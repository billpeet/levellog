import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import { getServerEnv } from '$lib/server/env';

import * as schema from './schema';

let database: ReturnType<typeof drizzle> | null = null;

export function getDb() {
	if (database) {
		return database;
	}

	const env = getServerEnv();
	const sqlite = new Database(env.DATABASE_URL);
	sqlite.exec('PRAGMA journal_mode = WAL');
	sqlite.exec('PRAGMA foreign_keys = ON');

	database = drizzle({ client: sqlite, schema });
	return database;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
	get(_, prop, receiver) {
		return Reflect.get(getDb(), prop, receiver);
	}
});

export { schema };
