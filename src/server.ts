import axios from 'axios';
import cors from 'cors';
import express, { Request as ExpressRequest } from 'express';
import http from 'http';
import FormData from 'form-data'
import { v4 as uuidv4 } from 'uuid'
import { CatGirlsAreSexyRest, DatabaseRest, DiscordRest, getDatabaseUser } from './api';
import { IGuildFetchResponse, IGuildMeta, ISubscriptionPayload, IUserSession, ILoginData } from './types';
import { buildResponse, getTimeAsInt, ICardUpdate, log } from './utils';
import { getSession } from './sessions';
import { getCachedGuildData, getSessionFromToken, getUserWebhooks, tInsertCachedGuildData, tInsertGuildsWebhook, tInsertSession, tInsertUsersWebhook } from './sqlite';
import { url } from 'inspector';
import { IDatabaseGuildSettings, IDatabaseUserSettings, IUmekoApiResponse } from './framework';

const app = express();

app.use(express.json({ limit: '100mb' }));
app.use(cors());
app.set('trust proxy', true)

const port = process.argv.includes('--debug') ? 9000 : 8080;

function notifyUserSettingsChanged(user: string) {
    getUserWebhooks(user).forEach(({ url }) => {
        axios.post(url, user, { validateStatus: () => true })
    });
}

function notifyGuildSettingsChanged(guild: string) {
    getUserWebhooks(guild).forEach(({ url }) => {
        axios.post(url, guild, { validateStatus: () => true })
    });
}


app.get('/', async (req, res) => {
    res.send(buildResponse("Not Implemented", true))
});

app.post('/login', async (req, res) => {


    try {
        if (!req.body['token']) {
            res.send(buildResponse("No Token Sent", true))
            return;
        }

        const data = new URLSearchParams({
            'client_id': process.argv.includes('--debug') ? process.env.DISCORD_BOT_ID_DEBUG! : process.env.DISCORD_BOT_ID!,
            'client_secret': process.argv.includes('--debug') ? process.env.DISCORD_BOT_SECRETE_DEBUG! : process.env.DISCORD_BOT_SECRETE!,
            'grant_type': 'authorization_code',
            'code': req.body['token']!,
            'redirect_uri': process.argv.includes('--debug') ? process.env.DISCORD_REDIRECT_URI_DEBUG! : process.env.DISCORD_REDIRECT_URI!
        });

        axios.post("https://discordapp.com/api/oauth2/token", data)
            .then(async (result) => {

                const DiscordResponseData = result.data;

                const headers = {
                    'Authorization': `Bearer ${DiscordResponseData.access_token}`
                }

                const userDiscordDataResponse = (await axios.get("https://discordapp.com/api/oauth2/@me", { headers: headers })).data;



                const dbUser = await getDatabaseUser(userDiscordDataResponse.user.id);

                const existingSession = getSessionFromToken(DiscordResponseData.access_token);

                if (existingSession) {
                    console.log("Sent existing session")
                    res.send(buildResponse<ILoginData>({ session: existingSession.id, user: existingSession.user, nickname: existingSession.nickname, avatar: existingSession.avatar, card_opts: dbUser.card }))
                    return;
                }

                const sessionId = uuidv4();

                const sessionData: IUserSession = {
                    id: sessionId,
                    user: userDiscordDataResponse.user.id,
                    nickname: userDiscordDataResponse.user.username,
                    avatar: `https://cdn.discordapp.com/avatars/${userDiscordDataResponse.user.id}/${userDiscordDataResponse.user.avatar}.${userDiscordDataResponse.user.avatar.startsWith("a_") ? 'gif' : 'png'}`,
                    token: DiscordResponseData.access_token,
                    refresh: DiscordResponseData.refresh_token,
                    expire_at: 0
                }

                console.log(sessionData)

                tInsertSession.deferred(sessionData);

                res.send(buildResponse<ILoginData>({ session: sessionId, user: sessionData.user, nickname: sessionData.nickname, avatar: sessionData.avatar, card_opts: dbUser.card }))

            }, (error) => {
                res.send(buildResponse(error.message, true))
            });

    } catch (error) {
        res.send(buildResponse(error.message, true))
    }

});

app.get('/:session/logout', async (req, res) => {
    res.send(buildResponse("Not Implemented", true))
});

app.get('/:session/guilds', async (req, res) => {

    try {
        const session = getSession(req);

    } catch (error) {
        res.send(buildResponse(error.message, true))
    }
});

