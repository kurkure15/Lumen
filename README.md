# Lumen

An experimental input where the cursor leaves luminous ink behind.

## The idea

Most inputs treat the cursor as a placeholder — a thin blinking line marking where text will appear next. Lumen treats it as a light source.

As you type, a soft periwinkle beam projects backward from the cursor through what you've just written. Recent characters glow brightest. Earlier words fall into the dark. The cursor isn't projecting light forward into empty space — it's leaving illuminated ink behind it, like writing with a glowing pen on black paper.

The result is an input that *feels* like the act of writing, not the mechanics of data entry.

## How it works

A few systems running together:

**Spring-driven cursor.** The visible cursor chases the real input's caret position via a Framer Motion spring (`stiffness: 900, damping: 45, mass: 0.4`). Snappy enough to keep up with fast typing, but still elastic — there's a tiny visible lag the light catches up to. Tuned this up from the original `400/35/0.8` spec because it felt soft under rapid typing.

**Distance-based character opacity, with an immediate cutoff.** Every character's opacity is computed each frame from its position relative to the cursor:
- Within 30px *behind* the cursor → fully lit
- 30–70px behind → linear falloff
- Past the cursor target → opacity 0, immediately
The "past the cursor" rule is checked against the spring's *target* (not its current position), so characters snap to dark the instant the cursor commits to moving — even before the spring catches up. That kills the "one ghost char hangs on after backspace" artifact.

**Beam SVG anchored at the cursor.** A pre-blurred Figma path (purple gradient, Gaussian-blurred at export time) sits with its bright narrow end pinned to the cursor and its wide dark end fanning leftward over the typed text. The beam scales horizontally from 0 → 1 as the cursor moves out from the start (capped at the path's natural width) — so it grows progressively as you type, instead of appearing fully formed on the first keystroke.

**Light on/off toggle.** A small icon on the right of the input (also from Figma) toggles the metaphor entirely. Off: the beam fades out over 700ms, all chars snap to full opacity in a flat gray. On: the metaphor re-engages, beam re-illuminates over 700ms. Slow on purpose — distinguishes a deliberate state change from typing-driven motion.

**Synchronized breathing pulse.** After 800ms of idle (and only while focused), the cursor *and* the beam both pulse opacity 1 ↔ 0.55 over 1.6s. Same CSS keyframe class on both elements. Stops the moment a key is pressed.

**Squircle container.** The 376×56 input shape uses [`figma-squircle`](https://www.npmjs.com/package/figma-squircle) so the corners follow a true superellipse, not just a CSS arc. The fill is clipped to the squircle path; the border is a separate stroked SVG drawn over the top so corner thickness stays uniform with the straight edges.

## Stack

- React 19 + TypeScript
- Framer Motion (springs, motion values, `useTransform`, reduced-motion handling)
- Vite
- `figma-squircle` for the container shape
- Tailwind v4 is wired up but the component itself uses inline styles — the design is pixel-precise and reads more cleanly that way

## Running it

```bash
cd flashlight
npm install
npm run dev
```

Then open http://localhost:5173.

## Design constraints

A few rules borrowed from Emil Kowalski's animation work:

- Only `transform` and `opacity` are animated. The beam's blur is baked into the SVG at export time — it doesn't reblur per frame. The beam scales via `scaleX`, not `width`. Color shifts (cursor lit/dim) are className/state toggles, not transitions on `color`.
- Easing for any non-spring animation: `cubic-bezier(0.215, 0.61, 0.355, 1)`.
- Springs for interruptible motion (cursor X). CSS keyframes for ambient loops (idle pulse). One-shot transitions for one-shot moments (light on/off, backspace dim, beam presence).
- `useReducedMotion` disables the spring (cursor jumps to the target), the breathing pulse, and the backspace dim. The static lighting model — distance-based opacity — stays. That's not motion, that's how the room looks.

## Status

Portfolio prototype, not a production component. Out of scope on purpose: IME composition, paste handling, long text overflow, autofill, mobile keyboard quirks, font loading races, autocomplete. Build the happy path beautifully, ship the idea.


## License

MIT — do whatever, attribution appreciated.
