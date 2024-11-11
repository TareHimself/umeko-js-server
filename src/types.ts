import { IDatabaseGuildSettings, IDatabaseUserSettings } from './common';

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

export type IdentifierPair = { id: string; name: string };

export interface IDiscordGuildPartial {
	id: string;
	name: string;
	icon: string;
	owner: boolean;
	permissions: number;
	features: string[];
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
	card_opts: IDatabaseUserSettings['card'];
}

export interface IGuildFetchResponse {
	settings: IDatabaseGuildSettings;
	channels: IdentifierPair[];
	roles: IdentifierPair[];
}

export interface ICardUpdate {
	color: string;
	opacity: number;
	background: string;
}

export type PartialWithSome<T, S extends keyof T> = Partial<T> &
	Omit<T, Exclude<keyof T, S>>;

declare global {
	namespace NodeJS {
		// Alias for compatibility
		interface ProcessEnv extends Dict<string> {
			DB_HOST: string;
			DB_TARGET: string;
			DB_USER: string;
			DB_PASS: string;
			DISCORD_BOT_ID: string;
			DISCORD_BOT_SECRETE: string;
			DISCORD_BOT_ID_DEBUG: string;
			DISCORD_BOT_SECRETE_DEBUG: string;
			DISCORD_REDIRECT_URI: string;
			DISCORD_REDIRECT_URI_DEBUG: string;
			DISCORD_BOT_TOKEN: string;
			DISCORD_BOT_TOKEN_ALPHA: string;
			CGAS_KEY: string;
		}
	}
}
