const axios = require('axios');

module.exports = axios.create({
    baseURL: "https://discord.com/api/v9",
    headers: {
        'Authorizationn': `Bot ${process.argv.includes('debug') ? process.env.DISCORD_BOT_TOKEN_ALPHA : process.env.DISCORD_BOT_TOKEN}`
    }
})