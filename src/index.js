
const process = require('process');
const fs = require('fs');
const cors = require('cors');
const express = require('express');
const http = require('http');


const HeatSync = require('heatsync');

const sync = new HeatSync();

process.env = sync.require('../secretes.json');
const utils = sync.require('./utils');

const app = express();

app.use(express.json());
app.use(cors());

const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server);

const req = require('express/lib/request');

const port = 8080;

const dashboardSessions = new Map();

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



const verifiedSockets = new Map();
let clientSocket = undefined;


io.botConnections = new Map();

io.on('connection', (socket) => {
    log('a user connected');


    socket.on('identify', (bot) => {
        if (bot.id === "Umeko") {
            bot.guilds.forEach(function (guild, index) {
                io.botConnections.set(guild,socket);
            });

            log(`Bot Client Connected`);
        }
    });

    socket.on('disconnect', () => {
        if (socket.id == io.relSocket.id) {
            io.relSocket = undefined;

            log('Bot Client Disconnected');
        }
        else 
        {
            log('User Client Disconnected');
        }
    });
});