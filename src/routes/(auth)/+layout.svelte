<script lang="ts">
	import BenchmarkMark from '$lib/components/brand/benchmark-mark.svelte';

	let { children }: { children: import('svelte').Snippet } = $props();
</script>

<div class="relative flex min-h-screen w-full items-stretch">
	<!-- Left poster panel -->
	<aside class="topo-plate relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-ink/15 bg-vellum p-10 lg:flex">
		<div class="absolute inset-0 bg-gradient-to-br from-vellum/85 via-vellum/60 to-paper/95"></div>

		<div class="relative flex items-center gap-3 text-ink">
			<BenchmarkMark size={34} accent />
			<span class="font-display text-3xl tracking-tight">Level<span class="italic">log</span></span>
		</div>

		<div class="relative max-w-md">
			<p class="eyebrow">Field log · 03 May 2026</p>
			<h1 class="mt-3 font-display text-[3.4rem] leading-[0.95] tracking-tight text-ink">
				Every reading,
				<span class="block italic text-graphite">to the millimetre.</span>
			</h1>
			<p class="mt-5 font-body text-[15px] text-ink-2">
				A field-grade level book for surveyors. Drop points on a plan, log staff readings,
				re-level safely without rewriting history.
			</p>

			<div class="mt-8 flex items-baseline gap-6">
				<div>
					<span class="font-display text-3xl tabular text-accent-deep">±2 mm</span>
					<span class="block font-mono text-[11px] text-graphite">avg residual</span>
				</div>
				<div class="hairline-v h-10"></div>
				<div>
					<span class="font-display text-3xl tabular text-ink">12.000</span>
					<span class="block font-mono text-[11px] text-graphite">m · BM datum</span>
				</div>
				<div class="hairline-v h-10"></div>
				<div>
					<span class="font-display text-3xl tabular text-signal-deep">live</span>
					<span class="block font-mono text-[11px] text-graphite">session aware</span>
				</div>
			</div>
		</div>

		<div class="relative flex items-center justify-between">
			<span class="eyebrow">Lat 51.5074°N · Lng 0.1278°W</span>
			<span class="font-mono text-[11px] text-graphite">datum · AHD</span>
		</div>
	</aside>

	<!-- Right form panel -->
	<main class="relative flex flex-1 items-center justify-center p-8">
		{@render children()}
	</main>
</div>
