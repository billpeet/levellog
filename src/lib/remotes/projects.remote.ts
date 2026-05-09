import { command, getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import { z } from 'zod';

import { calculateInstrumentHeight, calculateReducedLevel } from '$lib/domain/levels';
import { auth } from '$lib/server/auth';
import { getDb } from '$lib/server/db/client';
import { defaultLevelTypes } from '$lib/server/db/seed';
import { annotationLines, levelSessions, levelTypes, plans, points, projects, readings } from '$lib/server/db/schema';
import { resolveUploadPath } from '$lib/server/uploads';

async function requireUserId() {
	const event = getRequestEvent();
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (!session?.user?.id) {
		error(401, 'Sign in required');
	}

	return session.user.id;
}

function id() {
	return crypto.randomUUID();
}

const projectIdSchema = z.object({ projectId: z.uuid() });

async function assertProjectOwner(projectId: string, userId: string) {
	const db = getDb();
	const [project] = await db
		.select()
		.from(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
		.limit(1);

	if (!project) {
		error(404, 'Project not found');
	}

	return project;
}

export const listProjects = query(async () => {
	const userId = await requireUserId();
	const db = getDb();

	return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
});

export const getProject = query(projectIdSchema, async ({ projectId }) => {
	const userId = await requireUserId();
	const db = getDb();
	const project = await assertProjectOwner(projectId, userId);

	const [plan] = await db.select().from(plans).where(eq(plans.projectId, projectId)).limit(1);

	return {
		project,
		plan: plan ?? null,
		levelTypes: await db
			.select()
			.from(levelTypes)
			.where(eq(levelTypes.projectId, projectId))
			.orderBy(levelTypes.sortOrder),
		points: await db.select().from(points).where(eq(points.projectId, projectId)),
		sessions: await db
			.select()
			.from(levelSessions)
			.where(eq(levelSessions.projectId, projectId))
			.orderBy(desc(levelSessions.startedAt)),
		readings: await db
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
			.where(eq(points.projectId, projectId)),
		annotationLines: await db
			.select()
			.from(annotationLines)
			.where(eq(annotationLines.projectId, projectId))
			.orderBy(annotationLines.createdAt)
	};
});

export const createProject = command(
	z.object({ name: z.string().trim().min(1).max(120) }),
	async ({ name }) => {
		const userId = await requireUserId();
		const db = getDb();
		const projectId = id();
		const now = new Date();

		return db.transaction((tx) => {
			tx.insert(projects).values({ id: projectId, userId, name, createdAt: now, updatedAt: now }).run();

			const insertedLevelTypes = defaultLevelTypes.map((levelType) => ({
				...levelType,
				id: id(),
				projectId,
				createdAt: now,
				updatedAt: now
			}));

			tx.insert(levelTypes).values(insertedLevelTypes).run();
			tx.update(projects)
				.set({ primaryLevelTypeId: insertedLevelTypes.find((levelType) => levelType.code === 'CL')?.id })
				.where(eq(projects.id, projectId))
				.run();

			return { id: projectId };
		});
	}
);

export const updateProject = command(
	z.object({
		projectId: z.uuid(),
		name: z.string().trim().min(1).max(120).optional(),
		primaryLevelTypeId: z.uuid().nullable().optional()
	}),
	async ({ projectId, name, primaryLevelTypeId }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const update: Record<string, unknown> = { updatedAt: new Date() };
		if (name !== undefined) update.name = name;

		if (primaryLevelTypeId !== undefined) {
			if (primaryLevelTypeId !== null) {
				const [lt] = await db
					.select()
					.from(levelTypes)
					.where(and(eq(levelTypes.id, primaryLevelTypeId), eq(levelTypes.projectId, projectId)))
					.limit(1);
				if (!lt) error(400, 'Pick a level type from this project');
			}
			update.primaryLevelTypeId = primaryLevelTypeId;
		}

		await db.update(projects).set(update).where(eq(projects.id, projectId));

		return { ok: true };
	}
);

export const deleteProject = command(
	z.object({ projectId: z.uuid() }),
	async ({ projectId }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);

		// Cascade in DB drops plans/level_types/points/sessions/readings for the project.
		await getDb().delete(projects).where(eq(projects.id, projectId));

		// Best-effort: remove the project's upload directory. Don't fail the
		// command if the dir is missing (already deleted, never created).
		try {
			await rm(resolveUploadPath(projectId), { recursive: true, force: true });
		} catch {
			// swallow — DB row is gone, the orphan files (if any) are harmless.
		}

		return { ok: true };
	}
);

const levelTypeKindSchema = z.enum(['measured', 'design']);
const levelTypeCodeSchema = z
	.string()
	.trim()
	.min(1)
	.max(8)
	.regex(/^[A-Za-z0-9_-]+$/, 'Code uses letters, digits, dash, underscore');
const levelTypeNameSchema = z.string().trim().min(1).max(60);
const levelTypeColorSchema = z
	.string()
	.trim()
	.regex(/^#[0-9a-fA-F]{6}$/, 'Pick a 6-digit hex colour like #2e7d5b');

export const createLevelType = command(
	z.object({
		projectId: z.uuid(),
		code: levelTypeCodeSchema,
		name: levelTypeNameSchema,
		kind: levelTypeKindSchema,
		colorHex: levelTypeColorSchema
	}),
	async ({ projectId, code, name, kind, colorHex }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const normalisedCode = code.toUpperCase();

		const [clash] = await db
			.select({ id: levelTypes.id })
			.from(levelTypes)
			.where(and(eq(levelTypes.projectId, projectId), eq(levelTypes.code, normalisedCode)))
			.limit(1);
		if (clash) error(400, `A level type with code ${normalisedCode} already exists`);

		const [maxOrder] = await db
			.select({ value: levelTypes.sortOrder })
			.from(levelTypes)
			.where(eq(levelTypes.projectId, projectId))
			.orderBy(desc(levelTypes.sortOrder))
			.limit(1);

		const newId = id();
		await db.insert(levelTypes).values({
			id: newId,
			projectId,
			code: normalisedCode,
			name,
			kind,
			colorHex,
			sortOrder: (maxOrder?.value ?? 0) + 10
		});

		return { id: newId };
	}
);

export const updateLevelType = command(
	z.object({
		projectId: z.uuid(),
		levelTypeId: z.uuid(),
		code: levelTypeCodeSchema.optional(),
		name: levelTypeNameSchema.optional(),
		colorHex: levelTypeColorSchema.optional()
	}),
	async ({ projectId, levelTypeId, code, name, colorHex }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const [existing] = await db
			.select()
			.from(levelTypes)
			.where(and(eq(levelTypes.id, levelTypeId), eq(levelTypes.projectId, projectId)))
			.limit(1);
		if (!existing) error(404, 'Level type not found');

		const update: Record<string, unknown> = { updatedAt: new Date() };
		if (name !== undefined) update.name = name;
		if (colorHex !== undefined) update.colorHex = colorHex;

		if (code !== undefined) {
			const normalisedCode = code.toUpperCase();
			if (normalisedCode !== existing.code) {
				const [clash] = await db
					.select({ id: levelTypes.id })
					.from(levelTypes)
					.where(and(eq(levelTypes.projectId, projectId), eq(levelTypes.code, normalisedCode)))
					.limit(1);
				if (clash) error(400, `A level type with code ${normalisedCode} already exists`);
				update.code = normalisedCode;
			}
		}

		await db.update(levelTypes).set(update).where(eq(levelTypes.id, levelTypeId));
		return { ok: true };
	}
);

export const deleteLevelType = command(
	z.object({ projectId: z.uuid(), levelTypeId: z.uuid() }),
	async ({ projectId, levelTypeId }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const [existing] = await db
			.select()
			.from(levelTypes)
			.where(and(eq(levelTypes.id, levelTypeId), eq(levelTypes.projectId, projectId)))
			.limit(1);
		if (!existing) error(404, 'Level type not found');

		const [usage] = await db
			.select({ id: readings.id })
			.from(readings)
			.where(eq(readings.levelTypeId, levelTypeId))
			.limit(1);
		if (usage) error(400, 'Remove readings of this level type before deleting it');

		// If this was the primary, clear it.
		const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
		if (project?.primaryLevelTypeId === levelTypeId) {
			await db.update(projects).set({ primaryLevelTypeId: null }).where(eq(projects.id, projectId));
		}

		await db.delete(levelTypes).where(eq(levelTypes.id, levelTypeId));
		return { ok: true };
	}
);

export const createPoint = command(
	z.object({
		projectId: z.uuid(),
		label: z.string().trim().min(1).max(40),
		xPx: z.number().finite(),
		yPx: z.number().finite(),
		isBenchmark: z.boolean().default(false),
		knownElevation: z.number().finite().nullable().optional()
	}),
	async (input) => {
		const userId = await requireUserId();
		await assertProjectOwner(input.projectId, userId);

		if (input.isBenchmark && input.knownElevation == null) {
			error(400, 'Benchmark points require a known elevation');
		}

		const pointId = id();
		await getDb().insert(points).values({ ...input, id: pointId, knownElevation: input.knownElevation ?? null });
		return { id: pointId };
	}
);

export const updatePoint = command(
	z.object({
		projectId: z.uuid(),
		pointId: z.uuid(),
		label: z.string().trim().min(1).max(40).optional(),
		xPx: z.number().finite().optional(),
		yPx: z.number().finite().optional(),
		knownElevation: z.number().finite().nullable().optional()
	}),
	async ({ projectId, pointId, ...patch }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const [existing] = await db
			.select()
			.from(points)
			.where(and(eq(points.id, pointId), eq(points.projectId, projectId)))
			.limit(1);
		if (!existing) error(404, 'Point not found');

		if (existing.isBenchmark && patch.knownElevation === null) {
			error(400, 'Benchmark points require a known elevation');
		}

		const update: Record<string, unknown> = {};
		if (patch.label !== undefined) update.label = patch.label;
		if (patch.xPx !== undefined) update.xPx = patch.xPx;
		if (patch.yPx !== undefined) update.yPx = patch.yPx;
		if (patch.knownElevation !== undefined) update.knownElevation = patch.knownElevation;

		if (Object.keys(update).length === 0) return { ok: true };

		await db.update(points).set(update).where(eq(points.id, pointId));
		return { ok: true };
	}
);

export const deletePoint = command(
	z.object({ projectId: z.uuid(), pointId: z.uuid() }),
	async ({ projectId, pointId }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const [existing] = await db
			.select()
			.from(points)
			.where(and(eq(points.id, pointId), eq(points.projectId, projectId)))
			.limit(1);
		if (!existing) error(404, 'Point not found');

		// Block delete of a benchmark with sessions referencing it
		if (existing.isBenchmark) {
			const [refSession] = await db
				.select({ id: levelSessions.id })
				.from(levelSessions)
				.where(eq(levelSessions.benchmarkPointId, pointId))
				.limit(1);
			if (refSession) {
				error(400, 'Delete or reassign sessions referencing this benchmark first');
			}
		}

		await db.delete(points).where(eq(points.id, pointId));
		return { ok: true };
	}
);

export const setPlanScale = command(
	z.object({
		projectId: z.uuid(),
		ax: z.number().finite(),
		ay: z.number().finite(),
		bx: z.number().finite(),
		by: z.number().finite(),
		metres: z.number().finite().positive()
	}),
	async ({ projectId, ax, ay, bx, by, metres }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const [plan] = await db.select().from(plans).where(eq(plans.projectId, projectId)).limit(1);
		if (!plan) error(400, 'Upload a plan before setting the scale');

		const dx = bx - ax;
		const dy = by - ay;
		const pxLength = Math.hypot(dx, dy);
		if (pxLength <= 0) error(400, 'Reference line has zero length');

		const scalePxPerMetre = pxLength / metres;

		await db
			.update(plans)
			.set({
				scalePxPerMetre,
				scaleRefAx: ax,
				scaleRefAy: ay,
				scaleRefBx: bx,
				scaleRefBy: by,
				scaleRefMetres: metres
			})
			.where(eq(plans.projectId, projectId));

		return { ok: true, scalePxPerMetre };
	}
);

// ── Annotation lines ─────────────────────────────────────────────────────────
// Free-hand straight-line markup the surveyor draws on top of the plan.
// Persisted in plan-pixel coords so they zoom and pan with the rest of the
// canvas. Style + colour + stroke width are user-editable per line.

const lineStyleSchema = z.enum(['solid', 'dashed', 'dotted']);
const colourHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #rrggbb');

export const createAnnotationLine = command(
	z.object({
		projectId: z.uuid(),
		ax: z.number().finite(),
		ay: z.number().finite(),
		bx: z.number().finite(),
		by: z.number().finite(),
		colorHex: colourHexSchema.optional(),
		style: lineStyleSchema.optional(),
		strokeWidth: z.number().finite().min(0.5).max(8).optional()
	}),
	async ({ projectId, ax, ay, bx, by, colorHex, style, strokeWidth }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const newId = id();
		await db.insert(annotationLines).values({
			id: newId,
			projectId,
			ax,
			ay,
			bx,
			by,
			colorHex: colorHex ?? '#0f100e',
			style: style ?? 'solid',
			strokeWidth: strokeWidth ?? 1.5
		});
		return { ok: true, id: newId };
	}
);

export const updateAnnotationLine = command(
	z.object({
		projectId: z.uuid(),
		id: z.uuid(),
		colorHex: colourHexSchema.optional(),
		style: lineStyleSchema.optional(),
		strokeWidth: z.number().finite().min(0.5).max(8).optional()
	}),
	async ({ projectId, id: lineId, colorHex, style, strokeWidth }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const patch: Partial<typeof annotationLines.$inferInsert> = {};
		if (colorHex !== undefined) patch.colorHex = colorHex;
		if (style !== undefined) patch.style = style;
		if (strokeWidth !== undefined) patch.strokeWidth = strokeWidth;
		if (Object.keys(patch).length === 0) return { ok: true };

		await db
			.update(annotationLines)
			.set(patch)
			.where(and(eq(annotationLines.id, lineId), eq(annotationLines.projectId, projectId)));
		return { ok: true };
	}
);

export const deleteAnnotationLine = command(
	z.object({ projectId: z.uuid(), id: z.uuid() }),
	async ({ projectId, id: lineId }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();
		await db
			.delete(annotationLines)
			.where(and(eq(annotationLines.id, lineId), eq(annotationLines.projectId, projectId)));
		return { ok: true };
	}
);

/**
 * Persist the plan-image opacity (0–1). Cheap; the page debounces calls to
 * once per slider rest so we don't write on every drag tick.
 */
export const setPlanImageOpacity = command(
	z.object({
		projectId: z.uuid(),
		opacity: z.number().finite().min(0).max(1)
	}),
	async ({ projectId, opacity }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const [plan] = await db.select().from(plans).where(eq(plans.projectId, projectId)).limit(1);
		if (!plan) error(400, 'No plan to update');

		await db.update(plans).set({ imageOpacity: opacity }).where(eq(plans.projectId, projectId));
		return { ok: true, opacity };
	}
);

export const startLevelSession = command(
	z.object({
		projectId: z.uuid(),
		benchmarkPointId: z.uuid(),
		benchmarkStaffReading: z.number().finite().nonnegative(),
		note: z.string().trim().max(500).nullable().optional()
	}),
	async ({ projectId, benchmarkPointId, benchmarkStaffReading, note }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const [benchmark] = await db
			.select()
			.from(points)
			.where(and(eq(points.id, benchmarkPointId), eq(points.projectId, projectId)))
			.limit(1);

		if (!benchmark?.isBenchmark || benchmark.knownElevation == null) {
			error(400, 'Select a benchmark point with a known elevation');
		}

		const sessionId = id();
		await db.insert(levelSessions).values({
			id: sessionId,
			projectId,
			benchmarkPointId,
			benchmarkStaffReading,
			instrumentHeight: calculateInstrumentHeight(benchmark.knownElevation, benchmarkStaffReading),
			note: note ?? null
		});

		return { id: sessionId };
	}
);

export const endLevelSession = command(
	z.object({ projectId: z.uuid(), sessionId: z.uuid() }),
	async ({ projectId, sessionId }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);

		await getDb()
			.update(levelSessions)
			.set({ endedAt: new Date() })
			.where(and(eq(levelSessions.id, sessionId), eq(levelSessions.projectId, projectId), isNull(levelSessions.endedAt)));

		return { ok: true };
	}
);

export const deleteLevelSession = command(
	z.object({ projectId: z.uuid(), sessionId: z.uuid() }),
	async ({ projectId, sessionId }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);

		await getDb()
			.delete(levelSessions)
			.where(and(eq(levelSessions.id, sessionId), eq(levelSessions.projectId, projectId)));

		return { ok: true };
	}
);

