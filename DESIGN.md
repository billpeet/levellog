---
version: alpha
name: LevelLog Field Instrument
description: >
  A drafting-table-meets-field-instrument design system for a surveying app
  used on-site against a laser level. Optimised for precision readouts,
  high-contrast outdoor legibility, and a tactile, paper-and-ink character.

colors:
  # Foundation — paper & ink
  ink: "#0f100e"
  ink-2: "#2b2a26"
  graphite: "#6e6a5c"
  paper: "#f1ecde"
  paper-2: "#e7e0cb"
  vellum: "#faf6eb"
  rule: "#c8bfa6"
  rule-2: "#d9d2bd"
  # Signals — used sparingly, never decoratively
  accent: "#e5532d"
  accent-deep: "#b6361a"
  signal: "#2e7d5b"
  signal-deep: "#1f5b41"
  warning: "#c79400"

typography:
  display-xl:
    fontFamily: Instrument Serif
    fontSize: 80px
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: -0.02em
  display-lg:
    fontFamily: Instrument Serif
    fontSize: 52px
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: -0.02em
  display-md:
    fontFamily: Instrument Serif
    fontSize: 38px
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: -0.01em
  display-sm:
    fontFamily: Instrument Serif
    fontSize: 32px
    fontWeight: 400
    lineHeight: 1.1
  headline-md:
    fontFamily: Instrument Serif
    fontSize: 22px
    fontWeight: 400
    lineHeight: 1.15
  body-lg:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.55
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  numeric-readout:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.2
    fontFeature: '"tnum"'
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: '"tnum"'
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.35
    fontFeature: '"tnum"'
  mono-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1.3
    fontFeature: '"tnum"'
  eyebrow:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.22em

rounded:
  none: 0px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  "2xl": 16px
  full: 9999px

spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  "2xl": 48px
  rail: 64px
  panel: 320px
  container-max: 1600px
  gutter: 24px
  margin-mobile: 24px
  margin-desktop: 40px

components:
  # Primary action — solid ink pill
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.mono-md}"
    rounded: "{rounded.full}"
    padding: 10px
    height: 40px
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button-primary-disabled:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"

  # Secondary — outlined on paper
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.mono-md}"
    rounded: "{rounded.full}"
    padding: 10px
    height: 40px
  button-secondary-hover:
    backgroundColor: "{colors.vellum}"

  # Ghost — used in left tool rail and small chrome buttons
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.graphite}"
    typography: "{typography.mono-md}"
    rounded: "{rounded.md}"
    padding: 8px
    height: 36px
  button-ghost-hover:
    backgroundColor: "{colors.vellum}"
    textColor: "{colors.ink}"
  button-ghost-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"

  # Drafting-style underline input — used in the new-project flow
  input-text:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.display-sm}"
    rounded: "{rounded.none}"
    padding: 8px
    height: 48px
  input-text-focus:
    backgroundColor: transparent
    textColor: "{colors.ink}"

  # Eyebrow / micro-cap label
  chip-eyebrow:
    backgroundColor: transparent
    textColor: "{colors.graphite}"
    typography: "{typography.eyebrow}"

  # Live-session pill — green dot + tabular HI readout
  badge-live:
    backgroundColor: rgba(46, 125, 91, 0.05)
    textColor: "{colors.signal-deep}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.full}"
    padding: 6px

  # Project card on the dashboard
  card-project:
    backgroundColor: "{colors.vellum}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: 20px
  card-project-hover:
    backgroundColor: "{colors.vellum}"

  # List rows in the right-side Points / Sessions / Levels panel
  list-item:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 12px
  list-item-hover:
    backgroundColor: "{colors.paper}"

  # Persistent shell chrome
  topbar:
    backgroundColor: rgba(241, 236, 222, 0.85)
    textColor: "{colors.ink}"
    height: 56px
  rail-left:
    backgroundColor: rgba(241, 236, 222, 0.6)
    textColor: "{colors.ink}"
    width: 64px
  panel-right:
    backgroundColor: rgba(250, 246, 235, 0.7)
    textColor: "{colors.ink}"
    width: 320px
---

# LevelLog — Design System

## Brand & Style

LevelLog is the field log a surveyor reaches for between staff readings. The
product personality is **"drafting table meets field instrument"** — equal
parts paper notebook and theodolite. It is built for people who care about
the third decimal place, often working outdoors with gloves on a phone or
tablet, and who need to trust that nothing they recorded yesterday has been
quietly rewritten.

The interface should feel:

- **Tactile and material** — warm cream paper, ink line work, ruler ticks,
  registration marks. Never glassy, never glossy, never slick.
- **Instrument-grade** — every numeric value is set in a monospaced face with
  tabular figures. Numbers line up vertically because surveyors read them
  vertically.
- **Quiet by default, loud when it matters** — the palette is dominated by
  paper and ink. Colour appears only to flag a state the user actually needs
  to act on (a live laser-level session, a primary call-to-action, an error).

