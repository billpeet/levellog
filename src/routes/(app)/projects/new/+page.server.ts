import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { auth } from '$lib/server/auth';
import { getDb } from '$lib/server/db/client';
import { defaultLevelTypes } from '$lib/server/db/seed';
import { levelTypes, projects } from '$lib/server/db/schema';

import type { Actions } from './$types';

function id() {
	return crypto.randomUUID();
}

export const actions: Actions = {
	create: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user) {
			redirect(303, '/login');
		}

		const formData = await request.formData();
		const rawName = formData.get('name');
		const name = typeof rawName === 'string' ? rawName.trim() : '';

		if (!name) {
			return fail(400, { name: rawName ?? '', error: 'Give the project a name.' });
		}
		if (name.length > 120) {
			return fail(400, { name, error: 'Name is limited to 120 characters.' });
		}

		const db = getDb();
		const projectId = id();
		const now = new Date();

		const insertedLevelTypes = defaultLevelTypes.map((levelType) => ({
			...levelType,
			id: id(),
			projectId,
			createdAt: now,
			updatedAt: now
		}));

		const primaryId = insertedLevelTypes.find((lt) => lt.code === 'CL')?.id ?? null;

		db.transaction((tx) => {
			tx.insert(projects)
				.values({
					id: projectId,
					userId: session.user.id,
					name,
					primaryLevelTypeId: primaryId,
					createdAt: now,
					updatedAt: now
				})
				.run();

			tx.insert(levelTypes).values(insertedLevelTypes).run();

			// Ensure FK validity: primaryLevelTypeId references a row that exists now.
			tx.update(projects)
				.set({ primaryLevelTypeId: primaryId })
				.where(eq(projects.id, projectId))
				.run();
		});

		return { id: projectId };
	}
};
