import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';

import { db, schema } from '$lib/server/db/client';
import { getServerEnv } from '$lib/server/env';

let authInstance: ReturnType<typeof createAuth> | null = null;

function createAuth() {
	const env = getServerEnv();
	const trustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS
		?.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

	return betterAuth({
		appName: 'LevelLog',
		baseURL: env.BETTER_AUTH_URL,
		trustedOrigins,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, {
			provider: 'sqlite',
			schema,
			usePlural: false
		}),
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET
			}
		}
	});
}

export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
	get(_, prop, receiver) {
		if (!authInstance) {
			authInstance = createAuth();
		}

		return Reflect.get(authInstance, prop, receiver);
	}
});
