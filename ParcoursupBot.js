const puppeteer = require('puppeteer-core');
const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');
const process = require('process');
const crypto = require('crypto');
const ecnryption_method = "aes-256-cbc";
const key = crypto.createHash('sha512').update(secret_key).digest('hex').substring(0, 32);
const encryptionIV = crypto.createHash('sha512').update(secret_iv).digest('hex').substring(0, 16);
const host = 'discord.com';
const api = '/api/v9';
var gatewayURL = null;
var timer = 0;
const shared = require('./info');
var ws = null;
var loggedin = false;
var discordData = [];
let browserVersion = null;
var parcoursupURL = 'https://dossier.parcoursup.fr/Candidat/authentification';

const JUNE = 5;
const JULY = 6;

function encryptData(data) {
	const cipher = crypto.createCipheriv(ecnryption_method, key, encryptionIV);
	return Buffer.from(
		cipher.update(data, 'utf8', 'hex') + cipher.final('hex')
	).toString('base64');
}

function decryptData(encryptedData) {
	const buff = Buffer.from(encryptedData, 'base64');
	const decipher = crypto.createDecipheriv(ecnryption_method, key, encryptionIV);
	return (
		decipher.update(buff.toString('utf8'), 'hex', 'utf8') +
		decipher.final('utf8')
	);
}

function mapAttentes(x) {
	let place;
	try {
		place = x.querySelector('div.popup > ul').children[0].children[0].innerText;
	} catch (e) {
		place = -1;
	};
	return {title: x.children[2].innerText.trim(), place: place};
}

