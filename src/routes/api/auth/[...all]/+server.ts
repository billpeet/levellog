import { toSvelteKitHandler } from 'better-auth/svelte-kit';

import { auth } from '$lib/server/auth';

export const GET = toSvelteKitHandler(auth);
export const POST = toSvelteKitHandler(auth);
