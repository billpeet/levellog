<script lang="ts">
	import { resolve } from '$app/paths';
	import Wordmark from '$lib/components/brand/wordmark.svelte';
	import SessionPill from './session-pill.svelte';
	import type { Pathname } from '$app/types';

	type Crumb = { label: string; href?: Pathname };
	type Session = { benchmark: string; instrumentHeight: number; startedAt: string } | null;

	let {
		crumbs = [] as Crumb[],
		session = null as Session,
		userInitials = 'MB',
		userName = 'Surveyor',
		onstartSession,
		onendSession
	}: {
		crumbs?: Crumb[];
		session?: Session;
		userInitials?: string;
		userName?: string;
		onstartSession?: () => void;
		onendSession?: () => void;
	} = $props();
</script>

<header class="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-md">
	<div class="ruler-ticks h-1.5 w-full"></div>
	<div class="flex items-center gap-4 px-5 py-3 lg:px-7">
		<Wordmark />

		{#if crumbs.length}
			<nav class="ml-2 hidden items-center gap-2 md:flex" aria-label="Breadcrumb">
				<span class="font-mono text-[11px] text-graphite/70">/</span>
				{#each crumbs as crumb, i (i)}
					{#if crumb.href}
						<a
							href={resolve(crumb.href)}
							class="press font-mono text-[12px] text-graphite hover:text-ink"
						>
							{crumb.label}
						</a>
					{:else}
						<span class="font-display text-[18px] italic text-ink">{crumb.label}</span>
					{/if}
					{#if i < crumbs.length - 1}
						<span class="font-mono text-[11px] text-graphite/50">/</span>
					{/if}
				{/each}
			</nav>
		{/if}

		<div class="ml-auto flex items-center gap-3">
			<div class="hidden md:block">
				<SessionPill {session} onstart={onstartSession} onend={onendSession} />
			</div>

			<button
				type="button"
				aria-label="User menu"
				title={userName}
				class="press inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink bg-ink text-paper font-mono text-[11px]"
			>
				{userInitials}
			</button>
		</div>
	</div>

	{#if session || onstartSession}
		<div class="md:hidden border-t border-rule px-5 py-2">
			<SessionPill {session} onstart={onstartSession} onend={onendSession} />
		</div>
	{/if}
</header>
