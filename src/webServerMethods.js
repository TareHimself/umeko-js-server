const EventEmitter = require("events");
const axios = require('axios');
const FormData = require('form-data');
const uuid = require('uuid');
var rp = require('request-promise');
const fs = require("fs");

const db = require('./db');
const utils = require('./utils');

const NO_SESSION_ID_MESSAGE = 'Bruh, where tf is your session Id';

const EXPIRED_SESSION_MESSAGE = 'It seems your session has expired';

const SESSION_TIMEOUT = 900; //timeout in seconds

const MAKE_NEW_API_REQUEST_PROBABILITY = 0.4;

const { localDb, memoryCache } = require('./dataBus');
const dataBus = require("./dataBus");

const validOPs = ['add', 'remove']

async function getServerInfo(request, response) {
    deleteExpiredSessions();
    const sessionsCount = localDb.prepare('SELECT session_id FROM sessions').all();
    response.send({id : 'umeko-js-server' , sessions_count : sessionsCount.length});
}

async function getServerPing(request, response) {
    response.send({ recieved_at : Date.now() });
}

function deleteExpiredSessions() {
    const currentTime = utils.utcInSeconds();

    const checkStatement = `SELECT session_id FROM sessions WHERE expire_at < ${currentTime}`;

    const sessionIds = localDb.prepare(checkStatement).all();

    if (sessionIds.length === 0) return;

    utils.log(`Deleting ${sessionIds.length} expired sessions`);

    const deleteStatement = `DELETE FROM sessions WHERE expire_at < ${currentTime}`;
    // delete local db entries first
    localDb.prepare(deleteStatement).run();

    sessionIds.forEach(function (row) {
        if (memoryCache.get(row.session_id)) {
            delete memoryCache.get(row.session_id);
        }
    });
}

function doesSessionExist(sessionId) {

    deleteExpiredSessions();

    const checkStatement = `SELECT session_id FROM sessions WHERE session_id='${sessionId}'`;

    const foundRows = localDb.prepare(checkStatement).all()

    return foundRows.length !== 0;
}

function getSessionIdFromToken(token) {

    deleteExpiredSessions();

    const checkStatement = `SELECT session_id FROM sessions WHERE discord_token='${token}'`;

    const foundRows = localDb.prepare(checkStatement).all()

    if (foundRows.length > 0 && foundRows[0].session_id) return foundRows[0].session_id;

    return undefined
}

function hasLatestSessionData(sessionId) {
    deleteExpiredSessions();

    if (!memoryCache.get(sessionId)) {
        if (doesSessionExist(sessionId)) {
            const fetchStatement = `SELECT * FROM sessions WHERE session_id ='${sessionId}'`;
            const newSessionData = localDb.prepare(fetchStatement).all()[0];

            memoryCache.set(sessionId, JSON.parse(newSessionData.session_data));
            utils.log(`Loaded Session ${sessionId} From Storage`);
            return memoryCache.get(sessionId);
        }

        return undefined;
    }

    const checkStatement = `SELECT last_update_time FROM sessions WHERE session_id ='${sessionId}'`;
    const currentSessionData = localDb.prepare(checkStatement).all()[0];

    if (currentSessionData.last_update_time < memoryCache.get(sessionId).last_update_time) {
        const fetchStatement = `SELECT * FROM sessions WHERE session_id ='${sessionId}'`;
        const newSessionData = localDb.prepare(fetchStatement).all()[0];

        memoryCache.set(sessionId, JSON.parse(newSessionData.session_data));
        memoryCache.get(sessionId).last_update_time = currentSessionData.last_update_time;
        utils.log(`Refreshed Session ${sessionId}`);
    }

    return memoryCache.get(sessionId);

}

function updateSession(sessionId) {
    deleteExpiredSessions();

    if (memoryCache.get(sessionId)) {
        const currentTime = utils.utcInSeconds();

        const updateStatement = `UPDATE sessions SET session_data='${JSON.stringify(memoryCache.get(sessionId))}', last_update_time=${currentTime}, expire_at=${currentTime + SESSION_TIMEOUT} WHERE session_id='${sessionId}'`;

        localDb.prepare(updateStatement).run();
    }
}

function destroySession(sessionId, reason) {
    if (!doesSessionExist(sessionId)) return;

    utils.log(`Destroying session ${sessionId} | ${reason}`);

    const deleteStatement = `DELETE FROM sessions WHERE session_id = '${sessionId}'`;

    localDb.prepare(deleteStatement).run();
    if (memoryCache.get(sessionId)) delete memoryCache.get(sessionId);
}

