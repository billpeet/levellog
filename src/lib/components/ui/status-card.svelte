<script lang="ts">
	let { label, value, hint }: { label: string; value: string; hint: string } = $props();
</script>

<article class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
	<p class="text-sm font-medium text-slate-500">{label}</p>
	<p class="mt-3 text-lg font-semibold text-slate-900">{value}</p>
	<p class="mt-2 text-sm text-slate-600">{hint}</p>
</article>
