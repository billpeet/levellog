<script lang="ts">
	import type { Snippet } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	type Props = {
		widthPx: number;
		heightPx: number;
		imageUrl?: string | null;
		cursor?: string;
		onsurfaceclick?: (event: { xPx: number; yPx: number; native: PointerEvent }) => void;
		onsurfacemove?: (event: { xPx: number; yPx: number; native: PointerEvent }) => void;
		overlay?: Snippet<[{ widthPx: number; heightPx: number; scale: number }]>;
		/** Show the built-in zoom / fit controls overlay. */
		showControls?: boolean;
		/** Two-way binding for the current zoom scale (plan px → screen px). */
		scale?: number;
		/** Plan image opacity, 0–1. Overlays (SVG) are unaffected. */
		imageOpacity?: number;
	};

	let {
		widthPx,
		heightPx,
		imageUrl = null,
		cursor = 'default',
		onsurfaceclick,
		onsurfacemove,
		overlay,
		showControls = true,
		scale = $bindable(1),
		imageOpacity = 1
	}: Props = $props();
	let tx = $state(0);
	let ty = $state(0);

	let viewport: HTMLDivElement | undefined = $state();
	let viewportSize = $state({ w: 0, h: 0 });

	$effect(() => {
		if (!viewport) return;
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) {
				viewportSize = { w: e.contentRect.width, h: e.contentRect.height };
			}
		});
		ro.observe(viewport);
		return () => ro.disconnect();
	});

	function fit() {
		if (!viewportSize.w || !viewportSize.h) return;
		const pad = 24;
		const s = Math.min(
			(viewportSize.w - pad * 2) / widthPx,
			(viewportSize.h - pad * 2) / heightPx
		);
		scale = Math.max(0.05, Math.min(8, s));
		tx = (viewportSize.w - widthPx * scale) / 2;
		ty = (viewportSize.h - heightPx * scale) / 2;
	}

	let didInitialFit = false;
	$effect(() => {
		if (!didInitialFit && viewportSize.w && viewportSize.h) {
			didInitialFit = true;
			fit();
		}
	});

	function zoomAt(cx: number, cy: number, next: number) {
		const clamped = Math.max(0.05, Math.min(16, next));
		const planX = (cx - tx) / scale;
		const planY = (cy - ty) / scale;
		scale = clamped;
		tx = cx - planX * scale;
		ty = cy - planY * scale;
	}

	function clientToPlan(clientX: number, clientY: number) {
		if (!viewport) return { xPx: 0, yPx: 0 };
		const r = viewport.getBoundingClientRect();
		return { xPx: (clientX - r.left - tx) / scale, yPx: (clientY - r.top - ty) / scale };
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const r = viewport!.getBoundingClientRect();
		zoomAt(e.clientX - r.left, e.clientY - r.top, scale * Math.exp(-e.deltaY * 0.0015));
	}

	type Drag =
		| { kind: 'pan'; startX: number; startY: number; startTx: number; startTy: number }
		| { kind: 'pinch'; startDist: number; startScale: number; cx: number; cy: number };

	let drag = $state<Drag | null>(null);
	const activePointers = new SvelteMap<number, { x: number; y: number }>();
	let didDrag = false;
	let pressedAt = 0;
	let pressedX = 0;
	let pressedY = 0;

	function onPointerDown(e: PointerEvent) {
		// Bail out when the press starts inside chrome that opts out of panning
		// (zoom controls, etc.) — otherwise setPointerCapture on the viewport
		// hijacks the pointer and the button never receives its click event.
		if ((e.target as HTMLElement | null)?.closest('[data-canvas-chrome]')) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		didDrag = false;
		pressedAt = performance.now();
		pressedX = e.clientX;
		pressedY = e.clientY;

		if (activePointers.size === 1) {
			drag = { kind: 'pan', startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
		} else if (activePointers.size === 2) {
			const [a, b] = [...activePointers.values()];
			drag = {
				kind: 'pinch',
				startDist: Math.hypot(a.x - b.x, a.y - b.y),
				startScale: scale,
				cx: (a.x + b.x) / 2,
				cy: (a.y + b.y) / 2
			};
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (activePointers.has(e.pointerId)) {
			activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		}
		if (drag?.kind === 'pan') {
			const dx = e.clientX - drag.startX;
			const dy = e.clientY - drag.startY;
			if (Math.abs(dx) + Math.abs(dy) > 4) didDrag = true;
			tx = drag.startTx + dx;
			ty = drag.startTy + dy;
		} else if (drag?.kind === 'pinch' && activePointers.size === 2) {
			const [a, b] = [...activePointers.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			const r = viewport!.getBoundingClientRect();
			zoomAt(drag.cx - r.left, drag.cy - r.top, (dist / drag.startDist) * drag.startScale);
			didDrag = true;
		}

		if (onsurfacemove) {
			const p = clientToPlan(e.clientX, e.clientY);
			onsurfacemove({ ...p, native: e });
		}
	}

	function endPointer(e: PointerEvent) {
		activePointers.delete(e.pointerId);
		const wasPan = drag?.kind === 'pan';
		if (activePointers.size === 0) drag = null;
		else if (activePointers.size === 1) {
			const [only] = [...activePointers.values()];
			drag = { kind: 'pan', startX: only.x, startY: only.y, startTx: tx, startTy: ty };
		}

		if (wasPan && !didDrag && performance.now() - pressedAt < 400) {
			const moved = Math.hypot(e.clientX - pressedX, e.clientY - pressedY);
			if (moved < 5 && onsurfaceclick) {
				const p = clientToPlan(e.clientX, e.clientY);
				onsurfaceclick({ ...p, native: e });
			}
		}
	}
</script>

<div
	bind:this={viewport}
	class="surveyor-grid relative h-full w-full overflow-hidden touch-none"
	style="cursor: {cursor};"
	onwheel={onWheel}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={endPointer}
	onpointercancel={endPointer}
	onpointerleave={endPointer}
	role="presentation"
>
	<div
		class="absolute left-0 top-0 origin-top-left"
		style="transform: translate({tx}px, {ty}px) scale({scale}); width: {widthPx}px; height: {heightPx}px;"
	>
		{#if imageUrl}
			<img
				src={imageUrl}
				alt="Site plan"
				draggable="false"
				class="pointer-events-none block h-full w-full select-none bg-vellum"
				style="opacity: {imageOpacity};"
			/>
		{:else}
			<div class="h-full w-full bg-vellum/40 ring-1 ring-inset ring-ink/10"></div>
		{/if}

		<svg
			class="pointer-events-none absolute inset-0 h-full w-full"
			viewBox="0 0 {widthPx} {heightPx}"
			preserveAspectRatio="none"
		>
			{#if overlay}
				{@render overlay({ widthPx, heightPx, scale })}
			{/if}
		</svg>
	</div>

	{#if showControls}
		<div
			data-canvas-chrome
			class="pointer-events-auto absolute right-4 top-4 flex gap-1 rounded border border-rule bg-paper/85 p-1 backdrop-blur-sm"
		>
			<button
				type="button"
				class="press inline-flex h-7 w-7 items-center justify-center rounded font-mono text-sm text-ink hover:bg-vellum"
				onclick={() => zoomAt(viewportSize.w / 2, viewportSize.h / 2, scale / 1.25)}
				aria-label="Zoom out"
			>−</button>
			<span class="inline-flex min-w-[3.2rem] items-center justify-center font-mono text-[11px] tabular text-ink">
				{Math.round(scale * 100)}%
			</span>
			<button
				type="button"
				class="press inline-flex h-7 w-7 items-center justify-center rounded font-mono text-sm text-ink hover:bg-vellum"
				onclick={() => zoomAt(viewportSize.w / 2, viewportSize.h / 2, scale * 1.25)}
				aria-label="Zoom in"
			>+</button>
			<button
				type="button"
				class="press ml-1 inline-flex items-center rounded px-2 font-mono text-[10px] uppercase tracking-wider text-ink hover:bg-vellum"
				onclick={fit}
			>Fit</button>
		</div>
	{/if}
</div>
