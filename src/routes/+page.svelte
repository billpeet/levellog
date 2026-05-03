<script lang="ts">
	import { resolve } from '$app/paths';
	import BenchmarkMark from '$lib/components/brand/benchmark-mark.svelte';
	import RegistrationCorners from '$lib/components/shell/registration-corners.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const signedIn = $derived(!!data.session);
	const ctaHref = $derived(signedIn ? resolve('/projects') : resolve('/login'));
	const ctaLabel = $derived(signedIn ? 'Open field book' : 'Continue with Google');

	const features = [
		{
			eyebrow: 'Plate · 01',
			title: 'Sessions, not spreadsheets.',
			body: 'Move the laser, take a fresh backsight, start a new session. Old readings stay anchored to the instrument height they were taken at — never silently rewritten.'
		},
		{
			eyebrow: 'Plate · 02',
			title: 'Plan, point, primary level.',
			body: 'Drop a benchmark, drop your shots, see the project’s primary level beside every marker. Tap a point for the full reading log: CL, FL, SL, DPC, FFL.'
		},
		{
			eyebrow: 'Plate · 03',
			title: 'Cut & fill, at a glance.',
			body: 'Toggle the heatmap to read current, finished, or delta across the site. Pick any two points for distance, height delta, and grade in % and 1:n.'
		}
	];

	const ledger = [
		{ label: 'BM datum', value: '12.000', unit: 'm' },
		{ label: 'Backsight', value: '1.482', unit: 'm' },
		{ label: 'Inst. height', value: '13.482', unit: 'm' },
		{ label: 'Shot · A4', value: '1.917', unit: 'm' },
		{ label: 'RL · A4', value: '11.565', unit: 'm' }
	];
</script>

<svelte:head>
	<title>LevelLog · A field log for laser-level surveys</title>
	<meta
		name="description"
		content="LevelLog is a drafting-table-meets-field-instrument web app for surveyors. Plan canvas, sessions, heatmap, and reading log — to the millimetre."
	/>
</svelte:head>

