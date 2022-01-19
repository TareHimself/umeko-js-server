const EventEmitter = require("events");
const axios = require('axios');
const utils = require('./utils');
const FormData = require('form-data');
const sessionTimeout = 900000; //15 minutes
var rp = require('request-promise');
const fs = require("fs");
const db = require('./db');

module.exports = class SessionHandler extends EventEmitter {

    constructor(sessionId, discordApiToken) {
        super();
        this.sessionId = sessionId;
        this.discordApiToken = discordApiToken;
        this.cache = { user: {} };
        this.timeout = setTimeout(this.destroy.bind(this), sessionTimeout);
        this.refreshTokenReference = setInterval(this.refreshToken.bind(this), this.discordApiToken.expires_in * 1000);
    }


    async getUser(res) {
        this.refreshTimeout();
        if (this.cache.user.discordInfo) {
            res.send({...this.cache.user.dbInfo,...this.cache.user.discordInfo});
            return;
        }

        const headers = {
            'Authorization': `${this.discordApiToken.token_type} ${this.discordApiToken.access_token}`
        }

        const ref = this;

        const userDiscordDataResponse = await axios.get("https://discordapp.com/api/oauth2/@me", { headers: headers }).catch((error) => {
            const responseData = error.response.data;
            responseData.result = 'error';
            res.send(responseData);
        })

        if (userDiscordDataResponse.data && userDiscordDataResponse.data.user) {

            this.cache.user.discordInfo = userDiscordDataResponse.data.user;

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

                this.cache.user.dbInfo = {
                    id: userDiscordDataResponse.data.user.id,
                    color: '#87ceeb',
                    card_bg_id: '',
                    card_bg_url: '',
                    afk_message: 'Im sleeping or something',
                    afk_options: new URLSearchParams()
                }
            }
            else {
                this.cache.user.dbInfo = userSettings.data[0];
                this.cache.user.dbInfo.afk_options = new URLSearchParams(this.cache.user.dbInfo.afk_options);
            }

            res.send({...this.cache.user.dbInfo,...this.cache.user.discordInfo});
        }
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

                const guildsWithRights = result.data.filter(function (guild) {
                    if (guild.owner || isAdmin(guild.permissions)) {
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

        if (req.body["guildId"] === undefined) return res.send({ error: "No guild Id was sent" });


        const headers = {
            'Authorization': `${this.discordApiToken.token_type} ${this.discordApiToken.access_token}`
        }

        const guildId = req.body["guildId"];

    }

    async getGuildSettings(req, res) {
        this.refreshTimeout();

        if (req.body["guildId"] === undefined) return res.send({ error: "No guild Id was sent" });


        this.serverSocket.on('guildSettings', onSettingsRecieved);

        this.serverSocket.emit('getGuildSettings', req.body["guildId"]);
    }

    async refreshToken() {
        const data = new URLSearchParams({
            'client_id': process.env.CLIENT_ID,
            'client_secret': process.env.CLIENT_SECRETE,
            'grant_type': 'refresh_token',
            'refresh_token': this.discordApiToken.refresh_token,
        });

        try {
            const tokenResponse = await axios.post("https://discordapp.com/api/oauth2/token", data).catch((error) => {
                const responseData = error.response.data;
                responseData.result = 'error';
                utils.log(`Error refreshing token for session ${this.sessionId}`, responseData);
            })

            if (tokenResponse.data) {
                this.discordApiToken = result.data;
            }

        } catch (error) {
            utils.log(`Error refreshing token for session ${this.sessionId} `, error);
        }
    }

    async updateCard(req, res) {

        this.refreshTimeout();

        const base64Card = req.body.card;

        if (!base64Card) return res.send({ error: 'no image sent' });

        const buffer = Buffer.from(base64Card, "base64");

        const oldBgId = this.cache.user.dbInfo.card_bg_id;

        const formData = {
            api_key: process.env.IMAGE_SHACK_API_KEY,
            album: 'umeko-rank-cards',
            'customBufferFile': {
                value: buffer,
                options: {
                    filename: `user-card-background-${this.cache.user.discordInfo.id}.jpg`
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
            res.send({ error: 'error saving image' });
        });

        if (imageUploadResponse) {
            const data = JSON.parse(imageUploadResponse);
            
            this.cache.user.dbInfo.card_bg_id = data.result.images[0].id;
            this.cache.user.dbInfo.card_bg_url = `https://imagizer.imageshack.com/v2/1000x300q90/${data.result.images[0].server}/${data.result.images[0].filename}`;

            res.send({ url: this.cache.user.dbInfo.card_bg_url });

            await db.post(`/tables/user_settings/rows`, { id : this.cache.user.discordInfo.id, card_bg_id: this.cache.user.dbInfo.card_bg_id, card_bg_url: this.cache.user.dbInfo.card_bg_url }).catch(utils.log);

            if (oldBgId !== '') {
                const deleteResponse = await axios.delete(`https://api.imageshack.com/v2/images/${oldBgId}?auth_token=${process.env.IMAGE_SHACK_API_TOKEN}`).catch((error)=>{
                    utils.log(error.response.data)
                    utils.log(error.response.data.error);
                });
                if(deleteResponse)
                {
                }
            }

        }



    }

    refreshTimeout() {
        utils.log(`Session ${this.sessionId} refreshed`);
        clearTimeout(this.timeout);
        this.timeout = setTimeout(this.destroy.bind(this), sessionTimeout);
    }

    destroy() {
        clearInterval(this.refreshTokenReference);
        this.emit('destroy', this.sessionId, "Inactivity");
    }

}