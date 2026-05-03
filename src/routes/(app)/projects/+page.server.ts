import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { auth } from '$lib/server/auth';
import { getDb } from '$lib/server/db/client';
import { levelSessions, levelTypes, plans, points, projects, readings } from '$lib/server/db/schema';

import type { PageServerLoad } from './$types';

export type DashboardProject = {
	id: string;
	name: string;
	updatedAt: Date;
	pointCount: number;
	readingCount: number;
	hasActiveSession: boolean;
	planId: string | null;
	primaryLevelTypeCode: string | null;
};

export const load: PageServerLoad = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	const userId = session!.user.id; // (app) layout guarantees a session
	const db = getDb();

	const rows = await db
		.select({
			id: projects.id,
			name: projects.name,
			updatedAt: projects.updatedAt,
			primaryLevelTypeId: projects.primaryLevelTypeId
		})
		.from(projects)
		.where(eq(projects.userId, userId))
		.orderBy(desc(projects.updatedAt));

	const projectsWithStats: DashboardProject[] = await Promise.all(
		rows.map(async (project) => {
			const [pointStat] = await db
				.select({ value: count() })
				.from(points)
				.where(eq(points.projectId, project.id));

			const [readingStat] = await db
				.select({ value: count() })
				.from(readings)
				.innerJoin(points, eq(readings.pointId, points.id))
				.where(eq(points.projectId, project.id));

			const [activeSession] = await db
				.select({ id: levelSessions.id })
				.from(levelSessions)
				.where(and(eq(levelSessions.projectId, project.id), isNull(levelSessions.endedAt)))
				.limit(1);

			const [plan] = await db
				.select({ id: plans.id })
				.from(plans)
				.where(eq(plans.projectId, project.id))
				.limit(1);

			const [primaryLevelType] = project.primaryLevelTypeId
				? await db
						.select({ code: levelTypes.code })
						.from(levelTypes)
						.where(
							and(
								eq(levelTypes.id, project.primaryLevelTypeId),
								eq(levelTypes.projectId, project.id)
							)
						)
						.limit(1)
				: [];

			return {
				id: project.id,
				name: project.name,
				updatedAt: project.updatedAt,
				pointCount: pointStat?.value ?? 0,
				readingCount: readingStat?.value ?? 0,
				hasActiveSession: Boolean(activeSession),
				planId: plan?.id ?? null,
				primaryLevelTypeCode: primaryLevelType?.code ?? null
			};
		})
	);

	const readingsThisWeek = projectsWithStats.reduce((sum, p) => sum + p.readingCount, 0);

	return { projects: projectsWithStats, readingsThisWeek };
};
