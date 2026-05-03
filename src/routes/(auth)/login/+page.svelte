<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { page } from '$app/state';
	import RegistrationCorners from '$lib/components/shell/registration-corners.svelte';

	let isSigningIn = $state(false);
	let errorMessage = $state('');

	const callbackURL = $derived(page.url.searchParams.get('next') || '/projects');

	async function signInWithGoogle() {
		if (isSigningIn) return;

		isSigningIn = true;
		errorMessage = '';

		const { error } = await authClient.signIn.social({
			provider: 'google',
			callbackURL
		});

		if (error) {
			errorMessage = error.message || 'Unable to start Google sign-in.';
			isSigningIn = false;
		}
	}
</script>

<div class="rise relative w-full max-w-sm">
	<div class="relative rounded-2xl border border-ink/10 bg-vellum p-8 shadow-[0_24px_60px_-30px_rgba(15,16,14,0.35)]">
		<RegistrationCorners inset={10} />

		<p class="eyebrow">Authentication</p>
		<h2 class="mt-3 font-display text-[2.4rem] leading-tight text-ink">
			Sign in
			<span class="italic text-graphite">to your field book.</span>
		</h2>
		<p class="mt-3 font-body text-sm text-ink-2">
			Use your Google account to pick up wherever you left off in the field.
		</p>

		<button
			type="button"
			class="press mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full border border-ink bg-ink px-5 py-3 text-paper hover:bg-ink-2 disabled:cursor-wait disabled:opacity-70"
			disabled={isSigningIn}
			onclick={signInWithGoogle}
		>
			<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<path fill="#fff" d="M17.6 9.2c0-.6-.05-1.18-.15-1.74H9v3.3h4.84a4.13 4.13 0 0 1-1.79 2.71v2.25h2.9c1.7-1.57 2.65-3.88 2.65-6.52z"/>
				<path fill="#fff" opacity=".55" d="M9 18c2.43 0 4.46-.81 5.95-2.18l-2.9-2.25c-.8.54-1.83.86-3.05.86-2.35 0-4.34-1.58-5.05-3.7H.96v2.32A9 9 0 0 0 9 18z"/>
				<path fill="#fff" opacity=".25" d="M3.95 10.73a5.4 5.4 0 0 1 0-3.46V4.95H.96a9 9 0 0 0 0 8.1l2.99-2.32z"/>
				<path fill="#fff" opacity=".7" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l2.99 2.32C4.66 5.16 6.65 3.58 9 3.58z"/>
			</svg>
			<span class="font-mono text-[12px] uppercase tracking-wider">
				{isSigningIn ? 'Redirecting…' : 'Continue with Google'}
			</span>
		</button>

		{#if errorMessage}
			<p class="mt-3 rounded-xl border border-red-900/20 bg-red-50 px-3 py-2 font-mono text-[11px] text-red-900">
				{errorMessage}
			</p>
		{/if}

		<div class="mt-7 flex items-center gap-3">
			<span class="hairline flex-1"></span>
			<span class="font-mono text-[10px] uppercase tracking-wider text-graphite">est. 2026</span>
			<span class="hairline flex-1"></span>
		</div>
	</div>
</div>
