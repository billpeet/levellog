<script lang="ts">
	import '../app.css';

	let { children }: { children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
	<title>LevelLog</title>
	<meta
		name="description"
		content="LevelLog scaffolding for survey project capture, auth, and data workflows."
	/>
</svelte:head>

{@render children()}
