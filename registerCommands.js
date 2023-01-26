const https = require('https');
const fs = require('fs');
var data = "";
const shared = require('./info');

const requestOptions = {
	'method': 'PUT',
	'hostname': 'discord.com',
	'port': 443,
	'path': `/api/v9/applications/${shared.appID}/commands`,
	'headers': {
		'Authorization': `Bot ${shared.botToken}`,
		'Content-Type': 'application/json',
	},
};
const json = [
	{
		"name": "ping",
		"description": "Envoyer un ping au bot",
		"type": 1,
	}, {
		"name": "autoupdate",
		"description": "(Des)activer la mise à jour auto le matin",
		"type": 1,
		"options": [
			{
				"name": "on",
				"description": "Activer",
				"type": 1,
			}, {
				"name": "off",
				"description": "Desactiver",
				"type": 1,
			}
		]
	}, {
		"name": "diff",
		"description": "Afficher les changements par rapport à la dernière vérification",
		"type": 1,
	}, {
		"name": "all",
		"description": "Afficher le status de tous les voeux",
		"type": 1,
	}, {
		"name": "compte",
		"description": "Configurer votre compte Parcoursup",
		"type": 1,
		"options": [
			{
				"name": "identifiant",
				"description": "Configurer l'identifiant de votre compte",
				"type": 1,
				"options": [
					{
						"name": "id",
						"description": "Identifiant",
						"type": 3,
						"required": true,
					}
				]
			}, {
				"name": "mdp",
				"description": "Configurer le mot de passe de votre compte",
				"type": 1,
				"options": [
					{
						"name": "mdp",
						"description": "Mot de passe",
						"type": 3,
						"required": true,
					}
				]
			}
		]
	}
];
const request = https.request(requestOptions, (res) => {
	res.on('data', (d) => {
		data += d.toString();
	});
	res.on('end', () => {
		console.log(data);
		fs.writeFileSync('commands.json', JSON.stringify(JSON.parse(data), null, 2));
	});
});
request.write(JSON.stringify(json));
request.end();
