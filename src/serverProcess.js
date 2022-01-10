const process = require('process');
const fs = require('fs');
const cors = require('cors');
const express = require('express');


process.env = require('../secretes.json');
const utils = require('./utils');

const app = express();

app.use(express.json());
app.use(cors());
app.set('trust proxy', true);

const port = 8080;

// map of sessions 
const sessions = new Map();

global.dashboardSessions = dashboardSessions;

app.get('/', (request, response) => {
    response.send('You Should\'nt be here');
});

// used to create a session for the user
app.post('/create-session', (request, response) => {
    utils.createSession(request,response);
});

// used to create a session for the user
app.post('/destroy-session', (request, response) => {
    utils.destroySession(request.body['sessionId'],'User Logout');
    response.send({ 'result': 'success'});
});


// checks if the session is  still valid
app.get('/verify', (request, response) => {
    if (utils.verifyRequest(request)) return response.send({ result: 'success' });

    response.send({ result: 'fail' });
});

// makes a request to the api for the user that was authenticated
app.get('/user', (request, response) => {
    if (!utils.verifyRequest(request)) return response.send({ result: 'error', error: " invalid session Id" });

    dashboardSessions.get(request.get('sessionId')).getUser(response);

});

// makes a request to the api for the user that was authenticated
app.get('/guilds', (request, response) => {
    if (!utils.verifyRequest(request)) return response.send({ result: 'error', error: " invalid session Id" });

    dashboardSessions.get(request.get('sessionId')).getGuilds(response);

});

app.get('/settings', (request, response) => {
    if (!utils.verifyRequest(request)) return response.send({ result: 'error', error: " invalid session Id" });

    dashboardSessions.get(request.get('sessionId')).getGuildSettings(request,response);

});

server.listen(port, () => {
    log(`Master HTTP Server listening at http://localhost:${port}/`)
});