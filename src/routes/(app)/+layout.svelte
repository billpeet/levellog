<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import TopBar from '$lib/components/shell/top-bar.svelte';
	import { endLevelSession } from '$lib/remotes/projects.remote.js';
	import { SvelteDate } from 'svelte/reactivity';
	import type { Pathname } from '$app/types';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const projectId = $derived<string | null>(page.params.id ?? null);
	const inProject = $derived(!!projectId && /^\/projects\/[^/]+/.test(page.url.pathname));

	type ProjectPageData = {
		project?: { name?: string };
		points?: Array<{ id: string; label: string; isBenchmark: boolean }>;
		sessions?: Array<{ id: string; benchmarkPointId: string; instrumentHeight: number; startedAt: Date | string; endedAt: Date | string | null }>;
	};
	type Crumb = { label: string; href?: Pathname };
	const pdata = $derived(page.data as unknown as ProjectPageData);

	const activeSessionRow = $derived(
		inProject ? pdata?.sessions?.find((s) => s.endedAt == null) ?? null : null
	);

	const activeSession = $derived.by(() => {
		if (!activeSessionRow) return null;
		const benchmark = pdata.points?.find((p) => p.id === activeSessionRow.benchmarkPointId);
		const startedAt =
			typeof activeSessionRow.startedAt === 'string'
				? new Date(activeSessionRow.startedAt)
				: activeSessionRow.startedAt;
		return {
			benchmark: benchmark?.label ?? 'BM',
			instrumentHeight: activeSessionRow.instrumentHeight,
			startedAt: formatStarted(startedAt)
		};
	});

	function formatStarted(d: Date) {
		const now = new SvelteDate();
		const isToday = d.toDateString() === now.toDateString();
		const yesterday = new SvelteDate(now);
		yesterday.setDate(now.getDate() - 1);
		const hh = d.getHours().toString().padStart(2, '0');
		const mm = d.getMinutes().toString().padStart(2, '0');
		if (isToday) return `today ${hh}:${mm}`;
		if (d.toDateString() === yesterday.toDateString()) return `yesterday ${hh}:${mm}`;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` ${hh}:${mm}`;
	}

	const crumbs = $derived.by((): Crumb[] =>
		inProject
			? [
					{ label: 'Projects', href: '/projects' },
					{ label: pdata?.project?.name ?? 'Project' }
				]
			: []
	);

	async function onstartSession() {
		if (!projectId) return;
		await goto(resolve(`/projects/${projectId}?session=start`), {
			keepFocus: true,
			noScroll: true
		});
	}

	async function onendSession() {
		if (!projectId || !activeSessionRow) return;
		try {
			await endLevelSession({ projectId, sessionId: activeSessionRow.id });
			await invalidateAll();
		} catch (e) {
			console.error(e);
		}
	}
</script>

<div class="flex min-h-screen flex-col">
	<TopBar
		userInitials={data.user.initials}
		userName={data.user.name}
		session={activeSession}
		{crumbs}
		onstartSession={inProject ? onstartSession : undefined}
		onendSession={inProject ? onendSession : undefined}
	/>
	<main class="flex min-h-0 flex-1 flex-col">
		{@render children()}
	</main>
	<footer class="hidden border-t border-rule/60 bg-paper/60 px-6 py-3 sm:block">
		<div class="mx-auto flex max-w-[1600px] items-center justify-between">
			<span class="eyebrow">© LevelLog · field instrument</span>
			<span class="font-mono text-[10px] text-graphite tabular">
				Local field book · project data only
			</span>
		</div>
	</footer>
</div>
