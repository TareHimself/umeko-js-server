

const EPluginOptsKeys = {
    MESSAGE: 'message',
    LOCATION: 'location',
    GIVE_ROLE: 'role-give',
    REMOVE_ROLE: 'role-remove',
    FILTER_ROLE: 'role-filter',
} as const;

const EBotOptsKeys = {
    BOT_NICKNAME: 'nickname',
    BOT_LOCALE: 'locale',
    BOT_COLOR: 'color',
} as const;

const ECardOptsKeys = {
    COLOR: 'color',
    DELETE_URL: 'delete_url',
    BG_URL: 'bg_url',
    OPACITY: 'opacity',
} as const;

const EOptsKeyLocation = {
    NONE: 'disabled',
    CURRENT_CHANNEL: 'channel',
    DIRECT_MESSAGE: 'direct',
    SPECIFIC_CHANNEL: '',
} as const;

export {
    EPluginOptsKeys,
    EBotOptsKeys,
    ECardOptsKeys,
    EOptsKeyLocation,
}

export type IUmekoApiResponse<T = any> = {
    data: T;
    error: false;
} | {
    data: string;
    error: true;
}

export interface IUserLevelData {
    user: string;
    guild: string;
    level: number;
    xp: number;
}

export interface IGuildSettings {
    id: string;
    bot_opts: OptsParser<ObjectValues<typeof EBotOptsKeys>>;
    join_opts: OptsParser<ObjectValues<typeof EPluginOptsKeys>>;
    leave_opts: OptsParser<ObjectValues<typeof EPluginOptsKeys>>;
    twitch_opts: OptsParser<ObjectValues<typeof EPluginOptsKeys>>;
    level_opts: OptsParser<ObjectValues<typeof EPluginOptsKeys>>;
    opts: OptsParser;
}

export interface IDatabaseGuildSettings {
    id: string;
    bot_opts: string;
    join_opts: string;
    leave_opts: string;
    twitch_opts: string;
    level_opts: string;
    opts: string;
}

export interface IUserSettings {
    id: string;
    card: OptsParser<ObjectValues<typeof ECardOptsKeys>>;
    opts: OptsParser;
    flags: number;
}

export interface IDatabaseUserSettings {
    id: string;
    card: string;
    opts: string;
    flags: number;
}

export type ObjectKeys<T> = keyof T;

export type ObjectValues<T> = (T)[ObjectKeys<T>];

export type TypedValuePair<T extends string> = { [key in T]: string; }

export class OptsParser<T extends string = string> {
    opts: TypedValuePair<T>;
    toString: undefined;
    constructor(a: TypedValuePair<T> | string) {
        if (typeof a === 'string') {
            this.opts = OptsParser.decode<T>(a);
        }
        else {
            this.opts = a;
        }
    }

    get(optId: T, fallback: string = "") {
        return this.opts[optId] || fallback;
    }

    set(optId: T, data: string) {
        this.opts[optId] = data;
    }

    static decode<T extends string>(opts: string): TypedValuePair<T> {
        try {
            return JSON.parse(decodeURI(opts).trim());
        } catch (error) {
            return {} as TypedValuePair<T>;
        }
    }

    encode() {
        return encodeURI(JSON.stringify(this.opts)).trim();
    }
}

export class FrameworkConstants {

    static DATA_UPDATE_INTERVAL = 10;
    static QUEUE_TIMEOUT = 300000;
    static QUEUE_ITEMS_PER_PAGE = 10;
    static XP_UPDATE_THRESHHOLD = 100

    static DEFAULT_BOT_NAME = "Umeko";
    static DEFAULT_BOT_LOCALE = "en";
    static DEFAULT_BOT_COLOR = "#2f3136";
    static DEFAULT_USER_CARD_COLOR = "#87ceeb"
    static DEFAULT_USER_CARD_OPACITY = "0.8";
    static DEFAULT_USER_CARD_BG = 'https://r4.wallpaperflare.com/wallpaper/108/140/869/digital-digital-art-artwork-fantasy-art-drawing-hd-wallpaper-d8b62d28c0f06c48d03c114ec8f2b4aa.jpg';

    static DEFAULT_GUILD_SETTINGS: IDatabaseGuildSettings = {
        id: "",
        bot_opts: new OptsParser<ObjectValues<typeof EBotOptsKeys>>({ color: this.DEFAULT_BOT_COLOR, nickname: this.DEFAULT_BOT_NAME, locale: this.DEFAULT_BOT_LOCALE }).encode(),
        join_opts: "",
        leave_opts: "",
        twitch_opts: "",
        level_opts: "",
        opts: ""
    };

    static DEFAULT_USER_SETTINGS: IDatabaseUserSettings = {
        id: "",
        card: new OptsParser<ObjectValues<typeof ECardOptsKeys>>({ color: FrameworkConstants.DEFAULT_USER_CARD_COLOR, delete_url: "", bg_url: "", opacity: this.DEFAULT_USER_CARD_OPACITY }).encode(),
        opts: "",
        flags: 0
    };

    static DEFAULT_USER_LEVEL_DATA: IUserLevelData = {
        user: "",
        guild: "",
        level: 0,
        xp: 0
    };

    static BOT_VERSION = 5.0

    static COMMAND_GROUPS = {
        FUN: "fun",
        NONE: "",
        GENERAL: "general"
    }
}

export function locationIsChannel(location: ObjectValues<typeof EOptsKeyLocation>) {
    return location !== EOptsKeyLocation.NONE && location !== EOptsKeyLocation.DIRECT_MESSAGE && location !== EOptsKeyLocation.CURRENT_CHANNEL;
}


