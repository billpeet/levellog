# LevelLog — Scope & Specification

A web app for surveyors to record laser-level readings against a site plan, manage re-leveling sessions, and visualise current vs. finished elevations.

## 1. Goals

- Replace paper field books and ad-hoc spreadsheets for level surveys.
- Make re-leveling (moving the laser, taking a fresh backsight) safe and auditable — no historical readings get silently distorted.
- Give a quick visual read of the site (heatmap, per-point cut/fill) without needing a CAD package.
- Work well on a phone/tablet on-site, and on desktop in the office.

## 2. Glossary

| Term | Meaning |
|---|---|
| **Benchmark** | A point on the plan with a known, true elevation (RL). Used to derive instrument height. |
| **Session** | A re-leveling event. A new staff reading is taken at a designated benchmark; all readings entered while the session is active are derived from that session's instrument height. |
| **Instrument Height (HI)** | `benchmark.knownElevation + benchmarkStaffReading`. The laser's collimation height. |
| **Staff reading** | The value read off the staff/rod when the laser hits it. |
| **Reduced Level (RL)** | `HI - staffReading` for a measured point. The point's true elevation. |
| **Level type** | A category of level recorded at a point: Current Level (CL), Finished Level (FL), Substrate Level (SL), Existing Ground (EGL), Damp-Proof Course (DPC), Finished Floor Level (FFL), or user-defined. |
| **Measured level** | A level type whose value comes from a staff reading taken via the laser (e.g. CL). |
| **Design level** | A level type whose value is a target elevation entered directly from drawings (e.g. FL, FFL). |
| **Display mode** | Toggle for canvas values. **Absolute** shows true RLs (the source of truth). **Relative** shows the equivalent staff reading against the active session (`HI − elevation`) — i.e. what the rod should read. Relative is only available while a session is active. |

## 3. User stories (MVP)

