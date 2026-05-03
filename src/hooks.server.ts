import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { auth } from '$lib/server/auth';
import { ensureUploadDir } from '$lib/server/uploads';

import type { Handle } from '@sveltejs/kit';

let uploadDirReady = false;

export const handle: Handle = async ({ event, resolve }) => {
	if (!building && !uploadDirReady) {
		await ensureUploadDir();
		uploadDirReady = true;
	}

	return svelteKitHandler({
		auth,
		event,
		resolve,
		building
	});
};
