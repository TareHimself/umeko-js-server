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

export interface IUserSessionCached extends IUserSession {
    ttl: number;
}

export interface ISubscriptionPayload {
    url: string;
    ids: string[]
}

export type IdentifierPair = { id: string; name: string; };

export interface IDiscordGuildPartial {
    id: string;
    name: string;
    icon: string;
    owner: boolean;
    permissions: number;
    features: string[];
}
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

export interface ICardUpdate {
    color: string;
    opacity: number;
    background: string;
}