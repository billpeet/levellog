<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PlanCanvas from '$lib/components/canvas/plan-canvas.svelte';
	import { arrowLengthPx, slopeColour } from '$lib/domain/arrows';
	import { buildContourView, type ContourView } from '$lib/domain/contour-view';
	import { buildHeatmapImage, type HeatmapImage } from '$lib/domain/heatmap';
	import { buildSampleHull, pointInPolygon, type Pt } from '$lib/domain/hull';
	import { interpolateIdw, type IdwSample } from '$lib/domain/idw';
	import {
		calculateGrade,
		calculateInstrumentHeight,
		calculateReducedLevel,
		formatDelta,
		formatLevel,
		toDisplayLevel,
		type DisplayMode
	} from '$lib/domain/levels';
	import {
		createAnnotationLine,
		createPoint,
		deleteAnnotationLine,
		deleteLevelSession,
		deletePoint,
		deleteReading,
		setPlanImageOpacity,
		setPlanScale,
		startLevelSession,
		updateAnnotationLine,
		updatePoint,
		upsertReading
	} from '$lib/remotes/projects.remote.js';
	import { SvelteDate, SvelteMap } from 'svelte/reactivity';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Tool = 'select' | 'point' | 'bench' | 'scale' | 'grade' | 'line';
	let tool = $state<Tool>('select');

	const tools: {
		id: Tool;
		label: string;
		shortcut: string;
		icon: 'point' | 'bench' | 'rule' | 'cursor' | 'grade' | 'line';
	}[] = [
		{ id: 'select', label: 'Select', shortcut: 'V', icon: 'cursor' },
		{ id: 'point', label: 'Add point', shortcut: 'P', icon: 'point' },
		{ id: 'bench', label: 'Add benchmark', shortcut: 'B', icon: 'bench' },
		{ id: 'scale', label: 'Set scale', shortcut: 'S', icon: 'rule' },
		{ id: 'grade', label: 'Measure grade', shortcut: 'M', icon: 'grade' },
		{ id: 'line', label: 'Draw line', shortcut: 'L', icon: 'line' }
	];

	type LineStyle = 'solid' | 'dashed' | 'dotted';
	const linePalette = ['#0f100e', '#e5532d', '#1f5b41', '#c79400', '#b6361a', '#3a5a8a', '#faf6eb'];
	const lineStrokeOptions = [1, 1.5, 2.5];
	// Persistent settings used when drawing new annotation lines. Lives in
	// the shell HUD that appears while the line tool is armed — picking a
	// colour or style here applies to every subsequent segment.
	let lineSettings = $state<{ colorHex: string; style: LineStyle; strokeWidth: number }>({
		colorHex: '#0f100e',
		style: 'solid',
		strokeWidth: 1.5
	});

	// Polyline-chain state. `lineA` is the next segment's starting endpoint;
	// on commit it auto-advances to the click that closed the previous
	// segment so the user can keep clicking to extend a polyline. Esc clears.
	let lineA = $state<{ x: number; y: number } | null>(null);

	// Optimistic in-flight segments. Rendered immediately on commit so the
	// chain feels instant; cleared after the server roundtrip + invalidation
	// surfaces them in `data.annotationLines`.
	let pendingLines = $state<
		{
			key: string;
			ax: number;
			ay: number;
			bx: number;
			by: number;
			colorHex: string;
			style: LineStyle;
			strokeWidth: number;
		}[]
	>([]);

	// Selected existing line — drives the edit HUD when in select mode.
	let selectedLineId = $state<string | null>(null);
	const selectedLine = $derived(
		selectedLineId ? data.annotationLines.find((l) => l.id === selectedLineId) ?? null : null
	);

	type ViewSource = 'current' | 'finished' | 'delta';
	type ViewStyle = 'points' | 'heatmap' | 'contours';
	let viewSource = $state<ViewSource>('current');
	let viewStyle = $state<ViewStyle>('points');
	// Plan-image opacity (0–1). Overlays (heatmap, contours, points) stay
	// fully opaque; only the underlying raster fades. Initial value comes
	// from the persisted plan row; mutations save back debounced so we don't
	// write on every drag tick.
	// svelte-ignore state_referenced_locally
	let planOpacity = $state<number>(data.plan?.imageOpacity ?? 1);
	let planOpacitySaveTimer: ReturnType<typeof setTimeout> | null = null;
	function onPlanOpacityChange() {
		if (!data.plan) return;
		if (planOpacitySaveTimer) clearTimeout(planOpacitySaveTimer);
		planOpacitySaveTimer = setTimeout(() => {
			setPlanImageOpacity({ projectId: data.projectId, opacity: planOpacity }).catch(() => {});
		}, 350);
	}

	const viewSources: { id: ViewSource; label: string }[] = [
		{ id: 'current', label: 'Current' },
		{ id: 'finished', label: 'Finished' },
		{ id: 'delta', label: 'Delta' }
	];
	const viewStyles: { id: ViewStyle; label: string }[] = [
		{ id: 'points', label: 'Points' },
		{ id: 'heatmap', label: 'Heatmap' },
		{ id: 'contours', label: 'Contours' }
	];

	// Plan dimensions: from uploaded plan or virtual blank canvas.
	const planW = $derived(data.plan?.widthPx ?? 1600);
	const planH = $derived(data.plan?.heightPx ?? 1000);
	const planImgUrl = $derived(data.plan?.id ? `/api/uploads/plans/${data.plan.id}` : null);

	const planScale = $derived(data.plan?.scalePxPerMetre ?? null);
	let planFileInput: HTMLInputElement | undefined = $state();
	let replacingPlan = $state(false);
	async function replacePlan(file: File | null) {
		if (!file || replacingPlan) return;
		const type = file.type.toLowerCase();
		if (!['image/png', 'image/jpeg', 'image/jpg'].includes(type)) {
			err = 'Replacement plan must be PNG or JPG.';
			if (planFileInput) planFileInput.value = '';
			return;
		}
		const message = data.plan
			? 'Replacing the plan image will reset the saved scale reference. Continue?'
			: 'Upload this image as the site plan?';
		if (!confirm(message)) {
			if (planFileInput) planFileInput.value = '';
			return;
		}
		replacingPlan = true;
		err = null;
		try {
			const fd = new FormData();
			fd.set('file', file);
			const res = await fetch(`/api/projects/${data.projectId}/plan`, {
				method: 'POST',
				body: fd
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Plan upload failed (${res.status})`);
			}
			planOpacity = 1;
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not replace plan.';
		} finally {
			replacingPlan = false;
			if (planFileInput) planFileInput.value = '';
		}
	}

	const activeSession = $derived(data.sessions.find((s) => s.endedAt == null) ?? null);

	// Canvas display mode — Absolute (true RL) or Relative (HI − elevation,
	// i.e. expected staff reading). Relative is only meaningful while a
	// session is active; we snap back to Absolute whenever no session is
	// running and the toggle becomes inert. Preference is persisted per-project
	// in localStorage so it survives reloads during a long on-site session.
	let displayMode = $state<DisplayMode>('absolute');
	const displayModeStorageKey = $derived(`levellog:displayMode:${data.projectId}`);
	$effect(() => {
		// Hydrate on mount.
		try {
			const stored = localStorage.getItem(displayModeStorageKey);
			if (stored === 'relative' || stored === 'absolute') displayMode = stored;
		} catch {
			/* SSR / disabled storage — fine */
		}
	});
	$effect(() => {
		// Force Absolute whenever the active session goes away.
		if (!activeSession && displayMode !== 'absolute') displayMode = 'absolute';
	});
	$effect(() => {
		try {
			localStorage.setItem(displayModeStorageKey, displayMode);
		} catch {
			/* ignore */
		}
	});

	// Convenience derivations for the formatter helpers.
	const hi = $derived(activeSession?.instrumentHeight ?? null);
	const isRelative = $derived(displayMode === 'relative' && hi != null);
	function mmToMetres(value: string) {
		const trimmed = value.trim();
		return trimmed === '' ? Number.NaN : Number(trimmed) / 1000;
	}
	function metresToMm(value: number) {
		return Math.round(value * 1000).toString();
	}
	function fmtLevel(elev: number, digits = 0) {
		return formatLevel(elev, displayMode, hi, digits);
	}
	function fmtMm(elev: number) {
		return metresToMm(elev);
	}

	// Hover readout
	let hover = $state<{ xPx: number; yPx: number } | null>(null);

	// Scale flow state
	let scaleA = $state<{ x: number; y: number } | null>(null);
	let scaleB = $state<{ x: number; y: number } | null>(null);
	let scaleMetres = $state<string>('');

	// Grade-tool state — two point ids the user has tapped while the tool is armed.
	let gradeA = $state<string | null>(null);
	let gradeB = $state<string | null>(null);

	// New-point modal state
	let pendingPoint = $state<{ x: number; y: number; isBenchmark: boolean } | null>(null);
	let pendingLabel = $state('');
	let pendingElevation = $state('');

	// Selection / detail sheet
	let selectedPointId = $state<string | null>(null);
	const selectedPoint = $derived(
		selectedPointId ? data.points.find((p) => p.id === selectedPointId) ?? null : null
	);

	// Right panel tab
	type Tab = 'points' | 'sessions' | 'levels';
	let tab = $state<Tab>('points');

	// Mobile sheets — the right panel collapses into a bottom sheet below xl,
	// and the tool rail collapses into a bottom strip below lg. The strip is
	// always visible on mobile; the panel sheet is opened via the chrome bar.
	let mobilePanelOpen = $state(false);

	// Selecting a point from inside the mobile panel sheet should hand off to
	// the detail sheet, so dismiss the bottom sheet automatically.
	$effect(() => {
		if (selectedPointId) mobilePanelOpen = false;
	});

	// Reading entry state (lives in detail sheet)
	let readingDraft = $state<{
		levelTypeId: string;
		mode: 'staff' | 'elevation';
		staffReading: string;
		elevation: string;
		note: string;
		editingId: string | null;
	} | null>(null);

	// Session start modal state
	let sessionDraft = $state<{
		benchmarkPointId: string;
		staffReading: string;
		note: string;
	} | null>(null);

	let busy = $state(false);
	let err = $state<string | null>(null);

	// Open start-session modal when ?session=start in URL
	$effect(() => {
		const wants = page.url.searchParams.get('session');
		if (wants === 'start' && !sessionDraft && !activeSession) {
			openSessionModal();
		}
	});

	function defaultLabel(isBenchmark: boolean) {
		const prefix = isBenchmark ? 'BM' : 'P';
		const used = new Set(data.points.map((p) => p.label));
		for (let i = 1; i < 999; i++) {
			const candidate = `${prefix}-${String(i).padStart(2, '0')}`;
			if (!used.has(candidate)) return candidate;
		}
		return `${prefix}-${Date.now()}`;
	}

	function clearSessionParam() {
		const url = new URL(page.url);
		if (url.searchParams.has('session')) {
			url.searchParams.delete('session');
			goto(resolve(`/projects/${data.projectId}`), {
				keepFocus: true,
				noScroll: true
			});
		}
	}

	function openSessionModal() {
		const benchmarks = data.points.filter((p) => p.isBenchmark);
		if (benchmarks.length === 0) {
			err = 'Drop at least one benchmark with a known elevation before starting a session.';
			clearSessionParam();
			return;
		}
		sessionDraft = {
			benchmarkPointId: benchmarks[0].id,
			staffReading: '',
			note: ''
		};
	}

	function closeSessionModal() {
		sessionDraft = null;
		clearSessionParam();
	}

	async function confirmStartSession() {
		if (!sessionDraft) return;
		const staff = mmToMetres(sessionDraft.staffReading);
		if (!Number.isFinite(staff) || staff < 0) {
			err = 'Enter a non-negative staff reading.';
			return;
		}
		busy = true;
		err = null;
		try {
			await startLevelSession({
				projectId: data.projectId,
				benchmarkPointId: sessionDraft.benchmarkPointId,
				benchmarkStaffReading: staff,
				note: sessionDraft.note.trim() ? sessionDraft.note.trim() : null
			});
			closeSessionModal();
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not start session.';
		} finally {
			busy = false;
		}
	}

	async function endSession(sessionId: string) {
		busy = true;
		err = null;
		try {
			await deleteLevelSession({ projectId: data.projectId, sessionId });
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not delete session.';
		} finally {
			busy = false;
		}
	}

	function pickPointAt(xPx: number, yPx: number, scale: number) {
		// Hit-test radius in plan-pixels — scale-aware so it stays ~14 screen px regardless of zoom.
		const r = 14 / scale;
		let best: { id: string; d: number } | null = null;
		for (const p of data.points) {
			const d = Math.hypot(p.xPx - xPx, p.yPx - yPx);
			if (d <= r && (!best || d < best.d)) best = { id: p.id, d };
		}
		return best?.id ?? null;
	}

	let canvasScale = $state(1);

	// ── Snap helpers ─────────────────────────────────────────────────────────
	// Toggle in the canvas chrome bar; shortcut "/" to flick on and off without
	// leaving the canvas. Applies to the line + scale tools — the others either
	// snap implicitly (grade picks points by id) or want freeform placement
	// (drop point/benchmark in empty space).
	let snapEnabled = $state(false);

	type SnapKind = 'point' | 'endpoint' | 'midpoint';
	type SnapTarget = { x: number; y: number; kind: SnapKind; sourceId?: string };

	/**
	 * Find the closest snap candidate to (xPx, yPx) within a screen-space
	 * tolerance (~14 device-pixels by default). Returns null when nothing is
	 * within reach. Priority on tie-break: point > endpoint > midpoint.
	 */
	function findSnapTarget(xPx: number, yPx: number, scale: number): SnapTarget | null {
		if (!snapEnabled) return null;
		const tolPx = 14 / scale;
		const tol2 = tolPx * tolPx;
		// `best` is mutated from inside `consider`; wrap in a single-cell array
		// so TypeScript's flow narrowing doesn't collapse it to `never` across
		// the closure boundary.
		const bestRef: [{ t: SnapTarget; d2: number; rank: number } | null] = [null];
		const consider = (t: SnapTarget, rank: number) => {
			const dx = t.x - xPx;
			const dy = t.y - yPx;
			const d2 = dx * dx + dy * dy;
			if (d2 > tol2) return;
			const cur = bestRef[0];
			if (!cur || d2 < cur.d2 || (d2 === cur.d2 && rank < cur.rank)) {
				bestRef[0] = { t, d2, rank };
			}
		};
		for (const p of data.points) {
			consider({ x: p.xPx, y: p.yPx, kind: 'point', sourceId: p.id }, 0);
		}
		for (const ln of data.annotationLines) {
			consider({ x: ln.ax, y: ln.ay, kind: 'endpoint', sourceId: ln.id }, 1);
			consider({ x: ln.bx, y: ln.by, kind: 'endpoint', sourceId: ln.id }, 1);
			consider(
				{ x: (ln.ax + ln.bx) / 2, y: (ln.ay + ln.by) / 2, kind: 'midpoint', sourceId: ln.id },
				2
			);
		}
		return bestRef[0]?.t ?? null;
	}

	/** Snap candidate at the user's current cursor position, for tools that
	 *  show a live preview (line, scale). null when snap is off, no hover, or
	 *  nothing is in tolerance. */
	const hoverSnap = $derived(
		hover && (tool === 'line' || tool === 'scale' || tool === 'point' || tool === 'bench')
			? findSnapTarget(hover.xPx, hover.yPx, canvasScale)
			: null
	);

	function onSurfaceClick({ xPx, yPx }: { xPx: number; yPx: number }) {
		if (xPx < 0 || yPx < 0 || xPx > planW || yPx > planH) return;

		// Resolve snap before any tool-specific branch — if snap is on and
		// something is in tolerance, replace the click coords with the target.
		if (tool === 'line' || tool === 'scale' || tool === 'point' || tool === 'bench') {
			const snap = findSnapTarget(xPx, yPx, canvasScale);
			if (snap) {
				xPx = snap.x;
				yPx = snap.y;
			}
		}

		if (tool === 'point' || tool === 'bench') {
			pendingPoint = { x: xPx, y: yPx, isBenchmark: tool === 'bench' };
			pendingLabel = defaultLabel(tool === 'bench');
			pendingElevation = '';
		} else if (tool === 'scale') {
			if (!scaleA) scaleA = { x: xPx, y: yPx };
			else if (!scaleB) scaleB = { x: xPx, y: yPx };
		} else if (tool === 'grade') {
			const hit = pickPointAt(xPx, yPx, canvasScale);
			if (!hit) return;
			if (!gradeA) gradeA = hit;
			else if (!gradeB && hit !== gradeA) gradeB = hit;
			else {
				gradeA = hit;
				gradeB = null;
			}
		} else if (tool === 'line') {
			if (!lineA) {
				lineA = { x: xPx, y: yPx };
			} else {
				commitLineSegment(lineA, { x: xPx, y: yPx });
				// Auto-chain so the next click extends the polyline.
				lineA = { x: xPx, y: yPx };
			}
		} else if (tool === 'select') {
			// Lines win priority over points only if the click is closer to a line
			// than to any point — otherwise we keep the existing point-pick UX.
			const linePick = pickLineAt(xPx, yPx, canvasScale);
			const pointPick = pickPointAt(xPx, yPx, canvasScale);
			if (linePick && !pointPick) {
				selectLineForEdit(linePick);
				return;
			}
			selectedPointId = pointPick;
			selectedLineId = null;
			if (pointPick) tab = 'points';
		}
	}

	function selectLineForEdit(lineId: string) {
		const line = data.annotationLines.find((l) => l.id === lineId);
		if (!line) return;
		selectedLineId = lineId;
		selectedPointId = null;
		// Snap the shell HUD's pickers to the selected line's settings so the
		// surveyor sees its current style and any picker-tap edits the line.
		lineSettings = {
			colorHex: line.colorHex,
			style: line.style as LineStyle,
			strokeWidth: line.strokeWidth
		};
	}

	/** Hit-test annotation lines. Distance threshold uses the same screen-space
	 *  budget (~10 px) as the point-pick helper, divided by the canvas scale to
	 *  convert into plan-pixel units. */
	function pickLineAt(xPx: number, yPx: number, scale: number): string | null {
		const tolerance = 10 / scale;
		let best: { id: string; d: number } | null = null;
		for (const l of data.annotationLines) {
			const d = pointToSegmentDistance(xPx, yPx, l.ax, l.ay, l.bx, l.by);
			if (d <= tolerance && (!best || d < best.d)) best = { id: l.id, d };
		}
		return best?.id ?? null;
	}

	function pointToSegmentDistance(
		px: number,
		py: number,
		ax: number,
		ay: number,
		bx: number,
		by: number
	): number {
		const dx = bx - ax;
		const dy = by - ay;
		const len2 = dx * dx + dy * dy;
		if (len2 === 0) return Math.hypot(px - ax, py - ay);
		let t = ((px - ax) * dx + (py - ay) * dy) / len2;
		t = Math.max(0, Math.min(1, t));
		return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
	}

	/**
	 * Persist a freshly-drawn segment with the current shell settings. Adds
	 * an optimistic pending entry first so the polyline visibly grows on the
	 * canvas without waiting for the server roundtrip; the entry is dropped
	 * on the next invalidation when the real row appears in `data`.
	 */
	async function commitLineSegment(a: { x: number; y: number }, b: { x: number; y: number }) {
		const key = crypto.randomUUID();
		const optimistic = {
			key,
			ax: a.x,
			ay: a.y,
			bx: b.x,
			by: b.y,
			colorHex: lineSettings.colorHex,
			style: lineSettings.style,
			strokeWidth: lineSettings.strokeWidth
		};
		pendingLines = [...pendingLines, optimistic];
		try {
			await createAnnotationLine({
				projectId: data.projectId,
				ax: a.x,
				ay: a.y,
				bx: b.x,
				by: b.y,
				colorHex: lineSettings.colorHex,
				style: lineSettings.style,
				strokeWidth: lineSettings.strokeWidth
			});
			await invalidateAll();
			pendingLines = pendingLines.filter((p) => p.key !== key);
		} catch (e) {
			pendingLines = pendingLines.filter((p) => p.key !== key);
			err = e instanceof Error ? e.message : 'Could not save line.';
		}
	}

	/**
	 * Apply the current `lineSettings` to the selected line. Called whenever
	 * a picker in the line HUD is tapped while a line is selected — each pick
	 * is a discrete user action so we save immediately rather than debouncing.
	 */
	async function applySelectedLineSettings() {
		if (!selectedLineId) return;
		const id = selectedLineId;
		try {
			await updateAnnotationLine({
				projectId: data.projectId,
				id,
				colorHex: lineSettings.colorHex,
				style: lineSettings.style,
				strokeWidth: lineSettings.strokeWidth
			});
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not update line.';
		}
	}

	async function deleteSelectedLine() {
		if (!selectedLineId) return;
		const id = selectedLineId;
		try {
			await deleteAnnotationLine({ projectId: data.projectId, id });
			selectedLineId = null;
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not delete line.';
		}
	}

	function cancelLine() {
		lineA = null;
	}

	function resetGrade() {
		gradeA = null;
		gradeB = null;
	}

	// Clear the polyline chain when leaving the line tool, and clear any
	// selected-line halo when leaving select mode. Keeps the canvas tidy
	// without forcing the user to Esc on every tool change.
	$effect(() => {
		if (tool !== 'line') lineA = null;
		if (tool !== 'select') selectedLineId = null;
	});

	async function confirmCreatePoint() {
		if (!pendingPoint) return;
		const isBench = pendingPoint.isBenchmark;
		const elevationInput = String(pendingElevation ?? '');
		const elev = isBench ? mmToMetres(elevationInput) : null;
		if (isBench && (!Number.isFinite(elev) || elevationInput.trim() === '')) {
			err = 'Benchmark requires a known elevation.';
			return;
		}
		busy = true;
		err = null;
		try {
			await createPoint({
				projectId: data.projectId,
				label: pendingLabel.trim() || defaultLabel(isBench),
				xPx: pendingPoint.x,
				yPx: pendingPoint.y,
				isBenchmark: isBench,
				knownElevation: isBench ? elev : null
			});
			pendingPoint = null;
			tool = 'select';
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not save point.';
		} finally {
			busy = false;
		}
	}

	async function confirmScale() {
		if (!scaleA || !scaleB) return;
		const metres = Number(scaleMetres);
		if (!Number.isFinite(metres) || metres <= 0) {
			err = 'Enter the real-world distance in metres.';
			return;
		}
		busy = true;
		err = null;
		try {
			await setPlanScale({
				projectId: data.projectId,
				ax: scaleA.x,
				ay: scaleA.y,
				bx: scaleB.x,
				by: scaleB.y,
				metres
			});
			scaleA = null;
			scaleB = null;
			scaleMetres = '';
			tool = 'select';
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not save scale.';
		} finally {
			busy = false;
		}
	}

	async function removePoint(id: string) {
		if (!confirm('Delete this point and its readings?')) return;
		busy = true;
		err = null;
		try {
			await deletePoint({ projectId: data.projectId, pointId: id });
			if (selectedPointId === id) selectedPointId = null;
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not delete point.';
		} finally {
			busy = false;
		}
	}

	async function renamePoint(id: string, label: string) {
		try {
			await updatePoint({ projectId: data.projectId, pointId: id, label });
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not rename point.';
		}
	}

	async function updateBenchmarkElevation(id: string, value: string) {
		const elev = mmToMetres(value);
		if (!Number.isFinite(elev)) {
			err = 'Benchmark elevation must be a number.';
			return;
		}
		try {
			await updatePoint({ projectId: data.projectId, pointId: id, knownElevation: elev });
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not update benchmark.';
		}
	}

	function defaultReadingMode(levelTypeId: string, existing?: typeof data.readings[number]): 'staff' | 'elevation' {
		if (existing?.staffReading != null) return 'staff';
		if (existing?.elevation != null) return 'elevation';
		return levelTypeById(levelTypeId)?.kind === 'measured' ? 'staff' : 'elevation';
	}

	function startReading(levelTypeId: string, existing?: typeof data.readings[number]) {
		readingDraft = {
			levelTypeId,
			mode: defaultReadingMode(levelTypeId, existing),
			staffReading: existing?.staffReading != null ? metresToMm(existing.staffReading) : '',
			elevation: existing?.elevation != null ? metresToMm(existing.elevation) : '',
			note: existing?.note ?? '',
			editingId: existing?.id ?? null
		};
	}

	function setReadingMode(mode: 'staff' | 'elevation') {
		if (!readingDraft || readingDraft.mode === mode) return;
		if (mode === 'staff' && !readingDraft.staffReading && activeSession) {
			const elev = mmToMetres(readingDraft.elevation);
			if (Number.isFinite(elev)) readingDraft.staffReading = metresToMm(activeSession.instrumentHeight - elev);
		}
		if (mode === 'elevation' && !readingDraft.elevation && activeSession) {
			const staff = mmToMetres(readingDraft.staffReading);
			if (Number.isFinite(staff)) readingDraft.elevation = metresToMm(calculateReducedLevel(activeSession.instrumentHeight, staff));
		}
		readingDraft.mode = mode;
	}

	function cancelReading() {
		readingDraft = null;
	}

	async function confirmReading() {
		if (!readingDraft || !selectedPoint) return;
		const lt = data.levelTypes.find((l) => l.id === readingDraft!.levelTypeId);
		if (!lt) return;

		busy = true;
		err = null;
		try {
			if (readingDraft.mode === 'staff') {
				if (!activeSession) {
					err = 'Start a session before recording staff readings.';
					return;
				}
				const staff = mmToMetres(readingDraft.staffReading);
				if (!Number.isFinite(staff) || staff < 0) {
					err = 'Staff reading must be a non-negative number.';
					return;
				}
				await upsertReading({
					projectId: data.projectId,
					pointId: selectedPoint.id,
					levelTypeId: lt.id,
					staffReading: staff,
					note: readingDraft.note.trim() ? readingDraft.note.trim() : null
				});
			} else {
				const elev = mmToMetres(readingDraft.elevation);
				if (!Number.isFinite(elev)) {
					err = 'Enter the design elevation.';
					return;
				}
				await upsertReading({
					projectId: data.projectId,
					pointId: selectedPoint.id,
					levelTypeId: lt.id,
					elevation: elev,
					note: readingDraft.note.trim() ? readingDraft.note.trim() : null
				});
			}
			readingDraft = null;
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not save reading.';
		} finally {
			busy = false;
		}
	}

	async function removeReading(id: string) {
		if (!confirm('Delete this reading?')) return;
		busy = true;
		err = null;
		try {
			await deleteReading({ projectId: data.projectId, readingId: id });
			await invalidateAll();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not delete reading.';
		} finally {
			busy = false;
		}
	}

	function cancelPending() {
		pendingPoint = null;
	}
	function cancelScale() {
		scaleA = null;
		scaleB = null;
		scaleMetres = '';
	}

	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
		const k = e.key.toLowerCase();
		if (k === 'v') tool = 'select';
		else if (k === 'p') tool = 'point';
		else if (k === 'b') tool = 'bench';
		else if (k === 's') tool = 'scale';
		else if (k === 'm') tool = 'grade';
		else if (k === 'l') tool = 'line';
		else if (k === '/') snapEnabled = !snapEnabled;
		else if (k === 'escape') {
			cancelPending();
			cancelScale();
			cancelLine();
			if (sessionDraft) closeSessionModal();
			if (readingDraft) cancelReading();
			else if (gradeA || gradeB) resetGrade();
			else if (selectedLineId) selectedLineId = null;
			else if (selectedPointId) selectedPointId = null;
			else tool = 'select';
		}
	}

	const armedCursor = $derived(
		tool === 'point' || tool === 'bench' || tool === 'scale' || tool === 'grade' || tool === 'line'
			? 'crosshair'
			: 'default'
	);

	const pointReadings = $derived.by(() => {
		const map = new SvelteMap<string, typeof data.readings>();
		for (const r of data.readings) {
			const arr = map.get(r.pointId) ?? [];
			arr.push(r);
			map.set(r.pointId, arr);
		}
		return map;
	});

	const primaryLevelTypeId = $derived(data.project.primaryLevelTypeId);
	const primaryLevelType = $derived(
		data.levelTypes.find((l) => l.id === primaryLevelTypeId) ?? null
	);

	function primaryReading(pointId: string) {
		if (!primaryLevelTypeId) return null;
		const list = pointReadings.get(pointId);
		return list?.find((r) => r.levelTypeId === primaryLevelTypeId) ?? null;
	}

	/**
	 * Best-effort elevation for a point — primary reading first, then known
	 * benchmark elevation as a fallback. Mirrors the inline-label rule.
	 */
	function pointElevation(pointId: string): number | null {
		const p = data.points.find((pt) => pt.id === pointId);
		if (!p) return null;
		const pr = primaryReading(pointId);
		if (pr) return pr.elevation;
		if (p.isBenchmark && p.knownElevation != null) return p.knownElevation;
		return null;
	}

	function readingFor(pointId: string, levelTypeId: string | null) {
		if (!levelTypeId) return null;
		const list = pointReadings.get(pointId);
		return list?.find((r) => r.levelTypeId === levelTypeId) ?? null;
	}

	function levelTypeById(id: string) {
		return data.levelTypes.find((l) => l.id === id) ?? null;
	}

	function pointLabel(id: string) {
		return data.points.find((p) => p.id === id)?.label ?? id;
	}

	function formatDateTime(d: Date | string | null | undefined) {
		if (!d) return '';
		const date = typeof d === 'string' ? new Date(d) : d;
		const now = new SvelteDate();
		const isToday = date.toDateString() === now.toDateString();
		const yesterday = new SvelteDate(now);
		yesterday.setDate(now.getDate() - 1);
		const hh = date.getHours().toString().padStart(2, '0');
		const mm = date.getMinutes().toString().padStart(2, '0');
		if (isToday) return `today ${hh}:${mm}`;
		if (date.toDateString() === yesterday.toDateString()) return `yesterday ${hh}:${mm}`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` ${hh}:${mm}`;
	}

	const previewHi = $derived.by(() => {
		const draft = sessionDraft;
		if (!draft) return null;
		const bench = data.points.find((p) => p.id === draft.benchmarkPointId);
		const staff = mmToMetres(draft.staffReading);
		if (bench?.knownElevation == null || !Number.isFinite(staff)) return null;
		return calculateInstrumentHeight(bench.knownElevation, staff);
	});

	const previewRl = $derived.by(() => {
		if (!readingDraft || !activeSession || readingDraft.mode !== 'staff') return null;
		const staff = mmToMetres(readingDraft.staffReading);
		if (!Number.isFinite(staff)) return null;
		return calculateReducedLevel(activeSession.instrumentHeight, staff);
	});

	const previewStaff = $derived.by(() => {
		if (!readingDraft || !activeSession || readingDraft.mode !== 'elevation') return null;
		const elev = mmToMetres(readingDraft.elevation);
		if (!Number.isFinite(elev)) return null;
		return activeSession.instrumentHeight - elev;
	});

	const benchmarks = $derived(data.points.filter((p) => p.isBenchmark));
	const measuredTypes = $derived(data.levelTypes.filter((l) => l.kind === 'measured'));
	const designTypes = $derived(data.levelTypes.filter((l) => l.kind === 'design'));

	// ── Grade tool derivations ───────────────────────────────────────────────────
	const gradePointA = $derived(gradeA ? data.points.find((p) => p.id === gradeA) ?? null : null);
	const gradePointB = $derived(gradeB ? data.points.find((p) => p.id === gradeB) ?? null : null);
	const gradeReadout = $derived.by(() => {
		const a = gradePointA;
		const b = gradePointB;
		if (!a || !b) return null;
		const elevA = pointElevation(a.id);
		const elevB = pointElevation(b.id);
		const dxPx = b.xPx - a.xPx;
		const dyPx = b.yPx - a.yPx;
		const pxLen = Math.hypot(dxPx, dyPx);
		const distanceMetres = planScale ? pxLen / planScale : null;
		const grade =
			elevA != null && elevB != null && distanceMetres
				? calculateGrade(elevA, elevB, distanceMetres)
				: null;
		return {
			a,
			b,
			elevA,
			elevB,
			pxLen,
			distanceMetres,
			delta: elevA != null && elevB != null ? elevB - elevA : null,
			grade
		};
	});

	// ── Heatmap derivations ──────────────────────────────────────────────────────
	// "Current" → project's primary level type (defaults to CL on creation).
	// "Finished" → first design level type with code FL/FFL, else any design type.
	const currentLevelType = $derived(primaryLevelType ?? measuredTypes[0] ?? null);
	const finishedLevelType = $derived(
		designTypes.find((l) => l.code === 'FL') ??
			designTypes.find((l) => l.code === 'FFL') ??
			designTypes[0] ??
			null
	);

	function samplesFor(levelTypeId: string | null): IdwSample[] {
		if (!levelTypeId) return [];
		const out: IdwSample[] = [];
		for (const p of data.points) {
			const r = readingFor(p.id, levelTypeId);
			if (r) {
				out.push({ x: p.xPx, y: p.yPx, value: r.elevation });
			} else if (p.isBenchmark && p.knownElevation != null && levelTypeId === primaryLevelTypeId) {
				// Benchmarks anchor the "current" surface even if no measured reading exists yet.
				out.push({ x: p.xPx, y: p.yPx, value: p.knownElevation });
			}
		}
		return out;
	}

	const currentSamples = $derived(samplesFor(currentLevelType?.id ?? null));
	const finishedSamples = $derived(samplesFor(finishedLevelType?.id ?? null));

	// Delta = current − finished, only at points that carry both.
	const deltaSamples = $derived.by<IdwSample[]>(() => {
		const cId = currentLevelType?.id;
		const fId = finishedLevelType?.id;
		if (!cId || !fId) return [];
		const out: IdwSample[] = [];
		for (const p of data.points) {
			const c = readingFor(p.id, cId);
			const f = readingFor(p.id, fId);
			const cVal = c?.elevation ?? (p.isBenchmark && cId === primaryLevelTypeId ? p.knownElevation : null);
			if (cVal == null || !f) continue;
			out.push({ x: p.xPx, y: p.yPx, value: cVal - f.elevation });
		}
		return out;
	});

	// Padded sample-cloud hulls for the live hover readout — restricts the
	// displayed IDW value to where there's actually information.
	const currentHull = $derived<Pt[] | null>(buildSampleHull(currentSamples));
	const finishedHull = $derived<Pt[] | null>(buildSampleHull(finishedSamples));

	const hoverCurrent = $derived.by<number | null>(() => {
		if (!hover) return null;
		if (currentSamples.length === 0) return null;
		if (currentHull && !pointInPolygon(hover.xPx, hover.yPx, currentHull)) return null;
		return interpolateIdw(hover.xPx, hover.yPx, currentSamples);
	});

	const hoverFinished = $derived.by<number | null>(() => {
		if (!hover) return null;
		if (finishedSamples.length === 0) return null;
		if (finishedHull && !pointInPolygon(hover.xPx, hover.yPx, finishedHull)) return null;
		return interpolateIdw(hover.xPx, hover.yPx, finishedSamples);
	});

	// Samples for the current Source selection.
	const sourceSamples = $derived(
		viewSource === 'current'
			? currentSamples
			: viewSource === 'finished'
				? finishedSamples
				: deltaSamples
	);

	const heatmapImage = $derived.by<HeatmapImage | null>(() => {
		if (viewStyle !== 'heatmap') return null;
		if (sourceSamples.length === 0) return null;
		return buildHeatmapImage({
			width: planW,
			height: planH,
			mode: viewSource === 'delta' ? 'diverging' : 'sequential',
			samples: sourceSamples,
			hull: buildSampleHull(sourceSamples)
		});
	});

	const activeSourceType = $derived(
		viewSource === 'current'
			? currentLevelType
			: viewSource === 'finished'
				? finishedLevelType
				: null
	);

	function pointDisplayValue(point: typeof data.points[number]): number | null {
		if (viewSource === 'delta') {
			const cId = currentLevelType?.id;
			const fId = finishedLevelType?.id;
			if (!cId || !fId) return null;
			const c = readingFor(point.id, cId);
			const f = readingFor(point.id, fId);
			const cVal = c?.elevation ?? (point.isBenchmark && cId === primaryLevelTypeId ? point.knownElevation : null);
			return cVal != null && f ? cVal - f.elevation : null;
		}

		const levelTypeId = activeSourceType?.id ?? null;
		const reading = readingFor(point.id, levelTypeId);
		if (reading) return reading.elevation;
		if (viewSource === 'current' && point.isBenchmark && point.knownElevation != null && levelTypeId === primaryLevelTypeId) {
			return point.knownElevation;
		}
		return null;
	}

	// ── Contour-view derivations ─────────────────────────────────────────────────
	const contourView = $derived.by<ContourView | null>(() => {
		if (viewStyle !== 'contours') return null;
		if (sourceSamples.length < 3) return null;
		return buildContourView({
			samples: sourceSamples,
			width: planW,
			height: planH,
			pxPerMetre: planScale
		});
	});

	// Slope formatter for the contour legend's "1:n" / "%" endpoints.
	function formatSlope(slope: number): { pct: string; ratio: string } {
		const pct = `${(slope * 100).toFixed(slope < 0.01 ? 2 : 1)}%`;
		const ratio = slope > 1e-6 ? `1:${(1 / slope).toFixed(slope < 0.05 ? 0 : 1)}` : 'level';
		return { pct, ratio };
	}
</script>

<svelte:window onkeydown={onKey} />

<!-- Left tool rail -->
<aside class="hidden lg:flex w-[64px] shrink-0 flex-col items-center justify-between border-r border-rule bg-paper/60 py-4">
	<div class="flex flex-col items-center gap-1">
		<span class="eyebrow rotate-180 [writing-mode:vertical-rl] mb-3 !text-[10px]">TOOLS</span>
		{#each tools as t (t.id)}
			<button
				type="button"
				title="{t.label} · {t.shortcut}"
				onclick={() => (tool = t.id)}
				class="press group relative flex h-11 w-11 items-center justify-center rounded-md border
					{tool === t.id
						? 'border-ink bg-ink text-paper'
						: 'border-transparent text-graphite hover:border-rule hover:bg-vellum hover:text-ink'}"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					{#if t.icon === 'cursor'}
						<path d="M 5 3 L 5 18 L 9 14 L 12 21 L 14 20 L 11 13 L 17 13 Z" fill="currentColor" stroke-width="1" />
					{:else if t.icon === 'point'}
						<circle cx="12" cy="10" r="3.5" />
						<path d="M 12 13.5 L 12 21 M 6 21 L 18 21" />
					{:else if t.icon === 'bench'}
						<path d="M 4 8 L 12 18 L 20 8 Z" />
						<path d="M 2 8 L 22 8" />
					{:else if t.icon === 'rule'}
						<path d="M 3 14 L 14 3 L 21 10 L 10 21 Z" />
						<path d="M 6 13 L 8 11 M 10 17 L 12 15 M 14 21 L 16 19" />
					{:else if t.icon === 'grade'}
						<path d="M 4 19 L 20 5" />
						<path d="M 4 19 L 20 19" />
						<circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none" />
						<circle cx="20" cy="5" r="1.6" fill="currentColor" stroke="none" />
					{:else if t.icon === 'line'}
						<path d="M 4 20 L 20 4" />
						<circle cx="4" cy="20" r="1.6" fill="currentColor" stroke="none" />
						<circle cx="20" cy="4" r="1.6" fill="currentColor" stroke="none" />
					{/if}
				</svg>
			</button>
		{/each}
	</div>
	<a
		href={resolve(`/projects/${data.projectId}/settings`)}
		class="press flex h-9 w-9 items-center justify-center rounded-md text-graphite hover:bg-vellum hover:text-ink"
		title="Project settings"
	>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<circle cx="12" cy="12" r="3" />
			<path d="M 12 2 L 12 5 M 12 19 L 12 22 M 4.2 4.2 L 6.3 6.3 M 17.7 17.7 L 19.8 19.8 M 2 12 L 5 12 M 19 12 L 22 12 M 4.2 19.8 L 6.3 17.7 M 17.7 6.3 L 19.8 4.2" stroke-linecap="round" />
		</svg>
	</a>
</aside>

<!-- Main canvas column -->
<section class="relative flex flex-1 flex-col overflow-hidden">
	<!-- Canvas chrome bar -->
	<div class="flex items-center justify-between gap-2 border-b border-rule bg-paper/70 px-3 py-2.5 sm:px-5">
		<div class="flex items-center gap-2 sm:gap-4 min-w-0">
			<a href={resolve('/projects')} class="press eyebrow inline-flex items-center gap-1 hover:text-ink shrink-0">
				<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M 8 2 L 4 6 L 8 10"/></svg>
				<span class="hidden sm:inline">All projects</span>
			</a>
			<span class="hairline-v h-4 hidden sm:block"></span>
			<span class="font-display text-[16px] sm:text-[18px] italic text-ink truncate max-w-[10rem] sm:max-w-[24rem]">{data.project.name}</span>
			<span class="hairline-v h-4 hidden md:block"></span>
			<span class="eyebrow hidden md:inline">Plan</span>
			<span class="font-mono text-[12px] text-ink hidden md:inline">
				{#if data.plan}{data.plan.widthPx}×{data.plan.heightPx} px{:else}Blank canvas{/if}
			</span>
			<span class="hairline-v h-4 hidden md:block"></span>
			<span class="font-mono text-[11px] text-graphite hidden md:inline">scale</span>
			<span class="font-mono text-[12px] tabular text-ink hidden md:inline">
				{#if planScale}{planScale.toFixed(2)} px / m{:else}<span class="text-accent-deep">not set</span>{/if}
			</span>
			<input
				bind:this={planFileInput}
				type="file"
				accept="image/png,image/jpeg"
				class="hidden"
				onchange={(e) => replacePlan((e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
			/>
		</div>
		<div class="flex items-center gap-2 sm:gap-3 shrink-0">
			<button
				type="button"
				onclick={() => planFileInput?.click()}
				disabled={replacingPlan}
				class="press inline-flex items-center gap-1.5 rounded-full border border-ink/30 bg-paper px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink hover:border-ink disabled:opacity-40 sm:px-3"
				title={data.plan ? 'Replace plan' : 'Upload plan'}
				aria-label={data.plan ? 'Replace plan' : 'Upload plan'}
			>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
					<path d="M 3 11.5 V 13 H 13 V 11.5" />
					<path d="M 8 10 V 3" />
					<path d="M 5.5 5.5 L 8 3 L 10.5 5.5" />
				</svg>
				<span class="hidden sm:inline">{replacingPlan ? 'Uploading' : data.plan ? 'Replace plan' : 'Upload plan'}</span>
			</button>
			{#if tool !== 'select'}
				<span class="hidden md:inline rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-accent-deep">
					{tools.find((x) => x.id === tool)?.label} armed · Esc to cancel
				</span>
			{/if}
			<!-- Panels trigger — visible until the desktop right rail kicks in -->
			<button
				type="button"
				onclick={() => (mobilePanelOpen = true)}
				class="press xl:hidden inline-flex items-center gap-1.5 rounded-full border border-ink/30 bg-paper px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink hover:border-ink"
				aria-label="Open panels"
			>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M 2 4 H 14 M 2 8 H 14 M 2 12 H 14" stroke-linecap="round"/></svg>
				<span class="hidden sm:inline">Panels</span>
			</button>
		</div>
	</div>

	<div class="relative flex-1 overflow-hidden">
		<PlanCanvas
			widthPx={planW}
			heightPx={planH}
			imageUrl={planImgUrl}
			imageOpacity={planOpacity}
			cursor={armedCursor}
			onsurfaceclick={onSurfaceClick}
			onsurfacemove={(e) => (hover = { xPx: e.xPx, yPx: e.yPx })}
			bind:scale={canvasScale}
		>
			{#snippet overlay({ scale })}
				{@const stroke = 1 / scale}
				{@const r = 6 / scale}

				<!-- Heatmap raster — IDW interpolation of selected level type -->
				{#if heatmapImage}
					<image
						href={heatmapImage.url}
						x="0"
						y="0"
						width={planW}
						height={planH}
						preserveAspectRatio="none"
						style="image-rendering: auto; mix-blend-mode: multiply;"
					/>
				{/if}

				<!-- Contour lines + direction-of-fall arrows. -->
				{#if contourView}
					{@const cv = contourView}
					{@const interval = cv.interval}
					{@const isDeltaContour = viewSource === 'delta'}
					<!-- Minor contour lines (every interval) -->
					<g
						stroke={isDeltaContour ? '#3a3a36' : '#2a2a26'}
						stroke-width={stroke * 0.6}
						stroke-opacity="0.55"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
						style="pointer-events: none;"
					>
						{#each cv.segments as seg, i (i)}
							{#if interval > 0 && Math.round(seg.level / interval) % 5 !== 0}
								<line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} />
							{/if}
						{/each}
					</g>
					<!-- Major contour lines (every 5th) -->
					<g
						stroke={isDeltaContour ? '#0f100e' : '#0f100e'}
						stroke-width={stroke * 1.4}
						stroke-opacity="0.85"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
						style="pointer-events: none;"
					>
						{#each cv.segments as seg, i (i)}
							{#if interval > 0 && Math.round(seg.level / interval) % 5 === 0}
								<line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} />
							{/if}
						{/each}
					</g>

					<!-- Fall / cut-direction arrows (skipped without plan scale). -->
					{#if cv.arrows.length > 0 && cv.slopeMax > 0}
						{@const arrowMin = 8 / scale}
						{@const arrowMax = 28 / scale}
						<g style="pointer-events: none;">
							{#each cv.arrows as a, i (i)}
								{@const len = arrowLengthPx(a.slope, cv.slopeMax, arrowMin, arrowMax)}
								{@const colour = slopeColour(a.slope, cv.slopeMax)}
								{@const tipX = a.x + a.dx * (len * 0.5)}
								{@const tipY = a.y + a.dy * (len * 0.5)}
								{@const tailX = a.x - a.dx * (len * 0.5)}
								{@const tailY = a.y - a.dy * (len * 0.5)}
								{@const headLen = Math.max(stroke * 3, len * 0.35)}
								{@const headW = headLen * 0.55}
								{@const px = -a.dy}
								{@const py = a.dx}
								{@const baseX = tipX - a.dx * headLen}
								{@const baseY = tipY - a.dy * headLen}
								<line
									x1={tailX}
									y1={tailY}
									x2={baseX}
									y2={baseY}
									stroke={colour}
									stroke-width={stroke * 1.6}
									stroke-linecap="round"
								/>
								<path
									d={`M ${tipX} ${tipY} L ${baseX + px * headW} ${baseY + py * headW} L ${baseX - px * headW} ${baseY - py * headW} Z`}
									fill={colour}
									stroke="none"
								/>
							{/each}
						</g>
					{/if}

					<!-- Contour level labels — placed at the start of every Nth major segment. -->
					{#if interval > 0}
						{@const labelStride = Math.max(1, Math.floor(cv.segments.length / 24))}
						<g style="pointer-events: none;">
							{#each cv.segments as seg, i (i)}
								{#if Math.round(seg.level / interval) % 5 === 0 && i % labelStride === 0}
									<g transform="translate({(seg.x1 + seg.x2) / 2} {(seg.y1 + seg.y2) / 2})">
										<rect
											x={-14 / scale}
											y={-6 / scale}
											width={28 / scale}
											height={12 / scale}
											rx={2 / scale}
											fill="#faf6eb"
											fill-opacity="0.85"
											stroke="#0f100e"
											stroke-opacity="0.15"
											stroke-width={stroke * 0.5}
										/>
										<text
											text-anchor="middle"
											dominant-baseline="middle"
											font-family="JetBrains Mono, monospace"
											font-size={8 / scale}
											fill="#0f100e"
										>{viewSource === 'delta'
											? seg.level.toFixed(interval < 0.1 ? 2 : interval < 1 ? 2 : 1)
											: fmtLevel(seg.level)}</text>
									</g>
								{/if}
							{/each}
						</g>
					{/if}
				{/if}

				<!-- Existing scale reference line -->
				{#if data.plan?.scaleRefAx != null && data.plan.scaleRefAy != null && data.plan.scaleRefBx != null && data.plan.scaleRefBy != null}
					<g stroke="#0f100e" stroke-width={stroke}>
						<line
							x1={data.plan.scaleRefAx}
							y1={data.plan.scaleRefAy}
							x2={data.plan.scaleRefBx}
							y2={data.plan.scaleRefBy}
							stroke-dasharray="{6 / scale} {3 / scale}"
						/>
					</g>
				{/if}

				<!-- User-drawn annotation lines. Rendered after the heatmap/contour
					 layers but before points so markers stay on top. Stroke widths are
					 scaled by zoom so a "1.5 px" line stays 1.5 device-pixels regardless
					 of zoom level. -->
				{#each data.annotationLines as ln (ln.id)}
					{@const sw = ln.strokeWidth * stroke}
					{@const dash =
						ln.style === 'dashed'
							? `${8 / scale} ${5 / scale}`
							: ln.style === 'dotted'
								? `${1.5 / scale} ${4 / scale}`
								: undefined}
					{#if selectedLineId === ln.id}
						<line
							x1={ln.ax}
							y1={ln.ay}
							x2={ln.bx}
							y2={ln.by}
							stroke="#0f100e"
							stroke-width={Math.max(sw * 1.8, stroke * 3)}
							stroke-opacity="0.18"
							stroke-linecap="round"
						/>
					{/if}
					<line
						x1={ln.ax}
						y1={ln.ay}
						x2={ln.bx}
						y2={ln.by}
						stroke={ln.colorHex}
						stroke-width={sw}
						stroke-linecap={ln.style === 'dotted' ? 'round' : 'butt'}
						stroke-dasharray={dash ?? null}
					/>
				{/each}
				<!-- Optimistic in-flight segments (drawn but not yet round-tripped). -->
				{#each pendingLines as pl (pl.key)}
					{@const sw = pl.strokeWidth * stroke}
					{@const dash =
						pl.style === 'dashed'
							? `${8 / scale} ${5 / scale}`
							: pl.style === 'dotted'
								? `${1.5 / scale} ${4 / scale}`
								: undefined}
					<line
						x1={pl.ax}
						y1={pl.ay}
						x2={pl.bx}
						y2={pl.by}
						stroke={pl.colorHex}
						stroke-width={sw}
						stroke-linecap={pl.style === 'dotted' ? 'round' : 'butt'}
						stroke-dasharray={dash ?? null}
						opacity="0.85"
					/>
				{/each}

				<!-- In-progress line preview from the chained start point to the cursor. -->
				{#if tool === 'line' && lineA}
					{@const tipX = hoverSnap?.x ?? hover?.xPx}
					{@const tipY = hoverSnap?.y ?? hover?.yPx}
					<circle cx={lineA.x} cy={lineA.y} r={r * 0.45} fill={lineSettings.colorHex} stroke="#faf6eb" stroke-width={stroke} />
					{#if tipX != null && tipY != null}
						<line
							x1={lineA.x}
							y1={lineA.y}
							x2={tipX}
							y2={tipY}
							stroke={lineSettings.colorHex}
							stroke-width={lineSettings.strokeWidth * stroke}
							stroke-opacity="0.45"
							stroke-dasharray="{4 / scale} {3 / scale}"
						/>
					{/if}
				{/if}

				<!-- Snap indicator — small mark at the active snap target, only
					 while a relevant tool is armed and snap is on. Different glyph
					 per kind so the user can see what they're snapping to. -->
				{#if hoverSnap}
					{@const sx = hoverSnap.x}
					{@const sy = hoverSnap.y}
					{@const sz = 7 / scale}
					<g pointer-events="none">
						{#if hoverSnap.kind === 'point'}
							<circle cx={sx} cy={sy} r={sz} fill="none" stroke="#1f5b41" stroke-width={stroke * 1.6} />
							<circle cx={sx} cy={sy} r={sz * 1.6} fill="none" stroke="#1f5b41" stroke-width={stroke * 0.8} stroke-dasharray="{2 / scale} {2 / scale}" />
						{:else if hoverSnap.kind === 'endpoint'}
							<rect x={sx - sz} y={sy - sz} width={sz * 2} height={sz * 2} fill="none" stroke="#1f5b41" stroke-width={stroke * 1.6} />
						{:else}
							<!-- midpoint: triangle -->
							<path
								d={`M ${sx} ${sy - sz} L ${sx + sz} ${sy + sz * 0.7} L ${sx - sz} ${sy + sz * 0.7} Z`}
								fill="none"
								stroke="#1f5b41"
								stroke-width={stroke * 1.6}
							/>
						{/if}
					</g>
				{/if}

				<!-- In-progress scale capture -->
				{#if scaleA}
					<circle cx={scaleA.x} cy={scaleA.y} r={r * 0.6} fill="#e5532d" stroke="#0f100e" stroke-width={stroke} />
				{/if}
				{#if scaleA && scaleB}
					<line x1={scaleA.x} y1={scaleA.y} x2={scaleB.x} y2={scaleB.y} stroke="#e5532d" stroke-width={stroke * 1.5} />
					<circle cx={scaleB.x} cy={scaleB.y} r={r * 0.6} fill="#e5532d" stroke="#0f100e" stroke-width={stroke} />
				{/if}

				<!-- Active session benchmark halo -->
				{#if activeSession}
					{@const bm = data.points.find((p) => p.id === activeSession.benchmarkPointId)}
					{#if bm}
						<circle
							cx={bm.xPx}
							cy={bm.yPx}
							r={r * 1.8}
							fill="none"
							stroke="#2e7d5b"
							stroke-width={stroke * 1.2}
							stroke-dasharray="{2 / scale} {2 / scale}"
						/>
					{/if}
				{/if}

				<!-- Grade tool: line + halos for the picked points -->
				{#if gradePointA}
					<circle
						cx={gradePointA.xPx}
						cy={gradePointA.yPx}
						r={r * 1.7}
						fill="none"
						stroke="#0f100e"
						stroke-width={stroke * 1.4}
					/>
					<text
						x={gradePointA.xPx}
						y={gradePointA.yPx - r * 2.0}
						text-anchor="middle"
						font-family="JetBrains Mono, monospace"
						font-size={9 / scale}
						font-weight="500"
						fill="#0f100e"
					>A</text>
				{/if}
				{#if gradePointB}
					<circle
						cx={gradePointB.xPx}
						cy={gradePointB.yPx}
						r={r * 1.7}
						fill="none"
						stroke="#0f100e"
						stroke-width={stroke * 1.4}
					/>
					<text
						x={gradePointB.xPx}
						y={gradePointB.yPx - r * 2.0}
						text-anchor="middle"
						font-family="JetBrains Mono, monospace"
						font-size={9 / scale}
						font-weight="500"
						fill="#0f100e"
					>B</text>
				{/if}
				{#if gradePointA && gradePointB}
					<line
						x1={gradePointA.xPx}
						y1={gradePointA.yPx}
						x2={gradePointB.xPx}
						y2={gradePointB.yPx}
						stroke="#0f100e"
						stroke-width={stroke * 1.6}
						stroke-dasharray="{4 / scale} {3 / scale}"
					/>
				{/if}

				<!-- Points -->
				{#each data.points as p (p.id)}
					{@const isSel = selectedPointId === p.id}
					{@const displayValue = pointDisplayValue(p)}
					<g transform="translate({p.xPx} {p.yPx})">
						{#if p.isBenchmark}
							<path d={`M ${-r} ${-r * 0.9} L 0 ${r * 0.7} L ${r} ${-r * 0.9} Z`} fill="#0f100e" />
							<path d={`M ${-r * 1.3} ${-r * 0.9} L ${r * 1.3} ${-r * 0.9}`} stroke="#0f100e" stroke-width={stroke * 1.2} />
						{:else}
							<circle r={r * 0.55} fill="#e5532d" stroke="#0f100e" stroke-width={stroke} />
						{/if}
						{#if isSel}
							<circle r={r * 1.4} fill="none" stroke="#0f100e" stroke-width={stroke} stroke-dasharray="{3 / scale} {2 / scale}" />
						{/if}
						<text
							x={r * 1.4}
							y={-r * 0.4}
							font-family="JetBrains Mono, monospace"
							font-size={9 / scale}
							fill="#6e6a5c"
						>{p.label}</text>
						{#if displayValue != null}
							<text
								x={r * 1.4}
								y={r * 1.0}
								font-family="JetBrains Mono, monospace"
								font-size={11 / scale}
								fill={viewSource === 'delta' ? (displayValue > 0 ? '#b6361a' : displayValue < 0 ? '#1f5b41' : '#0f100e') : '#0f100e'}
							>{viewSource === 'delta' ? formatDelta(displayValue) : fmtLevel(displayValue)}</text>
						{/if}
					</g>
				{/each}
			{/snippet}
		</PlanCanvas>

		<!-- First-run guidance — fades when the project has any points -->
		{#if data.points.length === 0 && tool === 'select' && !pendingPoint && !sessionDraft}
			<div class="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[min(420px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink/15 bg-paper/90 p-6 text-center backdrop-blur-sm shadow-[0_2px_18px_-8px_rgba(15,16,14,0.25)]">
				<p class="eyebrow">Empty plan</p>
				<h2 class="mt-2 font-display text-[1.6rem] italic leading-tight text-ink">
					Drop your first benchmark.
				</h2>
				<p class="mt-2 font-body text-[13px] leading-relaxed text-ink-2">
					Pick the <span class="font-mono text-[12px] uppercase">Add benchmark</span> tool
					(<span class="font-mono">B</span>), click the spot on the plan, and enter its known
					elevation. Once a benchmark exists you can start a session and log readings.
				</p>
				<div class="pointer-events-auto mt-4 flex flex-wrap items-center justify-center gap-2">
					<button
						type="button"
						onclick={() => (tool = 'bench')}
						class="press inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-paper hover:bg-ink-2"
					>Add benchmark</button>
					<button
						type="button"
						onclick={() => (tool = 'point')}
						class="press inline-flex items-center gap-2 rounded-full border border-ink/30 bg-paper px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-ink hover:border-ink"
					>Add a plain point</button>
				</div>
				{#if !planScale && data.plan}
					<p class="mt-3 font-mono text-[11px] text-warning">
						Tip — set the plan scale (<span class="font-mono">S</span>) before measuring distance or grade.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Coordinate + live-elevation readout -->
		{#if hover}
			<div class="pointer-events-none absolute bottom-4 right-4 rounded border border-rule bg-paper/85 px-3 py-1.5 font-mono text-[11px] text-ink">
				<div>
					x <span class="tabular text-graphite">{hover.xPx.toFixed(1)}</span>
					· y <span class="tabular text-graphite">{hover.yPx.toFixed(1)}</span>
					· px
				</div>
				{#if hoverCurrent != null || hoverFinished != null}
					<div class="mt-0.5 flex items-center gap-2">
						{#if hoverCurrent != null && currentLevelType}
							<span class="text-graphite">{currentLevelType.code}</span>
							<span class="tabular text-ink">{fmtLevel(hoverCurrent)}</span>
						{/if}
						{#if hoverCurrent != null && hoverFinished != null}
							<span class="text-graphite/40">·</span>
						{/if}
						{#if hoverFinished != null && finishedLevelType}
							<span class="text-graphite">{finishedLevelType.code}</span>
							<span class="tabular text-ink">{fmtLevel(hoverFinished)}</span>
						{/if}
					</div>
					{#if hoverCurrent != null && hoverFinished != null}
						{@const d = hoverCurrent - hoverFinished}
						<div class="mt-0.5 flex items-center gap-2">
							<span class="text-graphite">Δ</span>
							<span class="tabular {d > 0 ? 'text-accent-deep' : d < 0 ? 'text-signal-deep' : 'text-ink'}">
								{formatDelta(d)}
							</span>
							<span class="text-graphite/70 text-[10px] uppercase tracking-wider">
								{d > 0 ? 'cut' : d < 0 ? 'fill' : 'level'}
							</span>
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Heatmap legend -->
		{#if heatmapImage}
			{@const labelType = activeSourceType}
			{@const isDelta = viewSource === 'delta'}
			{@const ext = heatmapImage.divergingExtent}
			<!-- In Relative mode the gradient stays elevation-coloured (green=high
				 ground, red=low ground), but the staff-reading numbers run the
				 other way (rod-low at high ground). Flip the gradient direction
				 so the smaller displayed number always sits on the left. Delta is
				 immune — it's a difference, not an elevation. -->
			{@const flipGradient = isRelative && !isDelta}
			{@const tickLeft = isDelta ? -ext : (flipGradient ? heatmapImage.max : heatmapImage.min)}
			{@const tickRight = isDelta ? ext : (flipGradient ? heatmapImage.min : heatmapImage.max)}
			<div class="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-ink/15 bg-paper/95 px-3 py-2.5 backdrop-blur-sm shadow-[0_2px_18px_-8px_rgba(15,16,14,0.25)]">
				<div class="flex items-center gap-2">
					<span class="eyebrow !text-[10px]">Heatmap · {viewSources.find((v) => v.id === viewSource)?.label}</span>
					{#if isDelta && currentLevelType && finishedLevelType}
						<span class="font-mono text-[10px] text-graphite">{currentLevelType.code} − {finishedLevelType.code}</span>
					{:else if labelType}
						<span class="font-mono text-[10px] text-graphite">{labelType.code} · {labelType.name}</span>
					{/if}
				</div>
				<div class="mt-2 flex items-center gap-2">
					<span class="font-mono text-[10px] tabular text-ink w-14 text-right">
						{#if isDelta}{formatDelta(tickLeft)}{:else}{fmtLevel(tickLeft)}{/if}
					</span>
					<div
						class="h-2 w-40 rounded-full border border-ink/10"
						style="background: linear-gradient(to {flipGradient ? 'left' : 'right'}, {isDelta
							? '#1f5b41 0%, rgba(250,246,235,0.6) 50%, #b6361a 100%'
							: '#1f5b41 0%, #c79400 50%, #b6361a 100%'});"
					></div>
					<span class="font-mono text-[10px] tabular text-ink w-14">
						{#if isDelta}{formatDelta(tickRight)}{:else}{fmtLevel(tickRight)}{/if}
					</span>
					<span class="font-mono text-[10px] text-graphite">mm</span>
				</div>
				{#if isDelta}
					<p class="mt-1 font-mono text-[10px] text-graphite">
						<span class="text-signal-deep">fill</span> · level · <span class="text-accent-deep">cut</span>
					</p>
				{/if}
			</div>
		{/if}

		<!-- Contour legend -->
		{#if contourView}
			{@const cv = contourView}
			{@const labelType = activeSourceType}
			{@const isDeltaContour = viewSource === 'delta'}
			{@const slopeFmt = formatSlope(cv.slopeMax)}
			<div class="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-ink/15 bg-paper/95 px-3 py-2.5 backdrop-blur-sm shadow-[0_2px_18px_-8px_rgba(15,16,14,0.25)]">
				<div class="flex items-center gap-2">
					<span class="eyebrow !text-[10px]">Contours · {viewSources.find((v) => v.id === viewSource)?.label}</span>
					{#if isDeltaContour && currentLevelType && finishedLevelType}
						<span class="font-mono text-[10px] text-graphite">{currentLevelType.code} − {finishedLevelType.code}</span>
					{:else if labelType}
						<span class="font-mono text-[10px] text-graphite">{labelType.code} · {labelType.name}</span>
					{/if}
				</div>
				<p class="mt-1.5 font-mono text-[10px] text-ink">
					Contours every <span class="tabular">{fmtMm(cv.interval)}</span> mm
				</p>
				{#if planScale && cv.slopeMax > 0}
					<div class="mt-2 flex items-center gap-2">
						<span class="font-mono text-[10px] tabular text-graphite w-10 text-right">flat</span>
						<div
							class="h-2 w-32 rounded-full border border-ink/10"
							style="background: linear-gradient(to right, #1f5b41 0%, #c79400 50%, #b6361a 100%);"
						></div>
						<span class="font-mono text-[10px] tabular text-ink">{slopeFmt.pct}</span>
					</div>
					<p class="mt-1 font-mono text-[10px] text-graphite">
						steepest ≈ <span class="tabular text-ink">{slopeFmt.ratio}</span>
						· {isDeltaContour ? '→ cut direction' : '→ direction of fall'}
					</p>
				{:else if !planScale}
					<p class="mt-1 font-mono text-[10px] text-warning">
						Set plan scale to render fall arrows.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Grade tool HUD -->
		{#if tool === 'grade'}
			<div class="absolute left-1/2 top-4 -translate-x-1/2 w-[min(540px,90vw)] rounded-lg border border-ink/15 bg-paper/95 px-4 py-3 backdrop-blur-sm shadow-[0_2px_18px_-8px_rgba(15,16,14,0.25)]">
				<div class="flex items-baseline justify-between">
					<p class="eyebrow">Measure grade</p>
					<button
						type="button"
						onclick={resetGrade}
						class="press font-mono text-[10px] uppercase tracking-wider text-graphite hover:text-accent-deep"
					>Reset</button>
				</div>

				{#if !planScale}
					<p class="mt-1 font-mono text-[11px] text-warning">
						Plan scale not set yet — distance and grade can't be computed.
						<button
							type="button"
							onclick={() => (tool = 'scale')}
							class="press underline hover:text-ink"
						>Set scale</button>.
					</p>
				{:else if !gradeA}
					<p class="mt-1 font-mono text-[12px] text-ink">
						Tap the first point on the canvas. Both points need an elevation (primary reading or benchmark).
					</p>
				{:else if !gradeB}
					<p class="mt-1 font-mono text-[12px] text-ink">
						Tap the second point. Selected <span class="font-bold">A</span>: {gradePointA?.label}
						{#if gradeReadout?.elevA != null}<span class="text-graphite">· <span class="tabular">{fmtLevel(gradeReadout.elevA)}</span> mm</span>{:else}<span class="text-warning">· no elevation</span>{/if}
					</p>
				{:else if gradeReadout}
					<!-- In Relative mode the rendered elevations are HI − elev, so
						 Δ and grade flip sign for internal consistency. The cut/fill
						 arrow direction follows from the same flipped numbers, so
						 the user sees a self-consistent readout. -->
					{@const elevADisp = gradeReadout.elevA != null ? toDisplayLevel(gradeReadout.elevA, displayMode, hi) : null}
					{@const elevBDisp = gradeReadout.elevB != null ? toDisplayLevel(gradeReadout.elevB, displayMode, hi) : null}
					{@const deltaDisp = elevADisp != null && elevBDisp != null ? elevBDisp - elevADisp : null}
					{@const gradeDisp =
						deltaDisp != null && gradeReadout.distanceMetres
							? calculateGrade(elevADisp!, elevBDisp!, gradeReadout.distanceMetres)
							: null}
					<div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
						<div>
							<p class="eyebrow !text-[9px]">A · {gradeReadout.a.label}</p>
							<p class="font-mono text-[13px] tabular text-ink mt-0.5">
								{#if gradeReadout.elevA != null}{fmtLevel(gradeReadout.elevA)} <span class="text-[10px] text-graphite">mm</span>{:else}<span class="text-warning">—</span>{/if}
							</p>
						</div>
						<div>
							<p class="eyebrow !text-[9px]">B · {gradeReadout.b.label}</p>
							<p class="font-mono text-[13px] tabular text-ink mt-0.5">
								{#if gradeReadout.elevB != null}{fmtLevel(gradeReadout.elevB)} <span class="text-[10px] text-graphite">mm</span>{:else}<span class="text-warning">—</span>{/if}
							</p>
						</div>
						<div>
							<p class="eyebrow !text-[9px]">Distance</p>
							<p class="font-mono text-[13px] tabular text-ink mt-0.5">
								{#if gradeReadout.distanceMetres != null}{gradeReadout.distanceMetres.toFixed(3)} <span class="text-[10px] text-graphite">m</span>{:else}<span class="text-warning">—</span>{/if}
							</p>
						</div>
						<div>
							<p class="eyebrow !text-[9px]">Δ height (B−A)</p>
							<p class="font-mono text-[13px] tabular text-ink mt-0.5">
								{#if deltaDisp != null}
									{formatDelta(deltaDisp)} <span class="text-[10px] text-graphite">mm</span>
								{:else}<span class="text-warning">—</span>{/if}
							</p>
						</div>
					</div>
					{#if gradeDisp}
						{@const g = gradeDisp}
						<div class="mt-3 flex items-baseline justify-between rounded border border-rule/70 bg-vellum/70 px-3 py-2">
							<span class="eyebrow">Grade</span>
							<div class="flex items-baseline gap-4">
								<span class="font-display text-2xl tabular text-ink">
									{g.percent >= 0 ? '+' : ''}{g.percent.toFixed(2)}<span class="font-mono text-[11px] text-graphite ml-1">%</span>
								</span>
								<span class="font-mono text-[12px] tabular text-graphite">
									{#if Math.abs(g.ratio) < 1e-9}
										level
									{:else}
										1 : {(1 / Math.abs(g.ratio)).toFixed(1)} {g.ratio < 0 ? '↓' : '↑'}
									{/if}
								</span>
							</div>
						</div>
					{:else}
						<p class="mt-3 font-mono text-[11px] text-warning">
							{#if gradeReadout.elevA == null || gradeReadout.elevB == null}
								Both points need an elevation reading to compute grade.
							{:else if gradeReadout.distanceMetres === 0}
								Both points sit on top of each other — no horizontal distance.
							{/if}
						</p>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Annotation-line HUD. Surfaces the same colour/style/width pickers
			 used while drawing AND while editing a previously-drawn line, so
			 surveyors don't context-switch into a modal to tweak markup. -->
		{#if tool === 'line' || selectedLine}
			{@const editing = !!selectedLine}
			<div class="absolute left-1/2 top-4 z-30 -translate-x-1/2 w-[min(640px,94vw)] rounded-lg border border-ink/15 bg-paper/95 px-4 py-3 backdrop-blur-sm shadow-[0_2px_18px_-8px_rgba(15,16,14,0.25)]" data-canvas-chrome>
				<div class="flex items-center justify-between gap-3">
					<p class="eyebrow shrink-0">{editing ? 'Edit line' : lineA ? 'Drawing · click to extend' : 'Draw line · click to start'}</p>
					<div class="flex items-center gap-1.5">
						{#if editing}
							<button
								type="button"
								onclick={deleteSelectedLine}
								class="press rounded-full border border-accent-deep/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-accent-deep hover:bg-accent-deep/10"
							>Delete</button>
							<button
								type="button"
								onclick={() => (selectedLineId = null)}
								class="press rounded-full bg-ink px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-paper"
							>Done</button>
						{:else}
							{#if lineA}
								<button
									type="button"
									onclick={() => (lineA = null)}
									class="press rounded-full border border-rule px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-graphite hover:text-ink"
									title="Stop the current chain (Esc)"
								>Stop</button>
							{/if}
							<button
								type="button"
								onclick={() => (tool = 'select')}
								class="press rounded-full bg-ink px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-paper"
							>Done</button>
						{/if}
					</div>
				</div>

				<div class="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
					<!-- Colour -->
					<div class="flex items-center gap-1.5">
						<span class="eyebrow !text-[10px] hidden sm:inline">Colour</span>
						{#each linePalette as c (c)}
							<button
								type="button"
								aria-label="Use colour {c}"
								title={c}
								onclick={() => {
									lineSettings = { ...lineSettings, colorHex: c };
									if (editing) applySelectedLineSettings();
								}}
								class="press h-5 w-5 rounded-full border-2 transition-colors
									{lineSettings.colorHex === c ? 'border-ink' : 'border-rule hover:border-ink/40'}"
								style="background-color: {c};"
							></button>
						{/each}
					</div>

					<!-- Style -->
					<div class="flex items-center gap-1.5">
						<span class="eyebrow !text-[10px] hidden sm:inline">Style</span>
						<div class="inline-flex rounded-full border border-rule bg-paper/80 p-0.5">
							{#each ['solid', 'dashed', 'dotted'] as s (s)}
								<button
									type="button"
									onclick={() => {
										lineSettings = { ...lineSettings, style: s as LineStyle };
										if (editing) applySelectedLineSettings();
									}}
									class="press rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider
										{lineSettings.style === s ? 'bg-ink text-paper' : 'text-graphite hover:text-ink'}"
								>{s}</button>
							{/each}
						</div>
					</div>

					<!-- Stroke -->
					<div class="flex items-center gap-1.5">
						<span class="eyebrow !text-[10px] hidden sm:inline">Stroke</span>
						<div class="inline-flex rounded-full border border-rule bg-paper/80 p-0.5">
							{#each lineStrokeOptions as w (w)}
								<button
									type="button"
									onclick={() => {
										lineSettings = { ...lineSettings, strokeWidth: w };
										if (editing) applySelectedLineSettings();
									}}
									class="press rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider
										{Math.abs(lineSettings.strokeWidth - w) < 1e-3 ? 'bg-ink text-paper' : 'text-graphite hover:text-ink'}"
								>{w === 1 ? 'Thin' : w === 1.5 ? 'Med' : 'Thick'}</button>
							{/each}
						</div>
					</div>

					<!-- Inline live preview -->
					<svg viewBox="0 0 120 16" class="h-4 w-24 shrink-0">
						<line
							x1="2"
							y1="8"
							x2="118"
							y2="8"
							stroke={lineSettings.colorHex}
							stroke-width={lineSettings.strokeWidth}
							stroke-linecap={lineSettings.style === 'dotted' ? 'round' : 'butt'}
							stroke-dasharray={lineSettings.style === 'dashed'
								? '8 5'
								: lineSettings.style === 'dotted'
									? '1.5 4'
									: undefined}
						/>
					</svg>
				</div>

				{#if !editing}
					<p class="mt-1.5 font-mono text-[10px] text-graphite">
						Each click drops a segment endpoint and starts the next from there. <span class="text-ink">Esc</span> ends the chain.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Scale capture HUD -->
		{#if tool === 'scale'}
			<div class="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-ink/15 bg-paper/95 px-4 py-3 backdrop-blur-sm shadow-[0_2px_18px_-8px_rgba(15,16,14,0.25)]">
				<p class="eyebrow">Set scale</p>
				{#if !scaleA}
					<p class="mt-1 font-mono text-[12px] text-ink">Click the first end of a known reference on the plan.</p>
				{:else if !scaleB}
					<p class="mt-1 font-mono text-[12px] text-ink">Click the second end of the reference.</p>
				{:else}
					{@const dxp = scaleB.x - scaleA.x}
					{@const dyp = scaleB.y - scaleA.y}
					{@const pxLen = Math.hypot(dxp, dyp)}
					<div class="mt-2 flex items-center gap-3">
						<span class="font-mono text-[11px] text-graphite">{pxLen.toFixed(1)} px =</span>
						<input
							type="number"
							inputmode="decimal"
							step="0.001"
							min="0.001"
							bind:value={scaleMetres}
							placeholder="metres"
							class="w-28 border-b-2 border-ink/30 bg-transparent pb-1 text-right font-mono text-sm text-ink focus:border-accent focus:outline-none"
						/>
						<span class="font-mono text-[11px] text-graphite">m</span>
						<button
							type="button"
							onclick={confirmScale}
							disabled={busy}
							class="press rounded-full bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper disabled:opacity-40"
						>Save</button>
						<button
							type="button"
							onclick={cancelScale}
							class="press font-mono text-[10px] uppercase tracking-wider text-graphite hover:text-accent-deep"
						>Reset</button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- New point modal -->
		{#if pendingPoint}
			<div class="absolute inset-0 z-40 flex items-center justify-center bg-ink/20 p-4">
				<div class="w-full max-w-sm rounded-xl border border-ink/15 bg-paper p-5 shadow-[0_24px_60px_-30px_rgba(15,16,14,0.35)]">
					<p class="eyebrow">{pendingPoint.isBenchmark ? 'New benchmark' : 'New point'}</p>
					<p class="mt-1 font-mono text-[11px] text-graphite">
						x <span class="tabular text-ink">{pendingPoint.x.toFixed(1)}</span>
						· y <span class="tabular text-ink">{pendingPoint.y.toFixed(1)}</span>
					</p>

					<label class="mt-4 block">
						<span class="eyebrow">Label</span>
						<input
							type="text"
							bind:value={pendingLabel}
							maxlength="40"
							class="mt-1 w-full border-b-2 border-ink/30 bg-transparent pb-1 font-mono text-sm text-ink focus:border-accent focus:outline-none"
						/>
					</label>

					{#if pendingPoint.isBenchmark}
						<label class="mt-4 block">
							<span class="eyebrow">Known elevation (mm)</span>
							<input
								type="number"
								inputmode="decimal"
								step="1"
								bind:value={pendingElevation}
								placeholder="e.g. 12000"
								class="mt-1 w-full border-b-2 border-ink/30 bg-transparent pb-1 font-mono text-sm text-ink focus:border-accent focus:outline-none"
							/>
						</label>
					{/if}

					<div class="mt-6 flex items-center justify-end gap-2">
						<button
							type="button"
							onclick={cancelPending}
							class="press rounded-full border border-rule px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink hover:bg-vellum"
						>Cancel</button>
						<button
							type="button"
							onclick={confirmCreatePoint}
							disabled={busy}
							class="press rounded-full bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper disabled:opacity-40"
						>Save</button>
					</div>
				</div>
			</div>
		{/if}


		<!-- Start session modal -->
		{#if sessionDraft}
			<div class="absolute inset-0 z-40 flex items-center justify-center bg-ink/20 p-4">
				<div class="w-full max-w-md rounded-xl border border-ink/15 bg-paper p-5 shadow-[0_24px_60px_-30px_rgba(15,16,14,0.35)]">
					<p class="eyebrow">Start level session</p>
					<p class="mt-1 font-mono text-[11px] text-graphite">
						Pick the benchmark you sighted and enter the staff reading to derive instrument height.
					</p>

					<label class="mt-4 block">
						<span class="eyebrow">Benchmark</span>
						<select
							bind:value={sessionDraft.benchmarkPointId}
							class="mt-1 w-full border-b-2 border-ink/30 bg-transparent pb-1 font-mono text-sm text-ink focus:border-accent focus:outline-none"
						>
							{#each benchmarks as bm (bm.id)}
								<option value={bm.id}>{bm.label} · {bm.knownElevation != null ? fmtMm(bm.knownElevation) : '—'} mm</option>
							{/each}
						</select>
					</label>

					<label class="mt-4 block">
						<span class="eyebrow">Staff reading at benchmark (mm)</span>
						<input
							type="number"
							inputmode="decimal"
							step="1"
							min="0"
							bind:value={sessionDraft.staffReading}
							placeholder="e.g. 1420"
							class="mt-1 w-full border-b-2 border-ink/30 bg-transparent pb-1 font-mono text-sm text-ink focus:border-accent focus:outline-none"
						/>
					</label>

					<label class="mt-4 block">
						<span class="eyebrow">Note (optional)</span>
						<input
							type="text"
							maxlength="500"
							bind:value={sessionDraft.note}
							placeholder="e.g. instrument over north corner"
							class="mt-1 w-full border-b-2 border-ink/30 bg-transparent pb-1 font-mono text-sm text-ink focus:border-accent focus:outline-none"
						/>
					</label>

					<div class="mt-5 rounded-md border border-rule/70 bg-vellum/70 px-3 py-2">
						<div class="flex items-baseline justify-between">
							<span class="eyebrow">Instrument height</span>
							<span class="font-mono text-lg tabular text-ink">
								{#if previewHi != null}{fmtMm(previewHi)}<span class="text-[11px] text-graphite ml-1">mm</span>{:else}<span class="text-graphite italic">—</span>{/if}
							</span>
						</div>
					</div>

					<div class="mt-6 flex items-center justify-end gap-2">
						<button
							type="button"
							onclick={closeSessionModal}
							class="press rounded-full border border-rule px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink hover:bg-vellum"
						>Cancel</button>
						<button
							type="button"
							onclick={confirmStartSession}
							disabled={busy || previewHi == null}
							class="press rounded-full bg-signal-deep px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper disabled:opacity-40"
						>Start session</button>
					</div>
				</div>
			</div>
		{/if}

		{#if err}
			<div class="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-accent-deep/30 bg-paper/90 px-3 py-2 font-mono text-[11px] text-accent-deep">
				{err}
				<button
					type="button"
					onclick={() => (err = null)}
					class="ml-3 underline"
				>dismiss</button>
			</div>
		{/if}
	</div>

	<!-- Canvas footer — display + interaction controls live below the canvas
		so the top chrome can stay quiet. Source/View toggle the raster output,
		Snap arms the line/scale tools, Show flips between absolute RL and the
		expected staff reading, and the slider fades the plan underlay. -->
	<div class="flex flex-col gap-1.5 border-t border-rule bg-paper/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
		<div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 sm:flex-nowrap sm:justify-start sm:gap-3 sm:shrink-0">
			<!-- Source segmented control (Current / Finished / Delta) -->
			<div class="flex items-center gap-1">
				<span class="eyebrow !text-[10px] hidden lg:inline">Source</span>
				<div class="inline-flex rounded-full border border-rule bg-paper/80 p-0.5">
					{#each viewSources as s (s.id)}
						{@const count =
							s.id === 'current'
								? currentSamples.length
								: s.id === 'finished'
									? finishedSamples.length
									: deltaSamples.length}
						{@const dis = count === 0}
						{@const inert = viewStyle === 'points'}
						{@const sourceCode =
							s.id === 'current' && currentLevelType
								? currentLevelType.code
								: s.id === 'finished' && finishedLevelType
									? finishedLevelType.code
									: s.id === 'delta' && currentLevelType && finishedLevelType
										? `${currentLevelType.code} − ${finishedLevelType.code}`
										: null}
						<button
							type="button"
							onclick={() => (viewSource = s.id)}
							disabled={dis}
							title={dis
								? `No ${s.label.toLowerCase()} readings yet`
								: inert
									? `${s.label}${sourceCode ? ` · ${sourceCode}` : ''} (pick Heatmap or Contours)`
									: `${s.label}${sourceCode ? ` · ${sourceCode}` : ''}`}
							class="press rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider
								{viewSource === s.id
									? inert
										? 'bg-ink/30 text-paper'
										: 'bg-ink text-paper'
									: dis
										? 'text-graphite/40 cursor-not-allowed'
										: 'text-graphite hover:text-ink'}"
						>{s.label}</button>
					{/each}
				</div>
			</div>

			<!-- View-style segmented control (Points / Heatmap / Contours) -->
			<div class="flex items-center gap-1">
				<span class="eyebrow !text-[10px] hidden lg:inline">View</span>
				<div class="inline-flex rounded-full border border-rule bg-paper/80 p-0.5">
					{#each viewStyles as v (v.id)}
						{@const need = v.id === 'contours' ? 3 : v.id === 'heatmap' ? 1 : 0}
						{@const dis = v.id !== 'points' && sourceSamples.length < need}
						{@const tip =
							v.id === 'points'
								? 'Show the markers only'
								: dis
									? v.id === 'contours'
										? `Need at least 3 ${viewSource} readings`
										: `No ${viewSource} readings yet`
									: v.id === 'heatmap'
										? `IDW heatmap of the selected source`
										: !planScale
											? `Contour lines · arrows hidden until scale is set`
											: `Contour lines + ${viewSource === 'delta' ? 'cut-direction' : 'fall-direction'} arrows`}
						<button
							type="button"
							onclick={() => (viewStyle = v.id)}
							disabled={dis}
							title={tip}
							class="press rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider
								{viewStyle === v.id
									? 'bg-ink text-paper'
									: dis
										? 'text-graphite/40 cursor-not-allowed'
										: 'text-graphite hover:text-ink'}"
						>{v.label}</button>
					{/each}
				</div>
			</div>
		</div>

		<div class="flex items-center justify-between gap-2 sm:justify-end sm:gap-3 sm:shrink-0">
			<!-- Snap toggle — applies to the line + scale tools. Endpoints,
				 midpoints of annotation lines and any point/benchmark are eligible
				 targets. Shortcut "/" flips it without leaving the canvas. -->
			<button
				type="button"
				data-canvas-chrome
				onclick={() => (snapEnabled = !snapEnabled)}
				title={snapEnabled ? 'Snap on · / to toggle' : 'Snap off · / to toggle'}
				aria-pressed={snapEnabled}
				class="press inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider
					{snapEnabled
						? 'border-ink bg-ink text-paper'
						: 'border-rule bg-paper/80 text-graphite hover:text-ink'}"
			>
				<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4">
					<path d="M 2 6 L 6 2 L 10 6 L 6 10 Z" />
					<circle cx="6" cy="6" r="0.8" fill="currentColor" stroke="none" />
				</svg>
				<span>Snap</span>
			</button>

			<!-- Display-mode toggle — Abs / Rel (relative is HI − elevation, the
				 expected staff reading). Only active while a session is running;
				 collapses to an inert Abs pill otherwise so the surveyor can see
				 the control even when there's no HI to compare against. -->
			<div class="flex items-center gap-1" data-canvas-chrome>
				<span class="eyebrow !text-[10px] hidden lg:inline">Show</span>
				<div
					class="inline-flex rounded-full border border-rule bg-paper/80 p-0.5"
					title={activeSession
						? 'Abs = true RL · Rel = HI − elevation (staff reading)'
						: 'Start a session to switch to relative (staff-reading) display'}
				>
					<button
						type="button"
						onclick={() => (displayMode = 'absolute')}
						class="press rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider
							{displayMode === 'absolute'
								? 'bg-ink text-paper'
								: 'text-graphite hover:text-ink'}"
					>Abs</button>
					<button
						type="button"
						onclick={() => activeSession && (displayMode = 'relative')}
						disabled={!activeSession}
						class="press rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider
							{displayMode === 'relative'
								? 'bg-ink text-paper'
								: !activeSession
									? 'text-graphite/40 cursor-not-allowed'
									: 'text-graphite hover:text-ink'}"
					>Rel</button>
				</div>
			</div>

			<!-- Plan-image opacity slider — only meaningful when a plan is uploaded. -->
			{#if planImgUrl}
				<div class="hidden md:flex items-center gap-1.5" data-canvas-chrome>
					<span class="eyebrow !text-[10px] hidden lg:inline">Plan</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						bind:value={planOpacity}
						oninput={onPlanOpacityChange}
						aria-label="Plan image opacity"
						title="Plan image opacity · {Math.round(planOpacity * 100)}%"
						class="h-1 w-20 cursor-pointer accent-ink"
					/>
					<span class="font-mono text-[10px] tabular text-graphite w-8">{Math.round(planOpacity * 100)}%</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Mobile tool strip — replaces the left rail below `lg`. Each button is a
		44px tap target so it stays usable with gloves on a tablet outdoors. -->
	<div class="lg:hidden flex items-center justify-between gap-1 border-t border-rule bg-paper/85 px-2 py-2 backdrop-blur-md">
		<div class="flex flex-1 items-center justify-around gap-1 overflow-x-auto">
			{#each tools as t (t.id)}
				<button
					type="button"
					onclick={() => (tool = t.id)}
					title="{t.label} · {t.shortcut}"
					aria-label={t.label}
					class="press flex h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-md px-2
						{tool === t.id
							? 'bg-ink text-paper'
							: 'text-graphite hover:bg-vellum hover:text-ink'}"
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						{#if t.icon === 'cursor'}
							<path d="M 5 3 L 5 18 L 9 14 L 12 21 L 14 20 L 11 13 L 17 13 Z" fill="currentColor" stroke-width="1" />
						{:else if t.icon === 'point'}
							<circle cx="12" cy="10" r="3.5" />
							<path d="M 12 13.5 L 12 21 M 6 21 L 18 21" />
						{:else if t.icon === 'bench'}
							<path d="M 4 8 L 12 18 L 20 8 Z" />
							<path d="M 2 8 L 22 8" />
						{:else if t.icon === 'rule'}
							<path d="M 3 14 L 14 3 L 21 10 L 10 21 Z" />
							<path d="M 6 13 L 8 11 M 10 17 L 12 15 M 14 21 L 16 19" />
						{:else if t.icon === 'grade'}
							<path d="M 4 19 L 20 5" />
							<path d="M 4 19 L 20 19" />
							<circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none" />
							<circle cx="20" cy="5" r="1.6" fill="currentColor" stroke="none" />
						{:else if t.icon === 'line'}
							<path d="M 4 20 L 20 4" />
							<circle cx="4" cy="20" r="1.6" fill="currentColor" stroke="none" />
							<circle cx="20" cy="4" r="1.6" fill="currentColor" stroke="none" />
						{/if}
					</svg>
					<span class="mt-0.5 font-mono text-[9px] uppercase tracking-wider">{t.label.split(' ')[0]}</span>
				</button>
			{/each}
		</div>
		<a
			href={resolve(`/projects/${data.projectId}/settings`)}
			class="press flex h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-md px-2 text-graphite hover:bg-vellum hover:text-ink"
			aria-label="Project settings"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<circle cx="12" cy="12" r="3" />
				<path d="M 12 2 L 12 5 M 12 19 L 12 22 M 4.2 4.2 L 6.3 6.3 M 17.7 17.7 L 19.8 19.8 M 2 12 L 5 12 M 19 12 L 22 12 M 4.2 19.8 L 6.3 17.7 M 17.7 6.3 L 19.8 4.2" stroke-linecap="round" />
			</svg>
			<span class="mt-0.5 font-mono text-[9px] uppercase tracking-wider">Set</span>
		</a>
	</div>
</section>

<!-- Right panel — tabs (Points / Sessions / Levels). The body is shared between
	the desktop aside (xl+) and the mobile bottom sheet via a snippet. -->
{#snippet panelTabs()}
	<div class="flex border-b border-rule">
		{#each [
			{ id: 'points', label: 'Points' },
			{ id: 'sessions', label: 'Sessions' },
			{ id: 'levels', label: 'Levels' }
		] as t (t.id)}
			<button
				type="button"
				onclick={() => (tab = t.id as Tab)}
				class="press flex-1 py-3 font-mono text-[11px] uppercase tracking-wider
					{tab === t.id ? 'bg-paper text-ink border-b-2 border-accent -mb-px' : 'text-graphite hover:text-ink'}"
			>{t.label}</button>
		{/each}
	</div>
{/snippet}

{#snippet panelBody()}

	{#if tab === 'points'}
		<div class="flex items-center justify-between px-4 py-3 border-b border-rule/60">
			<span class="eyebrow">{data.points.length} entries</span>
			<button
				type="button"
				onclick={() => (tool = 'point')}
				class="press inline-flex items-center gap-1 rounded border border-ink/15 bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink hover:border-ink/40"
			>
				<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M 6 2 V 10 M 2 6 H 10" /></svg>
				New
			</button>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if data.points.length === 0}
				<p class="px-4 py-6 font-mono text-[11px] text-graphite">
					No points yet. Arm <span class="text-ink">Add point</span> (P) or <span class="text-ink">Add benchmark</span> (B) and click on the canvas.
				</p>
			{:else}
				<ul class="divide-y divide-rule/50">
					{#each data.points as p (p.id)}
						{@const pr = primaryReading(p.id)}
						{@const isSel = selectedPointId === p.id}
						{@const readingsCount = pointReadings.get(p.id)?.length ?? 0}
						<li class="flex items-stretch hover:bg-paper {isSel ? 'bg-paper' : ''}">
							<button
								type="button"
								onclick={() => (selectedPointId = isSel ? null : p.id)}
								class="press flex flex-1 items-center gap-3 px-4 py-3 text-left"
							>
								<span
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded font-mono text-[10px]
										{p.isBenchmark ? 'bg-ink text-paper' : 'border border-rule text-ink'}"
								>
									{#if p.isBenchmark}▽{:else}●{/if}
								</span>
								<div class="flex flex-1 flex-col leading-tight min-w-0">
									<span class="font-mono text-xs text-ink truncate">{p.label}</span>
									<span class="eyebrow !text-[10px]">
										{#if p.isBenchmark}Benchmark · {p.knownElevation != null ? fmtMm(p.knownElevation) : '—'} mm{:else}{readingsCount} {readingsCount === 1 ? 'reading' : 'readings'}{/if}
									</span>
								</div>
								<div class="text-right shrink-0">
									{#if pr}
										<span class="font-mono text-sm tabular text-ink">{fmtMm(pr.elevation)}</span>
										<span class="font-mono text-[10px] text-graphite ml-0.5">mm</span>
									{:else if !p.isBenchmark}
										<span class="font-mono text-[11px] text-graphite italic">no reading</span>
									{/if}
								</div>
							</button>
							<button
								type="button"
								onclick={() => removePoint(p.id)}
								title="Delete point"
								class="press px-3 text-graphite hover:text-accent-deep"
								aria-label="Delete {p.label}"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
									<path d="M 4 7 H 20 M 9 7 V 4 H 15 V 7 M 6 7 L 7 20 H 17 L 18 7" />
								</svg>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else if tab === 'sessions'}
		<div class="flex items-center justify-between px-4 py-3 border-b border-rule/60">
			<span class="eyebrow">{data.sessions.length} {data.sessions.length === 1 ? 'session' : 'sessions'}</span>
			{#if !activeSession}
				<button
					type="button"
					onclick={openSessionModal}
					disabled={benchmarks.length === 0}
					class="press inline-flex items-center gap-1 rounded-full border border-signal/40 bg-signal/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-signal-deep hover:bg-signal/20 disabled:opacity-40"
				>
					<span class="inline-block h-1.5 w-1.5 rounded-full bg-signal"></span>
					Start session
				</button>
			{:else}
				<button
					type="button"
					onclick={() => endSession(activeSession.id)}
					class="press inline-flex items-center gap-1 rounded-full border border-signal/40 bg-signal/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-signal-deep hover:bg-signal/20"
				>End session</button>
			{/if}
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if data.sessions.length === 0}
				<p class="px-4 py-6 font-mono text-[11px] text-graphite">
					No sessions yet. {#if benchmarks.length === 0}Drop a <span class="text-ink">benchmark</span> first, then start a session.{:else}<button class="press underline hover:text-ink" onclick={openSessionModal}>Start one</button> when the laser is set up.{/if}
				</p>
			{:else}
				<ul class="divide-y divide-rule/50">
					{#each data.sessions as s (s.id)}
						{@const isActive = s.endedAt == null}
						<li class="px-4 py-3 group">
							<div class="flex items-center justify-between">
								<span class="flex items-center gap-2">
									{#if isActive}
										<span class="laser-dot inline-block h-1.5 w-1.5 rounded-full bg-signal"></span>
										<span class="eyebrow !text-signal-deep">Active</span>
									{:else}
										<span class="inline-block h-1.5 w-1.5 rounded-full bg-graphite/40"></span>
										<span class="eyebrow">Closed</span>
									{/if}
								</span>
								<span class="font-mono text-[11px] text-graphite">{formatDateTime(s.startedAt)}</span>
							</div>
							<div class="mt-2 flex items-baseline justify-between">
								<span class="font-mono text-[11px] text-graphite">HI from {pointLabel(s.benchmarkPointId)}</span>
								<span class="font-display text-xl tabular text-ink">
									{fmtMm(s.instrumentHeight)}<span class="font-mono text-[11px] text-graphite ml-1">mm</span>
								</span>
							</div>
							{#if s.note}
								<p class="mt-1 font-mono text-[11px] text-graphite truncate">{s.note}</p>
							{/if}
							<div class="mt-2 flex items-center gap-3">
								{#if isActive}
									<button
										type="button"
										onclick={() => endSession(s.id)}
										class="press font-mono text-[10px] uppercase tracking-wider text-signal-deep hover:text-ink"
									>End</button>
								{:else}
									<button
										type="button"
										onclick={() => endSession(s.id)}
										class="press font-mono text-[10px] uppercase tracking-wider text-graphite hover:text-accent-deep"
									>Delete</button>
									{#if s.endedAt}
										<span class="font-mono text-[10px] text-graphite">ended {formatDateTime(s.endedAt)}</span>
									{/if}
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<div class="flex items-center justify-between px-4 py-3 border-b border-rule/60">
			<span class="eyebrow">{data.levelTypes.length} types</span>
			<a
				href={resolve(`/projects/${data.projectId}/settings`)}
				class="press inline-flex items-center gap-1 rounded border border-ink/15 bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink hover:border-ink/40"
			>Manage</a>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto">
			<ul class="divide-y divide-rule/50">
				{#each data.levelTypes as l (l.id)}
					<li class="flex items-center gap-3 px-4 py-3">
						<span class="h-2.5 w-2.5 rounded-sm" style="background-color: {l.colorHex}"></span>
						<div class="flex flex-1 flex-col leading-tight min-w-0">
							<span class="font-mono text-xs text-ink truncate">{l.code} · {l.name}</span>
							<span class="eyebrow !text-[10px]">{l.kind}</span>
						</div>
						{#if l.id === primaryLevelTypeId}
							<span class="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-accent-deep">primary</span>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
{/snippet}

<!-- Desktop right panel — locked open from xl up. -->
<aside class="hidden max-h-[calc(100dvh-8.25rem)] min-h-0 w-[320px] shrink-0 flex-col overflow-hidden border-l border-rule bg-vellum/70 xl:flex">
	{@render panelTabs()}
	{@render panelBody()}
</aside>

<!-- Mobile bottom sheet — same content, slid up from below xl. -->
{#if mobilePanelOpen}
	<button
		type="button"
		aria-label="Close panels"
		onclick={() => (mobilePanelOpen = false)}
		class="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[1px] xl:hidden"
	></button>
	<div
		class="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] min-h-0 flex-col rounded-t-2xl border border-ink/15 bg-vellum shadow-[0_-12px_40px_-20px_rgba(15,16,14,0.35)] xl:hidden"
	>
		<div class="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
			<span class="mx-auto block h-1 w-10 rounded-full bg-rule" aria-hidden="true"></span>
			<button
				type="button"
				onclick={() => (mobilePanelOpen = false)}
				class="press absolute right-3 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-graphite hover:bg-paper hover:text-ink"
				aria-label="Close panels"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
					<path d="M 5 5 L 19 19 M 19 5 L 5 19" />
				</svg>
			</button>
		</div>
		{@render panelTabs()}
		{@render panelBody()}
	</div>
{/if}

<!-- Point detail sheet -->
{#if selectedPoint}
	{@const list = pointReadings.get(selectedPoint.id) ?? []}
	{@const usedTypes = new Set(list.map((r) => r.levelTypeId))}
	{@const draftLt = readingDraft ? levelTypeById(readingDraft.levelTypeId) : null}
	<div
		class="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-ink/15 bg-paper shadow-[0_24px_60px_-30px_rgba(15,16,14,0.35)] xl:right-[320px]"
	>
		<header class="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
			<div class="min-w-0">
				<p class="eyebrow">{selectedPoint.isBenchmark ? 'Benchmark' : 'Point'}</p>
				<h2 class="font-display text-2xl italic text-ink truncate">{selectedPoint.label}</h2>
				<p class="mt-1 font-mono text-[11px] text-graphite">
					x <span class="tabular text-ink">{selectedPoint.xPx.toFixed(1)}</span>
					· y <span class="tabular text-ink">{selectedPoint.yPx.toFixed(1)}</span>
					· px
				</p>
			</div>
			<button
				type="button"
				onclick={() => {
					selectedPointId = null;
					readingDraft = null;
				}}
				class="press text-graphite hover:text-ink"
				aria-label="Close"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
					<path d="M 5 5 L 19 19 M 19 5 L 5 19" />
				</svg>
			</button>
		</header>

		<div class="flex-1 overflow-y-auto px-5 py-4">
			{#if selectedPoint.isBenchmark}
				<section class="mb-6 rounded-md border border-rule/70 bg-vellum/70 px-4 py-3">
					<div class="flex items-baseline justify-between">
						<span class="eyebrow">Known elevation (mm)</span>
						<input
							type="number"
							inputmode="decimal"
							step="1"
							value={selectedPoint.knownElevation != null ? fmtMm(selectedPoint.knownElevation) : ''}
							onblur={(e) => {
								const v = (e.currentTarget as HTMLInputElement).value;
								if (v.trim() !== '' && mmToMetres(v) !== selectedPoint.knownElevation) {
									updateBenchmarkElevation(selectedPoint.id, v);
								}
							}}
							class="w-32 border-b-2 border-ink/30 bg-transparent pb-1 text-right font-mono text-lg tabular text-ink focus:border-accent focus:outline-none"
						/>
						<span class="font-mono text-[11px] text-graphite">mm</span>
					</div>
					<p class="mt-1 font-mono text-[11px] text-graphite">
						True RL of this benchmark — used as the datum when starting a session here.
					</p>
				</section>
			{/if}

			<section class="mb-2 flex items-center justify-between">
				<span class="eyebrow">Readings</span>
				<span class="font-mono text-[11px] text-graphite">{list.length} {list.length === 1 ? 'entry' : 'entries'}</span>
			</section>

			{#if list.length === 0}
				<p class="font-mono text-[11px] text-graphite italic">No readings recorded for this point yet.</p>
			{:else}
				<ul class="divide-y divide-rule/50 border-y border-rule/50">
					{#each list as r (r.id)}
						{@const lt = levelTypeById(r.levelTypeId)}
						{#if lt}
							<li class="py-3 px-1">
								<div class="flex items-baseline justify-between gap-3">
									<span class="flex items-center gap-2 min-w-0">
										<span class="h-2.5 w-2.5 rounded-sm shrink-0" style="background-color: {lt.colorHex}"></span>
										<span class="font-mono text-[12px] text-ink">{lt.code}</span>
										<span class="font-mono text-[11px] text-graphite truncate">{lt.name}</span>
										{#if lt.id === primaryLevelTypeId}
											<span class="ml-1 rounded border border-accent/40 bg-accent/10 px-1 py-0 font-mono text-[9px] uppercase text-accent-deep">primary</span>
										{/if}
									</span>
									<span class="font-mono text-base tabular text-ink shrink-0">
										{fmtMm(r.elevation)}<span class="text-[11px] text-graphite ml-0.5">mm</span>
									</span>
								</div>
								<div class="mt-1 flex items-center justify-between font-mono text-[11px] text-graphite">
									<span>
										{#if lt.kind === 'measured' && r.staffReading != null}
											staff <span class="tabular text-ink">{fmtMm(r.staffReading)}</span> mm
										{:else}
											design level
										{/if}
										· {formatDateTime(r.takenAt)}
									</span>
									<span class="flex items-center gap-2">
										<button
											type="button"
											onclick={() => startReading(lt.id, r)}
											class="press uppercase tracking-wider hover:text-ink"
										>Edit</button>
										<button
											type="button"
											onclick={() => removeReading(r.id)}
											class="press uppercase tracking-wider hover:text-accent-deep"
										>Delete</button>
									</span>
								</div>
								{#if r.note}
									<p class="mt-1 font-mono text-[11px] text-graphite italic">{r.note}</p>
								{/if}
							</li>
						{/if}
					{/each}
				</ul>
			{/if}

			{#if !readingDraft}
				<section class="mt-5">
					<p class="eyebrow mb-2">Add reading</p>
					<div class="grid grid-cols-2 gap-2">
						{#each data.levelTypes as lt (lt.id)}
							{@const used = usedTypes.has(lt.id)}
							<button
								type="button"
								onclick={() => startReading(lt.id)}
								class="press flex items-center gap-2 rounded border border-rule/70 bg-vellum/70 px-3 py-2 text-left hover:border-ink/40"
							>
								<span class="h-2.5 w-2.5 rounded-sm shrink-0" style="background-color: {lt.colorHex}"></span>
								<span class="flex flex-1 flex-col leading-tight min-w-0">
									<span class="font-mono text-[12px] text-ink truncate">{lt.code}</span>
									<span class="font-mono text-[10px] text-graphite">{lt.kind}{used ? ' · replace' : ''}</span>
								</span>
							</button>
						{/each}
					</div>
					{#if measuredTypes.length > 0 && !activeSession}
						<p class="mt-3 font-mono text-[11px] text-warning">
							No active session — measured readings are disabled. <button class="underline" onclick={openSessionModal}>Start a session</button>.
						</p>
					{/if}
				</section>
			{:else if draftLt}
				<section class="mt-5 rounded-md border border-ink/15 bg-vellum/80 px-4 py-3">
					<div class="flex items-center justify-between">
						<p class="eyebrow">{readingDraft.editingId ? 'Edit reading' : 'New reading'} · {draftLt.code}</p>
						<button
							type="button"
							onclick={cancelReading}
							class="press font-mono text-[10px] uppercase tracking-wider text-graphite hover:text-ink"
						>Cancel</button>
					</div>

					<div class="mt-3 inline-flex rounded-full border border-rule bg-paper p-0.5 font-mono text-[10px] uppercase tracking-wider">
						<button type="button" onclick={() => setReadingMode('staff')} disabled={!activeSession} class={`press rounded-full px-3 py-1 ${readingDraft.mode === 'staff' ? 'bg-ink text-paper' : 'text-graphite hover:text-ink disabled:opacity-40'}`}>Staff</button>
						<button type="button" onclick={() => setReadingMode('elevation')} class={`press rounded-full px-3 py-1 ${readingDraft.mode === 'elevation' ? 'bg-ink text-paper' : 'text-graphite hover:text-ink'}`}>Elevation</button>
					</div>

					{#if readingDraft.mode === 'staff'}
						{#if !activeSession}
							<p class="mt-3 font-mono text-[11px] text-warning">
								Staff-entry readings need an active session. <button class="underline" onclick={openSessionModal}>Start one</button>.
							</p>
						{:else}
							<label class="mt-3 block">
								<span class="eyebrow">Staff reading (mm)</span>
								<input type="number" inputmode="decimal" step="1" min="0" bind:value={readingDraft.staffReading} placeholder="e.g. 1687" class="mt-1 w-full border-b-2 border-ink/30 bg-transparent pb-1 font-mono text-lg text-ink focus:border-accent focus:outline-none" />
							</label>
							<div class="mt-3 flex items-baseline justify-between rounded border border-rule/70 bg-paper/80 px-3 py-2">
								<span class="eyebrow">Reduced level</span>
								<span class="font-mono text-base tabular text-ink">{#if previewRl != null}{fmtMm(previewRl)}<span class="text-[11px] text-graphite ml-1">mm</span>{:else}<span class="text-graphite italic">—</span>{/if}</span>
							</div>
							<p class="mt-1 font-mono text-[10px] text-graphite">HI {fmtMm(activeSession.instrumentHeight)} mm − staff = RL</p>
						{/if}
					{:else}
						<label class="mt-3 block">
							<span class="eyebrow">Design elevation / RL (mm)</span>
							<input type="number" inputmode="decimal" step="1" bind:value={readingDraft.elevation} placeholder="e.g. 12350" class="mt-1 w-full border-b-2 border-ink/30 bg-transparent pb-1 font-mono text-lg text-ink focus:border-accent focus:outline-none" />
						</label>
						{#if activeSession}
							<div class="mt-3 flex items-baseline justify-between rounded border border-rule/70 bg-paper/80 px-3 py-2">
								<span class="eyebrow">Equivalent staff</span>
								<span class="font-mono text-base tabular text-ink">{#if previewStaff != null}{fmtMm(previewStaff)}<span class="text-[11px] text-graphite ml-1">mm</span>{:else}<span class="text-graphite italic">—</span>{/if}</span>
							</div>
						{/if}
					{/if}

					<label class="mt-3 block">
						<span class="eyebrow">Note (optional)</span>
						<input
							type="text"
							maxlength="500"
							bind:value={readingDraft.note}
							class="mt-1 w-full border-b-2 border-ink/30 bg-transparent pb-1 font-mono text-sm text-ink focus:border-accent focus:outline-none"
						/>
					</label>

					<div class="mt-4 flex items-center justify-end gap-2">
						<button
							type="button"
							onclick={confirmReading}
							disabled={busy || (readingDraft.mode === 'staff' && !activeSession)}
							class="press rounded-full bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper disabled:opacity-40"
						>Save reading</button>
					</div>
				</section>
			{/if}
		</div>

		<footer class="flex items-center justify-between border-t border-rule px-5 py-3">
			<button
				type="button"
				onclick={() => removePoint(selectedPoint!.id)}
				class="press inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-graphite hover:text-accent-deep"
			>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
					<path d="M 4 7 H 20 M 9 7 V 4 H 15 V 7 M 6 7 L 7 20 H 17 L 18 7" />
				</svg>
				Delete point
			</button>
			<button
				type="button"
				onclick={() => {
					const v = prompt('New label', selectedPoint!.label);
					if (v && v.trim() && v.trim() !== selectedPoint!.label) renamePoint(selectedPoint!.id, v.trim());
				}}
				class="press font-mono text-[11px] uppercase tracking-wider text-graphite hover:text-ink"
			>Rename</button>
		</footer>
	</div>
{/if}