export const upsertReading = command(
	z.object({
		projectId: z.uuid(),
		pointId: z.uuid(),
		levelTypeId: z.uuid(),
		staffReading: z.number().finite().nonnegative().nullable().optional(),
		elevation: z.number().finite().nullable().optional(),
		note: z.string().trim().max(500).nullable().optional()
	}),
	async ({ projectId, pointId, levelTypeId, staffReading, elevation, note }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		const [point] = await db.select().from(points).where(and(eq(points.id, pointId), eq(points.projectId, projectId))).limit(1);
		const [levelType] = await db.select().from(levelTypes).where(and(eq(levelTypes.id, levelTypeId), eq(levelTypes.projectId, projectId))).limit(1);

		if (!point || !levelType) error(404, 'Point or level type not found');

		let sessionId: string | null = null;
		let storedStaffReading: number | null = null;
		let storedElevation: number;

		if (staffReading != null) {
			const [activeSession] = await db
				.select()
				.from(levelSessions)
				.where(and(eq(levelSessions.projectId, projectId), isNull(levelSessions.endedAt)))
				.limit(1);
			if (!activeSession) error(400, 'Start a level session before adding staff readings');
			sessionId = activeSession.id;
			storedStaffReading = staffReading;
			storedElevation = calculateReducedLevel(activeSession.instrumentHeight, staffReading);
		} else {
			if (elevation == null) error(400, 'Enter an elevation or staff reading');
			storedElevation = elevation;
		}

		const readingId = id();
		await db
			.insert(readings)
			.values({
				id: readingId,
				pointId,
				levelTypeId,
				sessionId,
				staffReading: storedStaffReading,
				elevation: storedElevation,
				note: note ?? null
			})
			.onConflictDoUpdate({
				target: [readings.pointId, readings.levelTypeId],
				set: {
					sessionId,
					staffReading: storedStaffReading,
					elevation: storedElevation,
					note: note ?? null,
					takenAt: new Date()
				}
			});

		return { id: readingId, elevation: storedElevation };
	}
);

export const deleteReading = command(
	z.object({ projectId: z.uuid(), readingId: z.uuid() }),
	async ({ projectId, readingId }) => {
		const userId = await requireUserId();
		await assertProjectOwner(projectId, userId);
		const db = getDb();

		// Verify the reading belongs to a point in this project
		const [row] = await db
			.select({ id: readings.id })
			.from(readings)
			.innerJoin(points, eq(readings.pointId, points.id))
			.where(and(eq(readings.id, readingId), eq(points.projectId, projectId)))
			.limit(1);

		if (!row) error(404, 'Reading not found');

		await db.delete(readings).where(eq(readings.id, readingId));
		return { ok: true };
	}
);