async function createSession(request, response) {
    if (request.body['token'] === undefined) return { error: 'No token sent' };

    const data = new URLSearchParams({
        'client_id': process.argv.includes('debug') ? process.env.DISCORD_CLIENT_ID_DEBUG : process.env.DISCORD_CLIENT_ID,
        'client_secret': process.argv.includes('debug') ? process.env.DISCORD_CLIENT_SECRETE_DEBUG : process.env.DISCORD_CLIENT_SECRETE,
        'grant_type': 'authorization_code',
        'code': request.body['token'],
        'redirect_uri': process.argv.includes('debug') ? process.env.DISCORD_REDIRECT_URI_DEBUG : process.env.DISCORD_REDIRECT_URI
    });

    utils.log(data);


    try {
        axios.post("https://discordapp.com/api/oauth2/token", data)
            .then((result) => {

                const resultData = result.data;

                const existingSessionId = getSessionIdFromToken(resultData.access_token);

                if (existingSessionId) {
                    // update memory cache
                    const session = hasLatestSessionData(existingSessionId);

                    response.send({ 'sessionId': existingSessionId });
                }
                else {
                    const sessionId = uuid.v4();
                    const currentTime = utils.utcInSeconds();

                    memoryCache.set(sessionId, {
                        user: {},
                        token: resultData.access_token,// they last for like 100+ days, no need to be concerned about refreshing
                        last_update_time: currentTime
                    })

                    const createStatement = `INSERT INTO sessions VALUES ('${sessionId}','${JSON.stringify(memoryCache.get(sessionId))}','${resultData.access_token}',${currentTime},${currentTime},${currentTime + SESSION_TIMEOUT})`;

                    localDb.prepare(createStatement).run()

                    utils.log(`Created new session for user ${sessionId}`);

                    response.send({ 'sessionId': sessionId });
                }

            }, (error) => {
                const responseData = error.response.data;
                responseData.result = 'error';
                response.send(responseData);
            });

    } catch (error) {
        response.send({ 'error': `${error}` });
    }
}

async function getSessionLifetime(request, response) {
    const sessionId = request.get('sessionId');

    if (!sessionId) return response.send({ error: NO_SESSION_ID_MESSAGE });

    const checkStatement = `SELECT created_at, expire_at FROM sessions WHERE session_id='${sessionId}'`;

    const foundRows = localDb.prepare(checkStatement).all()

    if (foundRows.length === 0) return response.send({ error: EXPIRED_SESSION_MESSAGE });

    response.send(foundRows[0]);
}

async function notifyUserUpdate(userId){
    const rows = localDb.prepare(`SELECT targets FROM user_notifications WHERE id='${userId}'`).all();
    if(rows.length)
    {
        const targets = rows[0].targets.split(',');

        if(targets.length)
        {
            targets.forEach(function(target){
                try {
                    axios.post(target,{ id : userId}).catch((error)=>{
                        utils.log(error.message)
                    });
                } catch (error) {
                    utils.log(error);
                }
                
            });
        }
    }
}

async function notifyGuildUpdate(guildId){
    const rows = localDb.prepare(`SELECT target FROM guild_notifications WHERE id='${guildId}'`).all();

    if(rows.length)
    {
        try {
            const target = rows[0].target;
            axios.post(target,{ id : guildId}).catch((error)=>{
                utils.log(error.message)
            }); 
        } catch (error) {
            utils.log(error);
        }  
    }
}

async function getUser(request, response) {

    const sessionId = request.get('sessionId');

    if (!sessionId) return response.send({ error: NO_SESSION_ID_MESSAGE });

    const session = hasLatestSessionData(sessionId);

    if (!session) return response.send({ error: EXPIRED_SESSION_MESSAGE });


    if (Math.random() < MAKE_NEW_API_REQUEST_PROBABILITY && session.user && session.user.discordInfo) {
        response.send({ ...session.user.dbInfo, ...session.user.discordInfo });
        return;
    }

    const headers = {
        'Authorization': `Bearer ${session.token}`
    }

    const userDiscordDataResponse = await axios.get("https://discordapp.com/api/oauth2/@me", { headers: headers }).catch((error) => {
        const responseData = error.response.data;
        responseData.result = 'error';
        response.send(responseData);
    })

    if (userDiscordDataResponse.data && userDiscordDataResponse.data.user) {

        session.user.discordInfo = userDiscordDataResponse.data.user;

        const userDatabaseResponse = await db.get(`/tables/user_settings/rows?WHERE=id%3D%${userDiscordDataResponse.data.user.id}`).catch(utils.log);

        const userSettings = userDatabaseResponse.data;

        if (userSettings.data.length === 0) {
            const userSetting = {
                id: userDiscordDataResponse.data.user.id,
                color: '#87ceeb',
                card_bg_id: '',
                card_bg_url: '',
                afk_message: 'Im sleeping or something',
                afk_options: ''
            }

            await db.post('/tables/user_settings/rows', userSetting).catch(utils.log);

            session.user.dbInfo = {
                id: userDiscordDataResponse.data.user.id,
                color: '#87ceeb',
                card_bg_id: '',
                card_bg_url: '',
                afk_message: 'Im sleeping or something',
                afk_options: new URLSearchParams()
            }
        }
        else {
            session.user.dbInfo = userSettings.data[0];
            session.user.dbInfo.afk_options = new URLSearchParams(session.user.dbInfo.afk_options);
        }

        updateSession(sessionId);

        response.send({ ...session.user.dbInfo, ...session.user.discordInfo });
    }
}

