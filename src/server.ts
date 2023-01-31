import axios from 'axios';
import cors from 'cors';
import express, { Request as ExpressRequest } from 'express';
import http from 'http';
import FormData from 'form-data'
import { CatGirlsAreSexyRest, DatabaseRest, DiscordRest } from './api';
import { IDatabaseResponse, IGuildData, ISubscriptionPayload, IUserData } from './types';
import { buildResponse, getTimeAsInt, ICardUpdate, log } from './utils';
import { getSession } from './sessions';
import { getUserWebhooks, tInsertGuildsWebhook, tInsertUsersWebhook } from './sqlite';

const app = express();

app.use(express.json());
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
    res.send(buildResponse("Not Implemented", true))
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

        const databaseResponse = (await DatabaseRest.get<IDatabaseResponse>(`/guilds?ids=${req.params.guildId}`)).data;

        res.send(buildResponse(databaseResponse.data, databaseResponse.error));
    } catch (error) {
        res.send(buildResponse(error.message, true))
    }
});

app.get('/:session/guilds/:guildId/meta', async (req, res) => {

    try {
        const session = getSession(req);

        const rawChannels = (await DiscordRest.get(`/guilds/${req.params.guildId}/channels`)).data;
        const rawRoles = (await DiscordRest.get(`/guilds/${req.params.guildId}/roles`)).data;

        const textChannels = rawChannels.filter((channel => channel.type === 0)).map((channel) => {
            return { id: channel.id, name: channel.name };
        });

        const roles = rawRoles.filter(role => role.name !== '@everyone').map((role) => {
            return { id: role.id, name: role.name };
        });

        const response = {
            roles: roles,
            channels: textChannels
        }


        res.send(buildResponse(response));
    } catch (error) {
        res.send(buildResponse(error.message, true))
    }
});

app.get('/:session/user', async (req, res) => {

    try {
        const session = getSession(req);

        const databaseResponse = (await DatabaseRest.get<IDatabaseResponse>(`/users?ids=${session.user}`)).data;

        res.send(buildResponse(databaseResponse.data, databaseResponse.error));
    } catch (error) {
        res.send(buildResponse(error.message, true))
    }
});

app.post('/:session/guilds', async (req, res) => {

    try {
        const session = getSession(req);

        const payload: Partial<IGuildData> & { id: IGuildData['id'] } = req.body;

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

        const payload: Partial<IUserData> & { id: IUserData['id'] } = {
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

app.post('/:session/user/card', async (req, res) => {

    try {
        const session = getSession(req);

        const payload: ICardUpdate = req.body;

        const base64Card = payload.fileAsBase64;

        const userDataResponse = (await DatabaseRest.get<IDatabaseResponse<IUserData[]>>(`/users?ids=${session.user}`)).data

        if (userDataResponse.error) {
            res.send(buildResponse(userDataResponse.data, true))
            return
        }

        const databaseUser = userDataResponse.data[0] as IUserData

        const cardOptions = new URLSearchParams(databaseUser.card);

        if (base64Card) {
            const buffer = Buffer.from(base64Card, "base64");

            if (cardOptions.has('bg_delete')) {
                await axios.get(cardOptions.get('bg_delete') as string).catch(log)
            }

            const form = new FormData();
            form.append('file', buffer, `${process.argv.includes('debug') ? 'debug-' : ''}${databaseUser.id}-${getTimeAsInt()}.png`);
            form.append('key', process.env.CGAS_KEY);
            const { url, deletion_url } = (await CatGirlsAreSexyRest.post('/upload', form, { headers: form.getHeaders() }))?.data
            cardOptions.set('bg_delete', deletion_url);
            cardOptions.set('bg', url);
        }

        cardOptions.set('color', payload.color);
        cardOptions.set('opacity', payload.opacity.toString());

        const userUpdate: Partial<IUserData> = {
            id: databaseUser.id,
            card: cardOptions.toString()
        }

        await DatabaseRest.post(`/users`, [userUpdate]).catch(log);

        res.send(buildResponse("Updated"))

        notifyUserSettingsChanged(databaseUser.id);
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