<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const projects = $derived(data.projects);
	const userFirstName = $derived(data.user.name.split(/\s+/)[0]);

	const dateLabel = new Date().toLocaleDateString('en-GB', {
		day: '2-digit',
		month: 'short',
		year: 'numeric'
	});

	function relativeTime(value: Date | string): string {
		const date = value instanceof Date ? value : new Date(value);
		const diff = Date.now() - date.getTime();
		const minute = 60_000;
		const hour = 60 * minute;
		const day = 24 * hour;
		if (diff < minute) return 'just now';
		if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
		if (diff < day) return `${Math.floor(diff / hour)} hr ago`;
		if (diff < 2 * day) return 'yesterday';
		if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
		return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
	}

	const activeProject = $derived(projects.find((project) => project.hasActiveSession));
	const openCount = $derived(projects.length);
	const greetingTail = $derived(
		openCount === 0
			? 'Stake your first project to begin.'
			: openCount === 1
				? 'One site is open.'
				: `${openCount} sites are open.`
	);
</script>

<div class="rise mx-auto w-full max-w-[1600px] px-6 py-10 lg:px-10">
	<!-- Hero band -->
	<div class="relative overflow-hidden rounded-2xl border border-ink/10 bg-vellum">
		<div class="topo-plate absolute inset-0 opacity-90"></div>
		<div class="absolute inset-0 bg-gradient-to-r from-vellum via-vellum/85 to-transparent"></div>
		<div class="relative grid gap-6 p-8 md:grid-cols-[1.4fr_1fr] md:p-10">
			<div>
				<p class="eyebrow">Field log · {dateLabel}</p>
				<h1 class="mt-3 font-display text-[3.25rem] leading-[0.95] tracking-tight text-ink">
					Good morning, {userFirstName}.
					<span class="block italic text-graphite">{greetingTail}</span>
				</h1>
				<p class="mt-4 max-w-md font-body text-[15px] leading-relaxed text-ink-2">
					{#if activeProject}
						The laser at <span class="font-display italic">{activeProject.name}</span> is still
						live — readings taken there will be derived from the active session.
					{:else if openCount === 0}
						Bring in a site plan, drop a benchmark, and start logging readings to the
						millimetre.
					{:else}
						Pick up where you left off, or stake out a new project.
					{/if}
				</p>
				<div class="mt-6 flex flex-wrap items-center gap-3">
					<a
						href={resolve('/projects/new')}
						class="press inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-mono text-[12px] uppercase tracking-wider text-paper hover:bg-ink-2"
					>
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M 6 1 V 11 M 1 6 H 11" stroke-linecap="round"/></svg>
						New project
					</a>
					{#if activeProject}
						<a
							href={resolve(`/projects/${activeProject.id}`)}
							class="press inline-flex items-center gap-2 rounded-full border border-ink/30 bg-paper/70 px-5 py-2.5 font-mono text-[12px] uppercase tracking-wider text-ink hover:border-ink"
						>
							Resume {activeProject.name.split('·')[0].trim()} →
						</a>
					{/if}
				</div>
			</div>

			<div class="hidden flex-col items-end justify-end gap-3 md:flex">
				<div class="flex items-baseline gap-3">
					<span class="font-display text-[5rem] leading-none tabular text-ink">{data.readingsThisWeek}</span>
					<div class="flex flex-col text-right">
						<span class="eyebrow !text-[10px]">readings</span>
						<span class="font-mono text-[11px] text-graphite">on file</span>
					</div>
				</div>
				<div class="hairline w-40"></div>
				<div class="flex items-baseline gap-3">
					<span class="font-display italic text-3xl tabular text-accent-deep">
						{openCount.toString().padStart(2, '0')}
					</span>
					<span class="font-mono text-[11px] text-graphite">project{openCount === 1 ? '' : 's'} open</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Projects header -->
	<div class="mt-12 flex items-end justify-between">
		<div>
			<p class="eyebrow">Index 01</p>
			<h2 class="mt-1 font-display text-[2rem] leading-tight text-ink">Projects</h2>
		</div>
	</div>

	<!-- Cards -->
	<ul class="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
		{#each projects as project (project.id)}
			<li>
				<a
					href={resolve(`/projects/${project.id}`)}
					class="press group relative flex h-full flex-col overflow-hidden rounded-xl border border-ink/10 bg-vellum hover:border-ink/40 hover:shadow-[0_8px_24px_-12px_rgba(15,16,14,0.25)]"
				>
					<!-- Plan thumb -->
					<div class="surveyor-grid relative h-36 border-b border-ink/10">
						{#if project.planId}
							<img
								src={`/api/uploads/plans/${project.planId}`}
								alt=""
								class="absolute inset-0 h-full w-full object-cover opacity-90"
								loading="lazy"
							/>
							<div class="absolute inset-0 bg-paper/10"></div>
						{:else}
							<div class="absolute inset-0 bg-vellum/25"></div>
							<div class="absolute inset-x-5 bottom-5 flex items-center gap-2">
								<div class="flex h-1.5 overflow-hidden border border-ink/50">
									<div class="w-6 bg-ink"></div>
									<div class="w-6 bg-paper"></div>
									<div class="w-6 bg-ink"></div>
								</div>
								<span class="font-mono text-[10px] uppercase tracking-wider text-graphite">blank canvas</span>
							</div>
						{/if}
						{#if project.hasActiveSession}
							<span class="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-signal/40 bg-paper/85 px-2 py-0.5">
								<span class="laser-dot inline-block h-1.5 w-1.5 rounded-full bg-signal"></span>
								<span class="eyebrow !text-signal-deep !text-[10px]">live</span>
							</span>
						{/if}
					</div>

					<div class="flex flex-1 flex-col p-5">
						<div class="flex items-start justify-between gap-3">
							<h3 class="font-display text-[1.4rem] leading-tight text-ink group-hover:italic">{project.name}</h3>
							<svg class="mt-1 shrink-0 text-graphite group-hover:text-ink press" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M 5 3 L 13 3 L 13 11 M 13 3 L 3 13" stroke-linecap="round"/>
							</svg>
						</div>
						<p class="eyebrow mt-2">{relativeTime(project.updatedAt)}</p>

						<div class="mt-auto flex items-end justify-between pt-5">
							<div class="flex flex-col">
								<span class="font-mono text-[10px] uppercase text-graphite">points</span>
								<span class="font-mono text-base tabular text-ink">{project.pointCount}</span>
							</div>
							<div class="hairline-v h-8"></div>
							<div class="flex flex-col">
								<span class="font-mono text-[10px] uppercase text-graphite">readings</span>
								<span class="font-mono text-base tabular text-ink">{project.readingCount}</span>
							</div>
							<div class="hairline-v h-8"></div>
							<div class="flex flex-col text-right">
								<span class="font-mono text-[10px] uppercase text-graphite">primary</span>
								<span class="font-mono text-base tabular text-accent-deep">{project.primaryLevelTypeCode ?? 'None'}</span>
							</div>
						</div>
					</div>
				</a>
			</li>
		{/each}

		<!-- New project tile -->
		<li>
			<a
				href={resolve('/projects/new')}
				class="press group flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-ink/30 bg-paper/40 text-center hover:border-ink hover:bg-vellum"
			>
				<svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.2" class="text-graphite group-hover:text-ink">
					<circle cx="18" cy="18" r="16"/>
					<path d="M 18 11 V 25 M 11 18 H 25" stroke-linecap="round"/>
				</svg>
				<span class="font-display text-xl italic text-ink">Stake a new project</span>
				<span class="eyebrow">Upload, paste, PDF, or blank canvas</span>
			</a>
		</li>
	</ul>
</div>
