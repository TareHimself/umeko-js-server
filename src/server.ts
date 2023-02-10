import axios, { AxiosError } from 'axios';
import cors from 'cors';
import express, { Request as ExpressRequest } from 'express';
import http from 'http';
import FormData from 'form-data'
import { v4 as uuidv4 } from 'uuid'
import { CatGirlsAreSexyRest, DatabaseRest, DiscordRest, getDatabaseGuilds, getDatabaseUser } from './api';
import { IGuildFetchResponse, IGuildMeta, ISubscriptionPayload, IUserSession, ILoginData, IDiscordGuildPartial, ICardUpdate } from './types';
import { buildResponse, getTimeAsInt, isAdmin, log } from './utils';
import { getSession } from './sessions';
import { getCachedGuildData, tGetSession, tGetSessionFromToken, getUserWebhooks, tDeleteSession, tInsertCachedGuildData, tInsertGuildsWebhook, tInsertSession, tInsertUsersWebhook } from './sqlite';
import { url } from 'inspector';
import { ECardOptsKeys, IDatabaseGuildSettings, IDatabaseUserSettings, IUmekoApiResponse, ObjectValues, OptsParser } from './framework';

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

                const existingSession = tGetSessionFromToken(DiscordResponseData.access_token);

                if (existingSession) {
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
    try {
        tDeleteSession(req.params.session)
        res.send(buildResponse("Logged Out"))
    } catch (error) {
        res.send(buildResponse(error.message, true))
    }

});

app.get('/:session/guilds', async (req, res) => {

    try {
        const session = getSession(req);

        const cached = getCachedGuildData<IDiscordGuildPartial[]>('meta-guilds')
        if (cached) {
            res.send(buildResponse(cached))
            return
        }
        const headers = {
            'Authorization': `Bearer ${session.token}`
        }

        const guildsFromDiscordResponse = (await axios.get<IDiscordGuildPartial[]>("https://discordapp.com/api/users/@me/guilds", { headers: headers }))

        const guildsFromDiscord = guildsFromDiscordResponse.data
        if (!guildsFromDiscord) {
            res.send(buildResponse('recieved invalid response from discord api', true));
            return
        }


        const guildsUserHasAuthorityIn = guildsFromDiscord.filter((guild) => {
            return guild.owner || isAdmin(guild.permissions);
        });

        const guildsToFetch = guildsUserHasAuthorityIn.map(guild => guild.id)

        const databaseGuildRequest = (await DatabaseRest.get<IUmekoApiResponse<IDatabaseGuildSettings[]>>(`/guilds?ids=${guildsToFetch.join(',')}`)).data;

        if (databaseGuildRequest.error) {
            res.send(buildResponse(databaseGuildRequest.data, databaseGuildRequest.error))
            return;
        }

        const dbGuilds = databaseGuildRequest.data.map(g => g.id);

        const guildsToSend = guildsUserHasAuthorityIn.filter(a => dbGuilds.includes(a.id))

        res.send(buildResponse(guildsToSend));

        tInsertCachedGuildData.deferred('meta-guilds', guildsToSend)
    } catch (error) {
        res.send(buildResponse(error.message, true))
    }
});

app.get('/:session/guilds/:guildId', async (req, res) => {

    try {
        const session = getSession(req);

        const dbGuild = (await getDatabaseGuilds([req.params.guildId]))[0]

        const metaFromCache = getCachedGuildData<IGuildMeta>(`meta-guilds-${req.params.guildId}`);

        if (metaFromCache) {
            const payload: IGuildFetchResponse = {
                ...metaFromCache,
                settings: dbGuild
            }

            res.send(buildResponse(payload));
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
                settings: dbGuild,
                roles: roles,
                channels: textChannels,
            }

            res.send(buildResponse(payload));

            tInsertCachedGuildData.deferred(`meta-guilds-${req.params.guildId}`, { roles: roles, channels: textChannels });
        }


    } catch (error) {
        res.send(buildResponse(error.message, true))
    }
});
app.get('/:session', async (req, res) => {

    try {
        const existingSession = getSession(req);

        if (!existingSession) {
            res.send(buildResponse("Session Does Not Exist", true));
            return;
        }

        const dbUser = await getDatabaseUser(existingSession.user);

        res.send(buildResponse<ILoginData>({ session: existingSession.id, user: existingSession.user, nickname: existingSession.nickname, avatar: existingSession.avatar, card_opts: dbUser.card }))
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
    try {
        const session = getSession(req);

        const payload: ICardUpdate = req.body;

        const base64Card = payload.background;

        const dbUser = await getDatabaseUser(session.user);

        const cardOptions = new OptsParser<ObjectValues<typeof ECardOptsKeys>>(dbUser.card);

        if (base64Card) {

            const buffer = Buffer.from(base64Card, "base64");
            const fileName = `${process.argv.includes('--debug') ? 'debug-' : ''}${dbUser['id']}.png`;
            if (cardOptions.get('delete_url').length > 0) {
                await axios.get(cardOptions.get('delete_url')).catch(log)
            }

            const form = new FormData();
            form.append('file', buffer, fileName);
            form.append('key', process.env.CGAS_KEY);
            const { url, deletion_url } = (await CatGirlsAreSexyRest.post('/upload', form, { headers: form.getHeaders() }))?.data
            cardOptions.set('delete_url', deletion_url);
            cardOptions.set('bg_url', url);
        }

        cardOptions.set('color', payload.color);
        cardOptions.set('opacity', payload.opacity.toString());

        const userUpdate: Partial<IDatabaseUserSettings> = {
            id: dbUser.id,
            card: cardOptions.encode()
        }

        await DatabaseRest.post(`/users`, [userUpdate]).catch(log);

        res.send(buildResponse(cardOptions.encode()))



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