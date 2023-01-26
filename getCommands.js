const https = require('https');
const fs = require('fs');
const shared = require('./info');

const requestOptions = {
	hostname: 'discord.com',
	port: 443,
	path: `/api/v9/applications/${shared.appID}/commands`,
	method: 'GET',
	headers: {
		'Authorization': `Bot ${shared.botToken}`,
		'Content-Type': 'application/json',
	}
};

var data = '';
const request = https.request(requestOptions, (res) => {
	res.on('data', (d) => {
		console.log(d.toString());
		data += d.toString();
	});
	res.on('end', (d) => {
		console.log(JSON.parse(data).map(x => x.id));
		fs.writeFileSync('commands.json', JSON.stringify(JSON.parse(data.toString()), null, 2), null, 2);
	});
});
request.end();

