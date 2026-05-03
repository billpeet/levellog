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

## 4. Out of scope (v1)

- Multi-user / sharing / read-only links.
- Offline / PWA / sync.
- True contour lines (Delaunay triangulation + isolines) — heatmap covers MVP need; revisit in v2.
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
- SvelteKit + Tailwind + shadcn-svelte set up.
- BetterAuth + Google OAuth working locally.
- Drizzle + SQLite, initial migration with `users` / `projects` / `plans` / `level_types` seed.
- Dockerfile + docker-compose.yml that boots the app with a mounted SQLite volume.
- Projects dashboard + create-project flow (no plan upload yet).

**Phase 2 — Plan & points**
- Plan upload (PNG/JPG, paste, PDF page select).
- Plan canvas with pan/zoom on desktop and touch.
- Add/edit/delete points (non-benchmark, no readings yet).
- Set-scale flow (reference line + distance).

**Phase 3 — Sessions & readings**
- Benchmark points with known elevation.
- Start/end session, instrument height calculation.
- Reading entry (measured via staff reading; design via direct elevation).
- Point detail sheet with reading list.
- Inline primary-level rendering on canvas.

**Phase 4 — Stats**
- Two-point grade tool.
- Heatmap overlay (current / finished / delta) via IDW.
- View-mode toggle in toolbar.

**Phase 5 — Polish**
- Mobile layout pass (bottom sheet, large touch targets).
- Project settings (custom level types, primary type, rename, delete).
- Error states, empty states, loading skeletons.

## 10. Open questions to revisit before Phase 4

- Heatmap performance on dense point sets — may need to throttle to a low-res grid and upscale.
- PDF rendering on the server vs. extract-on-client-then-upload-PNG. Decide once we hit Phase 2.
- Soft-delete vs. hard-delete for points/sessions. Default: hard-delete with cascade; revisit if users ask for undo.
