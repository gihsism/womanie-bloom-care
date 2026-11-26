# Design "own" — brief for every agent (2026-11-27)

Founder: "I still don't like design, it is still AI generated, let's make it unique" → "You do it".
Audit of what reads as AI/template: ~/.cache/womanie-ux/ai-tells/AI-TELLS.md (read it).

## The one idea
Everything is drawn in the **same hand as the Home body maps** (src/components/dashboard/PregnancyBodyMap.tsx,
MenopauseBodyMap, BabyBodyMap, CycleDialHero, PillRingHero, IVFTimelineHero): one ink line (#1A1A19 /
`hsl(var(--foreground))`), 1.2px at hero size (≈1.5px at 24px icon size), round caps and joins, slightly
uneven organic curves, porcelain-stone fills (#FCF6F4→#D9C8C3), a single raspberry accent
(`--primary` 336 66% 46%) used sparingly. Medical-anatomy-plate feeling, adult, calm. Keep current tokens,
fonts (Fraunces headings/numbers, Jost body, DM Mono `.label-mono` labels) and colours: this round changes
the *material*, not the palette.

## Banned (these are the "AI tells")
- lucide-react icons in UI (replace with our set in `src/components/icons`), especially Sparkles, Wand,
  Bot, Brain, Stars. No sparkle styling for AI anywhere.
- Gradient icon tiles, gradient blobs/glows, emoji in UI, stock flat illustrations, identical card grids,
  "icon in a rounded square on every row", dashed-box empty states, default shadcn look (default shadows,
  `rounded-xl` cards, pill badges), recharts default grid.
- Generic copy ("Like never before", "health journey", "Key Features", "Your privacy, our priority").
  Plain, specific, warm sentences. Never claim things we can't back (no boards, certifications, "bank-level").

## Rules
- Branch `design-own` only; previews only. Nothing merges to main until the founder says so.
- Behaviour, data, routes, tests stay the same. e2e selectors (data-testid, roles, labels) must keep working.
- Gate before you finish: `npx tsc --noEmit -p tsconfig.app.json && npx vitest run && npm run build`.
- node_modules is symlinked from main; never run npm install / prune in ~/womanie-bloom-care.
- Accessible: icons decorative → aria-hidden; contrast AA; tap targets ≥44px.
- Screenshot your screens at 390×844 with ~/.cache/womanie-ux/live.js-style Playwright against
  `npm run preview` (local) and save to ~/.cache/womanie-ux/own/<your-area>/.
