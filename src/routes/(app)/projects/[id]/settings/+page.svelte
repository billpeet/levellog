<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		createLevelType,
		deleteLevelType,
		deleteProject,
		updateLevelType,
		updateProject
	} from '$lib/remotes/projects.remote.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state(false);
	let err = $state<string | null>(null);
	let flash = $state<string | null>(null);

	function announce(msg: string) {
		flash = msg;
		setTimeout(() => {
			if (flash === msg) flash = null;
		}, 2400);
	}

	// ── Identity (rename + primary type) ─────────────────────────────────────
	// svelte-ignore state_referenced_locally — initial seed; $effect resyncs on reload
	let nameDraft = $state(data.project.name);
	// svelte-ignore state_referenced_locally — initial seed; $effect resyncs on reload
	let primaryDraft = $state<string>(data.project.primaryLevelTypeId ?? '');

	$effect(() => {
		// Reset drafts whenever the loaded project changes (e.g. after invalidateAll).
		nameDraft = data.project.name;
		primaryDraft = data.project.primaryLevelTypeId ?? '';
	});

	const identityDirty = $derived(
		nameDraft.trim() !== data.project.name ||
			(primaryDraft || null) !== (data.project.primaryLevelTypeId ?? null)
	);

	async function saveIdentity(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = nameDraft.trim();
		if (!trimmed) {
			err = 'Project needs a name.';
			return;
		}
		busy = true;
		err = null;
		try {
			await updateProject({
				projectId: data.projectId,
				name: trimmed,
				primaryLevelTypeId: primaryDraft || null
			});
			await invalidateAll();
			announce('Saved.');
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not save changes.';
		} finally {
			busy = false;
		}
	}

	// ── Level types ──────────────────────────────────────────────────────────
	type EditDraft = {
		id: string;
		code: string;
		name: string;
		colorHex: string;
	};
	let editing = $state<EditDraft | null>(null);

	function startEdit(lt: PageData['levelTypes'][number]) {
		editing = { id: lt.id, code: lt.code, name: lt.name, colorHex: lt.colorHex };
	}
	function cancelEdit() {
		editing = null;
	}

	async function saveEdit() {
		if (!editing) return;
		const code = editing.code.trim().toUpperCase();
		const name = editing.name.trim();
		if (!code || !name) {
			err = 'Code and name are required.';
			return;
		}
		busy = true;
		err = null;
		try {
			await updateLevelType({
				projectId: data.projectId,
				levelTypeId: editing.id,
				code,
				name,
				colorHex: editing.colorHex
			});
			editing = null;
			await invalidateAll();
			announce('Level type updated.');
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not update level type.';
		} finally {
			busy = false;
		}
	}

	async function removeLevelType(id: string, code: string, count: number) {
		if (count > 0) {
			err = `${code} is used by ${count} reading${count === 1 ? '' : 's'} — remove them first.`;
			return;
		}
		if (!confirm(`Delete level type ${code}? This cannot be undone.`)) return;
		busy = true;
		err = null;
		try {
			await deleteLevelType({ projectId: data.projectId, levelTypeId: id });
			await invalidateAll();
			announce(`${code} removed.`);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not delete level type.';
		} finally {
			busy = false;
		}
	}

	// New level type
	let creating = $state(false);
	let newDraft = $state<{
		code: string;
		name: string;
		kind: 'measured' | 'design';
		colorHex: string;
	}>({ code: '', name: '', kind: 'measured', colorHex: '#2e7d5b' });

	function startCreate() {
		creating = true;
		newDraft = { code: '', name: '', kind: 'measured', colorHex: '#2e7d5b' };
	}
	function cancelCreate() {
		creating = false;
	}

	async function saveCreate() {
		const code = newDraft.code.trim().toUpperCase();
		const name = newDraft.name.trim();
		if (!code || !name) {
			err = 'Code and name are required.';
			return;
		}
		busy = true;
		err = null;
		try {
			await createLevelType({
				projectId: data.projectId,
				code,
				name,
				kind: newDraft.kind,
				colorHex: newDraft.colorHex
			});
			creating = false;
			await invalidateAll();
			announce(`${code} added.`);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not create level type.';
		} finally {
			busy = false;
		}
	}

	// ── Delete project ───────────────────────────────────────────────────────
	let confirmDelete = $state(false);
	let deleteName = $state('');

	async function reallyDelete() {
		if (deleteName.trim() !== data.project.name) {
			err = 'Type the project name exactly to confirm.';
			return;
		}
		busy = true;
		err = null;
		try {
			await deleteProject({ projectId: data.projectId });
			await goto(resolve('/projects'));
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not delete project.';
			busy = false;
		}
	}
