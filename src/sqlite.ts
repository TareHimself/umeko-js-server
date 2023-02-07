import path from 'path';
import Database from 'better-sqlite3';
import cluster from 'cluster';
import * as fs from 'fs';
import { IUserSession } from "./types";

const DATABASE_DIR = path.join(process.cwd(), 'db')
if (!fs.existsSync(DATABASE_DIR)) {
    fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

export function pad(number: number) {
    return number < 10 ? `0${number}` : `${number}`;
}

/**
 * Converts a date object to an integer formated as YYYYMMDDHHMMSS
 */
export function TimeToInteger(date: Date) {
    return parseInt(
        `${date.getUTCFullYear()}${pad(date.getUTCMonth())}${pad(
            date.getUTCDate()
        )}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
            date.getUTCSeconds()
        )}`,
        10
    );
}

const db = Database(path.join(DATABASE_DIR, 'persistent.db'))
if (cluster.isPrimary) {
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
    ]

    // fix concurrency issues
    db.pragma("journal_mode = WAL");

    db.pragma("wal_checkpoint(RESTART)");

    const checkDbSize = async () => {
        try {
            const stats = await fs.promises.stat(path.join(DATABASE_DIR, "cache.db-wal"))
            if (stats.size / (1024 * 1024) > 50) {
                db.pragma("wal_checkpoint(RESTART)");
            }
        } catch (error: any) {
            if (error.code !== "ENOENT") throw error;
        }

    }
    setInterval(checkDbSize,
        5000
    ).unref();

    db.transaction((statements) => {
        statements.forEach((statement) => {
            db.prepare(statement).run();
        });
    }).immediate(TABLE_STATEMENTS);
}

const getSessionStatement = db.prepare<{ id: string }>('SELECT * FROM sessions WHERE id=@id')
const getSessionFromTokenStatement = db.prepare<{ token: string }>('SELECT * FROM sessions WHERE token=@token')
const getUserWebhooksStatement = db.prepare<{ id: string }>('SELECT url FROM user_hooks WHERE id=@id')
const getGuildWebhooksStatement = db.prepare<{ id: string }>('SELECT url FROM guild_hooks WHERE id=@id')
const getGuildDataCacheStatement = db.prepare<{ id: string }>('SELECT data FROM guild_cache WHERE id=@id')

const insertSessionStatement = db.prepare<IUserSession>('INSERT OR REPLACE INTO sessions VALUES (@id,@user,@avatar,@nickname,@token,@refresh,@expire_at)')
const insertUserWebhookStatement = db.prepare<{ id: string, url: string }>('INSERT OR REPLACE INTO user_hooks VALUES (@id,@url)')
const insertGuildWebhookStatement = db.prepare<{ id: string, url: string }>('INSERT OR REPLACE INTO guild_hooks VALUES (@id,@url)')
const insertGuildDataCache = db.prepare<{ id: string, data: string, ttl: number }>('INSERT OR REPLACE INTO guild_cache VALUES (@id,@data,@ttl)')

const deleteSessionStatement = db.prepare<{ id: string }>('DELETE FROM sessions WHERE id=@id')

export function getSession(sessionId: string) {

    return (getSessionStatement.all({ id: sessionId }) as IUserSession[])[0];
}

export function getSessionFromToken(token: string) {

    return (getSessionFromTokenStatement.all({ token: token }) as IUserSession[])[0];
}

export type WebHookInfo = { url: string }

export function getUserWebhooks(user: string) {
    return (getUserWebhooksStatement.all({ id: user }) as WebHookInfo[]);
}

export function getGuildWebhooks(guild: string) {
    return (getGuildWebhooksStatement.all({ id: guild }) as WebHookInfo[]);
}

export function getCachedGuildData<T>(guild: string) {
    return (getGuildDataCacheStatement.all({ id: guild }) as T[]);
}

const tInsertUsersWebhook = db.transaction((target: string, ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
        insertUserWebhookStatement.run({ id: ids[i], url: target });
    }
})

const tInsertGuildsWebhook = db.transaction((target: string, ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
        insertGuildWebhookStatement.run({ id: ids[i], url: target });
    }
})

const tInsertSession = db.transaction((session: IUserSession) => {
    insertSessionStatement.run(session);
})

const tInsertCachedGuildData = db.transaction((guild: string, data: object) => {
    insertGuildDataCache.run({ id: guild, data: JSON.stringify(data), ttl: TimeToInteger(new Date()) });
})

const tDeleteSession = db.transaction((sessionId: string) => {
    deleteSessionStatement.run({ id: sessionId });
})

export {
    tInsertUsersWebhook,
    tInsertGuildsWebhook,
    tInsertCachedGuildData,
    tInsertSession,
    tDeleteSession,
}


