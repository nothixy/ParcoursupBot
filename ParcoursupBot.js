const puppeteer = require('puppeteer-core');
const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');
const process = require('process');
const host = 'discord.com';
const api = '/api/v9';
var gatewayURL = null;
var timer = 0;
const shared = require('./info');
var ws = null;
var loggedin = false;
var discordData = [];
var browserVersion = null;
var parcoursupURL = 'https://dossier.parcoursup.fr/Candidat/authentification';

async function connectParcoursup(userData) {
	let date = new Date();
	if (!((date.getMonth() == 5 && date.getDate() >= 2) || (date.getMonth() == 6 && date.getDate() <= 15))) {
		return [2, "La phase d'admission n'est pas ouverte"];
	}
	const browser = await puppeteer.launch({executablePath: '/usr/bin/chromium', headless: true});
	browserVersion = (await browser.version()).split('/').join(' ');
	const page = await browser.newPage();
	page.setJavaScriptEnabled(true);
	await page.goto(parcoursupURL, {waitUntil: 'networkidle0', timeout: 0});
	page.on('console', consoleObj => console.log(consoleObj.text()));
	await page.evaluate((userData) => {
		const login = document.getElementById('g_cn_cod');
		const pw = document.getElementById('g_cn_mot_pas');
		const btn = document.getElementById('btnConnexion');
		login.value = userData.username;
		pw.value = userData.password;
		btn.childNodes[1].click();
	}, userData);
	await page.waitForNavigation({waitUntil: 'networkidle0', timeout: 0});
	if (await page.$('#h1Erreur') != null) {
		await browser.close();
		return [1, "Erreur de connection. Vos identifiants sont-ils corrects ?"];
	}
	let data = await page.evaluate(() => {
		let ouis_nodes = document.querySelectorAll('div#listePropositions tbody tr.voeu');
		let ouis = Array.from(ouis_nodes).map(x => x.children[2].innerText.trim());
		let nons_nodes = document.querySelectorAll('div#voeux_refuses tbody tr.voeu');
		let nons = Array.from(nons_nodes).map(x => x.children[2].innerText.trim());
		let attentes_nodes = document.querySelectorAll('div#voeux_enattente tbody tr.voeu');
		let attentes = Array.from(attentes_nodes).map(x => {let place; try {place = x.querySelector('div.popup > ul').children[0].children[0].innerText} catch (e) {place = -1}; return {title: x.children[2].innerText.trim(), place: place}});
		let d = {
			ouis: ouis,
			attentes: attentes,
			nons: nons
		};
		return d;
	});
	await browser.close();
	return [0, data];
}

function getInfosMatin() {
	for (let i = 0; i < discordData.length; i++) {
		if (discordData[i].autoupdate) {
			const data = connectParcoursup(discordData[i]);
			if (data[0] != 0) {
				console.log("Error");
			} else {
				discordData[i].old = data[1];
				fs.writeFileSync('userDataParcoursupDiscord.json', JSON.stringify(discordData, null, 2));
			}
		}
	}
}

async function sendMessage(message, channel = shared.channelAnnounce) {
	return new Promise(resolve => {
		var requestOptions = {
		hostname: host,
		port: 443,
		path: `${api}/channels/${channel}/messages`,
		method: 'POST',
		headers: {
			'Authorization': `Bot ${shared.botToken}`,
			'Content-Type': 'application/json',
		}
	};
	let data_r = "";
	var request = https.request(requestOptions, (res) => {
		res.on('data', (d) => {
			data_r += d;
		});
		res.on('end', () => {
			resolve(0);
		});
	});
	var data = {
		'content': message,
	};
	request.write(JSON.stringify(data));
	request.end();
});
}

