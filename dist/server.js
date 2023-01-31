"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const form_data_1 = __importDefault(require("form-data"));
const api_1 = require("./api");
const utils_1 = require("./utils");
const sessions_1 = require("./sessions");
const sqlite_1 = require("./sqlite");
const app = (0, express_1.default)();
app.use(express_1.default.json());
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
    res.send((0, utils_1.buildResponse)("Not Implemented", true));
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
        res.send((0, utils_1.buildResponse)(databaseResponse.data, databaseResponse.error));
    }
    catch (error) {
        res.send((0, utils_1.buildResponse)(error.message, true));
    }
});
app.get('/:session/guilds/:guildId/meta', async (req, res) => {
    try {
        const session = (0, sessions_1.getSession)(req);
        const rawChannels = (await api_1.DiscordRest.get(`/guilds/${req.params.guildId}/channels`)).data;
        const rawRoles = (await api_1.DiscordRest.get(`/guilds/${req.params.guildId}/roles`)).data;
        const textChannels = rawChannels.filter((channel => channel.type === 0)).map((channel) => {
            return { id: channel.id, name: channel.name };
        });
        const roles = rawRoles.filter(role => role.name !== '@everyone').map((role) => {
            return { id: role.id, name: role.name };
        });
        const response = {
            roles: roles,
            channels: textChannels
        };
        res.send((0, utils_1.buildResponse)(response));
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
app.post('/:session/user/card', async (req, res) => {
    try {
        const session = (0, sessions_1.getSession)(req);
        const payload = req.body;
        const base64Card = payload.fileAsBase64;
        const userDataResponse = (await api_1.DatabaseRest.get(`/users?ids=${session.user}`)).data;
        if (userDataResponse.error) {
            res.send((0, utils_1.buildResponse)(userDataResponse.data, true));
            return;
        }
        const databaseUser = userDataResponse.data[0];
        const cardOptions = new URLSearchParams(databaseUser.card);
        if (base64Card) {
            const buffer = Buffer.from(base64Card, "base64");
            if (cardOptions.has('bg_delete')) {
                await axios_1.default.get(cardOptions.get('bg_delete')).catch(utils_1.log);
            }
            const form = new form_data_1.default();
            form.append('file', buffer, `${process.argv.includes('debug') ? 'debug-' : ''}${databaseUser.id}-${(0, utils_1.getTimeAsInt)()}.png`);
            form.append('key', process.env.CGAS_KEY);
            const { url, deletion_url } = (await api_1.CatGirlsAreSexyRest.post('/upload', form, { headers: form.getHeaders() }))?.data;
            cardOptions.set('bg_delete', deletion_url);
            cardOptions.set('bg', url);
        }
        cardOptions.set('color', payload.color);
        cardOptions.set('opacity', payload.opacity.toString());
        const userUpdate = {
            id: databaseUser.id,
            card: cardOptions.toString()
        };
        await api_1.DatabaseRest.post(`/users`, [userUpdate]).catch(utils_1.log);
        res.send((0, utils_1.buildResponse)("Updated"));
        notifyUserSettingsChanged(databaseUser.id);
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