1. As a surveyor, I sign in with Google and land on a list of my projects.
2. I create a new project, optionally uploading a site plan (PNG, JPG, PDF page, or pasted from clipboard) — or starting on a blank canvas.
3. I set the plan scale by drawing a reference line between two features and entering the real-world distance.
4. I drop a **benchmark point** on the plan and enter its known RL (e.g. 12.000 m).
5. I start a **session**: pick a benchmark, enter the staff reading taken at it. The app computes instrument height.
6. I drop additional points around the plan and, for each, enter staff readings for one or more level types. The app computes RLs against the active session.
7. For design levels (FL, FFL, etc.), I enter the target elevation directly — no session needed.
8. I can view the plan with each point's **primary level** shown inline, tap a point to see all stored levels.
9. I can pick any two points and see distance + height delta + grade (% and ratio).
10. I can toggle a **heatmap overlay** showing current / finished / delta interpolated between known points.
11. I close a session when I move the laser. Starting a new session does not modify previously-entered readings.
12. I can edit/delete points, readings, and sessions from a side panel.
13. While a session is running, I can toggle the canvas between **Absolute** (true RLs) and **Relative** (staff-reading equivalents against the active session's HI). The toggle affects every value rendered on the canvas — point labels, hover/measure HUD, two-point delta, heatmap legend ticks, contour line labels — so I can sanity-check rod readings without arithmetic. Outside an active session the toggle is disabled and values are always Absolute.

## 4. Out of scope (v1)

- Multi-user / sharing / read-only links.
- ~~Offline / PWA / sync.~~ Phase 6 lands installable PWA + app-shell offline cache + offline fallback page; offline data sync (queued mutations, local SQLite mirror) remains out of scope.
- ~~True contour lines (Delaunay triangulation + isolines) — heatmap covers MVP need; revisit in v2.~~ Pulled forward in Phase 4.5; we extract isolines via marching squares from the existing IDW grid (no Delaunay needed).
- Volume estimation (cut/fill totals across the site).
- CSV / PDF / print export.
- Email + password / magic-link auth (Google only for v1).
- Mobile-native apps. Web only.
- GPS / true geo-referencing. Local plan grid only.

## 5. Tech stack

- **SvelteKit** (Svelte 5, runes) — full-stack, server endpoints for mutations.
- **Tailwind CSS** + **shadcn-svelte** for UI primitives.
- **Drizzle ORM** with **SQLite** (local file). Schema in `src/lib/server/db/schema.ts`.
- **BetterAuth** with the Google OAuth provider only.
- **Sharp** for server-side image processing (PDF page → PNG, EXIF strip, resize).
- **pdfjs-dist** for client-side PDF page selection preview.
- Plan canvas: SVG overlay on top of an `<img>`, transformed via CSS; pan/zoom via `svelte-pan-zoom` or hand-rolled (decide during build).
- Heatmap: client-side IDW (inverse-distance weighting) on a canvas overlay. Cheap, no triangulation library needed.
- **Hosting**: self-hosted via Dokploy from a `docker-compose.yml`. SQLite file mounted on a persistent volume. Single Node container.

## 6. Domain / data model

```
User                (BetterAuth)
 └── Project
      ├── Plan                 (image blob ref, width/height, scale: pxPerMetre, scaleRefLine)
      ├── LevelType[]          (project-scoped overrides + system defaults)
      ├── Point[]              (x, y in plan-pixel coords; label; isBenchmark; knownElevation?)
      ├── Session[]            (benchmarkPointId, benchmarkStaffReading, instrumentHeight, startedAt, endedAt)
      └── Reading[]            (pointId, levelTypeId, sessionId?, staffReading?, elevation, takenAt)
```

### 6.1 Tables (Drizzle)

**`users`**, **`accounts`**, **`sessions`**, **`verification_tokens`** — managed by BetterAuth.

**`projects`**
- `id` text pk (cuid)
- `userId` text fk → users
- `name` text
- `primaryLevelTypeId` text fk → level_types (nullable; defaults to CL on creation)
- `createdAt`, `updatedAt`

**`plans`** (1:1 with project; nullable for blank-canvas projects)
- `id`, `projectId` (unique)
- `imagePath` text — relative path under a configured uploads dir
- `mimeType`, `widthPx`, `heightPx`
- `scalePxPerMetre` real (nullable until scale is set)
- `scaleRefAx`, `scaleRefAy`, `scaleRefBx`, `scaleRefBy`, `scaleRefMetres` — to allow re-editing the scale line

**`level_types`**
- `id`, `projectId` (nullable for system defaults)
- `code` text (e.g. `CL`, `FL`)
- `name` text
- `kind` text — `'measured' | 'design'`
- `colorHex` text
- `sortOrder` int

System defaults seeded once per project on creation: CL (measured), EGL (measured), FL (design), SL (design), DPC (design), FFL (design).

**`points`**
- `id`, `projectId`
- `label` text
- `xPx`, `yPx` real
- `isBenchmark` bool
- `knownElevation` real — required when `isBenchmark = true`, else null
- `createdAt`

**`sessions`** (laser-level sessions, distinct from auth sessions — table name `level_sessions` to avoid collision)
- `id`, `projectId`
- `benchmarkPointId` fk → points
- `benchmarkStaffReading` real
- `instrumentHeight` real (computed and stored on insert)
- `note` text
- `startedAt`, `endedAt` (nullable; null = active)

**`readings`**
- `id`, `pointId`, `levelTypeId`
- `sessionId` (nullable — null for design levels)
- `staffReading` real (nullable for design levels)
- `elevation` real (source of truth; for measured = `HI - staffReading` snapshotted on insert)
- `note`, `takenAt`

Invariants:
- Exactly one active session per project (`endedAt IS NULL`).
- `(pointId, levelTypeId)` has at most one reading by default; new entries replace. (History via an audit table is v2.)
- Deleting a benchmark point with sessions referencing it is blocked unless those sessions are deleted first.

### 6.2 Computed values

- **Distance between two points**: euclidean in pixels ÷ `scalePxPerMetre`.
- **Grade**: `(elevB - elevA) / distanceMetres`; show as `%` and `1:n` (where `n = 1/grade`).
- **Heatmap value at (x,y)**: IDW over all points that have a reading for the selected level type — `Σ(wᵢ · vᵢ) / Σwᵢ` where `wᵢ = 1 / dᵢ²`.

## 7. UX / screens

1. **Sign-in** — single "Continue with Google" button.
2. **Projects dashboard** — cards: project name, plan thumbnail, last-updated, point count, active-session badge. "+ New project" button.
3. **New project flow** — name → optional plan upload (drag-drop / paste / PDF page picker / "skip — blank canvas") → land on project view.
4. **Project view** (the workhorse screen)
   - **Canvas** centre: plan image with SVG overlay showing points, scale-line, active heatmap.
   - **Top toolbar**: project name, active-session pill (with end-session button), view-mode toggle (Points / Heatmap-Current / Heatmap-Finished / Heatmap-Delta), zoom controls.
   - **Left rail (collapsible)**: tools — Add Point, Add Benchmark, Measure (grade between two points), Set Scale.
   - **Right panel (collapsible)**: tabs — Points, Sessions, Level Types.
   - **Mobile**: rails collapse into a bottom sheet; canvas fills screen.
5. **Point detail sheet** — opens when a point is tapped. Lists all readings by level type, with inline edit. "Add reading" picks a level type and prompts for staff reading (if measured + active session exists) or direct elevation (if design or no session).
6. **Start session modal** — pick benchmark, enter staff reading, optional note. Shows computed HI before confirming.
7. **Set scale modal** — instructs user to draw the line on the plan, then prompts for distance in metres.
8. **Project settings** — rename, manage custom level types, set primary level type, delete project.

### 7.1 Inline label rule

Each point renders the value of the project's **primary level type** beside the marker. Points without a reading for the primary type render the label only (no number). Tap → full reading list.

### 7.2 Display-mode toggle

- A two-state segmented control (**Abs / Rel**) sits in the canvas chrome bar next to the active-session pill.
- **Absolute** (default): every on-canvas number is the true RL in metres. This is the only mode available when no session is active; the control is rendered disabled with a tooltip explaining why.
- **Relative**: every on-canvas number is recomputed as `HI − elevation` and rendered with a leading marker (e.g. `↓1.234` or a small "rod" badge) so it can never be confused with an RL. Negative values (point above HI) render with `↑` and are coloured to signal "above instrument". Design-level points (FL/FFL/etc.) still display their target as a relative offset against the active HI so the surveyor sees the staff reading they should be aiming for.
- The toggle is **view-only**. Stored elevations and stored staff readings are unchanged; reading entry forms continue to accept staff readings (measured) or absolute elevations (design) regardless of display mode.
- When the active session ends, the canvas snaps back to Absolute and the toggle re-disables.
- Persistence: display-mode preference is stored per-project in `localStorage` so it survives reload during a long session, but resets to Absolute whenever no session is active.

## 8. Project structure

```
src/
  lib/
    server/
      db/                # drizzle schema, migrations, client
      auth.ts            # BetterAuth config
      uploads.ts         # image/PDF intake
    components/
      ui/                # shadcn-svelte
      canvas/            # PlanCanvas, PointMarker, ScaleLine, HeatmapLayer
      panels/            # PointsPanel, SessionsPanel, LevelTypesPanel
    domain/
      levels.ts          # HI, RL, grade calculations (pure)
      idw.ts             # heatmap interpolation (pure)
      units.ts           # formatting (m / mm)
  routes/
    (auth)/login/
    (app)/
      projects/
        +page.svelte           # dashboard
        new/+page.svelte
        [id]/
          +page.svelte         # project view
          +page.server.ts
          settings/
  app.css
  app.html
static/
docker-compose.yml
Dockerfile
drizzle.config.ts
```

## 9. Build phases

**Phase 1 — Foundations** (no surveying logic yet)
- [x] SvelteKit + Tailwind + shadcn-svelte set up.
- [x] BetterAuth + Google OAuth wired (working pending provider credentials).
- [x] Drizzle + SQLite, initial migration with `users` / `projects` / `plans` / `level_types` seed.
- [x] Dockerfile + docker-compose.yml that boots the app with a mounted SQLite volume.
- [x] Projects dashboard + create-project flow (no plan upload yet).
- [x] Auth-guarded `(app)` routes; signed-in users skip the login screen.

**Phase 2 — Plan & points**
- [x] Plan upload (PNG/JPG drag-drop + clipboard paste + PDF page picker via client-side `pdfjs-dist` rasterisation; Sharp ingest pipeline; per-project upload dir; auth-guarded `/api/uploads/plans/[planId]` serving).
- [x] Plan canvas with pan/zoom on desktop and touch (wheel + pinch + drag, fit-to-viewport, cursor-anchored zoom; SVG overlay with inverse-scaled stroke widths).
- [x] Add/edit/delete points (non-benchmark + benchmark, no readings yet) — click-to-place with auto-suggested labels, rename + delete from the right panel.
- [x] Set-scale flow (reference line + distance) — two-click capture with inline HUD; persists `scalePxPerMetre` + ref-line endpoints so scale stays editable.

**Phase 3 — Sessions & readings**
- [x] Benchmark points with known elevation (placement, label, RL editable from detail sheet; deletion blocked while sessions reference them).
- [x] Start/end session — modal picks a benchmark + staff reading, derives instrument height, persists; topbar pill shows live HI · benchmark with End. One-active-per-project enforced at the index level.
- [x] Reading entry — measured types require an active session and a non-negative staff reading (RL preview shown live); design types take a direct elevation. `(point, levelType)` upserts on conflict.
- [x] Point detail sheet — slide-in sheet listing readings grouped by level type, with add / edit / delete and a reading-draft form that branches on `kind`.
- [x] Inline primary-level rendering on canvas (falls back to benchmark RL when no measured reading); active session benchmark gets a pulsing dashed halo.

**Phase 4 — Stats**
- [x] Two-point grade tool — left-rail tool (shortcut M) snaps two clicks to existing points; HUD shows distance, both elevations, Δheight (B−A), grade as `%` and `1:n` ratio. Blocks gracefully when plan scale isn't set or a point lacks an elevation; benchmarks fall back to their known RL.
- [x] Heatmap overlay (current / finished / delta) via IDW — `domain/idw.ts` rasterises samples into a value grid, `domain/heatmap.ts` paints it through a sequential ramp (signal-deep → warning → accent-deep) for current/finished and a diverging signal↔accent ramp for delta. Output is a PNG data URL embedded in the SVG overlay with `mix-blend-mode: multiply` so the plan reads through.
- [x] View-mode toggle in toolbar — segmented control in the canvas chrome bar (`Points / Current / Finished / Delta`); each option auto-disables when its source samples are empty. Includes a bottom-left legend that shows the active level types and the value range driving the ramp.

**Phase 4.5 — Contour view**
- [x] Sample-cloud convex hull masking — `domain/hull.ts` (Andrew's monotone chain, median-nearest-neighbour padding, point-in-polygon, `buildSampleHull` rejecting <3-point and colinear clouds). Shared by heatmap, contours, and arrows so all three layers stop bleeding past the measured area.
- [x] `rasterizeIdw` accepts an optional hull and writes `NaN` for cells whose centre falls outside it; `buildHeatmapImage` skips `NaN` cells (alpha 0). Fixes the existing heatmap-bleeds-across-empty-plan behaviour as a free side-effect.
- [x] Marching squares isoline extractor — `domain/contours.ts` with `niceInterval` (1/2/5×10ⁿ snapping, ~10-line target), `contourLevels`, `marchingSquares` (centre-of-cell saddle disambiguation, NaN-corner cells skipped), and `groupByLevel`. Major lines every 5th contour with elevation chips, minor lines thinner.
- [x] Gradient + arrow grid — `domain/gradient.ts` (central-difference ∇z on the IDW grid, slope in m/m via `scalePxPerMetre`) and `domain/arrows.ts` (`sampleArrows` sub-grid walker that drops slopes below 0.001 m/m, `slopeColour` reusing the heatmap palette, `arrowLengthPx` for length scaling). Composed by `domain/contour-view.ts`. Skipped entirely when plan scale isn't set.
- [x] Canvas rendering — contour minor/major paths, elevation labels in vellum chips, and fall-arrow group (line body + filled triangular head) inlined into the `PlanCanvas` overlay snippet in `+page.svelte`. (Decided not to extract dedicated `ContoursLayer.svelte` / `FallArrowsLayer.svelte` components — the markup is small enough that inline mirrors the existing heatmap pattern.)
- [x] Toolbar split into **Source** (Current / Finished / Delta) × **View** (Points / Heatmap / Contours) segmented controls. Source disables per-option when its sample set is empty; View's Heatmap and Contours options disable when the active source has too few samples (heatmap ≥1, contours ≥3). Source controls dim while View=Points to signal they're inert. Contour mode with `viewSource === 'delta'` labels arrows as "→ cut direction" rather than direction-of-fall.
- [x] Legend variant for contour mode — interval ("Contours every X m"), slope ramp from `flat` to peak `%`, "steepest ≈ 1:n" readout, and a "→ direction of fall" / "→ cut direction" caption that switches with the active source.

**Phase 5 — Polish**
- [x] Mobile layout pass — chrome bar collapses metadata below `md`, the left tool rail mirrors into a horizontal bottom strip below `lg` (44px tap targets), and the right panel collapses into a bottom sheet below `xl` opened from a "Panels" trigger in the chrome bar. Selecting a point auto-dismisses the sheet so the detail drawer takes over.
- [x] Project settings — server-backed rename, primary-level-type picker, full level-type CRUD (create / rename / recolour / delete-when-unused with reading-count guard), and hard-delete with type-the-name confirmation that cascades the project + uploads dir.
- [x] Error states — root `+error.svelte` with brand-styled 401/403/404/5xx copy and a "back to projects" path; inline dismiss-able error banners on settings + project view; success toast on settings mutations.
- [x] Empty states — projects dashboard hero copy branches on zero/one/many open projects; canvas shows a "drop your first benchmark" guidance card when a project has no points; right-panel tabs each carry their own empty copy that points the user to the next action; settings level-types list flags reading usage to explain why delete is disabled.
- [x] **Absolute / Relative display toggle** — segmented `Abs / Rel` control in the canvas chrome bar (Rel disabled until a session is running). `domain/levels.ts` exports `toDisplayLevel` + `formatLevel` (sign-arrowed string) + `formatDelta`; the project view threads them through point-marker labels, the live hover HUD, the heatmap legend ticks (gradient flips so the smaller displayed number stays on the left), contour elevation chips, and the grade-tool HUD (Δ + grade % derived from the *displayed* elevations so the readout stays internally consistent). Delta source stays absolute since it's already a difference. Stored data untouched; toggle auto-snaps back to Abs whenever the active session ends; per-project preference cached in `localStorage`.

## 10. Open questions

- ~~Heatmap performance on dense point sets~~ — Phase 4 lands with a fixed ~140-column raster (rows scale to plan aspect); revisit only if users hit dense-grid pauses on a real plan.
- ~~Sample-cloud masking for IDW layers~~ — Phase 4.5 adds a shared convex-hull mask (with NN-spacing padding) so heatmap, contours, and arrows all stop at the measured area instead of extrapolating into empty plan.
- ~~PDF rendering on the server vs. extract-on-client-then-upload-PNG.~~ Decided in Phase 2: client-side `pdfjs-dist` renders the chosen page to PNG before upload.
- Soft-delete vs. hard-delete for points/sessions. Default: hard-delete with cascade; revisit if users ask for undo.
- Heatmap "current" vs "finished" mapping — currently auto-picks the project's primary level type for current and the first `FL` / `FFL` / design type for finished. Revisit in Phase 5 when project settings let users pin both explicitly.
- Relative-mode rendering for **delta** view — delta is already a difference, so reinterpreting it via `HI − elevation` makes no physical sense. Current plan: in Relative mode the View=Delta source forces back to Absolute (with a one-line caption explaining why) rather than introducing a third "relative-delta" semantic. Confirm with first on-site user.
