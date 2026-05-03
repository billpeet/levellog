import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { getServerEnv } from '$lib/server/env';

import * as schema from './schema';

let database: ReturnType<typeof drizzle> | null = null;

export function getDb() {
	if (database) {
		return database;
	}

	const env = getServerEnv();
	const sqlite = new Database(env.DATABASE_URL);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');

	database = drizzle(sqlite, { schema });
	return database;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
	get(_, prop, receiver) {
		return Reflect.get(getDb(), prop, receiver);
	}
});

export { schema };
