# Sharp UI

This branch (`dentin-sharp-ui`) carries the same product as `main` with a
different visual language: software, not a phone OS.

## What changed, and why

**The header stopped moving.** `main` used the iOS pattern — a 34px large
title collapsing into a translucent bar as you scroll. Here the header is a
fixed, opaque strip with a hairline rule and a 16px left-aligned title. Nothing
animates on scroll, which is what makes a dense screen feel stable instead of
springy.

**Structure comes from borders, not shadows.** Every panel is a 1px hairline
at 6px radius. Soft shadows are reserved for things that genuinely float —
sheets and tooltips. Translucent blur no longer does decorative work anywhere.

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
