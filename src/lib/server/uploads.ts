import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { getServerEnv } from '$lib/server/env';

export function resolveUploadPath(...segments: string[]) {
	return path.resolve(getServerEnv().UPLOAD_DIR, ...segments);
}

export async function ensureUploadDir() {
	await mkdir(resolveUploadPath(), { recursive: true });
}
