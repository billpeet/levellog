<script lang="ts">
	import { goto } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { resolve } from '$app/paths';
	import PdfPagePicker from '$lib/components/canvas/pdf-page-picker.svelte';
	import RegistrationCorners from '$lib/components/shell/registration-corners.svelte';

	let projectName = $state('');
	let intake = $state<'blank' | 'upload' | 'paste' | 'pdf'>('blank');
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);

	let pickedFile = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	let pdfFile = $state<File | null>(null);
	let dragOver = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let pdfInput: HTMLInputElement | undefined = $state();

	function pickFile(file: File | null) {
		if (!file) {
			pickedFile = null;
			if (previewUrl) URL.revokeObjectURL(previewUrl);
			previewUrl = null;
			return;
		}
		const type = file.type.toLowerCase();
		if (type === 'application/pdf') {
			pdfFile = file;
			intake = 'pdf';
			pickedFile = null;
			if (previewUrl) URL.revokeObjectURL(previewUrl);
			previewUrl = null;
			errorMsg = null;
			return;
		}
		if (!['image/png', 'image/jpeg', 'image/jpg'].includes(type)) {
			errorMsg = 'Plan image must be PNG, JPG, or PDF.';
			return;
		}
		pickedFile = file;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = URL.createObjectURL(file);
		errorMsg = null;
		intake = 'upload';
	}

	function onPdfPagePicked(image: File) {
		pdfFile = null;
		pickedFile = image;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = URL.createObjectURL(image);
		intake = 'upload';
		errorMsg = null;
	}

	function onPaste(e: ClipboardEvent) {
		if (intake !== 'paste') return;
		const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
		if (item) {
			const f = item.getAsFile();
			if (f) pickFile(f);
		}
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!projectName.trim() || submitting) return;
		submitting = true;
		errorMsg = null;
		try {
			const fd = new FormData();
			fd.set('name', projectName.trim());
			const res = await fetch('?/create', {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text()) as
				| { type: 'success'; data?: { id?: string; error?: string } }
				| { type: 'failure'; data?: { error?: string } }
				| { type: 'redirect'; location: string }
				| { type: 'error'; error: { message?: string } };

			if (result.type === 'failure') {
				errorMsg = result.data?.error ?? 'Could not create project.';
				submitting = false;
				return;
			}
			if (result.type === 'error') {
				errorMsg = result.error?.message ?? 'Could not create project.';
				submitting = false;
				return;
			}
			const projectId =
				result.type === 'success'
					? result.data?.id
					: result.type === 'redirect'
						? result.location.split('/').pop()
						: null;
			if (!projectId) {
				errorMsg = 'Could not determine new project id.';
				submitting = false;
				return;
			}

			if (pickedFile) {
				const planFd = new FormData();
				planFd.set('file', pickedFile);
				const up = await fetch(`/api/projects/${projectId}/plan`, {
					method: 'POST',
					body: planFd
				});
				if (!up.ok) {
					const txt = await up.text().catch(() => '');
					errorMsg = `Plan upload failed: ${txt || up.status}`;
					// project still created — offer to continue anyway
					await goto(resolve(`/projects/${projectId}`));
					return;
				}
			}

			await goto(resolve(`/projects/${projectId}`));
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Something went wrong.';
			submitting = false;
		}
	}
</script>

<svelte:window onpaste={onPaste} />