The opposite reference points are equally useful: this is *not* a generic
SaaS dashboard, *not* a Material 3 application, *not* purple-gradient AI.
When in doubt, ask whether the choice would feel at home in a steel-bound
field book or on the side of a surveyor's tripod.

## Colors

The palette is a paper-and-ink foundation with two narrow signal channels.

- **Ink (`#0f100e`)** — near-black with a hint of green. Used for body text,
  borders that need to read as drawn lines, and as the background of primary
  buttons. The deepest value in the system.
- **Graphite (`#6e6a5c`)** — a muted warm grey for secondary text, metadata,
  and the resting state of icon buttons. Reads as pencil rather than ink.
- **Paper (`#f1ecde`)** — the dominant surface. A warm cream that is the page
  the product is drawn on. Used as the application background everywhere.
- **Vellum (`#faf6eb`)** — a slightly lighter cream used for raised surfaces
  (cards, the right-hand panel, the canvas itself). Vellum is to paper what a
  fresh sheet on a clipboard is to the desk underneath.
- **Rule (`#c8bfa6`)** — the colour of every hairline divider. Always
  rendered as a 1px line; for dotted dividers use the `.hairline` utility.
- **Accent — Surveyor Orange (`#e5532d`)** — the primary action colour and
  the colour of regular point markers on a plan. Borrowed from hi-vis
  flagging tape. Used surgically: at most one per screen.
- **Signal — Laser Green (`#2e7d5b`)** — reserved exclusively for the
  "session live" indicator, including the pulsing dot in the topbar pill and
  the badge on dashboard cards. If it is green, the laser is on.
- **Warning — Caution Yellow (`#c79400`)** — held in reserve for validation
  warnings (e.g. a benchmark with no reading yet, a session that has been
  open longer than a working day).

Light mode only for v1. Dark mode would betray the paper metaphor.

## Typography

Three faces, each with a single job:

- **Instrument Serif** — display face. Carries headlines, project names, and
  hero numerals. Its drafted, slightly mechanical italics suit the
  surveying-instrument metaphor and the product's name. Used at large sizes
  with tight tracking; never used for body copy.
- **Geist** — body face. Quiet, neutral, highly legible at small sizes
  outdoors. Used for paragraph text and any prose longer than a label.
- **JetBrains Mono** — every numeric readout, every label, every breadcrumb.
  Tabular figures (`font-feature-settings: "tnum"`) are mandatory wherever
  numbers appear, so elevations stack cleanly column-by-column.

The `eyebrow` style — uppercase mono at 11px with `0.22em` tracking — acts as
the system's section index. It runs above almost every block of content the
way a chapter header runs above a page in a survey notebook.

