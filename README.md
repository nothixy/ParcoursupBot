# ParcoursupBot
Un bot discord qui récupère les informations parcoursup tous les jours

## Commment l'utiliser
1. Installer les dépendances avec npm:
```bash
npm ci
```

2. Ajouter les informations suivantes sur le bot dans le fichier info.js :
- appID: l'identification de l'application discord
- botToken: le token du bot
- channelAnnounce: l'id du channel par défaut dans lequel la fonction sendMessage enverra les messages
- security_iv: un vecteur d'initialisation, peut être généré avec `crypto.randomBytes(16);`
- secutiry_key: une clé de sécurité, peut être générée avec `crypto.randomBytes(32);`

3. Enregistrer les commandes "slash" du bot: 
```bash
node registerCommands.js
```
Note: le bot peut prendre du temps avant que ses commandes soient enregistrées 

4. Lancer le bot avec
```bash
node ParcoursupBot.js
```

5. Le bot est prêt à être utilisé, il ne vous reste plus qu'à faire `/all` pour avoir les informations sur tous vos vœux ou `/diff` pour avoir uniquement les changements.

## Informations supplémentaires
`getCommands.js` pour afficher les commandes du bot enregistrées

`unregisterCommands.js` pour supprimer une commande du bot (changer l'id de la commande dans le fichier)

Note: ceci peut aussi prendre du temps

Il est possible de demander au bot d'afficher les changements tous les matins à 8h avec `/autoupdate on`

## Comment ça marche ?
A chaque appel, le bot ouvre une version sans interface (headless) du navigateur chromium, se connecte à Parcoursup et récupère les informations de la page.

## Captures d'écran ?
![Capture d'écran montrant une réponse du bot à la commande /all](https://hixy.tk/assets/pcsbot.webp)
