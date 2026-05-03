<script lang="ts">
	import Shell from '$lib/components/ui/shell.svelte';
	import StatusCard from '$lib/components/ui/status-card.svelte';
</script>

<Shell
	title="Foundations scaffold"
	subtitle="The repo is wired for SvelteKit, Tailwind, Drizzle, Better Auth, SQLite, and Docker. Product-specific workflows can be layered onto this structure next."
>
	<div class="grid gap-4 md:grid-cols-3">
		<StatusCard
			label="Frontend"
			value="SvelteKit + Tailwind"
			hint="App shell, route groups, and global styling are in place."
		/>
		<StatusCard
			label="Backend"
			value="Drizzle + Better Auth"
			hint="SQLite schema scaffolding and Google-only auth config are ready for env setup."
		/>
		<StatusCard
			label="Ops"
			value="Docker + local data volume"
			hint="The app can run against a mounted SQLite database path."
		/>
	</div>
</Shell>
