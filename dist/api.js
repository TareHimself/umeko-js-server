"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatGirlsAreSexyRest = exports.DatabaseRest = exports.DiscordRest = void 0;
const axios_1 = __importDefault(require("axios"));
const DiscordRest = axios_1.default.create({
    baseURL: "https://discord.com/api/v9",
    headers: {
        'Authorizationn': `Bot ${process.argv.includes('debug') ? process.env.DISCORD_BOT_TOKEN_ALPHA : process.env.DISCORD_BOT_TOKEN}`
    }
});
exports.DiscordRest = DiscordRest;
const DatabaseRest = axios_1.default.create({
    baseURL: "process.env.DB_API",
    headers: {
        'x-api-key': process.env.DB_API_TOKEN || ""
    }
});
exports.DatabaseRest = DatabaseRest;
const CatGirlsAreSexyRest = axios_1.default.create({
    baseURL: "https://catgirlsare.sexy/api"
});
exports.CatGirlsAreSexyRest = CatGirlsAreSexyRest;
