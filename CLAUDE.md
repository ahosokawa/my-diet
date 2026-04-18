# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Next.js dev server on http://localhost:3000
- `npm run build` — Production build; writes a static export to `out/`
- `npm run typecheck` — `tsc --noEmit` (TS strict is on)
- `npm run lint` — ESLint (`eslint-config-next`)
- `npm test` — Vitest once
- `npm run test:watch` — Vitest watch mode
- Run a single test: `npx vitest run lib/nutrition/__tests__/solver.test.ts` (or pass `-t "<name>"` to filter by test name)

## Deployment / static export

`next.config.mjs` sets `output: "export"` and a `basePath` of `/my-diet` when `NODE_ENV === "production"` (GitHub Pages). Consequences that matter when editing:

- **No server code.** No route handlers, no `getServerSideProps`-equivalents, no dynamic `fetch` on the server. Everything must run in the browser.
- **Asset URLs need the basePath.** Read it via `process.env.NEXT_PUBLIC_BASE_PATH` (see `app/layout.tsx` for the manifest, favicon, and service-worker registration pattern). Hard-coded `/foo.png` paths will 404 in prod.
- **`trailingSlash: true`.** Route links must follow suit.
- `.github/workflows/deploy.yml` builds on push to `main` and publishes `out/` to GitHub Pages.

## Architecture

This is a local-first PWA for macro tracking. There is no backend — all user data lives in IndexedDB on the device.

### Data layer (`lib/db/`)

- `schema.ts` — Dexie class `MyDietDb` with tables: `profile`, `targets`, `foods`, `schedule`, `mealLogs`, `weights`, `combos`. Schema is **versioned**: to change a schema, add a new `this.version(N).stores(...).upgrade(...)` block — never edit an existing version (existing user databases will be on older versions and upgrade through the chain).
- `repos.ts` — the only module UI should import. All reads/writes funnel through repo functions (`getProfile`, `logMeal`, `listFoods`, etc.) so the raw Dexie API stays encapsulated.
- `seed-foods.json` is seeded by `seedFoodsIfEmpty()` on first launch; builtin foods have `builtin: 1` and should not be deleted.
- `targets` is *append-only and versioned by `dateEffective`*. `getCurrentTargets()` returns the active row for today; pending future-dated targets can exist (see `hasPendingTargetChange`).

### Nutrition math (`lib/nutrition/`, pure functions, fully unit-tested)

- `mifflin.ts` — Mifflin-St Jeor TDEE from sex/age/height/weight/activity.
- `macros.ts` — Default macro targets: protein = 1.0 g/lb, fat = 0.45 g/lb, carbs fill remaining kcal. `KCAL = {protein: 4, fat: 9, carb: 4}`.
- `distribute.ts` — Splits a daily `MacroTarget` across N meal slots. Protein/fat are even; carbs bias toward the post-workout slot (`postWorkoutCarbBias`, default 0.5).
- `solver.ts` — Projected gradient descent on a weighted least-squares objective (protein weighted highest, then carbs, then fat). Locked foods are subtracted from the target up front; only unlocked portions are iterated. Non-negativity enforced by clipping.

The meal-detail UI is the main consumer: it calls `distributeMeals` to get a per-meal target, then `solvePortions` to auto-balance the unlocked foods in the current meal.

### Schedule (`lib/schedule/week.ts`)

7 days, each with `mealTimes[]` and optional workout window. `postWorkoutMealIndex(day)` returns the first meal that starts *after* workout end — this flag flows into `distribute.ts` to bias carbs. `copyTo()` is the "copy this day's schedule to other days" helper used by the schedule screen.

### Review engine (`lib/review/engine.ts`)

Weekly Friday check-in math (v1.1). Takes current/previous week weights and current targets, returns a `maintain | decrease | increase` verdict with a ±150 kcal adjustment when 7-day average weight moves more than 0.3%. The UI at `app/review/page.tsx` consumes this.

### Routes (App Router, all client components)

- `app/page.tsx` routes first-launch users to `/intake`, otherwise `/today`.
- `app/today/page.tsx` — daily view; accepts `?d=YYYY-MM-DD` for history/future navigation.
- `app/meals/page.tsx` — meal detail + food picker + solver; identified by `?d=YYYY-MM-DD&i=<mealIndex>` query params (not a dynamic `[id]` segment). Wrap `useSearchParams` usage in `<Suspense>` — required for static export.
- `app/intake`, `app/schedule`, `app/weight`, `app/review`, `app/settings` — one route each. Custom foods are created inline from the meal picker; there is no standalone `/foods` route.

Shared UI lives in `components/` (Header, TabBar, MacroBar, GramsStepper).

## Conventions

- Path alias `@/*` maps to repo root (see `tsconfig.json` and `vitest.config.ts`). Imports should use `@/lib/...`, `@/components/...`.
- Units are imperial everywhere user-facing (lb, in) and metric in the database where it matters (grams for food portions, per-100g macros).
- Dates are stored as `YYYY-MM-DD` strings (not `Date`). Use `todayStr()` from `lib/db/repos.ts`.
- Boolean-ish Dexie fields (`builtin`, `favorite`, `locked`) are stored as `0 | 1` to be indexable.
- Tests live in `__tests__/` folders colocated next to the module under test. Vitest uses `environment: "node"` — DOM/Dexie are **not** available in tests; keep test targets to pure functions.
