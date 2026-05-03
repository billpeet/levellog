import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
};

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	...timestamps
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
	refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
	scope: text('scope'),
	password: text('password'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
});

export const projects = sqliteTable('projects', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	primaryLevelTypeId: text('primary_level_type_id'),
	...timestamps
});

export const plans = sqliteTable('plans', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' })
		.unique(),
	imagePath: text('image_path'),
	mimeType: text('mime_type'),
	widthPx: integer('width_px'),
	heightPx: integer('height_px'),
	scalePxPerMetre: real('scale_px_per_metre'),
	scaleRefAx: real('scale_ref_ax'),
	scaleRefAy: real('scale_ref_ay'),
	scaleRefBx: real('scale_ref_bx'),
	scaleRefBy: real('scale_ref_by'),
	scaleRefMetres: real('scale_ref_metres')
});

export const levelTypes = sqliteTable(
	'level_types',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
		code: text('code').notNull(),
		name: text('name').notNull(),
		kind: text('kind', { enum: ['measured', 'design'] }).notNull(),
		colorHex: text('color_hex').notNull(),
		sortOrder: integer('sort_order').notNull(),
		...timestamps
	},
	(table) => ({
		levelTypesCodeIdx: uniqueIndex('level_types_project_code_idx').on(table.projectId, table.code)
	})
);

export const points = sqliteTable('points', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),
	xPx: real('x_px').notNull(),
	yPx: real('y_px').notNull(),
	isBenchmark: integer('is_benchmark', { mode: 'boolean' }).notNull().default(false),
	knownElevation: real('known_elevation'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
});

export const levelSessions = sqliteTable('level_sessions', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	benchmarkPointId: text('benchmark_point_id')
		.notNull()
		.references(() => points.id, { onDelete: 'restrict' }),
	benchmarkStaffReading: real('benchmark_staff_reading').notNull(),
	instrumentHeight: real('instrument_height').notNull(),
	note: text('note'),
	startedAt: integer('started_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
	endedAt: integer('ended_at', { mode: 'timestamp_ms' })
});

export const readings = sqliteTable(
	'readings',
	{
		id: text('id').primaryKey(),
		pointId: text('point_id')
			.notNull()
			.references(() => points.id, { onDelete: 'cascade' }),
		levelTypeId: text('level_type_id')
			.notNull()
			.references(() => levelTypes.id, { onDelete: 'restrict' }),
		sessionId: text('session_id').references(() => levelSessions.id, { onDelete: 'set null' }),
		staffReading: real('staff_reading'),
		elevation: real('elevation').notNull(),
		note: text('note'),
		takenAt: integer('taken_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(table) => ({
		readingsPointLevelIdx: uniqueIndex('readings_point_level_type_idx').on(
			table.pointId,
			table.levelTypeId
		)
	})
);

export const schema = {
	user,
	session,
	account,
	verification,
	projects,
	plans,
	levelTypes,
	points,
	levelSessions,
	readings
};

export type DatabaseSchema = typeof schema;
