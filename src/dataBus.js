const { REST } = require('@discordjs/rest');

const dataBus = {
    botRest: new REST({ version: '9' }).setToken()
}

module.exports = dataBus;