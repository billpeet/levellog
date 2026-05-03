<script lang="ts">
	type Session = {
		benchmark: string;
		instrumentHeight: number;
		startedAt: string;
	} | null;

	let {
		session = null as Session,
		onstart,
		onend
	}: {
		session?: Session;
		onstart?: () => void;
		onend?: () => void;
	} = $props();
</script>

{#if session}
	<div
		class="group inline-flex items-stretch overflow-hidden rounded-full border border-signal/40 bg-signal/5 text-ink"
	>
		<span class="flex items-center gap-2 pl-3 pr-2 py-1.5">
			<span class="laser-dot inline-block h-1.5 w-1.5 rounded-full bg-signal"></span>
			<span class="eyebrow !text-signal-deep">Session live</span>
		</span>
		<span class="hairline-v"></span>
		<span class="flex items-center gap-3 px-3 py-1.5">
			<span class="font-mono text-[11px] uppercase text-graphite">HI</span>
			<span class="font-mono text-sm font-medium tabular text-ink"
				>{session.instrumentHeight.toFixed(3)}</span
			>
			<span class="font-mono text-[11px] text-graphite">m · {session.benchmark}</span>
		</span>
		{#if onend}
			<button
				type="button"
				onclick={onend}
				class="press border-l border-signal/30 bg-signal/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-signal-deep hover:bg-signal/20"
			>
				End
			</button>
		{/if}
	</div>
{:else}
	<button
		type="button"
		onclick={onstart}
		disabled={!onstart}
		class="press inline-flex items-center gap-2 rounded-full border border-rule bg-vellum px-3 py-1.5 hover:border-ink/40 disabled:opacity-50 disabled:hover:border-rule disabled:cursor-not-allowed"
	>
		<span class="inline-block h-1.5 w-1.5 rounded-full bg-graphite/50"></span>
		<span class="eyebrow">No active session</span>
		{#if onstart}
			<span class="font-mono text-[11px] text-ink">Start →</span>
		{/if}
	</button>
{/if}
