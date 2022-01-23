const fs = require('fs');
const cors = require('cors');
const express = require('express');
const utils = require('./utils');
const compression = require('compression');
process.env = require('../secretes.json');

const dataBus = require('./dataBus');


if (process.argv.includes('debug')) process.env.DB_API = process.env.DB_API_DEBUG;

// to store sessions in memory
const memoryCache = new Map();

// connect to the local db containing all active sessions
const localDb = require('better-sqlite3')('./src/sessionStore.db', { fileMustExist: true });

// make them globally accessible
Object.assign(dataBus, { localDb : localDb, memoryCache: memoryCache });

const sync = new (require('heatsync'));

sync.events.on('error',error=>{
    utils.log(error);
})

const wsm = sync.require('./webServerMethods');

const app = express();

app.use(compression())
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

const port = process.argv.includes('debug') ? 49154 : 8080;




app.get('/', async (request, response) => {
    wsm.getServerInfo(request, response).catch(utils.log);
});

app.get('/ping',async (request, response) => {
    wsm.getServerPing(request, response).catch(utils.log);
});

// used to create a session for the user
app.post('/create-session', async (request, response) => {
    wsm.createSession(request, response).catch(utils.log);
});

// used to create a session for the user
app.post('/destroy-session', async (request, response) => {
    wsm.destroySession(request.body['sessionId'], 'User Logout');
    response.send({ 'result': 'success' });
});

// used to create a session for the user
app.post('/notifications-guild', async (request, response) => {
    wsm.updateGuildNotifications(request,response).catch(utils.log);
});

// used to create a session for the user
app.post('/notifications-user', async (request, response) => {
    wsm.updateUserNotifications(request,response).catch(utils.log);
});

app.use(async function (request, response, next) {

    if (request.get('sessionId') === undefined) return response.send({ error: 'No session id given' });

    if (!wsm.doesSessionExist(request.get('sessionId'))) return response.send({ error: 'Invalid session Id' });

    next();
});

// checks if the session is  still valid
app.get('/session-lifetime', async (request, response) => {
    wsm.getSessionLifetime(request, response).catch(utils.log);
});

// makes a request to the api for the user that was authenticated
app.get('/user', async (request, response) => {

    wsm.getUser(request, response).catch(utils.log);
});

// makes a request to the api for the user that was authenticated
app.get('/guilds', async (request, response) => {

    wsm.getGuilds(request, response).catch(utils.log);

});

app.get('/settings/:guildId', async (request, response) => {
    wsm.getGuildSettings(request, response).catch(utils.log);
});

// used to create a session for the user
app.post('/update-card', async (request, response) => {
    wsm.updateCard(request, response).catch(utils.log);
});


app.listen(port, () => {
    utils.log(`Master HTTP Server listening at http://localhost:${port}/`)
});

sync.events.on('error',utils.log);