app.get('/:session/guilds/:guildId', async (req, res) => {

    try {
        const session = getSession(req);

        const databaseResponse = (await DatabaseRest.get<IUmekoApiResponse<IDatabaseGuildSettings>>(`/guilds?ids=${req.params.guildId}`)).data;

        if (databaseResponse.error) {
            throw new Error(databaseResponse.data);
        }

        const metaFromDb = getCachedGuildData<IGuildMeta>(`meta-${req.params.guildId}`);

        if (metaFromDb.length) {
            const payload: IGuildFetchResponse = {
                settings: databaseResponse.data,
                ...metaFromDb[0]
            }
            res.send(buildResponse(payload, databaseResponse.error));
        }
        else {
            const rawChannels = (await DiscordRest.get(`/guilds/${req.params.guildId}/channels`)).data;
            const rawRoles = (await DiscordRest.get(`/guilds/${req.params.guildId}/roles`)).data;


            const textChannels = rawChannels.filter((channel => channel.type === 0)).map((channel) => {
                return { id: channel.id, name: channel.name };
            });

            const roles = rawRoles.filter(role => role.name !== '@everyone').map((role) => {
                return { id: role.id, name: role.name };
            });

            const payload: IGuildFetchResponse = {
                settings: databaseResponse.data,
                roles: roles,
                channels: textChannels,
            }

            res.send(buildResponse(payload, databaseResponse.error));

            tInsertCachedGuildData.deferred(`meta-${req.params.guildId}`, { roles: roles, channels: textChannels });
        }


    } catch (error) {
        res.send(buildResponse(error.message, true))
    }
});


app.get('/:session/user', async (req, res) => {

    try {
        const session = getSession(req);

        const databaseResponse = (await DatabaseRest.get<IUmekoApiResponse>(`/users?ids=${session.user}`)).data;

        res.send(buildResponse(databaseResponse.data, databaseResponse.error));
    } catch (error) {
        res.send(buildResponse(error.message, true))
    }
});

app.post('/:session/guilds', async (req, res) => {

    try {
        const session = getSession(req);

        const payload: Partial<IDatabaseGuildSettings> & { id: IDatabaseGuildSettings['id'] } = req.body;

        await DatabaseRest.post(`/guilds`, [payload]);

        res.send(buildResponse("Updated"))

        notifyGuildSettingsChanged(payload.id);
    } catch (error) {
        res.send(buildResponse(error.message, true))
    }
});

app.post('/:session/user', async (req, res) => {

    try {
        const session = getSession(req);

        const payload: Partial<IDatabaseUserSettings> & { id: IDatabaseUserSettings['id'] } = {
            id: session.user,
            opts: req.body
        }

        await DatabaseRest.post(`/users`, [payload]);

        res.send(buildResponse("Updated"))

        notifyUserSettingsChanged(session.user);
    } catch (error) {
        res.send(buildResponse(error.message, true))
    }
});

app.post('/:session/card', async (req, res) => {
    console.log("Updating Card")
    try {
        const session = getSession(req);

        const payload: ICardUpdate = req.body;

        const base64Card = payload.background;


        const dbUser = await getDatabaseUser(session.user);

        const cardOptions = new URLSearchParams(dbUser.card);

        if (base64Card) {

            const buffer = Buffer.from(base64Card, "base64");
            const fileName = `${process.argv.includes('--debug') ? 'debug-' : ''}${dbUser['id']}.png`;
            if (cardOptions.has('bg_delete')) {
                await axios.get(cardOptions.get('bg_delete') as string).catch(log)
            }

            const form = new FormData();
            form.append('file', buffer, fileName);
            form.append('key', process.env.CGAS_KEY);
            const { url, deletion_url } = (await CatGirlsAreSexyRest.post('/upload', form, { headers: form.getHeaders() }))?.data
            cardOptions.set('bg_delete', deletion_url);
            cardOptions.set('bg', url);
        }

        cardOptions.set('color', payload.color);
        cardOptions.set('opacity', payload.opacity.toString());

        const userUpdate: Partial<IDatabaseUserSettings> = {
            id: dbUser.id,
            card: cardOptions.toString()
        }

        await DatabaseRest.post(`/users`, [userUpdate]).catch(log);

        res.send(buildResponse(cardOptions.get('bg')!))

        notifyUserSettingsChanged(dbUser.id);
    } catch (error) {
        res.send(buildResponse(error.message, true))
    }

})

app.delete('/notify/users', async (req, res) => {

    try {
        const payload: ISubscriptionPayload = req.body;

        tInsertUsersWebhook.deferred(payload.url, payload.ids);

        res.send(buildResponse("Updated"));
    } catch (error) {
        res.send(buildResponse(error.message, true))
    }

})

app.delete('/notify/guilds', async (req, res) => {

    try {
        const payload: ISubscriptionPayload = req.body;

        tInsertGuildsWebhook.deferred(payload.url, payload.ids);

        res.send(buildResponse("Updated"));
    } catch (error) {
        res.send(buildResponse(error.message, true));
    }

})

app.listen(port, () => {
    log(`Master HTTP Server listening at http://localhost:${port}/`)
});