import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';

import { auth } from '$lib/server/auth';
import { getDb } from '$lib/server/db/client';
import { plans, projects } from '$lib/server/db/schema';
import { resolveUploadPath } from '$lib/server/uploads';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) error(401, 'Sign in required');

	const planId = params.planId!;
	const db = getDb();

	const [row] = await db
		.select({
			imagePath: plans.imagePath,
			mimeType: plans.mimeType
		})
		.from(plans)
		.innerJoin(projects, eq(projects.id, plans.projectId))
		.where(and(eq(plans.id, planId), eq(projects.userId, session.user.id)))
		.limit(1);

	if (!row?.imagePath) error(404, 'Plan image not found');

	const absPath = resolveUploadPath(row.imagePath);
	let info;
	try {
		info = await stat(absPath);
	} catch {
		error(404, 'Plan image missing on disk');
	}

	const stream = createReadStream(absPath);
	return new Response(stream as unknown as ReadableStream, {
		headers: {
			'Content-Type': row.mimeType ?? 'application/octet-stream',
			'Content-Length': String(info.size),
			'Cache-Control': 'private, max-age=3600'
		}
	});
};