<div class="relative min-h-screen w-full">
	<!-- Top bar -->
	<header class="sticky top-0 z-30 w-full backdrop-blur-md">
		<div class="bg-paper/85">
			<div class="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-6 md:px-10">
				<a href={resolve('/')} class="flex items-center gap-3 text-ink">
					<BenchmarkMark size={26} accent />
					<span class="font-display text-2xl tracking-tight">
						Level<span class="italic">log</span>
					</span>
				</a>

				<nav class="hidden items-center gap-7 md:flex">
					<a href="#field-book" class="font-mono text-[11px] uppercase tracking-[0.22em] text-graphite hover:text-ink">
						Field book
					</a>
					<a href="#instrument" class="font-mono text-[11px] uppercase tracking-[0.22em] text-graphite hover:text-ink">
						Instrument
					</a>
					<a href="#ledger" class="font-mono text-[11px] uppercase tracking-[0.22em] text-graphite hover:text-ink">
						Ledger
					</a>
				</nav>

				<a
					href={ctaHref}
					class="press inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-paper hover:bg-ink-2"
				>
					{signedIn ? 'Open field book' : 'Sign in'}
					<span aria-hidden="true">→</span>
				</a>
			</div>
			<div class="ruler-ticks h-[6px]"></div>
		</div>
	</header>

	<!-- Hero -->
	<section class="relative">
		<div class="mx-auto grid max-w-[1600px] grid-cols-1 gap-10 px-6 pb-20 pt-16 md:px-10 md:pt-24 lg:grid-cols-12 lg:gap-12 lg:pb-28">
			<div class="lg:col-span-7">
				<div class="flex items-center gap-3">
					<span class="eyebrow">Field log · 03 May 2026</span>
					<span class="hairline w-16"></span>
					<span class="font-mono text-[11px] uppercase tracking-[0.22em] text-graphite">v · alpha</span>
				</div>

				<h1 class="rise mt-5 font-display text-[3.4rem] leading-[0.95] tracking-tight text-ink md:text-[5.2rem]">
					Every reading,
					<span class="block italic text-graphite">to the millimetre.</span>
				</h1>

				<p class="mt-6 max-w-xl font-body text-[15px] leading-relaxed text-ink-2 md:text-[17px]">
					LevelLog replaces the paper field book and the ad-hoc spreadsheet.
					Drop a benchmark on a site plan, run sessions against your laser,
					and trust that nothing you wrote down yesterday will be quietly
					rewritten today.
				</p>

				<div class="mt-9 flex flex-wrap items-center gap-4">
					<a
						href={ctaHref}
						class="press inline-flex h-12 items-center gap-3 rounded-full bg-ink px-6 font-mono text-[12px] uppercase tracking-[0.2em] text-paper hover:bg-ink-2"
					>
						<span>{ctaLabel}</span>
						<span aria-hidden="true">→</span>
					</a>
					<a
						href="#field-book"
						class="press inline-flex h-12 items-center gap-3 rounded-full border border-ink/20 bg-paper px-6 font-mono text-[12px] uppercase tracking-[0.2em] text-ink hover:bg-vellum"
					>
						Read the spec
					</a>
				</div>

				<!-- Stat strip -->
				<div class="mt-12 flex flex-wrap items-baseline gap-x-8 gap-y-4">
					<div>
						<span class="font-display text-3xl tabular text-accent-deep">±2 mm</span>
						<span class="block font-mono text-[11px] text-graphite">avg residual</span>
					</div>
					<div class="hairline-v hidden h-10 sm:block"></div>
					<div>
						<span class="font-display text-3xl tabular text-ink">12.000</span>
						<span class="block font-mono text-[11px] text-graphite">m · BM datum</span>
					</div>
					<div class="hairline-v hidden h-10 sm:block"></div>
					<div>
						<span class="font-display text-3xl tabular text-signal-deep">live</span>
						<span class="block font-mono text-[11px] text-graphite">session aware</span>
					</div>
				</div>
			</div>

			<!-- Plan card -->
			<div class="relative lg:col-span-5">
				<div class="relative overflow-hidden rounded-2xl border border-ink/10 bg-vellum shadow-[0_24px_60px_-30px_rgba(15,16,14,0.35)]">
					<RegistrationCorners inset={12} />

					<!-- Floating site card -->
					<div class="absolute right-4 top-4 z-10 rounded-xl border border-ink/10 bg-paper/80 px-3 py-2 shadow-[0_2px_18px_-8px_rgba(15,16,14,0.25)] backdrop-blur-md">
						<div class="flex items-center gap-2">
							<span class="laser-dot h-2 w-2 rounded-full bg-signal"></span>
							<span class="font-mono text-[10px] uppercase tracking-[0.2em] text-signal-deep">Session live</span>
						</div>
						<div class="mt-1 font-mono text-[11px] tabular text-ink">HI · 13.482 m</div>
					</div>

					<!-- Surveyor canvas -->
					<div class="surveyor-grid relative h-[420px] w-full">
						<!-- North arrow -->
						<svg class="absolute left-4 top-4 text-ink" width="34" height="44" viewBox="0 0 34 44" fill="none">
							<path d="M 17 4 L 27 38 L 17 30 L 7 38 Z" stroke="currentColor" stroke-width="0.8" fill="none" />
							<path d="M 17 4 L 27 38 L 17 30 Z" fill="currentColor" />
							<text x="17" y="44" text-anchor="middle" font-family="JetBrains Mono" font-size="8" fill="currentColor" letter-spacing="0.18em">N</text>
						</svg>

						<!-- Scale bar -->
						<div class="absolute bottom-4 left-4 flex items-center gap-2">
							<div class="flex h-2 overflow-hidden border border-ink/70">
								<div class="w-8 bg-ink"></div>
								<div class="w-8 bg-paper"></div>
								<div class="w-8 bg-ink"></div>
							</div>
							<span class="font-mono text-[10px] tabular text-ink">0 · 5 m</span>
						</div>

						<!-- Cursor coord readout -->
						<div class="absolute bottom-4 right-4 font-mono text-[10px] tabular text-graphite">
							x 248.6 · y 191.3
						</div>

						<!-- Benchmark glyph -->
						<div class="absolute left-[22%] top-[34%] flex flex-col items-center text-ink">
							<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
								<path d="M 2 6 L 11 20 L 20 6 Z" stroke="currentColor" stroke-width="1.1" fill="var(--color-vellum)" />
								<circle cx="11" cy="10" r="1.4" fill="currentColor" />
							</svg>
							<span class="mt-1 rounded-sm bg-vellum/80 px-1 font-mono text-[10px] tabular text-ink">BM · 12.000</span>
						</div>

						<!-- Measured points -->
						{#each [
							{ x: '46%', y: '28%', label: 'A1', rl: '11.842' },
							{ x: '62%', y: '52%', label: 'A2', rl: '11.617' },
							{ x: '38%', y: '64%', label: 'A3', rl: '11.503' },
							{ x: '74%', y: '74%', label: 'A4', rl: '11.565' },
							{ x: '54%', y: '38%', label: 'A5', rl: '11.728' }
						] as pt (pt.label)}
							<div class="absolute flex items-center gap-1.5" style:left={pt.x} style:top={pt.y}>
								<span class="block h-2.5 w-2.5 rounded-full border border-ink bg-accent"></span>
								<span class="rounded-sm bg-vellum/80 px-1 font-mono text-[10px] tabular text-ink">
									{pt.label} · {pt.rl}
								</span>
							</div>
						{/each}

						<!-- Faint grade line between two points -->
						<svg class="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
							<line x1="46%" y1="28%" x2="74%" y2="74%" stroke="var(--color-accent)" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.6" />
						</svg>
					</div>

					<!-- Footer strip -->
					<div class="flex items-center justify-between border-t border-ink/10 px-4 py-2">
						<span class="eyebrow">Plan · Kingsford Lot 14</span>
						<span class="font-mono text-[10px] tabular text-graphite">5 pts · 1 BM</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Feature plates -->
	<section id="field-book" class="relative">
		<div class="mx-auto max-w-[1600px] px-6 pb-24 md:px-10">
			<div class="mb-10 flex items-end justify-between">
				<div>
					<span class="eyebrow">Section · field book</span>
					<h2 class="mt-3 font-display text-[2.6rem] leading-tight text-ink md:text-[3.4rem]">
						Built for the third <span class="italic text-graphite">decimal place.</span>
					</h2>
				</div>
				<span class="hidden font-mono text-[11px] uppercase tracking-[0.22em] text-graphite md:block">
					03 plates
				</span>
			</div>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
				{#each features as f, i (i)}
					<article class="relative rounded-2xl border border-ink/10 bg-vellum p-6 hover:border-ink/40">
						<RegistrationCorners inset={10} />
						<span class="eyebrow">{f.eyebrow}</span>
						<h3 class="mt-3 font-display text-[1.6rem] leading-tight text-ink">
							{f.title}
						</h3>
						<p class="mt-3 font-body text-[14px] leading-relaxed text-ink-2">
							{f.body}
						</p>
						<div class="mt-6 hairline"></div>
						<div class="mt-3 flex items-center justify-between">
							<span class="font-mono text-[10px] uppercase tracking-[0.2em] text-graphite">
								Ref · §{i + 5}
							</span>
							<span aria-hidden="true" class="font-mono text-[12px] text-ink">→</span>
						</div>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<!-- Instrument / numbers strip -->
	<section id="instrument" class="relative border-y border-ink/10 bg-vellum/60">
		<div class="mx-auto grid max-w-[1600px] grid-cols-1 gap-10 px-6 py-20 md:px-10 lg:grid-cols-12">
			<div class="lg:col-span-5">
				<span class="eyebrow">Section · instrument</span>
				<h2 class="mt-3 font-display text-[2.4rem] leading-tight text-ink md:text-[3.2rem]">
					HI = BM + backsight.
					<span class="block italic text-graphite">RL = HI − staff.</span>
				</h2>
				<p class="mt-5 max-w-md font-body text-[15px] leading-relaxed text-ink-2">
					LevelLog snapshots the instrument height the moment a session starts,
					stamps every reading taken under it, and hands you a ledger you can
					reconcile back to the staff. Re-level whenever you need — history
					stays still.
				</p>
			</div>

			<div id="ledger" class="lg:col-span-7">
				<div class="relative rounded-2xl border border-ink/10 bg-paper">
					<RegistrationCorners inset={10} />
					<div class="flex items-center justify-between border-b border-ink/10 px-5 py-3">
						<span class="eyebrow">Ledger · session 03</span>
						<div class="flex items-center gap-2">
							<span class="laser-dot h-2 w-2 rounded-full bg-signal"></span>
							<span class="font-mono text-[10px] uppercase tracking-[0.2em] text-signal-deep">Live</span>
						</div>
					</div>
					<dl class="divide-y divide-ink/10">
						{#each ledger as row, i (i)}
							<div class="flex items-baseline justify-between px-5 py-3">
								<dt class="font-mono text-[11px] uppercase tracking-[0.2em] text-graphite">
									{row.label}
								</dt>
								<dd class="font-mono text-[14px] tabular text-ink">
									{row.value}
									<span class="ml-1 text-graphite">{row.unit}</span>
								</dd>
							</div>
						{/each}
					</dl>
					<div class="flex items-center justify-between border-t border-ink/10 px-5 py-3">
						<span class="font-mono text-[10px] uppercase tracking-[0.2em] text-graphite">
							Δ vs. design
						</span>
						<span class="font-mono text-[14px] tabular text-accent-deep">−0.065 m</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Closing CTA -->
	<section class="relative">
		<div class="mx-auto max-w-[1600px] px-6 py-24 md:px-10">
			<div class="relative overflow-hidden rounded-2xl border border-ink/10 bg-vellum p-10 md:p-14">
				<RegistrationCorners inset={14} />
				<div class="grid grid-cols-1 items-end gap-10 lg:grid-cols-12">
					<div class="lg:col-span-8">
						<span class="eyebrow">Plate · 04</span>
						<h2 class="mt-3 font-display text-[2.6rem] leading-tight text-ink md:text-[3.6rem]">
							Stake a new project,
							<span class="italic text-graphite">to your field book.</span>
						</h2>
						<p class="mt-4 max-w-xl font-body text-[15px] leading-relaxed text-ink-2">
							Sign in with Google, drop a plan, set the scale.
							Your first session is two staff readings away.
						</p>
					</div>
					<div class="flex flex-col items-start gap-3 lg:col-span-4 lg:items-end">
						<a
							href={ctaHref}
							class="press inline-flex h-12 items-center gap-3 rounded-full bg-ink px-6 font-mono text-[12px] uppercase tracking-[0.2em] text-paper hover:bg-ink-2"
						>
							<span>{ctaLabel}</span>
							<span aria-hidden="true">→</span>
						</a>
						<span class="font-mono text-[10px] uppercase tracking-[0.2em] text-graphite">
							Google sign-in · v1
						</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-ink/10">
		<div class="mx-auto flex max-w-[1600px] flex-col items-start justify-between gap-4 px-6 py-8 md:flex-row md:items-center md:px-10">
			<div class="flex items-center gap-3 text-ink">
				<BenchmarkMark size={22} />
				<span class="font-display text-lg tracking-tight">
					Level<span class="italic">log</span>
				</span>
				<span class="ml-3 font-mono text-[10px] uppercase tracking-[0.22em] text-graphite">est. 2026</span>
			</div>
			<div class="flex items-center gap-6">
				<span class="font-mono text-[10px] uppercase tracking-[0.22em] text-graphite">
					Lat 51.5074°N · Lng 0.1278°W
				</span>
				<span class="hairline-v h-4 hidden md:block"></span>
				<span class="font-mono text-[10px] uppercase tracking-[0.22em] text-graphite">
					Datum · AHD
				</span>
			</div>
		</div>
	</footer>
</div>
