<script lang="ts">
	import '../app.css';

	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
	<title>LevelLog</title>
	<meta
		name="description"
		content="LevelLog scaffolding for survey project capture, auth, and data workflows."
	/>
</svelte:head>

{@render children()}