async function getGuilds(request, response) {

    const sessionId = request.get('sessionId');

    if (!sessionId) return response.send({ error: NO_SESSION_ID_MESSAGE });

    const session = hasLatestSessionData(sessionId);

    if (!session) return response.send({ error: EXPIRED_SESSION_MESSAGE });

    if(Math.random() < MAKE_NEW_API_REQUEST_PROBABILITY  && session.guilds ) return response.send(session.guilds);

    const headers = {
        'Authorization': `Bearer ${session.token}`
    }

    

    const discordGuildsResponse = await axios.get("https://discordapp.com/api/users/@me/guilds", { headers: headers })

    if(!discordGuildsResponse.data) return response.send({error : 'recieved invalid response from discord api'});

    const discordGuilds = discordGuildsResponse.data;

    const isAdmin = function (permissions) {
        if (typeof permissions !== 'number') return false;
        return eval(`(${permissions}n & (1n << 3n)) === (1n << 3n)`)
    }

    const guildsWithRights = discordGuilds.filter(function (guild) {
        return guild.owner || isAdmin(guild.permissions);
    });

    let whereStatement = '';

    guildsWithRights.forEach(function (guild) {
        whereStatement += `id='${guild.id}'${guild.id !== guildsWithRights[guildsWithRights.length - 1].id ? ' OR ' : ''}`;
    });

    const params = new URLSearchParams();

    params.append('where', whereStatement);

    utils.log(whereStatement)

    const databaseGuildsResponse = await db.get(`/tables/guild_settings/rows`,{ params : params }).catch(utils.log);

    if(!databaseGuildsResponse.data) return response.send({error : 'recieved invalid response from database'});

    const databaseGuilds = databaseGuildsResponse.data.data;

    if(databaseGuilds.length);

    const databaseGuildsIds = databaseGuilds.map(guild => guild.id);

    guildsWithRights.sort(function(guildA,guildB)
    {
        guildA.hasBot = databaseGuildsIds.includes(guildA.id);

        guildB.hasBot = databaseGuildsIds.includes(guildB.id);

        return (guildA.hasBot === guildB.hasBot)? 0 : guildA.hasBot ? -1 : 1;
    })

    utils.log(guildsWithRights);

    response.send(guildsWithRights);

    updateSession(sessionId);
}

async function getGuild(request, response) {

    const sessionId = request.get('sessionId');

    if (!sessionId) return response.send({ error: NO_SESSION_ID_MESSAGE });

    const session = hasLatestSessionData(sessionId);

    if (!session) return response.send({ error: EXPIRED_SESSION_MESSAGE });

    if (request.body["guildId"] === undefined) return response.send({ error: "No guild Id was sent" });

    if(Math.random() < MAKE_NEW_API_REQUEST_PROBABILITY  && session.guilds && session.getGuilds[`${guildId}`]) return response.send(session.guilds[`${guildId}`]);

    const headers = {
        'Authorization': `Bearer ${this.discordApiToken.access_token}`
    }

    const guildId = request.body["guildId"];

    response.send({ error : 'Endpoint not ready' })
}

async function getGuildSettings(request, response) {

    const sessionId = request.get('sessionId');

    if (!sessionId) return response.send({ error: NO_SESSION_ID_MESSAGE });

    const session = hasLatestSessionData(sessionId);

    if (!session) return response.send({ error: EXPIRED_SESSION_MESSAGE });

    const guildId = request.params.guildId;

    if (!guildId) return response.send({ error: "No guild Id was sent" });

    const guildDatabaseResponse = await db.get(`/tables/guild_settings/rows?WHERE=id%3D%${guildId}`).catch(utils.log);

        const guildSettings = guildDatabaseResponse.data;

        if (!guildSettings.data.length) {
            response.send({ error : 'guildDoesNotExist' });
        }
        else
        {
            const guildData = guildSettings.data[0];

            response.send(guildData);
        }
}

