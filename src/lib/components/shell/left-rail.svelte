<script lang="ts">
	type Tool = { id: string; label: string; shortcut: string; icon: 'point' | 'bench' | 'rule' | 'measure' | 'heat' | 'grid' };

	const tools: Tool[] = [
		{ id: 'point', label: 'Add point', shortcut: 'P', icon: 'point' },
		{ id: 'bench', label: 'Add benchmark', shortcut: 'B', icon: 'bench' },
		{ id: 'measure', label: 'Measure grade', shortcut: 'M', icon: 'measure' },
		{ id: 'rule', label: 'Set scale', shortcut: 'S', icon: 'rule' },
		{ id: 'heat', label: 'Heatmap', shortcut: 'H', icon: 'heat' },
		{ id: 'grid', label: 'Toggle grid', shortcut: 'G', icon: 'grid' }
	];

	let active = $state('point');
</script>

<aside
	class="hidden lg:flex w-[64px] shrink-0 flex-col items-center justify-between border-r border-rule bg-paper/60 py-4"
>
	<div class="flex flex-col items-center gap-1">
		<span class="eyebrow rotate-180 [writing-mode:vertical-rl] mb-3 !text-[10px]">TOOLS</span>
		{#each tools as tool (tool.id)}
			<button
				type="button"
				title="{tool.label} · {tool.shortcut}"
				onclick={() => (active = tool.id)}
				class="press group relative flex h-11 w-11 items-center justify-center rounded-md border
					{active === tool.id
						? 'border-ink bg-ink text-paper'
						: 'border-transparent text-graphite hover:border-rule hover:bg-vellum hover:text-ink'}"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					{#if tool.icon === 'point'}
						<circle cx="12" cy="10" r="3.5" />
						<path d="M 12 13.5 L 12 21 M 6 21 L 18 21" />
					{:else if tool.icon === 'bench'}
						<path d="M 4 8 L 12 18 L 20 8 Z" />
						<path d="M 2 8 L 22 8" />
					{:else if tool.icon === 'measure'}
						<path d="M 4 18 L 20 6" />
						<circle cx="4" cy="18" r="2" fill="currentColor" />
						<circle cx="20" cy="6" r="2" fill="currentColor" />
					{:else if tool.icon === 'rule'}
						<path d="M 3 14 L 14 3 L 21 10 L 10 21 Z" />
						<path d="M 6 13 L 8 11 M 10 17 L 12 15 M 14 21 L 16 19" />
					{:else if tool.icon === 'heat'}
						<circle cx="12" cy="12" r="3" />
						<circle cx="12" cy="12" r="6" opacity="0.6" />
						<circle cx="12" cy="12" r="9" opacity="0.3" />
					{:else if tool.icon === 'grid'}
						<path d="M 4 4 H 20 V 20 H 4 Z" />
						<path d="M 12 4 V 20 M 4 12 H 20" />
					{/if}
				</svg>
				<span
					class="pointer-events-none absolute left-[58px] z-40 hidden whitespace-nowrap rounded border border-rule bg-vellum px-2 py-1 font-mono text-[11px] text-ink shadow-sm group-hover:block"
				>
					{tool.label}
					<span class="ml-2 text-graphite">{tool.shortcut}</span>
				</span>
			</button>
		{/each}
	</div>

	<div class="flex flex-col items-center gap-2">
		<div class="hairline w-6"></div>
		<button
			type="button"
			class="press flex h-9 w-9 items-center justify-center rounded-md text-graphite hover:bg-vellum hover:text-ink"
			title="Settings"
			aria-label="Project settings"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<circle cx="12" cy="12" r="3" />
				<path d="M 12 2 L 12 5 M 12 19 L 12 22 M 4.2 4.2 L 6.3 6.3 M 17.7 17.7 L 19.8 19.8 M 2 12 L 5 12 M 19 12 L 22 12 M 4.2 19.8 L 6.3 17.7 M 17.7 6.3 L 19.8 4.2" stroke-linecap="round" />
			</svg>
		</button>
	</div>
</aside>
