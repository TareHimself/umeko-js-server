import axios from 'axios';
import cors from 'cors';
import express, { Request as ExpressRequest } from 'express';
import http from 'http';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import {
	CatGirlsAreSexyRest,
	DiscordRest,
	dbConnection,
	dbSubscriber,
	fetchGuilds,
	fetchUsers,
	updateGuild,
	updateUser,
} from './api';
import {
	IGuildMeta,
	IUserSession,
	ILoginData,
	IDiscordGuildPartial,
	IGuildFetchResponse,
	PartialWithSome,
	ICardUpdate,
} from './types';
import { buildResponse, isAdmin, log } from './utils';
import { getSession } from './sessions';
import {
	getCachedGuildData,
	tGetSessionFromToken,
	getUserWebhooks,
	tDeleteSession,
	tInsertCachedGuildData,
	tInsertGuildsWebhook,
	tInsertSession,
	tInsertUsersWebhook,
	getGuildWebhooks,
} from './sqlite';
import {
	ECardOptsKeys,
	IDatabaseGuildSettings,
	IDatabaseUserSettings,
	ObjectValues,
	OptsParser,
} from './common';

const app = express();

app.use(express.json({ limit: '100mb' }));
app.use(cors());
app.set('trust proxy', true);

const port = process.argv.includes('--debug') ? 9000 : 8080;

app.get('/', async (req, res) => {
	res.send(buildResponse('Not Implemented', true));
});

app.post('/login', async (req, res) => {
	try {
		if (!req.body['token']) {
			res.send(buildResponse('No Token Sent', true));
			return;
		}

		const data = new URLSearchParams({
			client_id: process.argv.includes('--debug')
				? process.env.DISCORD_BOT_ID_DEBUG!
				: process.env.DISCORD_BOT_ID!,
			client_secret: process.argv.includes('--debug')
				? process.env.DISCORD_BOT_SECRETE_DEBUG!
				: process.env.DISCORD_BOT_SECRETE!,
			grant_type: 'authorization_code',
			code: req.body['token']!,
			redirect_uri: process.argv.includes('--debug')
				? process.env.DISCORD_REDIRECT_URI_DEBUG!
				: process.env.DISCORD_REDIRECT_URI!,
		});

		axios.post('https://discordapp.com/api/oauth2/token', data).then(
			async (result) => {
				const DiscordResponseData = result.data;

				const headers = {
					Authorization: `Bearer ${DiscordResponseData.access_token}`,
				};

				const userDiscordDataResponse = (
					await axios.get('https://discordapp.com/api/oauth2/@me', {
						headers: headers,
					})
				).data;

				const dbUser = await fetchUsers([userDiscordDataResponse.user.id]).then(
					(a) => a[0]
				);

				const existingSession = tGetSessionFromToken(
					DiscordResponseData.access_token
				);

				if (existingSession) {
					res.send(
						buildResponse<ILoginData>({
							session: existingSession.id,
							user: existingSession.user,
							nickname: existingSession.nickname,
							avatar: existingSession.avatar,
							card_opts: dbUser.card,
						})
					);
					return;
				}

				const sessionId = uuidv4();

				const sessionData: IUserSession = {
					id: sessionId,
					user: userDiscordDataResponse.user.id,
					nickname: userDiscordDataResponse.user.username,
					avatar: `https://cdn.discordapp.com/avatars/${
						userDiscordDataResponse.user.id
					}/${userDiscordDataResponse.user.avatar}.${
						userDiscordDataResponse.user.avatar.startsWith('a_') ? 'gif' : 'png'
					}`,
					token: DiscordResponseData.access_token,
					refresh: DiscordResponseData.refresh_token,
					expire_at: 0,
				};

				tInsertSession.deferred(sessionData);

				res.send(
					buildResponse<ILoginData>({
						session: sessionId,
						user: sessionData.user,
						nickname: sessionData.nickname,
						avatar: sessionData.avatar,
						card_opts: dbUser.card,
					})
				);
			},
			(error) => {
				res.send(buildResponse(error.message, true));
			}
		);
	} catch (error) {
		res.send(buildResponse(error.message, true));
	}
});

app.get('/:session/logout', async (req, res) => {
	try {
		tDeleteSession(req.params.session);
		res.send(buildResponse('Logged Out'));
	} catch (error) {
		res.send(buildResponse(error.message, true));
	}
});

app.get('/:session/guilds', async (req, res) => {
	try {
		const session = getSession(req);

		const cached = getCachedGuildData<IDiscordGuildPartial[]>('meta-guilds');
		if (cached) {
			res.send(buildResponse(cached));
			return;
		}
		const headers = {
			Authorization: `Bearer ${session.token}`,
		};

		const guildsFromDiscordResponse = await axios.get<IDiscordGuildPartial[]>(
			'https://discordapp.com/api/users/@me/guilds',
			{ headers: headers }
		);

		const guildsFromDiscord = guildsFromDiscordResponse.data;
		if (!guildsFromDiscord) {
			res.send(
				buildResponse('recieved invalid response from discord api', true)
			);
			return;
		}

		const guildsUserHasAuthorityIn = guildsFromDiscord.filter((guild) => {
			return guild.owner || isAdmin(guild.permissions);
		});

		const guildsToFetch = guildsUserHasAuthorityIn.map((guild) => guild.id);

		const guildsFetched = await fetchGuilds(guildsToFetch);

		const dbGuilds = guildsFetched.map((g) => g.id);

		const guildsToSend = guildsUserHasAuthorityIn.filter((a) =>
			dbGuilds.includes(a.id)
		);

		res.send(buildResponse(guildsToSend));

		tInsertCachedGuildData.deferred('meta-guilds', guildsToSend);
	} catch (error) {
		res.send(buildResponse(error.message, true));
	}
});

