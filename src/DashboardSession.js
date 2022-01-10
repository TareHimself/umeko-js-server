const EventEmitter = require("events");
const axios = require('axios');
const { clear } = require("console");
const sessionTimeout = 900000; //15 minutes

module.exports = class DasboardSession extends EventEmitter {

    constructor(serverSocket, sessionId, discordApiToken) {
        super();
        this.serverSocket = serverSocket;
        this.sessionId = sessionId;
        this.discordApiToken = discordApiToken;
        this.cache = {};
        this.timeout = setTimeout(this.destroy, sessionTimeout, this);
        this.refreshTokenReference = setInterval(this.refreshToken, this.discordApiToken.expires_in * 1000);
    }


    async getUser(res) {
        this.refreshTimeout();
        if (this.cache.user !== undefined) {
            res.send(this.cache.user);
            return;
        }

        const headers = {
            'Authorization': `${this.discordApiToken.token_type} ${this.discordApiToken.access_token}`
        }

        axios.get("https://discordapp.com/api/oauth2/@me", { headers: headers })
            .then((result) => {

                if (result.data !== undefined && result.data.user !== undefined) {
                    this.cache.user = result.data.user;
                }

                res.send(result.data.user);
            }, (error) => {
                const responseData = error.response.data;
                responseData.result = 'error';
                res.send(responseData);
            });
    }

    async getGuilds(res) {

        this.refreshTimeout();

        const headers = {
            'Authorization': `${this.discordApiToken.token_type} ${this.discordApiToken.access_token}`
        }

        axios.get("https://discordapp.com/api/users/@me/guilds", { headers: headers })
            .then((result) => {

                const isAdmin = function (permissions) {
                    if (typeof permissions !== 'number') return false;
                    return eval(`(${permissions}n & (1n << 3n)) === (1n << 3n)`)
                }

                const guildsWithRights = result.data.filter(function (guild){
                    if (guild.owner || isAdmin(guild.permissions))
                    {
                        guild.clusterId = 0;
                        return true;
                    }

                    return false;
                });


                res.send(guildsWithRights);
            }, (error) => {
                const responseData = error.response.data;
                responseData.result = 'error';
                res.send(responseData);
            });
    }

    async getGuild(req, res) {
        this.refreshTimeout();

        if (req.body["guildId"] === undefined) return res.send({ result: 'error', error: "No guild Id was sent" });


        const headers = {
            'Authorization': `${this.discordApiToken.token_type} ${this.discordApiToken.access_token}`
        }

        const guildId = req.body["guildId"];

    }

    async getGuildSettings(req,res)
    {
        this.refreshTimeout();

        if (req.body["guildId"] === undefined) return res.send({ result: 'error', error: "No guild Id was sent" });
        

        this.serverSocket.on('guildSettings', onSettingsRecieved);
        
        this.serverSocket.emit('getGuildSettings',req.body["guildId"]);
    }



    async refreshToken(ref) {
        const data = new URLSearchParams({
            'client_id': process.env.CLIENT_ID,
            'client_secret': process.env.CLIENT_SECRETE,
            'grant_type': 'refresh_token',
            'refresh_token': ref.discordApiToken.refresh_token,
        });

        try {
            axios.post("https://discordapp.com/api/oauth2/token", data)
                .then((result) => {
                    ref.discordApiToken = result.data;
                }, (error) => {
                    const responseData = error.response.data;
                    responseData.result = 'error';
                    log("Error refreshing token for session " + ref.sessionId + " \n" + responseData);
                });

        } catch (error) {
            log("Error refreshing token for session " + ref.sessionId + " \n" + error);
        }
    }

    refreshTimeout() {
        log(`Session ${this.sessionId} refreshed`);
        clearTimeout(this.timeout);
        this.timeout = setTimeout(this.destroy, sessionTimeout, this);
    }

    destroy(ref) {
        clearInterval(ref.refreshTokenReference);
        ref.emit('destroy', ref.sessionId,"Inactivity");
    }

}