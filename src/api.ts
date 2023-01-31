import axios from 'axios';

const DiscordRest = axios.create({
    baseURL: "https://discord.com/api/v9",
    headers: {
        'Authorizationn': `Bot ${process.argv.includes('debug') ? process.env.DISCORD_BOT_TOKEN_ALPHA : process.env.DISCORD_BOT_TOKEN}`
    }
})

const DatabaseRest = axios.create({
    baseURL: "process.env.DB_API",
    headers: {
        'x-api-key': process.env.DB_API_TOKEN || ""
    }
})

const CatGirlsAreSexyRest = axios.create({
    baseURL: "https://catgirlsare.sexy/api"
})

export {
    DiscordRest,
    DatabaseRest,
    CatGirlsAreSexyRest
}