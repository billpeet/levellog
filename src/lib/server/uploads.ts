import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { getServerEnv } from '$lib/server/env';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_DIM = 6000;

export type IngestedPlanImage = {
	relPath: string;
	mimeType: 'image/png' | 'image/jpeg';
	widthPx: number;
	heightPx: number;
	byteSize: number;
};

export function resolveUploadPath(...segments: string[]) {
	return path.resolve(getServerEnv().UPLOAD_DIR, ...segments);
}

export async function ensureUploadDir() {
	await mkdir(resolveUploadPath(), { recursive: true });
}

/**
 * Read a Blob/File, normalise to a clean PNG or JPEG (EXIF stripped, downscaled
 * if absurdly large), and write it under the configured uploads dir keyed by
 * project id. Returns metadata for persistence on the `plans` row.
 */
export async function ingestPlanImage(file: Blob, projectId: string): Promise<IngestedPlanImage> {
	if (file.size === 0) {
		throw new Error('Empty file');
	}
	if (file.size > MAX_BYTES) {
		throw new Error(`File too large (max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB)`);
	}

	const contentType = (file.type || '').toLowerCase();
	if (!['image/png', 'image/jpeg', 'image/jpg'].includes(contentType)) {
		throw new Error('Unsupported image type — PNG or JPG only');
	}

	const buffer = Buffer.from(await file.arrayBuffer());

	const pipeline = sharp(buffer, { failOn: 'error' }).rotate(); // rotate honours + then strips EXIF
	const meta = await pipeline.metadata();
	if (!meta.width || !meta.height) {
		throw new Error('Could not read image dimensions');
	}

	const isJpeg = contentType === 'image/jpeg' || contentType === 'image/jpg';
	const targetMime: 'image/png' | 'image/jpeg' = isJpeg ? 'image/jpeg' : 'image/png';
	const ext = isJpeg ? 'jpg' : 'png';

	let processed = pipeline;
	if (meta.width > MAX_DIM || meta.height > MAX_DIM) {
		processed = processed.resize({
			width: Math.min(meta.width, MAX_DIM),
			height: Math.min(meta.height, MAX_DIM),
			fit: 'inside',
			withoutEnlargement: true
		});
	}
	processed = isJpeg
		? processed.jpeg({ quality: 88, mozjpeg: true })
		: processed.png({ compressionLevel: 9 });

	const out = await processed.toBuffer({ resolveWithObject: true });

	const subdir = projectId;
	const fileName = `${randomUUID()}-${createHash('sha1').update(out.data).digest('hex').slice(0, 8)}.${ext}`;
	const relPath = path.posix.join(subdir, fileName);

	await mkdir(resolveUploadPath(subdir), { recursive: true });
	await writeFile(resolveUploadPath(relPath), out.data);

	return {
		relPath,
		mimeType: targetMime,
		widthPx: out.info.width,
		heightPx: out.info.height,
		byteSize: out.data.byteLength
	};
}
