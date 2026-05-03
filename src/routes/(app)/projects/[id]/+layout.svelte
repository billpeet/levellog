<script lang="ts">
	let { children }: { children: import('svelte').Snippet } = $props();
</script>

<div class="flex flex-1 overflow-hidden">
	{@render children()}
</div>