Italic is reserved for emphasis on serif headlines (e.g. *"to your field
book"*, *"Stake a new project"*). Never italicise mono.

## Layout & Spacing

LevelLog uses a **three-column shell** for the project workspace and a
**single-column container** elsewhere.

- **Workspace shell**
  - Persistent **TopBar** (56px) with a 6px ruler-tick strip below it.
  - **Left tool rail** (64px) — fixed icon buttons, hidden below `lg`.
  - **Main canvas** — fluid; fills remaining width.
  - **Right panel** (320px) — Points / Sessions / Levels tabs, hidden below
    `xl`.
- **Dashboard / single-column** — content centred in a `1600px` max-width
  container with `40px` desktop / `24px` mobile gutters.

The spacing scale is anchored on **8px**, with a 4px half-step for fine
adjustment. Sections are separated generously (`32px`–`48px`) so each
content block reads as its own "plate" on the page. Component-internal
spacing stays tight (`8px`–`16px`) so dense readouts remain compact.

Mobile collapses the left rail and right panel into bottom sheets. The
topbar remains pinned. The canvas always fills available width.

## Elevation & Depth

Depth in LevelLog is **paper layering**, not Material shadows.

- **Level 0 — Page (Paper).** The application background. Carries a faint
  dotted dot-grid (radial gradient, ~5% ink) and two extremely soft radial
  tints in the corners (orange top-left, green bottom-right) to imply the
  product's two signal channels without ever being noticed.
- **Level 1 — Surface (Vellum).** Cards, the right panel, modal sheets, the
  canvas itself. Distinguished from Paper by the lighter cream tone and a
  `1px solid rgba(0,0,0,0.10)` border (`border-ink/10`).
- **Level 2 — Floating chrome.** Floating cards over the canvas (e.g. the
  site card top-right of the workspace) use a soft, low-spread shadow:
  `0 2px 18px -8px rgba(15,16,14,0.25)`. Used sparingly.
- **Level 3 — Auth poster.** A larger drop shadow
  (`0 24px 60px -30px rgba(15,16,14,0.35)`) is permitted on the sign-in card,
  which is the only "hero" surface in the product.

Backdrop blur is permitted only on the topbar and on the small floating site
card over the canvas, where it lets background grid lines read through.

## Shapes

The shape language is **"drawn, not rendered."** Corners are softened just
enough to feel modern without losing the engineered character.

- **Pills (`rounded-full`)** — buttons, chips, and the live-session
  indicator. Pills are the dominant action shape.
- **Cards (`rounded-xl` / `16px`)** — project cards, modal sheets, the auth
  card. Generous radius so they read as clipboard pages, not screens.
- **Inputs (`rounded-none`)** — text inputs use a 2px underline that
  switches from `rule` to `accent` on focus. They look like a value typed
  onto a ruled line, not a form field.
- **Markers** — point markers on the canvas use **two distinct shapes** that
  must never be swapped:
  - **Inverted triangle (`▽`)** — benchmarks. Mirrors the surveyor's
    benchmark glyph.
  - **Filled circle (`●`)** — measured points. Filled with `accent`,
    stroked with `ink`.

Decorative line work — registration "+" marks in canvas corners, ruler
ticks, hairline dividers, the benchmark wordmark — uses a **`0.6`–`0.8px`
stroke**. Anything heavier reads as a bordered UI element rather than as
draftsmanship.

## Components

### Buttons

- **`button-primary`** — solid ink pill with cream mono caps. Used for the
  one most important action on a screen (e.g. *Continue with Google*,
  *Create project*, *Resume Kingsford*). Hover deepens to `ink-2`. Disabled
  drops to 40% opacity and uses a `cursor-not-allowed`.
- **`button-secondary`** — outlined cream pill. Used as the alternative
  beside a primary action.
- **`button-ghost`** — borderless icon button used in the left tool rail and
  in chrome controls (zoom, filters, sort). Default = graphite icon on
  transparent. Hover = ink icon on vellum. **Active = paper icon on ink** —
  the active state is the strongest contrast in the system, because the
  surveyor needs to see at a glance which tool is armed.

### Chips & Badges

- **`chip-eyebrow`** — the system's section index. Mono caps, 11px, `0.22em`
  tracking, `graphite` colour. Always lives directly above a heading.
- **`badge-live`** — the live-session indicator. A pill with a `signal`
  laser-green dot that pulses on a 1.8s cycle (the `.laser-dot` utility).
  Tinted background at 5% opacity, border at 40%.

### Inputs

- **`input-text`** — drafting underline. No box, no rounded corners,
  display-sm typography on a transparent ground with a `2px` `rule`
  underline that becomes `accent` on focus. Placeholder text is graphite at
  50% opacity.

### Surfaces

- **`card-project`** — vellum surface, `rounded-xl`, hairline `ink/10`
  border. Hover lifts the border to `ink/40` and adds the Level-2 shadow.
  Each card includes a 144px-tall plan thumbnail strip with the surveyor
  grid background and procedural point markers.
- **`topbar`** — translucent paper at 85%, blurred backdrop, ruler-tick
  strip on the bottom edge. Always pinned.
- **`rail-left`** — translucent paper at 60%. Single column of 44px ghost
  buttons with hover tooltips that show the tool name and shortcut key
  (e.g. *Add Point · P*).
- **`panel-right`** — translucent vellum at 70%. Three tabs (Points,
  Sessions, Levels). The active tab gets a 2px `accent` underline.

### Plan Canvas

The canvas itself is treated as a component, not as content:

- Background is the `surveyor-grid` SVG pattern at 80px tile size.
- **Registration "+" marks** in all four corners (Bauhaus-flavoured but
  serving an actual purpose: they index the plan).
- **North arrow** top-left, **scale bar** bottom-left, **live cursor
  coordinate readout** bottom-right — all rendered in mono with tabular
  figures.
- Inline elevation labels next to each measured point use `numeric-readout`
  typography.

## Do's and Don'ts

- **Do** lead every numeric value with `JetBrains Mono` and tabular figures.
  Elevations are data, not prose.
- **Do** reserve `signal` (laser green) for the live-session indicator only.
  Anywhere else dilutes the meaning.
- **Do** reserve `accent` (surveyor orange) for the single most important
  action per screen, plus regular point markers on the canvas.
- **Do** use the `eyebrow` micro-cap above every section heading. It is the
  table of contents the user reads at a glance.
- **Do** distinguish benchmarks (`▽`) from measured points (`●`) on every
  surface they appear, including dashboard thumbnails and panel rows.
- **Do** italicise serif display copy when it carries emotional weight
  (*"to the millimetre"*, *"to your field book"*). Never italicise mono.
- **Don't** introduce a third signal hue. The product has paper, ink, one
  accent, one signal, and one warning — that is the whole vocabulary.
- **Don't** use Material-style drop shadows. Depth comes from cream-tone
  layering and `1px` ink-tinted borders.
- **Don't** mix corner radii within a screen. Pills go with pills, cards go
  with cards. Inputs are square-cornered and underlined, never rounded.
- **Don't** dress the canvas with decorative chrome. Every element on the
  canvas (north arrow, scale bar, registration marks) has a surveying job.
- **Don't** use the system font stack as a fallback for display copy. If
  Instrument Serif fails to load, fall through to `Cormorant Garamond` or
  `Times New Roman`, never to system-ui.
- **Don't** introduce dark mode. The paper metaphor is foundational.
