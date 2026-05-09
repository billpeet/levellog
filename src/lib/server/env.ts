import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { z } from 'zod';

const serverEnvSchema = z.object({
	DATABASE_URL: z.string().min(1),
	BETTER_AUTH_SECRET: z.string().min(32),
	BETTER_AUTH_URL: z.string().url(),
	BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
	GOOGLE_CLIENT_ID: z.string().min(1),
	GOOGLE_CLIENT_SECRET: z.string().min(1),
	UPLOAD_DIR: z.string().min(1).default('data/uploads'),
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});

const clientEnvSchema = z.object({
	PUBLIC_APP_NAME: z.string().min(1).default('LevelLog')
});

export function getServerEnv() {
	return serverEnvSchema.parse({
		DATABASE_URL: privateEnv.DATABASE_URL,
		BETTER_AUTH_SECRET: privateEnv.BETTER_AUTH_SECRET,
		BETTER_AUTH_URL: privateEnv.BETTER_AUTH_URL,
		BETTER_AUTH_TRUSTED_ORIGINS: privateEnv.BETTER_AUTH_TRUSTED_ORIGINS,
		GOOGLE_CLIENT_ID: privateEnv.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: privateEnv.GOOGLE_CLIENT_SECRET,
		UPLOAD_DIR: privateEnv.UPLOAD_DIR,
		NODE_ENV: privateEnv.NODE_ENV
	});
}

export function getClientEnv() {
	return clientEnvSchema.parse({
		PUBLIC_APP_NAME: publicEnv.PUBLIC_APP_NAME
	});
}
