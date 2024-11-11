import axios from 'axios';
import Constants from './constants';
import { ClientConfig, Client } from 'pg';
import createSubscriber from 'pg-listen';
import { PartialWithSome } from './types';
import {
	FrameworkConstants,
	IDatabaseGuildSettings,
	IDatabaseUserSettings,
} from './common/index';
import { makeUpdateStatement } from './utils';

export const DiscordRest = axios.create({
	baseURL: 'https://discord.com/api/v9',
	headers: {
		Authorization: `Bot ${
			process.argv.includes('--debug')
				? process.env.DISCORD_BOT_TOKEN_ALPHA
				: process.env.DISCORD_BOT_TOKEN
		}`,
	},
});

export const CatGirlsAreSexyRest = axios.create({
	baseURL: 'https://cgas.io/api',
});

const dbConnectionInfo: ClientConfig = {
	host: process.env.DB_HOST,
	database: process.env.DB_TARGET,
	port: 5432,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
};

export const dbConnection = new Client(dbConnectionInfo);

export const dbSubscriber = createSubscriber(dbConnectionInfo);

async function transaction(
	callback: (connection: typeof dbConnection) => Promise<void>
) {
	try {
		await dbConnection.query('BEGIN');
		await callback(dbConnection);
		await dbConnection.query('COMMIT');
	} catch (error) {
		await dbConnection.query('ROLLBACK');
		throw error;
	}
}

export async function fetchUsers(
	ids: string[],
	uploadMissing: boolean = true
): Promise<IDatabaseUserSettings[]> {
	const guildsQueryResult = await dbConnection.query<IDatabaseUserSettings>(
		`SELECT * FROM users WHERE id = ANY($1)`,
		[ids]
	);

	const usersFetched = [...guildsQueryResult.rows];

	if (uploadMissing) {
		const idsGotten = usersFetched.map((a) => a.id);
		const idsNeeded = ids.filter((a) => !idsGotten.includes(a));

		if (idsNeeded.length > 0) {
			await transaction(async (con) => {
				await Promise.allSettled([
					idsNeeded.map((a) => {
						const newData: IDatabaseUserSettings = {
							...FrameworkConstants.DEFAULT_USER_SETTINGS,
							id: a,
						};

						usersFetched.push(newData);

						return con.query('INSERT INTO users VALUES ($1,$2,$3)', [
							newData.id,
							newData.card,
							newData.opts,
						]);
					}),
				]);
			});
		}
	}
	console.log('Fetched Users', ids, usersFetched);
	return usersFetched;
}

export async function fetchGuilds(
	ids: string[],
	uploadMissing: boolean = true
): Promise<IDatabaseGuildSettings[]> {
	const guildsQueryResult = await dbConnection.query<IDatabaseGuildSettings>(
		`SELECT * FROM guilds WHERE id = ANY($1)`,
		[ids]
	);
	const guildsFetched = [...guildsQueryResult.rows];
	if (uploadMissing) {
		const idsGotten = guildsFetched.map((a) => a.id);
		const idsNeeded = ids.filter((a) => !idsGotten.includes(a));

		if (idsNeeded.length > 0) {
			await transaction(async (con) => {
				await Promise.allSettled([
					idsNeeded.map((a) => {
						const newData: IDatabaseGuildSettings = {
							...FrameworkConstants.DEFAULT_GUILD_SETTINGS,
							id: a,
						};

						guildsFetched.push(newData);

						return con.query(
							'INSERT INTO guilds VALUES ($1,$2,$3,$4,$5,$6,$7)',
							[
								newData.id,
								newData.bot_opts,
								newData.join_opts,
								newData.leave_opts,
								newData.twitch_opts,
								newData.level_opts,
								newData.opts,
							]
						);
					}),
				]);
			});
		}
	}

	console.log('Fetched Guilds', ids, guildsFetched);
	return guildsFetched;
}

export async function updateUser(
	update: PartialWithSome<IDatabaseUserSettings, 'id'>
) {
	const [statement, params] = makeUpdateStatement(update, ['id'], 2);

	if (params.length === 0) {
		return;
	}

	await transaction(async (conn) => {
		await conn.query(`UPDATE users ${statement} WHERE id = $1`, [
			update.id,
			...params,
		]);
	});

	await dbSubscriber.notify('update_user', {
		id: update.id,
	});
}

export async function updateGuild(
	update: PartialWithSome<IDatabaseGuildSettings, 'id'>
) {
	const [statement, params] = makeUpdateStatement(update, ['id'], 2);

	if (params.length === 0) {
		return;
	}

	await transaction(async (conn) => {
		await conn.query(`UPDATE guilds ${statement} WHERE id = $1`, [
			update.id,
			...params,
		]);
	});

	await dbSubscriber.notify('update_guild', {
		id: update.id,
	});
}