async function updateGuildSettings(request, response) {

    const sessionId = request.get('sessionId');

    if (!sessionId) return response.send({ error: NO_SESSION_ID_MESSAGE });

    const session = hasLatestSessionData(sessionId);

    if (!session) return response.send({ error: EXPIRED_SESSION_MESSAGE });

    const guildId = request.body["guildId"];

    if (!guildId) return response.send({ error: "No guild Id was sent" });

    const data = request.body["guildId"];

    if(!data) return response.send({ error: "No Data to update was sent" });

    const payload = { id: guildId , ...data};

    const guildDatabaseResponse = await db.post(`/tables/guild_settings/rows`,payload).catch(utils.log);

    response.send({ result : 'success' });

    notifyGuildUpdate(guildId);
}

async function updateCard(request, response) {

    const sessionId = request.get('sessionId');

    if (!sessionId) return response.send({ error: NO_SESSION_ID_MESSAGE });

    const session = hasLatestSessionData(sessionId);

    if (!session) return response.send({ error: EXPIRED_SESSION_MESSAGE });

    const payload = request.body;

    const base64Card = payload.background;

    if (base64Card) {
        const buffer = Buffer.from(base64Card, "base64");

        const oldBgId = session.user.dbInfo.card_bg_id;

        const formData = {
            api_key: process.env.IMAGE_SHACK_API_KEY,
            album: 'umeko-rank-cards',
            'customBufferFile': {
                value: buffer,
                options: {
                    filename: `user-card-background-${session.user.discordInfo.id}.jpg`
                }
            }
        }

        const options = {
            method: 'POST',
            uri: 'https://api.imageshack.com/v2/images',
            formData: formData,
            headers: {
                /* 'content-type': 'multipart/form-data' */ // Is set automatically
            }
        };

        const imageUploadResponse = await rp(options).catch((error) => {
            utils.log(err);
            response.send({ error: 'error saving image' });
        });

        if (imageUploadResponse) {
            const data = JSON.parse(imageUploadResponse);
            session.user.dbInfo.card_bg_id = data.result.images[0].id;
            session.user.dbInfo.card_bg_url = `https://imagizer.imageshack.com/v2/1000x300q90/${data.result.images[0].server}/${data.result.images[0].filename}`;

            if (oldBgId !== '') {
                axios.delete(`https://api.imageshack.com/v2/images/${oldBgId}?auth_token=${process.env.IMAGE_SHACK_API_TOKEN}`).catch((error) => {
                    utils.log(error.response.data)
                    utils.log(error.response.data.error);
                });
            }
        }
    }

    session.user.dbInfo.color = payload.color;
    session.user.dbInfo.card_opacity = payload.card_opacity;

    const dbPayload = {
        id: session.user.discordInfo.id,
        color: session.user.dbInfo.color,
        card_opacity: session.user.dbInfo.card_opacity,
        card_bg_id: session.user.dbInfo.card_bg_id,
        card_bg_url: session.user.dbInfo.card_bg_url
    }

    await db.post(`/tables/user_settings/rows`, dbPayload).catch(utils.log);

    response.send({ url: session.user.dbInfo.card_bg_url });

    notifyUserUpdate(session.user.discordInfo.id);

    updateSession(sessionId);
}

