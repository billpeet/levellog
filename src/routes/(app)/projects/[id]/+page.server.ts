import { error } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';

import { auth } from '$lib/server/auth';
import { getDb } from '$lib/server/db/client';
import { annotationLines, levelSessions, levelTypes, plans, points, projects, readings } from '$lib/server/db/schema';

import type { PageServerLoad } from './$types';

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

	const [plan] = await db.select().from(plans).where(eq(plans.projectId, projectId)).limit(1);
	const projectLevelTypes = await db
		.select()
		.from(levelTypes)
		.where(eq(levelTypes.projectId, projectId))
		.orderBy(levelTypes.sortOrder);
	const projectPoints = await db
		.select()
		.from(points)
		.where(eq(points.projectId, projectId))
		.orderBy(desc(points.createdAt));
	const projectSessions = await db
		.select()
		.from(levelSessions)
		.where(eq(levelSessions.projectId, projectId))
		.orderBy(desc(levelSessions.startedAt));
	const projectReadings = await db
		.select({
			id: readings.id,
			pointId: readings.pointId,
			levelTypeId: readings.levelTypeId,
			sessionId: readings.sessionId,
			staffReading: readings.staffReading,
			elevation: readings.elevation,
			note: readings.note,
			takenAt: readings.takenAt
		})
		.from(readings)
		.innerJoin(points, eq(readings.pointId, points.id))
		.where(eq(points.projectId, projectId));
	const projectLines = await db
		.select()
		.from(annotationLines)
		.where(eq(annotationLines.projectId, projectId))
		.orderBy(annotationLines.createdAt);

	return {
		projectId,
		project,
		plan: plan ?? null,
		levelTypes: projectLevelTypes,
		points: projectPoints,
		sessions: projectSessions,
		readings: projectReadings,
		annotationLines: projectLines
	};
};
