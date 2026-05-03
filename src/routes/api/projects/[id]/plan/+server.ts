import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

import { auth } from '$lib/server/auth';
import { getDb } from '$lib/server/db/client';
import { plans, projects } from '$lib/server/db/schema';
import { ingestPlanImage } from '$lib/server/uploads';

import type { RequestHandler } from './$types';

async function requireOwnedProject(request: Request, projectId: string) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) error(401, 'Sign in required');

	const [project] = await getDb()
		.select()
		.from(projects)
		.where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
		.limit(1);

	if (!project) error(404, 'Project not found');
	return project;
}

export const POST: RequestHandler = async ({ request, params }) => {
	const projectId = params.id!;
	await requireOwnedProject(request, projectId);

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof Blob)) {
		error(400, 'Missing file');
	}

	let ingested;
	try {
		ingested = await ingestPlanImage(file, projectId);
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Could not process image');
	}

	const db = getDb();
	const planId = crypto.randomUUID();

	await db
		.insert(plans)
		.values({
			id: planId,
			projectId,
			imagePath: ingested.relPath,
			mimeType: ingested.mimeType,
			widthPx: ingested.widthPx,
			heightPx: ingested.heightPx
		})
		.onConflictDoUpdate({
			target: plans.projectId,
			set: {
				imagePath: ingested.relPath,
				mimeType: ingested.mimeType,
				widthPx: ingested.widthPx,
				heightPx: ingested.heightPx,
				// reset scale when the underlying image changes
				scalePxPerMetre: null,
				scaleRefAx: null,
				scaleRefAy: null,
				scaleRefBx: null,
				scaleRefBy: null,
				scaleRefMetres: null
			}
		});

	const [plan] = await db.select().from(plans).where(eq(plans.projectId, projectId)).limit(1);

	await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));

	return json({ ok: true, plan });
};