</script>

<div class="flex-1 overflow-y-auto px-5 py-8 sm:px-8 sm:py-10">
	<div class="mx-auto max-w-2xl">
		<div class="flex items-center justify-between gap-3">
			<div>
				<p class="eyebrow">Project · settings</p>
				<h1 class="mt-2 font-display text-3xl text-ink sm:text-4xl">Configure the site.</h1>
			</div>
			<a
				href={resolve(`/projects/${data.projectId}`)}
				class="press hidden shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-graphite hover:text-ink sm:inline-flex"
			>
				<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"
					><path d="M 8 2 L 4 6 L 8 10" /></svg
				>
				Back to canvas
			</a>
		</div>
		<p class="mt-3 font-body text-[15px] text-ink-2">
			Rename the project, manage custom level types, choose the primary inline reading, or retire the
			project from your dashboard.
		</p>

		<!-- Flash / error banners -->
		{#if err}
			<div
				role="alert"
				class="mt-6 flex items-start gap-3 rounded-lg border border-accent-deep/40 bg-accent/5 px-4 py-3"
			>
				<span
					class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-deep text-paper font-mono text-[10px]"
					>!</span
				>
				<p class="font-mono text-[12px] text-accent-deep">{err}</p>
				<button
					type="button"
					onclick={() => (err = null)}
					class="press ml-auto font-mono text-[11px] text-graphite hover:text-ink"
					>dismiss</button
				>
			</div>
		{/if}
		{#if flash}
			<div
				role="status"
				class="mt-6 flex items-center gap-3 rounded-lg border border-signal/40 bg-signal/5 px-4 py-3"
			>
				<span class="laser-dot inline-block h-2 w-2 rounded-full bg-signal"></span>
				<p class="font-mono text-[11px] uppercase tracking-wider text-signal-deep">{flash}</p>
			</div>
		{/if}

		<section class="mt-10 space-y-6">
			<!-- Identity -->
			<form
				onsubmit={saveIdentity}
				class="rounded-xl border border-ink/10 bg-vellum p-6"
			>
				<p class="eyebrow">01 · Identity</p>
				<h2 class="mt-1 font-display text-2xl text-ink">Name &amp; primary reading</h2>
				<p class="mt-2 font-body text-[14px] text-ink-2">
					The primary level type renders next to each point on the canvas — usually
					<span class="font-mono text-[12px] uppercase">CL</span>.
				</p>

				<label class="mt-5 block">
					<span class="eyebrow !text-[10px]">Project name</span>
					<input
						type="text"
						bind:value={nameDraft}
						maxlength="120"
						class="mt-1 block w-full border-b-2 border-rule bg-transparent pb-2 font-display text-2xl text-ink outline-none placeholder:text-graphite/50 focus:border-accent"
						placeholder="Untitled survey"
					/>
				</label>

				<label class="mt-5 block">
					<span class="eyebrow !text-[10px]">Primary level type</span>
					<select
						bind:value={primaryDraft}
						class="mt-1 block w-full rounded-md border border-rule bg-paper px-3 py-2 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
					>
						<option value="">— None —</option>
						{#each data.levelTypes as lt (lt.id)}
							<option value={lt.id}>{lt.code} · {lt.name} ({lt.kind})</option>
						{/each}
					</select>
				</label>

				<div class="mt-5 flex justify-end">
					<button
						type="submit"
						disabled={busy || !identityDirty}
						class="press inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 font-mono text-[12px] uppercase tracking-wider text-paper hover:bg-ink-2 disabled:opacity-40"
					>
						Save changes
					</button>
				</div>
			</form>

			<!-- Level types -->
			<div class="rounded-xl border border-ink/10 bg-vellum p-6">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="eyebrow">02 · Level types</p>
						<h2 class="mt-1 font-display text-2xl text-ink">Reading categories</h2>
						<p class="mt-2 font-body text-[14px] text-ink-2">
							Defaults — CL, EGL, FL, SL, DPC, FFL — are seeded per project. Add custom types or
							adjust the existing ones. Codes are uppercased automatically.
						</p>
					</div>
					{#if !creating}
						<button
							type="button"
							onclick={startCreate}
							class="press shrink-0 rounded-full border border-ink/30 bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink hover:border-ink"
						>+ Add type</button>
					{/if}
				</div>

				{#if creating}
					<div class="mt-5 rounded-lg border border-rule bg-paper/70 p-4">
						<p class="eyebrow">New level type</p>
						<div class="mt-3 grid gap-3 sm:grid-cols-[80px_1fr_120px]">
							<label class="block">
								<span class="font-mono text-[10px] uppercase tracking-wider text-graphite">Code</span>
								<input
									type="text"
									bind:value={newDraft.code}
									maxlength="8"
									placeholder="DPC"
									class="mt-1 block w-full rounded-md border border-rule bg-paper px-2 py-1.5 font-mono text-[13px] uppercase tabular text-ink focus:border-ink focus:outline-none"
								/>
							</label>
							<label class="block">
								<span class="font-mono text-[10px] uppercase tracking-wider text-graphite">Name</span>
								<input
									type="text"
									bind:value={newDraft.name}
									maxlength="60"
									placeholder="Damp-Proof Course"
									class="mt-1 block w-full rounded-md border border-rule bg-paper px-2 py-1.5 font-body text-[13px] text-ink focus:border-ink focus:outline-none"
								/>
							</label>
							<label class="block">
								<span class="font-mono text-[10px] uppercase tracking-wider text-graphite">Colour</span>
								<div class="mt-1 flex items-center gap-2">
									<input
										type="color"
										bind:value={newDraft.colorHex}
										class="h-8 w-10 cursor-pointer rounded border border-rule bg-transparent"
									/>
									<input
										type="text"
										bind:value={newDraft.colorHex}
										maxlength="7"
										class="block w-full rounded-md border border-rule bg-paper px-2 py-1.5 font-mono text-[12px] tabular text-ink focus:border-ink focus:outline-none"
									/>
								</div>
							</label>
						</div>
						<fieldset class="mt-3">
							<legend class="font-mono text-[10px] uppercase tracking-wider text-graphite">Kind</legend>
							<div class="mt-1 flex gap-2">
								{#each ['measured', 'design'] as const as k (k)}
									<label
										class="press flex-1 cursor-pointer rounded-md border bg-paper px-3 py-2 text-center
											{newDraft.kind === k ? 'border-ink bg-ink text-paper' : 'border-rule text-ink hover:border-ink'}"
									>
										<input
											type="radio"
											name="new-kind"
											value={k}
											bind:group={newDraft.kind}
											class="sr-only"
										/>
										<span class="font-mono text-[11px] uppercase tracking-wider">{k}</span>
										<span class="block font-body text-[11px] {newDraft.kind === k ? 'text-paper/70' : 'text-graphite'}">
											{k === 'measured' ? 'staff reading via session' : 'direct elevation entry'}
										</span>
									</label>
								{/each}
							</div>
						</fieldset>
						<div class="mt-4 flex justify-end gap-2">
							<button
								type="button"
								onclick={cancelCreate}
								class="press rounded-full border border-rule bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-graphite hover:border-ink hover:text-ink"
								>Cancel</button
							>
							<button
								type="button"
								onclick={saveCreate}
								disabled={busy}
								class="press rounded-full bg-ink px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-paper hover:bg-ink-2 disabled:opacity-40"
								>Add type</button
							>
						</div>
					</div>
				{/if}

				<ul class="mt-5 divide-y divide-rule/60 border-t border-rule/60">
					{#each data.levelTypes as lt (lt.id)}
						<li class="py-3">
							{#if editing?.id === lt.id}
								<div class="grid gap-3 sm:grid-cols-[80px_1fr_120px]">
									<label class="block">
										<span class="font-mono text-[10px] uppercase tracking-wider text-graphite">Code</span>
										<input
											type="text"
											bind:value={editing.code}
											maxlength="8"
											class="mt-1 block w-full rounded-md border border-rule bg-paper px-2 py-1.5 font-mono text-[13px] uppercase tabular text-ink focus:border-ink focus:outline-none"
										/>
									</label>
									<label class="block">
										<span class="font-mono text-[10px] uppercase tracking-wider text-graphite">Name</span>
										<input
											type="text"
											bind:value={editing.name}
											maxlength="60"
											class="mt-1 block w-full rounded-md border border-rule bg-paper px-2 py-1.5 font-body text-[13px] text-ink focus:border-ink focus:outline-none"
										/>
									</label>
									<label class="block">
										<span class="font-mono text-[10px] uppercase tracking-wider text-graphite">Colour</span>
										<div class="mt-1 flex items-center gap-2">
											<input
												type="color"
												bind:value={editing.colorHex}
												class="h-8 w-10 cursor-pointer rounded border border-rule bg-transparent"
											/>
											<input
												type="text"
												bind:value={editing.colorHex}
												maxlength="7"
												class="block w-full rounded-md border border-rule bg-paper px-2 py-1.5 font-mono text-[12px] tabular text-ink focus:border-ink focus:outline-none"
											/>
										</div>
									</label>
								</div>
								<div class="mt-3 flex justify-end gap-2">
									<button
										type="button"
										onclick={cancelEdit}
										class="press rounded-full border border-rule bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-graphite hover:border-ink hover:text-ink"
										>Cancel</button
									>
									<button
										type="button"
										onclick={saveEdit}
										disabled={busy}
										class="press rounded-full bg-ink px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-paper hover:bg-ink-2 disabled:opacity-40"
										>Save</button
									>
								</div>
							{:else}
								<div class="flex items-center gap-3">
									<span
										class="inline-block h-3 w-3 shrink-0 rounded-full"
										style:background-color={lt.colorHex}
										aria-hidden="true"
									></span>
									<span class="font-mono text-[13px] tabular uppercase text-ink">{lt.code}</span>
									<span class="truncate font-body text-[13px] text-ink-2">{lt.name}</span>
									<span
										class="ml-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider
										{lt.kind === 'measured' ? 'border-signal/40 text-signal-deep' : 'border-rule text-graphite'}"
										>{lt.kind}</span
									>
									{#if data.project.primaryLevelTypeId === lt.id}
										<span
											class="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent-deep"
											>primary</span
										>
									{/if}
									<span class="ml-auto font-mono text-[11px] tabular text-graphite">
										{lt.readingCount} reading{lt.readingCount === 1 ? '' : 's'}
									</span>
									<button
										type="button"
										onclick={() => startEdit(lt)}
										class="press rounded border border-transparent px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-graphite hover:border-rule hover:text-ink"
										>Edit</button
									>
									<button
										type="button"
										onclick={() => removeLevelType(lt.id, lt.code, lt.readingCount)}
										disabled={lt.readingCount > 0}
										title={lt.readingCount > 0
											? 'Remove readings of this type before deleting'
											: 'Delete this level type'}
										class="press rounded border border-transparent px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-graphite hover:border-accent-deep/40 hover:text-accent-deep disabled:cursor-not-allowed disabled:text-graphite/40 disabled:hover:border-transparent disabled:hover:text-graphite/40"
										>Delete</button
									>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</div>

			<!-- Plan & scale -->
			<div class="rounded-xl border border-ink/10 bg-vellum p-6">
				<p class="eyebrow">03 · Plan &amp; scale</p>
				<h2 class="mt-1 font-display text-2xl text-ink">Site plan</h2>
				<p class="mt-2 font-body text-[14px] text-ink-2">
					The plan, scale reference line, and benchmarks live on the canvas — open the project to swap
					the underlying image or redraw the scale.
				</p>
				<a
					href={resolve(`/projects/${data.projectId}`)}
					class="press mt-4 inline-flex items-center gap-2 rounded-full border border-ink/30 bg-paper px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-ink hover:border-ink"
				>
					Open canvas →
				</a>
			</div>

			<!-- Archive -->
			<div class="rounded-xl border border-accent-deep/30 bg-vellum p-6">
				<p class="eyebrow !text-accent-deep">04 · Archive</p>
				<h2 class="mt-1 font-display text-2xl text-ink">Retire this project</h2>
				<p class="mt-2 font-body text-[14px] text-ink-2">
					Hard delete. Points, sessions, readings, level types and the uploaded plan all go with it.
					There is no undo.
				</p>

				{#if !confirmDelete}
					<button
						type="button"
						onclick={() => {
							confirmDelete = true;
							deleteName = '';
						}}
						class="press mt-4 inline-flex items-center gap-2 rounded-full border border-accent-deep/40 bg-paper px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-accent-deep hover:border-accent-deep"
					>
						Delete project
					</button>
				{:else}
					<div class="mt-4 rounded-lg border border-accent-deep/40 bg-paper/70 p-4">
						<p class="font-mono text-[11px] uppercase tracking-wider text-accent-deep">
							Type <span class="rounded bg-accent-deep/10 px-1 py-0.5">{data.project.name}</span> to confirm.
						</p>
						<input
							type="text"
							bind:value={deleteName}
							class="mt-3 block w-full rounded-md border border-rule bg-paper px-3 py-2 font-mono text-[13px] text-ink focus:border-accent-deep focus:outline-none"
							placeholder={data.project.name}
						/>
						<div class="mt-3 flex justify-end gap-2">
							<button
								type="button"
								onclick={() => {
									confirmDelete = false;
									deleteName = '';
								}}
								class="press rounded-full border border-rule bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-graphite hover:border-ink hover:text-ink"
								>Cancel</button
							>
							<button
								type="button"
								onclick={reallyDelete}
								disabled={busy || deleteName.trim() !== data.project.name}
								class="press rounded-full bg-accent-deep px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-paper hover:bg-accent disabled:opacity-40"
								>I understand — delete</button
							>
						</div>
					</div>
				{/if}
			</div>
		</section>
	</div>
</div>
