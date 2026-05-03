import 'dotenv/config';

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const databaseUrl = process.env.DATABASE_URL ?? './data/app.db';

await mkdir(dirname(databaseUrl), { recursive: true });

const sqlite = new Database(databaseUrl);
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');

const db = drizzle({ client: sqlite });
migrate(db, { migrationsFolder: './drizzle' });

sqlite.close();
console.log(`Applied database migrations to ${databaseUrl}`);
