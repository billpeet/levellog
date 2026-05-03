<script lang="ts">
	import { onDestroy } from 'svelte';

	type Props = {
		file: File;
		/** Called when the user confirms a page; provides a PNG File ready to upload. */
		onpicked: (image: File) => void;
		oncancel?: () => void;
	};

	let { file, onpicked, oncancel }: Props = $props();

	type Thumb = { pageNumber: number; url: string; widthPx: number; heightPx: number };

	let loading = $state(true);
	let err = $state<string | null>(null);
	let thumbs = $state<Thumb[]>([]);
	let selected = $state<number>(1);
	let rendering = $state(false);
	const skeletonThumbs = [0, 1, 2, 3];

	// Cache of the loaded pdfjs document (keeps page rendering snappy on confirm).
	let pdfDoc: { numPages: number; getPage: (n: number) => Promise<unknown> } | null = null;
	let pdfjsLib: typeof import('pdfjs-dist') | null = null;

	async function loadDoc() {
		try {
			loading = true;
			err = null;

			const lib = await import('pdfjs-dist');
			// Worker — Vite resolves the URL at build time.
			const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
			lib.GlobalWorkerOptions.workerSrc = workerUrl;
			pdfjsLib = lib;

			const buf = await file.arrayBuffer();
			const doc = await lib.getDocument({ data: buf }).promise;
			pdfDoc = doc as unknown as typeof pdfDoc;

			const out: Thumb[] = [];
			const maxThumbs = Math.min(doc.numPages, 24);
			for (let n = 1; n <= maxThumbs; n++) {
				const page = await doc.getPage(n);
				const baseVp = page.getViewport({ scale: 1 });
				const targetW = 220;
				const scale = targetW / baseVp.width;
				const vp = page.getViewport({ scale });
				const canvas = document.createElement('canvas');
				canvas.width = Math.ceil(vp.width);
				canvas.height = Math.ceil(vp.height);
				const ctx = canvas.getContext('2d')!;
				// Paper background to match the app aesthetic.
				ctx.fillStyle = '#faf6eb';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
				out.push({
					pageNumber: n,
					url: canvas.toDataURL('image/png'),
					widthPx: Math.ceil(baseVp.width),
					heightPx: Math.ceil(baseVp.height)
				});
				thumbs = [...out];
			}
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not read PDF';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (file) {
			thumbs = [];
			selected = 1;
			void loadDoc();
		}
	});

	onDestroy(() => {
		pdfDoc = null;
		pdfjsLib = null;
	});

	async function confirm() {
		if (!pdfDoc || !pdfjsLib) return;
		rendering = true;
		err = null;
		try {
			const page = await pdfDoc.getPage(selected);
			// Render at 2x for a crisp plan.
			const baseVp = (page as { getViewport: (o: { scale: number }) => { width: number; height: number } })
				.getViewport({ scale: 1 });
			const renderScale = Math.min(3, Math.max(1.5, 2400 / baseVp.width));
			const vp = (page as { getViewport: (o: { scale: number }) => { width: number; height: number } }).getViewport({
				scale: renderScale
			});
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(vp.width);
			canvas.height = Math.ceil(vp.height);
			const ctx = canvas.getContext('2d')!;
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			await (page as { render: (opts: unknown) => { promise: Promise<void> } }).render({
				canvasContext: ctx,
				viewport: vp,
				canvas
			}).promise;

			const blob: Blob = await new Promise((resolve, reject) => {
				canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode page'))), 'image/png');
			});

			const baseName = file.name.replace(/\.pdf$/i, '');
			const out = new File([blob], `${baseName}-p${selected}.png`, { type: 'image/png' });
			onpicked(out);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not render page';
		} finally {
			rendering = false;
		}
	}
</script>

<div class="rounded-lg border border-rule bg-paper/40 p-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<span class="eyebrow">PDF · {file.name}</span>
			{#if loading}
				<span class="font-mono text-[11px] text-graphite">Reading… {thumbs.length}{thumbs.length ? ' pages' : ''}</span>
			{:else if !err}
				<span class="font-mono text-[11px] text-graphite">
					{thumbs.length} page{thumbs.length === 1 ? '' : 's'} · pick one
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if oncancel}
				<button
					type="button"
					onclick={() => oncancel?.()}
					class="press font-mono text-[10px] uppercase tracking-wider text-graphite hover:text-accent-deep"
				>Remove</button>
			{/if}
			<button
				type="button"
				onclick={confirm}
				disabled={loading || rendering || thumbs.length === 0}
				class="press rounded-full bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper disabled:opacity-40"
			>
				{rendering ? 'Rendering…' : `Use page ${selected}`}
			</button>
		</div>
	</div>

	{#if err}
		<p class="mt-3 rounded-md border border-accent-deep/30 bg-paper/70 px-3 py-2 font-mono text-[11px] text-accent-deep">
			{err}
		</p>
	{/if}

	<div class="mt-4 grid max-h-[360px] gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
		{#if loading && thumbs.length === 0}
			{#each skeletonThumbs as i (i)}
				<div class="aspect-[3/4] animate-pulse rounded border border-rule bg-vellum"></div>
			{/each}
		{/if}
		{#each thumbs as t (t.pageNumber)}
			<button
				type="button"
				onclick={() => (selected = t.pageNumber)}
				class="press group relative flex flex-col items-stretch overflow-hidden rounded border bg-vellum p-1.5 text-left
					{selected === t.pageNumber ? 'border-ink ring-2 ring-accent/40' : 'border-rule hover:border-ink/40'}"
			>
				<img src={t.url} alt="Page {t.pageNumber}" class="block w-full rounded-sm bg-paper" />
				<div class="mt-1.5 flex items-center justify-between font-mono text-[10px] text-ink">
					<span>p.{t.pageNumber}</span>
					<span class="text-graphite">{t.widthPx}×{t.heightPx}</span>
				</div>
			</button>
		{/each}
	</div>
</div>