async function connectGateway() {
	ws.on('message', async function incoming(message) {
		const messageJSON = JSON.parse(message);
		var user_id = 0;
		switch(messageJSON.op) {
			case 0:
				switch(messageJSON.t) {
					case 'READY':
						await sendMessage("Le bot est réveillé");
						var data = {
							"op": 3,
							"d": {
								"since": Date.now(),
								"activities": [{
									"name": "les gens obtenir leurs voeux",
									"type": 3
								}],
								"status": "idle",
								"afk": false
							}
						};
						ws.send(JSON.stringify(data));
						const automateStep3 = function() {
							getInfosMatin();
						}
						const automateStep2 = function() {
							setInterval(automateStep3, 86400000);
						}
						const automate = async function() {
							return new Promise((resolve, reject) => {
								resolve();
								var next8h = new Date(Date.now());
								if (next8h.getHours() >= 7) {
									next8h.setDate(next8h.getDate() + 1);
								}
								next8h.setUTCHours(7);
								next8h.setMinutes(0);
								next8h.setSeconds(0);
								next8h.setMilliseconds(0);
								var delay = (Date.parse(next8h) - Date.now());
								console.log(`Next automatic morning run : ${Date(next8h)}`);
								setTimeout(automateStep2, delay);
							});
						}
						automate();
					break;
					case 'INTERACTION_CREATE':
						if (messageJSON.d.user != null) {
							user_id = messageJSON.d.user.id;
						} else {
							user_id = messageJSON.d.member.user.id;
						}
						var requestOptions = {
							hostname: host,
							port: 443,
							path: `${api}/interactions/${messageJSON.d.id}/${messageJSON.d.token}/callback`,
							method: 'POST',
							headers: {
								'Authorization': `Bot ${shared.botToken}`,
								'Content-Type': 'application/json',
							}
						}
						var request = https.request(requestOptions, (res) => {});
						var usermap = discordData.map(x => x.discord_id);
						var index = usermap.indexOf(user_id);
						if (index == -1) {
							var obj = {};
							obj['discord_id'] = user_id;
							obj['channel_id'] = messageJSON.d.channel_id;
							obj['username'] = '';
							obj['password'] = '';
							obj['autoupdate'] = false;
							var current = {};
							current['ouis'] = [];
							current['nons'] = [];
							current['attentes'] = [];
							var old = {};
							old['ouis'] = [];
							old['nons'] = [];
							old['attentes'] = [];
							obj['current'] = current;
							obj['old'] = old;
							discordData.push(obj);
						}
						usermap = discordData.map(x => x.discord_id);
						index = usermap.indexOf(user_id);
						function sendFinalMessage(message) {
							data = {
								'content': message,
							}
							requestOptions.path = `${api}/webhooks/${shared.appID}/${messageJSON.d.token}/messages/@original`;
							requestOptions.method = 'PATCH'
							request = https.request(requestOptions, (res) => {});
							request.write(JSON.stringify(data));
							request.end();
						}
						function sendError(message) {
							data = {
								'content': message,
							}
							requestOptions.path = `${api}/webhooks/${shared.appID}/${messageJSON.d.token}/messages/@original`;
							requestOptions.method = 'PATCH'
							request = https.request(requestOptions, (res) => {});
							request.write(JSON.stringify(data));
							request.end();
						}
						switch(messageJSON.d.data.name) {
							case 'all':
								var json = {
									"type": 5,
								}
								request.write(JSON.stringify(json));
								request.end();
								if (discordData[index].username == '' || discordData[index].password == '') {
									sendError("Nom d'utilisateur ou mot de passe vide, vous pouvez utiliser la commande /compte pour changer cela");
								} else {
									var pcsdata = await connectParcoursup(discordData[index]);
									if (pcsdata[0] != 0) {
										sendError(pcsdata[1]);
									} else {
										sendFinalMessage("Liste des voeux Parcoursup");
										discordData[index].old = discordData[index].current;
										discordData[index].current = pcsdata[1];
										var messages = [];
										var message0 = "";
										for (let i = 0; i < discordData[index].current.ouis.length; i++) {
											if (message0.length + discordData[index].current.ouis[i].length + 5 > 2000) {
												message0.slice(0, -1);
												messages.push(message0);
												message0 = "";
											}
											message0 += `✅ ${discordData[index].current.ouis[i]}\n`;
										}
										for (let i = 0; i < discordData[index].current.attentes.length; i++) {
											let nl = 0;
											let nextcl = discordData[index].current.attentes[i].place;
											if (nextcl != -1) {
												nl = nextcl.length + 4;
											} else {
												nl = 0;
											}
											if (message0.length + discordData[index].current.attentes[i].title.length + 5 + nl > 2000) {
												message0.slice(0, -1);
												messages.push(message0);
												message0 = "";
											}
											if (nl == 0) {
												message0 += `🔄 ${discordData[index].current.attentes[i].title}\n`;
											} else {
												message0 += `🔄 ${nextcl} - ${discordData[index].current.attentes[i].title}\n`;
											}
										}
										for (let i = 0; i < discordData[index].current.nons.length; i++) {
											if (message0.length + discordData[index].current.nons[i].length + 5 > 2000) {
												message0.slice(0, -1);
												messages.push(message0);
												message0 = "";
											}
											message0 += `❌ ${discordData[index].current.nons[i]}\n`;
										}
										messages.push(message0);
										requestOptions.path = `${api}/channels/${messageJSON.d.channel_id}/messages`;
										requestOptions.method = 'POST';
										let i = 0;
										let fn = setInterval(function () {
											if (i < messages.length) {
												data = {
													'content': messages[i],
												}
												let received = "";
												request = https.request(requestOptions, (res) => {
													res.on('data', (d) => {
														received += d;
													});
													res.on('end', () => {
														console.log(JSON.parse(received));
													});
												});
												request.write(JSON.stringify(data));
												request.end();
												i++;
											} else {
												clearInterval(fn);
											}
										}, 100);
									}
								}
								break;
							case 'clear':
								var json = {
									"type": 5,
								}
								request.write(JSON.stringify(json));
								request.end();
								messageJSON.d.channel_id;
							case 'diff':
								var json = {
									"type": 5,
								}
								request.write(JSON.stringify(json));
								request.end();
								if (discordData[index].username == '' || discordData[index].password == '') {
									sendError("Nom d'utilisateur ou mot de passe vide, vous pouvez utiliser la commande /compte pour changer cela");
								} else {
									var pcsdata = await connectParcoursup(discordData[index]);
									if (pcsdata[0] != 0) {
										sendError(pcsdata[1]);
									} else {
										discordData[index].old = discordData[index].current;
										discordData[index].current = pcsdata[1];
										for (let i = 0; i < discordData[index].current.ouis.length; i++) {
											if (discordData[index].old.ouis.indexOf(discordData[index].current.ouis[i]) == -1) {
												if (message0.length + discordData[index].current.ouis[i].title.length + 5 > 2000) {
													message0.slice(0, -1);
													messages.push(message0);
													message0 = "";
												}
												message0 += `✅ ${discordData[index].current.ouis[i]}\n`;
											}
										}
										for (let i = 0; i < discordData[index].current.attentes.length; i++) {
											let new_names_map = discordData[index].current.attentes.map(x => x.id);
											let old_names_map = discordData[index].old.attentes.map(x => x.id);
											if (new_names_map.indexOf(old_names_map[i]) != -1) {
												if (discordData[index].current.attentes[i].place != discordData[index].old.attentes[i].place) {
													let nl = 0;
													let nextcl = discordData[index].current.attentes[i].place;
													if (nextcl != -1) {
														nl = nextcl.length + 4;
													} else {
														nl = 0;
													}
													if (message0.length + discordData[index].current.attentes[i].title.length + 5 + nl > 2000) {
														message0.slice(0, -1);
														messages.push(message0);
														message0 = "";
													}
													if (nl == 0) {
														message0 += `🔄 ${discordData[index].current.attentes[i].title}\n`;
													} else {
														message0 += `🔄 ${nextcl} - ${discordData[index].current.attentes[i].title}\n`;
													}
												}
											}
										}
										for (let i = 0; i < discordData[index].current.nons.length; i++) {
											if (discordData[index].old.nons.indexOf(discordData[index].current.nons[i]) == -1) {
												if (message0.length + discordData[index].current.nons[i].title.length + 5 > 2000) {
													message0.slice(0, -1);
													messages.push(message0);
													message0 = "";
												}
												message0 += `❌ ${discordData[index].current.nons[i]}\n`;
											}
										}
										messages.push(message0);
										requestOptions.path = `${api}/channels/${messageJSON.d.channel_id}/messages`;
										requestOptions.method = 'POST';
										let i = 0;
										let fn = setInterval(function () {
											if (i < messages.length) {
												data = {
													'content': messages[i],
												}
												let received = "";
												request = https.request(requestOptions, (res) => {
													res.on('data', (d) => {
														received += d;
													});
													res.on('end', () => {
														console.log(JSON.parse(received));
													});
												});
												request.write(JSON.stringify(data));
												request.end();
												i++;
											} else {
												clearInterval(fn);
											}
										}, 100);
									}
								}
								break;
							case 'compte':
								var json = {
									'type': 4,
									'data': {
										'content': 'Fait',
									}
								};
								switch(messageJSON.d.data.options[0].name) {
									case 'identifiant':
										var id = messageJSON.d.data.options[0].options[0].value;
										discordData[index].username = id;
										break;
									case 'mdp':
										var mdp = messageJSON.d.data.options[0].options[0].value;
										discordData[index].password = mdp;
										break;
								}
								request.write(JSON.stringify(json));
								request.end();
								break;
							case 'autoupdate':
								var json = {
									'type': 4,
									'data': {
										'content': 'Fait',
									}
								};
								switch(messageJSON.d.data.options[0].name) {
									case 'on':
										discordData[index].autoupdate = true;
										break;
									case 'off':
										discordData[index].autoupdate = false;
										break;
								}
								request.write(JSON.stringify(json));
								request.end();
								break;
							case 'ping':
								json = {
									'type': 4,
									'data': {
										'content': 'Pong',
									}
								};
								request.write(JSON.stringify(json));
								request.end();
								break;
							default:
								console.log('Else');
								break;
						}
						fs.writeFileSync('userDataParcoursupDiscord.json', JSON.stringify(discordData, null, 2));
						break;
					default:
						break;
				}
				break;
			case 1:
				const op1request = {
					'op': 1,
					'd': messageJSON.s,
				}
				ws.send(JSON.stringify(op1request));
				break;
			case 10:
				const timer = messageJSON.d.heartbeat_interval * 0.99;
				const op1 = {
					'op': 1,
					'd': messageJSON.s,
				}
				ws.send(JSON.stringify(op1));
				const heartbeat = async function() {
					return new Promise((resolve, reject) => {
						resolve();
						setInterval(function() {
							const op1 = {
								'op': 1,
								'd': messageJSON.s,
							}
							ws.send(JSON.stringify(op1));
						}, timer);
					});
				}
				heartbeat();
				break;
			case 11:
				if (!loggedin) {
					const op2 = {
						'op': 2,
						'd': {
							'token': shared.botToken,
							'intents': 4625,
							'properties': {
								'$os': 'linux',
								'$browser': 'node',
								'$device': 'node',
							},
						},
					}
					ws.send(JSON.stringify(op2));
					loggedin = true;
				}
				break;
			default:
				break;
		}
	});
	ws.onerror = function(e) {
		console.error(e);
	};
}

async function getGateway() {
	const requestOptions = {
		hostname: host,
		port: 443,
		path: api + '/gateway',
		method: 'GET',
		headers: {
			'Authorization': `Bot ${shared.botToken}`,
			'Content-Type': 'application/json',
		}
	};

	const request = https.request(requestOptions, (res) => {
		res.on('data', (d) => {
			gatewayURL = JSON.parse(d.toString()).url;
		});
		res.on('end', () => {
			ws = new WebSocket(gatewayURL);
			connectGateway();
		});
	});
	request.end();
}

fs.readFile('userDataParcoursupDiscord.json', (err, data) => {
	if (!err) {
		discordData = JSON.parse(data);
	}
});

process.on('SIGINT', async () => {
	await sendMessage("Le bot part dormir");
	process.exit();
});

getGateway();
