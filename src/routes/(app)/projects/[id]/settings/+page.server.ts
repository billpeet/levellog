import { error } from '@sveltejs/kit';
import { and, count, desc, eq } from 'drizzle-orm';

import { auth } from '$lib/server/auth';
import { getDb } from '$lib/server/db/client';
import { levelSessions, levelTypes, points, projects, readings } from '$lib/server/db/schema';

import type { PageServerLoad } from './$types';

export type LevelTypeWithUsage = {
	id: string;
	code: string;
	name: string;
	kind: 'measured' | 'design';
	colorHex: string;
	sortOrder: number;
	readingCount: number;
};

export const load: PageServerLoad = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) error(401, 'Sign in required');

	const projectId = params.id;
	const db = getDb();

	const [project] = await db
		.select()
		.from(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
		.limit(1);

	if (!project) error(404, 'Project not found');

	const types = await db
		.select()
		.from(levelTypes)
		.where(eq(levelTypes.projectId, projectId))
		.orderBy(levelTypes.sortOrder);

	const usageRows = await db
		.select({ levelTypeId: readings.levelTypeId, value: count() })
		.from(readings)
		.innerJoin(points, eq(readings.pointId, points.id))
		.where(eq(points.projectId, projectId))
		.groupBy(readings.levelTypeId);

	const usage = new Map<string, number>(usageRows.map((row) => [row.levelTypeId, row.value]));

	const levelTypesWithUsage: LevelTypeWithUsage[] = types.map((lt) => ({
		id: lt.id,
		code: lt.code,
		name: lt.name,
		kind: lt.kind,
		colorHex: lt.colorHex,
		sortOrder: lt.sortOrder,
		readingCount: usage.get(lt.id) ?? 0
	}));

	// Loaded so the (app) topbar's session pill reflects reality on this page.
	const projectPoints = await db
		.select({ id: points.id, label: points.label, isBenchmark: points.isBenchmark })
		.from(points)
		.where(eq(points.projectId, projectId));

	const projectSessions = await db
		.select()
		.from(levelSessions)
		.where(eq(levelSessions.projectId, projectId))
		.orderBy(desc(levelSessions.startedAt));

	return {
		projectId,
		project,
		levelTypes: levelTypesWithUsage,
		points: projectPoints,
		sessions: projectSessions
	};
};
