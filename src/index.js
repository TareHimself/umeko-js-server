process.env = require('../secretes.json');

const port = process.argv.includes('debug') ? 49154 : 8080;
if(process.argv.includes('debug')) process.env.DB_API = process.env.DB_API_DEBUG;

const db = require('./db');
const fs = require('fs');
const cors = require('cors');
const express = require('express');
const utils = require('./utils');
const uuid = require('uuid');   
const axios = require('axios');
const SessionHandler = require('./SessionHandler');

const app = express();

app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({ extended: true, limit: '50mb'}));
app.use(cors());



const dashboardSessions = new Map();


function destroySession(sessionId,reason) {
    if(dashboardSessions.get(sessionId) === undefined) return;
    utils.log(`Destroying session ${sessionId} reason : ${reason}`);
    dashboardSessions.get(sessionId).removeListener('destroy', destroySession);
    dashboardSessions.delete(sessionId);
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

                const sessionId = uuid.v4();

                const newSession = new SessionHandler(sessionId, result.data);

                dashboardSessions.set(sessionId, newSession);

                newSession.on('destroy',destroySession)

                utils.log(`Created new session for user ${sessionId}`);

                response.send({ 'sessionId': sessionId });
            }, (error) => {
                const responseData = error.response.data;
                responseData.result = 'error';
                response.send(responseData);
            });

    } catch (error) {
        response.send({ 'result': 'error', 'error': `${error}` });
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

    if (dashboardSessions.get(request.get('sessionId')) === undefined) return response.send({ error : 'Invalid session Id'});

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

    dashboardSessions.get(request.get('sessionId')).getUser(response);
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