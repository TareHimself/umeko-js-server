"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tDeleteSession = exports.tInsertSession = exports.tInsertCachedGuildData = exports.tInsertGuildsWebhook = exports.tInsertUsersWebhook = exports.getCachedGuildData = exports.getGuildWebhooks = exports.getUserWebhooks = exports.getSessionFromToken = exports.getSession = exports.TimeToInteger = exports.pad = void 0;
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const cluster_1 = __importDefault(require("cluster"));
const fs = __importStar(require("fs"));
const DATABASE_DIR = path_1.default.join(process.cwd(), 'db');
if (!fs.existsSync(DATABASE_DIR)) {
    fs.mkdirSync(DATABASE_DIR, { recursive: true });
}
function pad(number) {
    return number < 10 ? `0${number}` : `${number}`;
}
exports.pad = pad;
function TimeToInteger(date) {
    return parseInt(`${date.getUTCFullYear()}${pad(date.getUTCMonth())}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`, 10);
}
exports.TimeToInteger = TimeToInteger;
const db = (0, better_sqlite3_1.default)(path_1.default.join(DATABASE_DIR, 'persistent.db'));
if (cluster_1.default.isPrimary) {
    const TABLE_STATEMENTS = [
        `
    CREATE TABLE IF NOT EXISTS sessions(
        id TEXT PRIMARY KEY,
        user TEXT NOT NULL,
        avatar TEXT NOT NULL,
        nickname TEXT NOT NULL,
        token STRING NOT NULL,
        refresh TEXT NOT NULL,
        expire_at INTEGER NOT NULL
    ) WITHOUT ROWID;
    `,
        `
    CREATE TABLE IF NOT EXISTS user_hooks(
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL
    ) WITHOUT ROWID;
    `,
        `
    CREATE TABLE IF NOT EXISTS guild_hooks(
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL
    ) WITHOUT ROWID;
    `,
        `
    CREATE TABLE IF NOT EXISTS guild_cache(
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        ttl INTEGER DEFAULT 0
    ) WITHOUT ROWID;
    `,
        `
    CREATE INDEX IF NOT EXISTS idx_sessions
    ON sessions (id,user,token);
    `
    ];
    db.pragma("journal_mode = WAL");
    db.pragma("wal_checkpoint(RESTART)");
    const checkDbSize = async () => {
        try {
            const stats = await fs.promises.stat(path_1.default.join(DATABASE_DIR, "cache.db-wal"));
            if (stats.size / (1024 * 1024) > 50) {
                db.pragma("wal_checkpoint(RESTART)");
            }
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
    };
    setInterval(checkDbSize, 5000).unref();
    db.transaction((statements) => {
        statements.forEach((statement) => {
            db.prepare(statement).run();
        });
    }).immediate(TABLE_STATEMENTS);
}
const getSessionStatement = db.prepare('SELECT * FROM sessions WHERE id=@id');
const getSessionFromTokenStatement = db.prepare('SELECT * FROM sessions WHERE token=@token');
const getUserWebhooksStatement = db.prepare('SELECT url FROM user_hooks WHERE id=@id');
const getGuildWebhooksStatement = db.prepare('SELECT url FROM guild_hooks WHERE id=@id');
const getGuildDataCacheStatement = db.prepare('SELECT data FROM guild_cache WHERE id=@id');
const insertSessionStatement = db.prepare('INSERT OR REPLACE INTO sessions VALUES (@id,@user,@avatar,@nickname,@token,@refresh,@expire_at)');
const insertUserWebhookStatement = db.prepare('INSERT OR REPLACE INTO user_hooks VALUES (@id,@url)');
const insertGuildWebhookStatement = db.prepare('INSERT OR REPLACE INTO guild_hooks VALUES (@id,@url)');
const insertGuildDataCache = db.prepare('INSERT OR REPLACE INTO guild_cache VALUES (@id,@data,@ttl)');
const deleteSessionStatement = db.prepare('DELETE FROM sessions WHERE id=@id');
function getSession(sessionId) {
    return getSessionStatement.all({ id: sessionId })[0];
}
exports.getSession = getSession;
function getSessionFromToken(token) {
    return getSessionFromTokenStatement.all({ token: token })[0];
}
exports.getSessionFromToken = getSessionFromToken;
function getUserWebhooks(user) {
    return getUserWebhooksStatement.all({ id: user });
}
exports.getUserWebhooks = getUserWebhooks;
function getGuildWebhooks(guild) {
    return getGuildWebhooksStatement.all({ id: guild });
}
exports.getGuildWebhooks = getGuildWebhooks;
function getCachedGuildData(guild) {
    return getGuildDataCacheStatement.all({ id: guild });
}
exports.getCachedGuildData = getCachedGuildData;
const tInsertUsersWebhook = db.transaction((target, ids) => {
    for (let i = 0; i < ids.length; i++) {
        insertUserWebhookStatement.run({ id: ids[i], url: target });
    }
});
exports.tInsertUsersWebhook = tInsertUsersWebhook;
const tInsertGuildsWebhook = db.transaction((target, ids) => {
    for (let i = 0; i < ids.length; i++) {
        insertGuildWebhookStatement.run({ id: ids[i], url: target });
    }
});
exports.tInsertGuildsWebhook = tInsertGuildsWebhook;
const tInsertSession = db.transaction((session) => {
    insertSessionStatement.run(session);
});
exports.tInsertSession = tInsertSession;
const tInsertCachedGuildData = db.transaction((guild, data) => {
    insertGuildDataCache.run({ id: guild, data: JSON.stringify(data), ttl: TimeToInteger(new Date()) });
});
exports.tInsertCachedGuildData = tInsertCachedGuildData;
const tDeleteSession = db.transaction((sessionId) => {
    deleteSessionStatement.run({ id: sessionId });
});
exports.tDeleteSession = tDeleteSession;