app.get('/:session/guilds/:guildId', async (req, res) => {
	try {
		const session = getSession(req);

		const dbGuild = await fetchGuilds([req.params.guildId]).then((a) => a[0]);

		const metaFromCache = getCachedGuildData<IGuildMeta>(
			`meta-guilds-${req.params.guildId}`
		);

		if (metaFromCache) {
			const payload: IGuildFetchResponse = {
				...metaFromCache,
				settings: dbGuild,
			};

			res.send(buildResponse(payload));
		} else {
			const rawChannels = (
				await DiscordRest.get(`/guilds/${req.params.guildId}/channels`)
			).data;

			const rawRoles = (
				await DiscordRest.get(`/guilds/${req.params.guildId}/roles`)
			).data;

			const textChannels = rawChannels
				.filter((channel) => channel.type === 0)
				.map((channel) => {
					return { id: channel.id, name: channel.name };
				});

			const roles = rawRoles
				.filter((role) => role.name !== '@everyone')
				.map((role) => {
					return { id: role.id, name: role.name };
				});

			const payload: IGuildFetchResponse = {
				settings: dbGuild,
				roles: roles,
				channels: textChannels,
			};

			res.send(buildResponse(payload));

			tInsertCachedGuildData.deferred(`meta-guilds-${req.params.guildId}`, {
				roles: roles,
				channels: textChannels,
			});
		}
	} catch (error) {
		res.send(buildResponse(error.message, true));
	}
});
app.get('/:session', async (req, res) => {
	try {
		const existingSession = getSession(req);

		if (!existingSession) {
			res.send(buildResponse('Session Does Not Exist', true));
			return;
		}

		const dbUser = await fetchUsers([existingSession.user]).then((a) => a[0]);

		res.send(
			buildResponse<ILoginData>({
				session: existingSession.id,
				user: existingSession.user,
				nickname: existingSession.nickname,
				avatar: existingSession.avatar,
				card_opts: dbUser.card,
			})
		);
	} catch (error) {
		res.send(buildResponse(error.message, true));
	}
});

app.get('/:session/user', async (req, res) => {
	try {
		const session = getSession(req);

		const userInfo = await fetchUsers([session.user]).then((a) => a[0]);

		if (!userInfo) {
			throw new Error('Failed to fetch user');
		}
		res.send(buildResponse(userInfo));
	} catch (error) {
		res.send(buildResponse(error.message, true));
	}
});

app.post('/:session/guilds', async (req, res) => {
	try {
		const session = getSession(req);

		const payload: PartialWithSome<IDatabaseGuildSettings, 'id'> = req.body;

		await updateGuild(payload);

		res.send(buildResponse('Updated'));
	} catch (error) {
		res.send(buildResponse(error.message, true));
	}
});

app.post('/:session/user', async (req, res) => {
	try {
		const session = getSession(req);

		const payload: PartialWithSome<IDatabaseUserSettings, 'id'> = {
			id: session.user,
			opts: req.body,
		};

		await updateUser(payload);

		res.send(buildResponse('Updated'));
	} catch (error) {
		res.send(buildResponse(error.message, true));
	}
});

app.post('/:session/card', async (req, res) => {
	try {
		const session = getSession(req);

		const payload: ICardUpdate = req.body;

		const base64Card = payload.background;

		const dbUser = await fetchUsers([session.user]).then((a) => a[0]);

		const cardOptions = new OptsParser<ObjectValues<typeof ECardOptsKeys>>(
			dbUser.card
		);

		if (base64Card) {
			const buffer = Buffer.from(base64Card, 'base64');
			const fileName = `${process.argv.includes('--debug') ? 'debug-' : ''}${
				dbUser['id']
			}.png`;
			if (cardOptions.get('delete_url').length > 0) {
				await axios.get(cardOptions.get('delete_url')).catch(log);
				cardOptions.set('delete_url', '');
			}

			const form = new FormData();
			form.append('file', buffer, fileName);
			form.append('key', process.env.CGAS_KEY);
			form.append('custom_url', 'https://files.oyintare.dev');
			const { url, deletion_url } = (
				await CatGirlsAreSexyRest.post('/upload', form, {
					headers: form.getHeaders(),
				})
			)?.data;
			cardOptions.set('delete_url', deletion_url);
			cardOptions.set('bg_url', url);
		}

		cardOptions.set('color', payload.color);
		cardOptions.set('opacity', payload.opacity.toString());

		const userUpdate: PartialWithSome<IDatabaseUserSettings, 'id'> = {
			id: dbUser.id,
			card: cardOptions.encode(),
		};

		await updateUser(userUpdate);

		res.send(buildResponse(cardOptions.encode()));
	} catch (error) {
		res.send(buildResponse(error.message, true));
	}
});

dbConnection.connect().then(() => {
	dbSubscriber.connect().then(() => {
		app.listen(port, () => {
			log(`Master HTTP Server listening at http://localhost:${port}/`);
		});
	});
});
