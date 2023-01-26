const https = require('https');
const fs = require('fs');

var data = "";
const shared = require('./info');
var commandId = '0'; // Remplacer avec la commande à supprimer

const requestOptions = {
	'method': 'DELETE',
	'hostname': 'discord.com',
	'port': 443,
	'path': `/api/v9/applications/${shared.appID}/commands/${commandId}`,
	'headers': {
		'Authorization': `Bot ${shared.botToken}`,
		'Content-Type': 'application/json',
	},
};
const request = https.request(requestOptions, (res) => {
	res.on('data', (d) => {
		data += d.toString();
	});
	res.on('end', () => {
		console.log(data);
	});
});
request.write(JSON.stringify(json));
request.end();
