<script lang="ts">
	let {
		title,
		subtitle,
		children
	}: {
		title: string;
		subtitle: string;
		children: import('svelte').Snippet;
	} = $props();
</script>

<section class="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-12">
	<div class="space-y-3">
		<p class="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">LevelLog</p>
		<h1 class="text-4xl font-semibold tracking-tight text-slate-950">{title}</h1>
		<p class="max-w-2xl text-base text-slate-600">{subtitle}</p>
	</div>
	<div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
		{@render children()}
	</div>
</section>
