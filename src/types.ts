import { IDatabaseGuildSettings } from "./framework";


export interface IUserSession {
    id: string;
    user: string;
    nickname: string;
    avatar: string;
    token: string;
    refresh: string;
    expire_at: number;
}

export interface ISubscriptionPayload {
    url: string;
    ids: string[]
}

export type IdentifierPair = { id: string; name: string; };

export interface IGuildFetchResponse {
    settings: IDatabaseGuildSettings;
    channels: IdentifierPair[];
    roles: IdentifierPair[];
}

export interface IGuildMeta {
    channels: IdentifierPair[];
    roles: IdentifierPair[];
}

export interface ILoginData {
    session: string;
    user: string;
    nickname: string;
    avatar: string;
    card_opts: string;
}