async function getInfosParcoursup(userData) {
	let date = new Date();
	if (!((date.getMonth() == JUNE && date.getDate() >= 2) || (date.getMonth() == JULY && date.getDate() <= 15))) {
		return [2, "La phase d'admission n'est pas ouverte"];
	}
	const browser = await puppeteer.launch({headless: true});
	browserVersion = (await browser.version()).split('/').join(' ');
	const page = await browser.newPage();
	page.setJavaScriptEnabled(true);
	// Wait for login page to be fully loaded
	await page.goto(parcoursupURL, {waitUntil: 'networkidle0', timeout: 0});
	// Map page console to node console
	page.on('console', consoleObj => console.log(consoleObj.text()));
	// Fill in values
	await page.evaluate((userData) => {
		const login = document.getElementById('g_cn_cod');
		const pw = document.getElementById('g_cn_mot_pas');
		const btn = document.getElementById('btnConnexion');
		login.value = userData.username;
		pw.value = decryptData(userData.password);
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
		// Try to get place in the queue
		let attentes = Array.from(attentes_nodes).map(mapAttentes);
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

// For all users, if they enabled autoupdate, check the changes from Parcoursup
function getInfosMatin() {
	for (let i = 0; i < discordData.length; i++) {
		if (!discordData[i].autoupdate) {
			continue;
		}
		const data = getInfosParcoursup(discordData[i]);
		if (data[0] != 0) {
			console.log("Error");
		} else {
			discordData[i].old = data[1];
			fs.writeFileSync('userDataParcoursupDiscord.json', JSON.stringify(discordData, null, 2));
		}
	}
}

function parseRes(res, data_r, resolve) {
	res.on('data', (d) => {
		data_r += d;
	});
	res.on('end', () => {
		resolve(0);
	});
}

async function sendMessage(message, channel = shared.channelAnnounce) {
	return new Promise(resolve => {
		var headers = {
			'Authorization': `Bot ${shared.botToken}`,
			'Content-Type': 'application/json',
		};
		var requestOptions = {
			hostname: host,
			port: 443,
			path: `${api}/channels/${channel}/messages`,
			method: 'POST',
			headers: headers,
		};
		let data_r = "";
		var request = https.request(requestOptions, (res) => parseRes(res, data_r, resolve));
		var data = {
			'content': message,
		};
		request.write(JSON.stringify(data));
		request.end();
	});
}


async function sendMessagesSplit(messages, fn, index) {
	if (index >= messages.length) {
		clearInterval(fn);
		return;
	}
	data = {
		'content': messages[i],
	}
	let received = "";
	var request2 = https.request(requestOptions, (res) => {
		res.on('data', (d) => {
			received += d;
		});
		res.on('end', () => {
			console.log(JSON.parse(received));
		});
	});
	request2.write(JSON.stringify(data));
	request2.end();
	index++;
}

// Get status for all wishes
async function op0all(messageJSON) {
	var json = {
		"type": 5,
	}
	request.write(JSON.stringify(json));
	request.end();
	if (discordData[index].username == '' || discordData[index].password == '') {
		sendError("Nom d'utilisateur ou mot de passe vide, vous pouvez utiliser la commande /compte pour changer cela", messageJSON);
		return;
	}
	var pcsdata = await getInfosParcoursup(discordData[index]);
	if (pcsdata[0] != 0) {
		sendError(pcsdata[1], messageJSON);
		return;
	}
	sendFinalMessage("Liste des voeux Parcoursup", messageJSON);
	discordData[index].old = discordData[index].current;
	discordData[index].current = pcsdata[1];
	var messages = [];
	var message0 = "";
	// Answers with YES
	for (let i = 0; i < discordData[index].current.ouis.length; i++) {
		if (message0.length + discordData[index].current.ouis[i].length + 5 > 2000) {
			message0.slice(0, -1);
			messages.push(message0);
			message0 = "";
		}
		message0 += `✅ ${discordData[index].current.ouis[i]}\n`;
	}
	// Answers with WAIT
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
	// Answers with NO
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
	let index = 0;
	// Send messages one by one
	let fn = setInterval(sendMessagesSplit, 100, fn, index);
}

// Get difference with previous call
async function op0diff(messageJSON) {
	var json = {
		"type": 5,
	}
	request.write(JSON.stringify(json));
	request.end();
	if (discordData[index].username == '' || discordData[index].password == '') {
		sendError("Nom d'utilisateur ou mot de passe vide, vous pouvez utiliser la commande /compte pour changer cela", messageJSON);
		return;
	}
	var pcsdata = await getInfosParcoursup(discordData[index]);
	if (pcsdata[0] != 0) {
		sendError(pcsdata[1], messageJSON);
		return;
	}
	discordData[index].old = discordData[index].current;
	discordData[index].current = pcsdata[1];
	// Answers with YES
	for (let i = 0; i < discordData[index].current.ouis.length; i++) {
		if (discordData[index].old.ouis.indexOf(discordData[index].current.ouis[i]) != -1) {
			continue;
		}
		if (message0.length + discordData[index].current.ouis[i].title.length + 5 > 2000) {
			message0.slice(0, -1);
			messages.push(message0);
			message0 = "";
		}
		message0 += `✅ ${discordData[index].current.ouis[i]}\n`;
	}
	// Answers with WAIT
	for (let i = 0; i < discordData[index].current.attentes.length; i++) {
		let new_names_map = discordData[index].current.attentes.map(x => x.id);
		let old_names_map = discordData[index].old.attentes.map(x => x.id);
		if (new_names_map.indexOf(old_names_map[i]) == -1) {
			continue;
		}
		if (discordData[index].current.attentes[i].place == discordData[index].old.attentes[i].place) {
			continue;
		}
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
	// Answers with NO
	for (let i = 0; i < discordData[index].current.nons.length; i++) {
		if (discordData[index].old.nons.indexOf(discordData[index].current.nons[i]) != -1) {
			continue;
		}
		if (message0.length + discordData[index].current.nons[i].title.length + 5 > 2000) {
			message0.slice(0, -1);
			messages.push(message0);
			message0 = "";
		}
		message0 += `❌ ${discordData[index].current.nons[i]}\n`;
	}
	messages.push(message0);
	requestOptions.path = `${api}/channels/${messageJSON.d.channel_id}/messages`;
	requestOptions.method = 'POST';
	let index = 0;
	// Send messages one by one
	let fn = setInterval(sendMessagesSplit, 100, messages, fn, index);
}

function sendFinalMessage(message, messageJSON) {
	data = {
		'content': message,
	}
	requestOptions.path = `${api}/webhooks/${shared.appID}/${messageJSON.d.token}/messages/@original`;
	requestOptions.method = 'PATCH'
	var request = https.request(requestOptions);
	request.write(JSON.stringify(data));
	request.end();
}

function sendError(message, messageJSON) {
	data = {
		'content': message,
	}
	requestOptions.path = `${api}/webhooks/${shared.appID}/${messageJSON.d.token}/messages/@original`;
	requestOptions.method = 'PATCH'
	var request = https.request(requestOptions);
	request.write(JSON.stringify(data));
	request.end();
}

// Execute getInfosMatin() every morning at 8:00 AM (UTC + 1)
async function automate() {
	const automateStep3 = function() {
		getInfosMatin();
	}
	const automateStep2 = function() {
		setInterval(automateStep3, 86400000);
	}
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

async function op0ready() {
	await sendMessage("Le bot est réveillé");
	// Set bot status
	const activities = [
		{
			"name": "les gens obtenir leurs voeux",
			"type": 3,
		}
	];
	const d = {
		"since": Date.now(),
		"activities": activities,
		"status": "idle",
		"afk": false
	};
	var data = {
		"op": 3,
		"d": d,
	};
	ws.send(JSON.stringify(data));
	automate();
}

async function op0compte(request, messageJSON) {
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
			discordData[index].password = encryptData(mdp);
			break;
	}
	request.write(JSON.stringify(json));
	request.end();
}

// Set automatic update for a user
async function op0autoupdate(request, messageJSON) {
	var json = {
		'type': 4,
		'data': {
			'content': 'Fait',
		}
	};
	discordData[index] = messageJSON.d.data.options[0].name == 'on';
	request.write(JSON.stringify(json));
	request.end();
}

async function op0ping(request) {
	var json = {
		'type': 4,
		'data': {
			'content': 'Pong',
		}
	};
	request.write(JSON.stringify(json));
	request.end();
}

// Handle INTERACTION_CREATE
async function op0interaction(messageJSON) {
	var user_id = 0;
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
	switch(messageJSON.d.data.name) {
		case 'all':
			await op0all(messageJSON);
			break;
		case 'diff':
			await op0diff(messageJSON);
			break;
		case 'compte':
			await op0compte(request, messageJSON);
			break;
		case 'autoupdate':
			await op0autoupdate(request, messageJSON);
			break;
		case 'ping':
			await op0ping(request);
			break;
		default:
			console.log('Else');
			break;
	}
	fs.writeFileSync('userDataParcoursupDiscord.json', JSON.stringify(discordData, null, 2));
}

// Handle Discord message
async function op0(messageJSON) {
	switch(messageJSON.t) {
		case 'READY':
			await op0ready();
			break;
		case 'INTERACTION_CREATE':
			await op0interaction(messageJSON);
			break;
		default:
			break;
	}
}

function heartbeat_repeat(messageJSON) {
	const op1 = {
		'op': 1,
		'd': messageJSON.s,
	}
	ws.send(JSON.stringify(op1));
}

// Send heartbeat at interval given by Discord
async function heartbeat(messageJSON) {
	const timer = messageJSON.d.heartbeat_interval * 0.99;
	return new Promise((resolve, reject) => {
		resolve();
		setInterval(heartbeat_repeat, timer, messageJSON);
	});
}

async function op1(messageJSON) {
	const op1request = {
		'op': 1,
		'd': messageJSON.s,
	}
	ws.send(JSON.stringify(op1request));
}

async function op10(messageJSON) {
	const op1 = {
		'op': 1,
		'd': messageJSON.s,
	}
	ws.send(JSON.stringify(op1));
	heartbeat(messageJSON);
}

async function op11() {
	if (loggedin) {
		return;
	}
	const props = {
		'$os': 'linux',
		'$browser': 'node',
		'$device': 'node',
	};
	const d = {
		'token': shared.botToken,
		'intents': 4625,
		'properties': props,
	};
	const op2 = {
		'op': 2,
		'd': d,
	}
	ws.send(JSON.stringify(op2));
	loggedin = true;
}

async function incoming(message) {
	const messageJSON = JSON.parse(message);
	switch(messageJSON.op) {
		case 0:
			await op0(messageJSON);
			break;
		case 1:
			await op1(messageJSON);
			break;
		case 10:
			await op10(messageJSON);
			break;
		case 11:
			await op11();
			break;
		default:
			break;
	}
}

async function connectGateway() {
	ws.on('message', incoming);
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
