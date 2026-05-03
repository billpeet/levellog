import type { auth } from '$lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			session: typeof auth.$Infer.Session | null;
			user: typeof auth.$Infer.Session.user | null;
		}
		interface PageData {
			session: typeof auth.$Infer.Session | null;
		}
	}
}

export {};
