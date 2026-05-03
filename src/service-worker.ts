/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// SvelteKit auto-registers this file as a service worker. It gives us
// `build` (immutable hashed asset chunks), `files` (everything in
// /static), `prerendered` (prerendered route paths), and `version`
// (build id) so we can scope a cache per deploy.

import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `levellog-cache-${version}`;
const OFFLINE_URL = '/offline.html';

// Pre-cache: hashed build chunks + everything we ship from /static (icons,
// manifest, fonts, the offline fallback) + any prerendered HTML. We
// deliberately do NOT pre-cache app routes — they're auth-gated and
// dynamic, so we cache them lazily on first visit instead.
const PRECACHE = [...build, ...files, ...prerendered, OFFLINE_URL];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Drop caches from previous deploys.
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

// Network strategy:
//   - Hashed build assets / static files → cache-first (immutable).
//   - GET navigations → network-first, fall back to cached page, then
//     to the offline shell. Auth/session stays online-only.
//   - Everything else (POST, API mutations, /api/uploads, etc.) → bypass
//     the SW entirely so we never serve stale data or break form actions.
sw.addEventListener('fetch', (event) => {
	const { request } = event;

	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Only handle same-origin traffic. Cross-origin requests (Google
	// Fonts, OAuth, etc.) go straight to the network.
	if (url.origin !== sw.location.origin) return;

	// Never intercept API or upload routes — they're dynamic, auth-gated,
	// or stream large blobs we don't want sitting in the SW cache.
	if (url.pathname.startsWith('/api/')) return;

	const isPrecached =
		build.includes(url.pathname) ||
		files.includes(url.pathname) ||
		prerendered.includes(url.pathname);

	if (isPrecached) {
		event.respondWith(cacheFirst(request));
		return;
	}

	// HTML navigations: try the network, fall back to whatever we cached
	// last for this URL, finally fall back to the static offline shell.
	const accept = request.headers.get('accept') ?? '';
	if (request.mode === 'navigate' || accept.includes('text/html')) {
		event.respondWith(networkFirstHtml(request));
	}
});

async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) cache.put(request, response.clone());
	return response;
}

async function networkFirstHtml(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		// Cache successful HTML so the page survives a later offline visit.
		// Skip auth redirects (3xx) and errors so we don't trap users on a
		// stale login redirect.
		if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		const offline = await cache.match(OFFLINE_URL);
		if (offline) return offline;
		return new Response('Offline', { status: 503, statusText: 'Offline' });
	}
}

// Allow the page to trigger an immediate activate after a deploy.
sw.addEventListener('message', (event) => {
	if (event.data === 'skip-waiting') sw.skipWaiting();
});
