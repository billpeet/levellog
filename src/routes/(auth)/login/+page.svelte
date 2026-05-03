<script lang="ts">
	import Shell from '$lib/components/ui/shell.svelte';
</script>

<Shell
	title="Sign in"
	subtitle="Auth wiring is scaffolded for Better Auth with the Google provider. This page is intentionally minimal until the real flow is implemented."
>
	<div class="flex flex-col gap-4">
		<button
			type="button"
			class="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white md:w-auto"
		>
			Continue with Google
		</button>
		<p class="text-sm text-slate-600">
			Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, and
			`BETTER_AUTH_URL` to make this functional.
		</p>
	</div>
</Shell>
