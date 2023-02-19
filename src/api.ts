import axios from 'axios';
import Constants from './constants';
import { FrameworkConstants, IDatabaseGuildSettings, IDatabaseUserSettings, IUmekoApiResponse } from './framework';

const DiscordRest = axios.create({
    baseURL: "https://discord.com/api/v9",
    headers: {
        'Authorization': `Bot ${process.argv.includes('--debug') ? process.env.DISCORD_BOT_TOKEN_ALPHA : process.env.DISCORD_BOT_TOKEN}`
    }
})

const DatabaseRest = axios.create({
    baseURL: `${process.argv.includes('--debug') ? process.env.DB_API_DEBUG : process.env.DB_API}`,
    headers: {
        'x-api-key': process.env.DB_API_TOKEN || ""
    }
})

const CatGirlsAreSexyRest = axios.create({
    baseURL: "https://cgas.io/api"
})

export async function getDatabaseUser(userId: string) {

    const databaseUserRequest = (await DatabaseRest.get<IUmekoApiResponse<IDatabaseUserSettings[]>>(`/users?ids=${userId}`)).data;
    if (databaseUserRequest.error || databaseUserRequest.data.length <= 0) {
        const newUser: IDatabaseUserSettings = { ...FrameworkConstants.DEFAULT_USER_SETTINGS, id: userId };

        (await DatabaseRest.put<IUmekoApiResponse<string>>(`/users`, [newUser]))
        return newUser;
    }
    else {
        return databaseUserRequest.data[0];
    }
}

export async function getDatabaseGuilds(guilds: string[]) {
    const databaseGuildRequest = (await DatabaseRest.get<IUmekoApiResponse<IDatabaseGuildSettings[]>>(`/guilds?ids=${guilds.join(',')}`)).data;
    if (databaseGuildRequest.error) throw new Error(databaseGuildRequest.data);

    if (guilds.length === databaseGuildRequest.data.length) return databaseGuildRequest.data;

    const fetchedGuilds = databaseGuildRequest.data.map(g => g.id)
    const missingGuilds = guilds.filter(a => !fetchedGuilds.includes(a))

    const newData = missingGuilds.map(a => ({ ...FrameworkConstants.DEFAULT_GUILD_SETTINGS, id: a }))

    console.log(databaseGuildRequest.data, fetchedGuilds, missingGuilds)

    await DatabaseRest.put<IUmekoApiResponse<string>>("/guilds", missingGuilds)

    return [...databaseGuildRequest.data, ...newData]
}

export {
    DiscordRest,
    DatabaseRest,
    CatGirlsAreSexyRest
}