<div class="rise mx-auto w-full max-w-3xl px-6 py-12">
	<a href={resolve('/projects')} class="press eyebrow inline-flex items-center gap-1 hover:text-ink">
		<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M 8 2 L 4 6 L 8 10"/></svg>
		Back to projects
	</a>

	<h1 class="mt-5 font-display text-[2.75rem] leading-[0.95] tracking-tight text-ink">
		Stake a new project.
	</h1>
	<p class="mt-3 max-w-lg font-body text-[15px] text-ink-2">
		Name the site, and optionally bring in a plan. You can always add or replace the plan later.
	</p>

	<form
		onsubmit={handleSubmit}
		class="relative mt-10 overflow-hidden rounded-xl border border-ink/10 bg-vellum p-7"
	>
		<RegistrationCorners inset={10} />

		<label class="block">
			<span class="eyebrow">01 · Project name</span>
			<input
				name="name"
				type="text"
				bind:value={projectName}
				placeholder="e.g. Kingsford Park · Pad 4"
				autocomplete="off"
				maxlength="120"
				required
				class="mt-2 w-full border-b-2 border-ink/30 bg-transparent pb-2 font-display text-2xl text-ink placeholder:text-graphite/50 focus:border-accent focus:outline-none"
			/>
		</label>

		<div class="mt-9">
			<span class="eyebrow">02 · Plan intake</span>
			<div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<button
					type="button"
					onclick={() => { intake = 'upload'; fileInput?.click(); }}
					class="press flex flex-col items-start gap-1 rounded-lg border p-4 text-left
						{intake === 'upload' ? 'border-ink bg-paper' : 'border-rule bg-paper/40 hover:border-ink/40 hover:bg-paper'}"
				>
					<span class="font-mono text-[12px] uppercase tracking-wider text-ink">Upload image</span>
					<span class="font-mono text-[11px] text-graphite">PNG · JPG · drag & drop</span>
				</button>
				<button
					type="button"
					onclick={() => { intake = 'paste'; }}
					class="press flex flex-col items-start gap-1 rounded-lg border p-4 text-left
						{intake === 'paste' ? 'border-ink bg-paper' : 'border-rule bg-paper/40 hover:border-ink/40 hover:bg-paper'}"
				>
					<span class="font-mono text-[12px] uppercase tracking-wider text-ink">Paste</span>
					<span class="font-mono text-[11px] text-graphite">⌘/Ctrl-V from clipboard</span>
				</button>
				<button
					type="button"
					onclick={() => { intake = 'pdf'; pdfInput?.click(); }}
					class="press flex flex-col items-start gap-1 rounded-lg border p-4 text-left
						{intake === 'pdf' ? 'border-ink bg-paper' : 'border-rule bg-paper/40 hover:border-ink/40 hover:bg-paper'}"
				>
					<span class="font-mono text-[12px] uppercase tracking-wider text-ink">PDF page</span>
					<span class="font-mono text-[11px] text-graphite">Pick a page from a PDF</span>
				</button>
				<button
					type="button"
					onclick={() => { intake = 'blank'; pickFile(null); pdfFile = null; }}
					class="press flex flex-col items-start gap-1 rounded-lg border p-4 text-left
						{intake === 'blank' ? 'border-ink bg-paper' : 'border-rule bg-paper/40 hover:border-ink/40 hover:bg-paper'}"
				>
					<span class="font-mono text-[12px] uppercase tracking-wider text-ink">Blank canvas</span>
					<span class="font-mono text-[11px] text-graphite">No plan — drop points free-form</span>
				</button>
			</div>

			<input
				bind:this={fileInput}
				type="file"
				accept="image/png,image/jpeg,application/pdf"
				class="hidden"
				onchange={(e) => pickFile((e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
			/>
			<input
				bind:this={pdfInput}
				type="file"
				accept="application/pdf"
				class="hidden"
				onchange={(e) => {
					const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
					if (f) pickFile(f);
				}}
			/>

			{#if intake === 'pdf' && pdfFile}
				<div class="mt-4">
					<PdfPagePicker
						file={pdfFile}
						onpicked={onPdfPagePicked}
						oncancel={() => { pdfFile = null; intake = 'blank'; }}
					/>
				</div>
			{/if}

			{#if intake === 'upload' || intake === 'paste' || (intake === 'pdf' && !pdfFile)}
				<div
					ondragover={(e) => { e.preventDefault(); dragOver = true; }}
					ondragleave={() => (dragOver = false)}
					ondrop={(e) => {
						e.preventDefault();
						dragOver = false;
						pickFile(e.dataTransfer?.files?.[0] ?? null);
					}}
					role="presentation"
					class="mt-4 flex min-h-[160px] items-center justify-center rounded-lg border-2 border-dashed p-4 text-center
						{dragOver ? 'border-accent bg-paper' : 'border-rule bg-paper/40'}"
				>
					{#if previewUrl}
						<div class="flex w-full items-center gap-4">
							<img src={previewUrl} alt="Plan preview" class="max-h-32 rounded border border-rule bg-vellum" />
							<div class="flex flex-1 flex-col items-start gap-1">
								<span class="font-mono text-[12px] text-ink">{pickedFile?.name}</span>
								<span class="font-mono text-[11px] text-graphite">
									{pickedFile ? Math.round(pickedFile.size / 1024) : 0} KB · {pickedFile?.type}
								</span>
								<button
									type="button"
									onclick={() => pickFile(null)}
									class="press mt-1 font-mono text-[10px] uppercase tracking-wider text-graphite hover:text-accent-deep"
								>Remove</button>
							</div>
						</div>
					{:else if intake === 'paste'}
						<span class="font-mono text-[12px] text-graphite">Paste an image (⌘V / Ctrl+V) anywhere on this page.</span>
					{:else if intake === 'pdf'}
						<span class="font-mono text-[12px] text-graphite">Drop a PDF here, or click "PDF page".</span>
					{:else}
						<span class="font-mono text-[12px] text-graphite">Drop a PNG, JPG, or PDF here, or click "Upload image".</span>
					{/if}
				</div>
			{/if}
		</div>

		<div class="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-6">
			<span class="font-mono text-[11px] text-graphite">
				Default level types: <span class="text-ink">CL · EGL · FL · SL · DPC · FFL</span>.
			</span>
			<button
				type="submit"
				disabled={!projectName.trim() || submitting}
				class="press inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-mono text-[12px] uppercase tracking-wider text-paper disabled:cursor-not-allowed disabled:opacity-40 hover:bg-ink-2"
			>
				{submitting ? 'Creating…' : 'Create project →'}
			</button>
		</div>

		{#if errorMsg}
			<p class="mt-4 rounded-md border border-accent-deep/30 bg-paper/70 px-3 py-2 font-mono text-[11px] text-accent-deep">
				{errorMsg}
			</p>
		{/if}
	</form>
</div>
