import path from 'path';
import Database from 'better-sqlite3';
import cluster from 'cluster';
import * as fs from 'fs';
import { IGuildData, IUserSession } from "./types";

const DATABASE_DIR = path.join(process.cwd(), 'db')
if (!fs.existsSync(DATABASE_DIR)) {
    fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

const db = Database(path.join(DATABASE_DIR, 'persistent.db'))
if (cluster.isPrimary) {
    const TABLE_STATEMENTS = [
        `
    CREATE TABLE IF NOT EXISTS sessions(
        id TEXT PRIMARY KEY,
        user TEXT NOT NULL
        discord_token STRING NOT NULL,
        discord_token_expire_at INTEGER NOT NULL,
        discord_token_refresh TEXT NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_sessions
    ON sessions (user,guild);
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
const getUserWebhooksStatement = db.prepare<{ id: string }>('SELECT url FROM user_hooks WHERE id=@id')
const getGuildWebhooksStatement = db.prepare<{ id: string }>('SELECT url FROM guild_hooks WHERE id=@id')
const insertUserWebhookStatement = db.prepare<{ id: string, url: string }>('INSERT OR REPLACE INTO user_hooks VALUES (@id,@url)')
const insertGuildWebhookStatement = db.prepare<{ id: string, url: string }>('INSERT OR REPLACE INTO guild_hooks VALUES (@id,@url)')

export function getSession(sessionId: string) {

    return (getSessionStatement.all({ id: sessionId }) as IUserSession[])[0];
}

export type WebHookInfo = { url: string }

export function getUserWebhooks(user: string) {
    return (getUserWebhooksStatement.all({ id: user }) as WebHookInfo[]);
}

export function getGuildWebhooks(guild: string) {
    return (getGuildWebhooksStatement.all({ id: guild }) as WebHookInfo[]);
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

export {
    tInsertUsersWebhook,
    tInsertGuildsWebhook
}


