const { REST } = require('@discordjs/rest');

const dataBus = {
    botRest : new REST({ version: '9' }).setToken(process.env.DISCORD_BOT_TOKEN)
}

module.exports = dataBus;