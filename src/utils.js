const uuid = require('uuid');
const axios = require('axios');
const SessionHandler = require('./session_handler');

function time(sep = '') {

    const currentDate = new Date();

    if (sep === '') {
        return currentDate.toUTCString();
    }

    const date = ("0" + currentDate.getUTCDate()).slice(-2);

    const month = ("0" + (currentDate.getUTCMonth() + 1)).slice(-2);

    const year = currentDate.getUTCFullYear();

    const hours = ("0" + (currentDate.getUTCHours())).slice(-2);

    const minutes = ("0" + (currentDate.getUTCMinutes())).slice(-2);

    const seconds = ("0" + currentDate.getUTCSeconds()).slice(-2);

    return `${year}${sep}${month}${sep}${date}${sep}${hours}${sep}${minutes}${sep}${seconds}`;
}

function log(data) {

    const argumentValues = Object.values(arguments);

    argumentValues.unshift(`${time(':')} ::`);

    console.log.apply(null,argumentValues);
}

function verifyRequest(request) {
    if (request.get('sessionId') === undefined) return false;

    if (dashboardSessions.get(request.get('sessionId')) === undefined) return false;

    return true;
}

function destroySession(sessions,sessionId,reason) {
    if(dashboardSessions.get(sessionId) === undefined) return;
    log(`Destroying session ${sessionId} reason : ${reason}`);
    dashboardSessions.get(sessionId).removeListener('destroy', destroySession);
    dashboardSessions.delete(sessionId);
}

async function createSession(req,res,io) {
    if (req.body['token'] === undefined) return { 'result': 'error', 'error': 'no token sent' };

    log(req.body['token']);

    const data = new URLSearchParams({
        'client_id': process.env.DISCORD_CLIENT_ID,
        'client_secret': process.env.DISCORD_CLIENT_SECRETE,
        'grant_type': 'authorization_code',
        'code': req.body['token'],
        'redirect_uri': process.argv.includes('alpha') ? process.env.DISCORD_REDIRECT_URI_ALPHA : process.env.DISCORD_REDIRECT_URI
    });


    try {
        axios.post("https://discordapp.com/api/oauth2/token", data)
            .then((result) => {

                const sessionId = uuid.v4();

                const newSession = new SessionHandler(io, sessionId, result.data);

                dashboardSessions.set(sessionId, newSession);

                newSession.on('destroy',destroySession)

                log(`Created new session for user ${sessionId}`);

                res.send({ 'result': 'success', 'sessionId': sessionId });
            }, (error) => {
                const responseData = error.response.data;
                responseData.result = 'error';
                res.send(responseData);
            });

    } catch (error) {
        res.send({ 'result': 'error', 'error': `${error}` });
    }
}

module.exports.log = log;
module.exports.verifyRequest = verifyRequest;
module.exports.destroySession = destroySession;
module.exports.createSession = createSession;