"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatGirlsAreSexyRest = exports.DatabaseRest = exports.DiscordRest = exports.getDatabaseUser = void 0;
const axios_1 = __importDefault(require("axios"));
const framework_1 = require("./framework");
const DiscordRest = axios_1.default.create({
    baseURL: "https://discord.com/api/v9",
    headers: {
        'Authorizationn': `Bot ${process.argv.includes('--debug') ? process.env.DISCORD_BOT_TOKEN_ALPHA : process.env.DISCORD_BOT_TOKEN}`
    }
});
exports.DiscordRest = DiscordRest;
const DatabaseRest = axios_1.default.create({
    baseURL: `${process.argv.includes('--debug') ? process.env.DB_API_DEBUG : process.env.DB_API}`,
    headers: {
        'x-api-key': process.env.DB_API_TOKEN || ""
    }
});
exports.DatabaseRest = DatabaseRest;
const CatGirlsAreSexyRest = axios_1.default.create({
    baseURL: "https://catgirlsare.sexy/api"
});
exports.CatGirlsAreSexyRest = CatGirlsAreSexyRest;
async function getDatabaseUser(userId) {
    const databaseUserRequest = (await DatabaseRest.get(`/users?ids=${userId}`)).data;
    if (databaseUserRequest.error || databaseUserRequest.data.length <= 0) {
        const newUser = { ...framework_1.FrameworkConstants.DEFAULT_USER_SETTINGS, id: userId };
        (await DatabaseRest.put(`/users`, [newUser]));
        return newUser;
    }
    else {
        return databaseUserRequest.data[0];
    }
}
exports.getDatabaseUser = getDatabaseUser;
