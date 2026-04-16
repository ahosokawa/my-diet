# my-diet

An iOS-friendly PWA for tracking calories and macros. Local-first: all food and weight data lives in IndexedDB on the device.

## Features

- **Intake wizard** — sex, age, height, weight, activity level → Mifflin-St Jeor TDEE + macro targets (1 g/lb protein, 0.45 g/lb fat, carbs fill).
- **Calorie review** — pick from three presets (slightly under / recommended / slightly over) or enter a custom calorie target during onboarding.
- **Weekly schedule** — per-day meal times and workout window, with flexible copy-to-days. Workout days get an automatic post-workout recovery meal.
- **Today view** — daily totals + per-meal cards. Navigate past and future days with prev/next arrows.
- **Meal detail** — pick foods, lock specific portions, auto-balance the rest via least-squares solver to hit the meal's macro target.
- **Food library** — ~130 curated foods plus custom food CRUD. Favorites pin to the top.
- **Combos** — save a set of foods (with locks) and reload them into any meal; auto-balances on load.
- **Weight log** — daily weight entry with a simple line chart.
- **PWA** — installable to the home screen, works offline.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS
- Dexie (IndexedDB)
- Recharts (weight chart)
- Vitest (unit tests)

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. First launch drops you into the intake wizard.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | ESLint |

## Project layout

```
app/                    Next.js App Router pages
  intake/               Onboarding wizard
  today/                Daily view (supports ?d=YYYY-MM-DD)
  meals/[id]/           Meal detail + food picker + solver
  foods/                Food library + custom food CRUD
  schedule/             Weekly grid
  weight/               Weight log + chart
components/             Shared UI (Header, TabBar, MacroBar, GramsStepper, …)
lib/
  db/                   Dexie schema + typed repos
  nutrition/            mifflin, macros, solver, distribute
  schedule/             week model + meal-time helpers
  review/               Friday rule engine (used by v1.1)
public/                 manifest, service worker, icons
```

## Data model

Everything is local IndexedDB (`Dexie`):

- `profile` — one row: sex, age, heightIn, weightLb, activityFactor
- `targets` — versioned kcal + macro targets with `dateEffective`
- `foods` — builtin + custom foods (per-100g macros), `favorite` flag
- `schedule` — 7 rows, one per weekday: `mealTimes[]` + optional workout window
- `mealLogs` — logged meals keyed by `date` + `index`
- `weights` — one row per date
- `combos` — saved food sets with per-item lock state

## Solver

`lib/nutrition/solver.ts` uses projected gradient descent on a weighted least-squares objective (protein weighted highest, then carbs, then fat). Locked foods have their macros subtracted from the target up front; only unlocked portions are iterated. Non-negativity is enforced by clipping each step.

## Macro defaults

| Macro | Default |
| --- | --- |
| Protein | 1.0 g / lb bodyweight |
| Fat | 0.45 g / lb bodyweight |
| Carbs | Fill remaining kcal |

Users can override the calorie target during onboarding; future overrides happen via the Friday review (v1.1).

## Status

v1 core loop is code-complete: onboarding, schedule, today, meal detail + solver, food library, weight log, PWA shell.

v1.1 (next) adds iOS Web Push notifications (meal reminders, weigh-in, Friday review) and the Friday check-in UI that consumes `lib/review/engine.ts`.

## Out of scope for v1

- Cut / bulk modes (maintenance only)
- Barcode scanning / USDA lookup
- Multi-device sync / accounts
- Household units (cups, tbsp, oz)
- Dark mode

## Credits

Built by Andrew Hosokawa with help from Claude.
