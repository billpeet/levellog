<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went sideways.');

	const headline = $derived.by(() => {
		if (status === 404) return 'Off the map.';
		if (status === 401) return 'Sign in first.';
		if (status === 403) return 'Not yours to see.';
		if (status >= 500) return 'The instrument slipped.';
		return 'Something went sideways.';
	});

	const subline = $derived.by(() => {
		if (status === 404) return 'The page or project you asked for isn’t in this field book.';
		if (status === 401) return 'Your session has expired or you haven’t signed in yet.';
		if (status === 403) return 'You don’t have access to this resource.';
		if (status >= 500) return 'A server error stopped the recording. Try again, or head back to your projects.';
		return message;
	});
</script>

<svelte:head>
	<title>{status} · LevelLog</title>
</svelte:head>

<div class="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
	<div class="surveyor-grid absolute inset-0 -z-10 opacity-40"></div>

	<div
		class="w-full max-w-lg rounded-2xl border border-ink/10 bg-vellum px-7 py-10 shadow-[0_24px_60px_-30px_rgba(15,16,14,0.35)]"
	>
		<div class="flex items-center gap-3">
			<span class="font-mono text-[42px] font-medium tabular leading-none text-accent-deep">
				{status}
			</span>
			<div class="hairline-v h-10"></div>
			<p class="eyebrow">Field log · error</p>
		</div>

		<h1 class="mt-6 font-display text-[2.5rem] leading-none tracking-tight text-ink">
			{headline}
		</h1>
		<p class="mt-3 font-body text-[15px] leading-relaxed text-ink-2">{subline}</p>

		{#if status < 500 && status !== 404 && message && message !== headline}
			<p class="mt-4 rounded border border-rule bg-paper/70 px-3 py-2 font-mono text-[12px] text-graphite">
				{message}
			</p>
		{/if}

		<div class="mt-7 flex flex-wrap items-center gap-3">
			<a
				href={resolve('/projects')}
				class="press inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 font-mono text-[12px] uppercase tracking-wider text-paper hover:bg-ink-2"
			>
				← Back to projects
			</a>
			{#if status === 401}
				<a
					href={resolve('/login')}
					class="press inline-flex items-center gap-2 rounded-full border border-ink/30 bg-paper px-4 py-2 font-mono text-[12px] uppercase tracking-wider text-ink hover:border-ink"
				>
					Sign in →
				</a>
			{/if}
		</div>
	</div>

	<p class="mt-8 font-mono text-[11px] text-graphite">
		LevelLog · field instrument
	</p>
</div>
