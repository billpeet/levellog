import { redirect } from '@sveltejs/kit';

import { auth } from '$lib/server/auth';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request, url }) => {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user) {
		const next = encodeURIComponent(url.pathname + url.search);
		redirect(303, `/login?next=${next}`);
	}

	const name = session.user.name ?? session.user.email ?? 'Surveyor';
	const initials = name
		.split(/\s+/)
		.map((part) => part[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase() || 'LL';

	return {
		user: {
			id: session.user.id,
			name,
			email: session.user.email,
			initials
		}
	};
};