async function updateGuildNotifications(request, response) {
    const op = request.body['op'];
    const data = request.body['data'];
    const target = request.body['target'];

    if (!op) return response.send({ error: 'No Operation Sent' });

    if (!validOPs.includes(op.toLowerCase())) return response.send({ error: 'invalid op' });

    if (!data) return response.send({ error: 'No Guilds Sent' });

    if (!data.filter) return response.send({ error: 'data must be of type Array|List' });

    if (!data.length) return response.send({ error: 'data cannot be empty' });

    if (target === null) return response.send({ error: 'No Target Sent' });

    if (!target.length) return response.send({ error: 'Target cannot be empty' });

    if (op === validOPs[0]) {
        let whereStatement = 'WHERE ';

        data.forEach(function (id) {
            whereStatement += `id='${id}'${id === data[data.length - 1] ? "" : " OR "}`;
        })

        const getguildSubscriptionsStatement = `SELECT * FROM guild_notifications ${whereStatement}`;

        const currentSubscriptions = localDb.prepare(getguildSubscriptionsStatement).all();

        const subscriptionsAsNormalArray = currentSubscriptions.map(row => row.id);

        const guildsToInsert = data.filter(guild => !subscriptionsAsNormalArray.includes(guild));

        guildsToInsert.forEach(function (guild) {
            localDb.prepare(`INSERT INTO guild_notifications VALUES ('${guild}','${target}')`).run();
        })

        currentSubscriptions.forEach(function (row) {
            if (row.target !== target) {
                localDb.prepare(`UPDATE guild_notifications SET target='${target}' WHERE id='${row.id}'`).run();
            }
        });

        response.send({ result: 'success', updated: currentSubscriptions.length, inserted: guildsToInsert.length });
    }
    else if (op === validOPs[1]) {

        let whereStatement = 'WHERE ';

        data.forEach(function (id) {
            whereStatement += `id='${id}'${id === data[data.length - 1] ? "" : " OR "}`;
        })

        const getguildSubscriptionsStatement = `SELECT * FROM guild_notifications ${whereStatement}`;

        const currentSubscriptions = localDb.prepare(getguildSubscriptionsStatement).all();

        let removedCount = 0;

        currentSubscriptions.forEach(function (row) {
            localDb.prepare(`DELETE FROM guild_notifications WHERE id='${row.id}'`).run();
        });

        response.send({ result: 'success', removed : removedCount });
    }

}

async function updateUserNotifications(request, response) {
    const op = request.body['op'];
    const data = request.body['data'];
    const target = request.body['target'];

    if (!op) return response.send({ error: 'No Operation Sent' });

    if (!validOPs.includes(op.toLowerCase())) return response.send({ error: 'invalid op' });

    if (!data) return response.send({ error: 'No Guilds Sent' });

    if (!data.filter) return response.send({ error: 'data must be of type Array|List' });

    if (!data.length) return response.send({ error: 'data cannot be empty' });

    if (target === null) return response.send({ error: 'No Target Sent' });

    if (!target.length) return response.send({ error: 'Target cannot be empty' });

    if (op === validOPs[0]) {
        let whereStatement = 'WHERE ';

        data.forEach(function (id) {
            whereStatement += `id='${id}'${id === data[data.length - 1] ? "" : " OR "}`;
        })

        const getguildSubscriptionsStatement = `SELECT * FROM user_notifications ${whereStatement}`;

        const currentSubscriptions = localDb.prepare(getguildSubscriptionsStatement).all();

        const subscriptionsAsNormalArray = currentSubscriptions.map(row => row.id);

        const usersToInsert = data.filter(user => !subscriptionsAsNormalArray.includes(user));

        usersToInsert.forEach(function (user) {
            localDb.prepare(`INSERT INTO user_notifications VALUES ('${user}','${target}')`).run();
        })

        currentSubscriptions.forEach(function (row) {
            const targets = row.targets.split(',');
            if (!targets.includes(target)) {
                targets.push(target);
                localDb.prepare(`UPDATE user_notifications SET targets='${targets.join(',')}' WHERE id='${row.id}'`).run();
            }
        });

        response.send({ result: 'success', updated: currentSubscriptions.length, inserted: usersToInsert.length });
    }
    else if (op === validOPs[1]) {

        let whereStatement = 'WHERE ';

        data.forEach(function (id) {
            whereStatement += `id='${id}'${id === data[data.length - 1] ? "" : " OR "}`;
        })

        const getUserSubscriptionsStatement = `SELECT * FROM user_notifications ${whereStatement}`;

        const currentSubscriptions = localDb.prepare(getUserSubscriptionsStatement).all();

        let removedCount = 0;

        currentSubscriptions.forEach(function (row) {
            const targets = row.targets.split(',');
            if (targets.includes(target)) {
                removedCount++;
                targets.splice(targets.indexOf(target),1);
                localDb.prepare(`UPDATE user_notifications SET targets='${targets.join(',')}' WHERE id='${row.id}'`).run();
            }
        });

        response.send({ result: 'success', removed : removedCount });
    }
}

module.exports = {
    getServerInfo : getServerInfo,
    getServerPing : getServerPing,
    doesSessionExist: doesSessionExist,
    createSession: createSession,
    destroySession: destroySession,
    getSessionLifetime: getSessionLifetime,
    getUser: getUser,
    getGuilds: getGuilds,
    getGuildSettings: getGuildSettings,
    updateCard: updateCard,
    updateGuildNotifications: updateGuildNotifications,
    updateUserNotifications: updateUserNotifications
}

if (dataBus.bHasLoaded) {
    utils.log('Session Handeling Reloaded');
}
else {
    Object.assign(require('./dataBus'), { bHasLoaded: true });
}
