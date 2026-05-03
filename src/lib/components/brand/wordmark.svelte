<script lang="ts">
	import { resolve } from '$app/paths';
	import BenchmarkMark from './benchmark-mark.svelte';

	let { compact = false }: { compact?: boolean } = $props();
</script>

<a href={resolve('/projects')} class="group inline-flex items-center gap-2.5 text-ink press">
	<span class="text-ink"><BenchmarkMark size={compact ? 22 : 26} accent /></span>
	<span class="flex flex-col leading-none">
		<span class="font-display text-[1.35rem] tracking-tight text-ink">
			Level<span class="italic">log</span>
		</span>
		{#if !compact}
			<span class="eyebrow mt-1">Field Survey · v0.1</span>
		{/if}
	</span>
</a>
