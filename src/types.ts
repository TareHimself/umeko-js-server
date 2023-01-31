export interface IGuildData {
    id: string;
    bot_opts: string;
    join_opts: string;
    leave_opts: string;
    twitch_opts: string;
    level_opts: string;
    opts: string;
}

export interface IUserData {
    id: string;
    card: string;
    opts: string;
    flags: number;
}

export interface IDatabaseResponse<T = any> {
    data: T | string;
    error: boolean;
}

export interface IUserSession {
    id: string;
    user: string;
    disc_tok: string;
    disc_tok_exp: number;
    disc_tok_refresh: string;
    expire_at: number;
}

export interface ISubscriptionPayload {
    url: string;
    ids: string[]
}