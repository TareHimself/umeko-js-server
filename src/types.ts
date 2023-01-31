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