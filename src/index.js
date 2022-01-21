process.env = require('../secretes.json');
const port = process.argv.includes('debug') ? 49154 : 8080;
if(process.argv.includes('debug')) process.env.DB_API = process.env.DB_API_DEBUG;

const db = require('./db');
const sessionStore = require('better-sqlite3')('./src/sessionStore.db', { fileMustExist: true });
const fs = require('fs');
const cors = require('cors');
const express = require('express');
const utils = require('./utils');
const uuid = require('uuid');   
const axios = require('axios');
const compression = require('compression');
const SessionHandler = require('./SessionHandler');

const app = express();

app.use(compression())
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({ extended: true, limit: '50mb'}));
app.use(cors());


if(process.argv.includes('wipe')){
    const { sessionsTableFormat } = require('../config.json');

    const deleteStatement = `DROP TABLE IF EXISTS \`${sessionsTableFormat.name}\`;`;

    sessionStore.prepare(deleteStatement).run();

    let createStatement = `CREATE TABLE IF NOT EXISTS ${sessionsTableFormat.name} (\n`;

    sessionsTableFormat.rows.forEach(element => {
            createStatement += `${element.name} ${element.type} ${element.option} ${element === sessionsTableFormat.rows[sessionsTableFormat.rows.length - 1] ? "" : ","}\n`
        });

        createStatement += ');';

    sessionStore.prepare(createStatement).run();

}

const memoryCache = new Map();

function deleteExpiredSessions()
{
    const currentTime = utils.utcInSeconds();

    const checkStatement = `SELECT session_id FROM sessions WHERE expire_time < ${currentTime}`;

    const sessionIds = sessionStore.prepare(checkStatement).all();

    if(sessionIds.length === 0) return;

    utils.log(`Deleting ${sessionIds.length} expired sessions`);

    const deleteStatement = `DELETE FROM sessions WHERE expire_time < ${currentTime}`;
    // delete local db entries first
    sessionStore.prepare(deleteStatement).run();

    sessionIds.forEach(function (row){
        if(memoryCache.get(row.session_id)){
            delete memoryCache.get(row.session_id);
        } 
    });
}

function doesSessionExist(sessionId)
{

    deleteExpiredSessions();

    const checkStatement = `SELECT session_id FROM sessions WHERE session_id='${sessionId}'`;

    const foundRow = sessionStore.prepare(checkStatement).all().find(function (row){
        return row.session_id === sessionId;
    });

    return foundRow !== undefined;
}

function hasLatestSessionData(sessionId)
{
    deleteExpiredSessions();

    if(memoryCache.get(sessionId))
    {
        const checkStatement = `SELECT last_update_time FROM sessions WHERE 'session_id'='${sessionId}'`;
        const lastUpdateTime = sessionStore.prepare(checkStatement).all()[0];

        if(lastUpdateTime < memoryCache.get(sessionId).lastUpdateTime)
        {
            const fetchStatement = `SELECT session_data FROM sessions WHERE 'session_id'='${sessionId}'`;
            const sessionData = sessionStore.prepare(fetchStatement).all()[0];
            console.log(sessionData);
            // update memory cache here
        }
    }
    
    
    return sessionStore.prepare(checkStatement).all().length === 0;
}

function destroySession(sessionId,reason) {
    if(!doesSessionExist(sessionId)) return;


    utils.log(`Destroying session ${sessionId} reason : ${reason}`);
    
    const deleteStatement = `DELETE FROM sessions WHERE session_id = '${sessionId}'`;
    // delete local db entries first
    sessionStore.prepare(deleteStatement).run();
    if(memoryCache.get(sessionId)) delete memoryCache.get(sessionId);
}

async function createSession(request,response) {
    if (request.body['token'] === undefined) return { error: 'No token sent' };

    const data = new URLSearchParams({
        'client_id': process.env.DISCORD_CLIENT_ID,
        'client_secret': process.env.DISCORD_CLIENT_SECRETE,
        'grant_type': 'authorization_code',
        'code': request.body['token'],
        'redirect_uri': process.argv.includes('debug') ? process.env.DISCORD_REDIRECT_URI_DEBUG : process.env.DISCORD_REDIRECT_URI
    }); 


    try {
        axios.post("https://discordapp.com/api/oauth2/token", data)
            .then((result) => {

                const resultData = result.data;

                const sessionId = uuid.v4();

                memoryCache.set(sessionId,{
                    exampleField : 'exampleData',
                })

                const currentTime = utils.utcInSeconds();
                const createStatement = `INSERT INTO sessions VALUES ('${sessionId}','${JSON.stringify(memoryCache.get(sessionId))}','${resultData.access_token}','${resultData.refresh_token}',${currentTime + resultData.expires_in},${currentTime},${currentTime + 60})`;
                
                sessionStore.prepare(createStatement).run()

                utils.log(`Created new session for user ${sessionId}`);

                response.send({ 'sessionId': sessionId });
            }, (error) => {
                const responseData = error.response.data;
                responseData.result = 'error';
                response.send(responseData);
            });

    } catch (error) {
        response.send({ 'error': `${error}` });
    }
}

app.get('/', (request, response) => {
    response.send('You Should\'nt be here');
});

// used to create a session for the user
app.post('/create-session', (request, response) => {
    createSession(request,response);
});

app.use(function (request, response, next) {
    
    if (request.get('sessionId') === undefined) return response.send({ error : 'No session id given'});

    if (!doesSessionExist(request.get('sessionId'))) return response.send({ error : 'Invalid session Id'});

    next();
});

// used to create a session for the user
app.post('/destroy-session', (request, response) => {
    destroySession(request.body['sessionId'],'User Logout');
    response.send({ 'result': 'success'});
});


// checks if the session is  still valid
app.get('/verify', (request, response) => {
    response.send({ data: 'success' });
});

// makes a request to the api for the user that was authenticated
app.get('/user', (request, response) => {

    //dashboardSessions.get(request.get('sessionId')).getUser(response);
});

// makes a request to the api for the user that was authenticated
app.get('/guilds', (request, response) => {

    dashboardSessions.get(request.get('sessionId')).getGuilds(response);

});

app.get('/settings', (request, response) => {

    dashboardSessions.get(request.get('sessionId')).getGuildSettings(request,response);

});

// used to create a session for the user
app.post('/update-card', (request, response) => {
    dashboardSessions.get(request.get('sessionId')).updateCard(request,response);
});


app.listen(port, () => {
    utils.log(`Master HTTP Server listening at http://localhost:${port}/`)
});