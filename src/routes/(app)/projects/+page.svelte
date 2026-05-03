<script lang="ts">
	import Shell from '$lib/components/ui/shell.svelte';
</script>

<Shell
	title="Projects"
	subtitle="This route group is reserved for the authenticated app surface. Dashboard functionality is intentionally deferred."
>
	<div class="grid gap-4 md:grid-cols-2">
		<div class="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">
			Project listing UI will land here in the next phase.
		</div>
		<div class="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">
			Create-project flow, uploads, and project bootstrapping are not implemented yet.
		</div>
	</div>
</Shell>
