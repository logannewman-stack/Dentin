# Sharp UI

The interface language: software, not a phone OS. Developed on
`dentin-sharp-ui` and merged into `main`, where the radii were tightened
further.

## What changed, and why

**The header stopped moving.** `main` used the iOS pattern — a 34px large
title collapsing into a translucent bar as you scroll. Here the header is a
fixed, opaque strip with a hairline rule and a 16px left-aligned title. Nothing
animates on scroll, which is what makes a dense screen feel stable instead of
springy.

**Structure comes from borders, not shadows.** Every panel is a 1px hairline
at 4px radius. Soft shadows are reserved for things that genuinely float —
sheets and tooltips. Translucent blur no longer does decorative work anywhere.

**Corners are sharp.** Panels 4px, controls and inputs 3px, badges 2px, sheets
6px. Nothing is a capsule: pills, avatars, status chips and progress rails are
all squared off. The small remaining radius is not softness — it stops a 1px
hairline border from rendering a jagged corner, which a true 0px does at
fractional device pixel ratios. Circles survive in exactly three places, where
the shape carries meaning rather than style: notification dots, loading
spinners, and legend markers.

**Inter actually ships.** The stack named Inter from the start, but nothing
loaded it — every device silently fell back to its OS font, which on iOS meant
the app still wore SF. The variable font is now self-hosted and bundled
(`@fontsource-variable/inter`), with optical sizing on, so the type is the
same on every device and the ramp below means what it says.

**Chrome is monochrome; colour is data.** Navigation icons wear ink
(`label-2`), not tinted candy tiles — the workspace mark in the topbar is the
one brand moment in the chrome. Red, orange and green appear only where they
encode state: stock status, expiry, service due. When colour only ever means
something, the eye learns to trust it.

**The dashboard is an instrument panel.** One bordered KPI grid with internal
hairline dividers instead of four floating cards; a column-headed table for
the working list (ITEM / COVER / PAR); alerts as a 2px left rail on a quiet
panel rather than a filled poster. Content rides a `max-w-2xl` rail so the app
holds its shape on a desktop window.

**The type ramp is software-sized.** Body dropped 17px → 14px, and the whole
scale re-cut around it. iOS loosens tracking as type grows; this tightens it
(-0.026em at display sizes) and opens it on micro-labels (+0.07em on the
uppercase section headers). Identifiers — SKUs, barcodes, account numbers —
wear mono so they can be compared character by character.

**Rows got denser.** 44px minimum → 38px, with tighter gutters. A
pointer-and-keyboard audience reads more rows at once and scrolls less.

**Controls became bordered rather than filled.** The segmented control is a
tab strip with dividers; the stepper is a bordered group; the toggle is a
20×34 square switch. Buttons carry an edge so secondary variants still read as
controls against a busy surface.

**The par gauge became a bar.** A ring was decorative; a par level is a
measurement against a threshold, and bars line up down a column where circles
do not. The percentage is now written out above it.

**Motion halved.** Transitions run 100–140ms on a sharp curve. The sheet eases
in 220ms instead of springing.

**Colour pulled back.** Status hues moved off iOS system values to slightly
desaturated equivalents so they read as data rather than as UI chrome. Dark
mode uses `#0A0A0C` rather than pure black, with `#131316` panels — an OLED
black makes hairlines disappear.

**Product tiles flattened.** Gradient chips became a flat tint with a
same-hue rule and inked initials.

## What deliberately did not change

Token *names* are held stable — `text-body`, `rounded-card`, `Pill`, `Gauge` —
so every screen inherited the new language without edits and the two branches
stay diffable. Only the values moved.

The chart palette is untouched. It was validated against its surfaces for
lightness, chroma, CVD separation and contrast; re-tinting it to match a mood
would break checks that were run for a reason. Bar radii tightened from pill to
2px, which changes no colour.

`Pill` is sentence case, not micro-caps. Uppercase suits a one-word state
("NEW", which the vendor badge keeps) and shouts at anything longer — these
carry phrases like "Cheapest on the market".

## Where the tokens live

- `tailwind.config.js` — type ramp, radii, shadows, colour scales
- `src/index.css` — surface variables per theme, `.panel` / `.row` /
  `.section-label` / `.ident` / `.focus-ring`
- `src/components/ui/` — the primitives (renamed from `ios/`)

## Adding a screen

Use `Screen`, `Section` and `Row` and it inherits the language for free. If you
reach for a bare container, give it `rounded-card border border-line
bg-surface` — the border is what defines it, and a card without one floats.
Radii belong in tokens; a literal `rounded-[10px]` in a page is a bug, not a
choice.
