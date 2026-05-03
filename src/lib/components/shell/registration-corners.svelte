<script lang="ts">
	let { inset = 12 }: { inset?: number } = $props();
</script>

<div class="pointer-events-none absolute inset-0">
	{#each [
		{ top: inset + 'px', left: inset + 'px' },
		{ top: inset + 'px', right: inset + 'px' },
		{ bottom: inset + 'px', left: inset + 'px' },
		{ bottom: inset + 'px', right: inset + 'px' }
	] as pos, i (i)}
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			class="absolute text-ink/35"
			style:top={pos.top}
			style:left={pos.left}
			style:right={pos.right}
			style:bottom={pos.bottom}
		>
			<path d="M 7 0 L 7 14 M 0 7 L 14 7" stroke="currentColor" stroke-width="0.7" />
			<circle cx="7" cy="7" r="2.5" stroke="currentColor" stroke-width="0.7" fill="none" />
		</svg>
	{/each}
</div>
