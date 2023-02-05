import axios from 'axios';
import Constants from './constants';
import { FrameworkConstants, IDatabaseUserSettings, IUmekoApiResponse } from './framework';

const DiscordRest = axios.create({
    baseURL: "https://discord.com/api/v9",
    headers: {
        'Authorizationn': `Bot ${process.argv.includes('--debug') ? process.env.DISCORD_BOT_TOKEN_ALPHA : process.env.DISCORD_BOT_TOKEN}`
    }
})

const DatabaseRest = axios.create({
    baseURL: `${process.argv.includes('--debug') ? process.env.DB_API_DEBUG : process.env.DB_API}`,
    headers: {
        'x-api-key': process.env.DB_API_TOKEN || ""
    }
})

const CatGirlsAreSexyRest = axios.create({
    baseURL: "https://catgirlsare.sexy/api"
})

export async function getDatabaseUser(userId: string) {

    const databaseUserRequest = (await DatabaseRest.get<IUmekoApiResponse<IDatabaseUserSettings[]>>(`/users?ids=${userId}`)).data;
    if (databaseUserRequest.error || databaseUserRequest.data.length > 0) {
        const newUser: IDatabaseUserSettings = { ...FrameworkConstants.DEFAULT_USER_SETTINGS, id: userId };

        (await DatabaseRest.post<IUmekoApiResponse<string>>(`/users`, [newUser]))
        return newUser;
    }
    else {
        return databaseUserRequest.data[0];
    }
}

export {
    DiscordRest,
    DatabaseRest,
    CatGirlsAreSexyRest
}