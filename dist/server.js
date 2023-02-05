"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const form_data_1 = __importDefault(require("form-data"));
const uuid_1 = require("uuid");
const api_1 = require("./api");
const utils_1 = require("./utils");
const sessions_1 = require("./sessions");
const sqlite_1 = require("./sqlite");
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: '100mb' }));
app.use((0, cors_1.default)());
app.set('trust proxy', true);
const port = process.argv.includes('--debug') ? 9000 : 8080;
function notifyUserSettingsChanged(user) {
    (0, sqlite_1.getUserWebhooks)(user).forEach(({ url }) => {
        axios_1.default.post(url, user, { validateStatus: () => true });
    });
}
function notifyGuildSettingsChanged(guild) {
    (0, sqlite_1.getUserWebhooks)(guild).forEach(({ url }) => {
        axios_1.default.post(url, guild, { validateStatus: () => true });
    });
}
app.get('/', async (req, res) => {
    res.send((0, utils_1.buildResponse)("Not Implemented", true));
});
app.post('/login', async (req, res) => {
    try {
        if (!req.body['token']) {
            res.send((0, utils_1.buildResponse)("No Token Sent", true));
            return;
        }
        const data = new URLSearchParams({
            'client_id': process.argv.includes('--debug') ? process.env.DISCORD_BOT_ID_DEBUG : process.env.DISCORD_BOT_ID,
            'client_secret': process.argv.includes('--debug') ? process.env.DISCORD_BOT_SECRETE_DEBUG : process.env.DISCORD_BOT_SECRETE,
            'grant_type': 'authorization_code',
            'code': req.body['token'],
            'redirect_uri': process.argv.includes('--debug') ? process.env.DISCORD_REDIRECT_URI_DEBUG : process.env.DISCORD_REDIRECT_URI
        });
        axios_1.default.post("https://discordapp.com/api/oauth2/token", data)
            .then(async (result) => {
            const DiscordResponseData = result.data;
            const headers = {
                'Authorization': `Bearer ${DiscordResponseData.access_token}`
            };
            const userDiscordDataResponse = (await axios_1.default.get("https://discordapp.com/api/oauth2/@me", { headers: headers })).data;
            const dbUser = await (0, api_1.getDatabaseUser)(userDiscordDataResponse.user.id);
            const existingSession = (0, sqlite_1.getSessionFromToken)(DiscordResponseData.access_token);
            if (existingSession) {
                console.log("Sent existing session");
                res.send((0, utils_1.buildResponse)({ session: existingSession.id, user: existingSession.user, nickname: existingSession.nickname, avatar: existingSession.avatar, card_opts: dbUser.card }));
                return;
            }
            const sessionId = (0, uuid_1.v4)();
            const sessionData = {
                id: sessionId,
                user: userDiscordDataResponse.user.id,
                nickname: userDiscordDataResponse.user.username,
                avatar: `https://cdn.discordapp.com/avatars/${userDiscordDataResponse.user.id}/${userDiscordDataResponse.user.avatar}.${userDiscordDataResponse.user.avatar.startsWith("a_") ? 'gif' : 'png'}`,
                token: DiscordResponseData.access_token,
                refresh: DiscordResponseData.refresh_token,
                expire_at: 0
            };
            console.log(sessionData);
            sqlite_1.tInsertSession.deferred(sessionData);
            res.send((0, utils_1.buildResponse)({ session: sessionId, user: sessionData.user, nickname: sessionData.nickname, avatar: sessionData.avatar, card_opts: dbUser.card }));
        }, (error) => {
            res.send((0, utils_1.buildResponse)(error.message, true));
        });
    }
    catch (error) {
        res.send((0, utils_1.buildResponse)(error.message, true));
    }
});
app.get('/:session/logout', async (req, res) => {
    res.send((0, utils_1.buildResponse)("Not Implemented", true));
});
app.get('/:session/guilds', async (req, res) => {
    try {
        const session = (0, sessions_1.getSession)(req);
    }
    catch (error) {
        res.send((0, utils_1.buildResponse)(error.message, true));
    }
});
app.get('/:session/guilds/:guildId', async (req, res) => {
    try {
        const session = (0, sessions_1.getSession)(req);
        const databaseResponse = (await api_1.DatabaseRest.get(`/guilds?ids=${req.params.guildId}`)).data;
        if (databaseResponse.error) {
            throw new Error(databaseResponse.data);
        }
        const metaFromDb = (0, sqlite_1.getCachedGuildData)(`meta-${req.params.guildId}`);
        if (metaFromDb.length) {
            const payload = {
                settings: databaseResponse.data,
                ...metaFromDb[0]
            };
            res.send((0, utils_1.buildResponse)(payload, databaseResponse.error));
        }
        else {
            const rawChannels = (await api_1.DiscordRest.get(`/guilds/${req.params.guildId}/channels`)).data;
            const rawRoles = (await api_1.DiscordRest.get(`/guilds/${req.params.guildId}/roles`)).data;
            const textChannels = rawChannels.filter((channel => channel.type === 0)).map((channel) => {
                return { id: channel.id, name: channel.name };
            });
            const roles = rawRoles.filter(role => role.name !== '@everyone').map((role) => {
                return { id: role.id, name: role.name };
            });
            const payload = {
                settings: databaseResponse.data,
                roles: roles,
                channels: textChannels,
            };
            res.send((0, utils_1.buildResponse)(payload, databaseResponse.error));
            sqlite_1.tInsertCachedGuildData.deferred(`meta-${req.params.guildId}`, { roles: roles, channels: textChannels });
        }
    }
    catch (error) {
        res.send((0, utils_1.buildResponse)(error.message, true));
    }
});
app.get('/:session/user', async (req, res) => {
    try {
        const session = (0, sessions_1.getSession)(req);
        const databaseResponse = (await api_1.DatabaseRest.get(`/users?ids=${session.user}`)).data;
        res.send((0, utils_1.buildResponse)(databaseResponse.data, databaseResponse.error));
    }
    catch (error) {
        res.send((0, utils_1.buildResponse)(error.message, true));
    }
});
app.post('/:session/guilds', async (req, res) => {
    try {
        const session = (0, sessions_1.getSession)(req);
        const payload = req.body;
        await api_1.DatabaseRest.post(`/guilds`, [payload]);
        res.send((0, utils_1.buildResponse)("Updated"));
        notifyGuildSettingsChanged(payload.id);
    }
    catch (error) {
        res.send((0, utils_1.buildResponse)(error.message, true));
    }
});
app.post('/:session/user', async (req, res) => {
    try {
        const session = (0, sessions_1.getSession)(req);
        const payload = {
            id: session.user,
            opts: req.body
        };
        await api_1.DatabaseRest.post(`/users`, [payload]);
        res.send((0, utils_1.buildResponse)("Updated"));
        notifyUserSettingsChanged(session.user);
    }
    catch (error) {
        res.send((0, utils_1.buildResponse)(error.message, true));
    }
});
app.post('/:session/card', async (req, res) => {
    console.log("Updating Card");
    try {
        const session = (0, sessions_1.getSession)(req);
        const payload = req.body;
        const base64Card = payload.background;
        const dbUser = await (0, api_1.getDatabaseUser)(session.user);
        const cardOptions = new URLSearchParams(dbUser.card);
        if (base64Card) {
            const buffer = Buffer.from(base64Card, "base64");
            const fileName = `${process.argv.includes('--debug') ? 'debug-' : ''}${dbUser['id']}.png`;
            if (cardOptions.has('bg_delete')) {
                await axios_1.default.get(cardOptions.get('bg_delete')).catch(utils_1.log);
            }
            const form = new form_data_1.default();
            form.append('file', buffer, fileName);
            form.append('key', process.env.CGAS_KEY);
            const { url, deletion_url } = (await api_1.CatGirlsAreSexyRest.post('/upload', form, { headers: form.getHeaders() }))?.data;
            cardOptions.set('bg_delete', deletion_url);
            cardOptions.set('bg', url);
        }
        cardOptions.set('color', payload.color);
        cardOptions.set('opacity', payload.opacity.toString());
        const userUpdate = {
            id: dbUser.id,
            card: cardOptions.toString()
        };
        await api_1.DatabaseRest.post(`/users`, [userUpdate]).catch(utils_1.log);
        res.send((0, utils_1.buildResponse)(cardOptions.get('bg')));
        notifyUserSettingsChanged(dbUser.id);
    }
    catch (error) {
        res.send((0, utils_1.buildResponse)(error.message, true));
    }
});
app.delete('/notify/users', async (req, res) => {
    try {
        const payload = req.body;
        sqlite_1.tInsertUsersWebhook.deferred(payload.url, payload.ids);
        res.send((0, utils_1.buildResponse)("Updated"));
    }
    catch (error) {
        res.send((0, utils_1.buildResponse)(error.message, true));
    }
});
app.delete('/notify/guilds', async (req, res) => {
    try {
        const payload = req.body;
        sqlite_1.tInsertGuildsWebhook.deferred(payload.url, payload.ids);
        res.send((0, utils_1.buildResponse)("Updated"));
    }
    catch (error) {
        res.send((0, utils_1.buildResponse)(error.message, true));
    }
});
app.listen(port, () => {
    (0, utils_1.log)(`Master HTTP Server listening at http://localhost:${port}/`);
});
