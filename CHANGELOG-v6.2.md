# v6.2 — Mobile UX pass

What changed and why, on top of the existing v6.1 platform:

1. **Bottom-sheet modal on mobile** (`src/main.jsx` → `Modal`, CSS in `src/premium.css`)
   Program details and checkout now slide up from the bottom like a native app sheet
   instead of a centered desktop-style dialog. Includes a drag handle and swipe-down-to-dismiss
   (touch-tracked, respects `prefers-reduced-motion`). Desktop keeps the centered dialog.

2. **Real touch feedback** — hover-only affordances (`:hover`) never fire on a touchscreen, so every
   primary button, program card, and dock icon now has an explicit `:active` state under a
   `(hover: none) and (pointer: coarse)` media query.

3. **Skeleton loading state** for the programs carousel — while `/api/programs` is loading, three
   shimmer placeholder cards render instead of an empty gap, improving perceived performance.

4. **Sticky mobile conversion bar** — once a visitor scrolls past the hero, a compact "Message Andre"
   bar slides up from the bottom (dismissible, respects safe-area-inset, avoids colliding with the
   WhatsApp float button).

5. **Success micro-interaction** — submitting a program request now shows a short, tasteful confetti
   burst behind the checkmark instead of a flat state change.

6. Light haptic feedback (`navigator.vibrate`, feature-detected) on key taps for supported devices.

No backend, routing, or data-contract changes. `dist/` was removed from this archive since it's a
build artifact — run `npm install && npm run build` to regenerate it.
