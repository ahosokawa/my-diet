import { KCAL_PER_LB_FAT, RATE_BANDS, type Goal } from "./macros";

/**
 * Rate-anchored targets.
 *
 * The user's real intent is a weekly rate of weight change ("lose 0.8 lb/wk"),
 * not a calorie number — the calorie number is just what that rate costs at
 * today's maintenance, and it has to move as bodyweight (and therefore
 * maintenance) moves. So the rate is what gets stored on a `Targets` row and
 * the kcal is derived from it; see `syncTargetsToWeight` in lib/db/repos.ts.
 */

/** kcal/day of surplus (or deficit) per lb/week of intended weight change. */
export const KCAL_PER_LB_PER_WEEK = KCAL_PER_LB_FAT / 7; // 500

/**
 * Slider domain, in lb/week. The step is exactly 10 kcal/day so the slider and
 * the calorie stepper move on the same grid — otherwise the thumb quantises
 * differently from the number beside it and appears to stick and jump.
 */
export const RATE_SLIDER = { min: -2, max: 1.5, step: 0.02 } as const;

/** Below this, a target is flagged (never blocked) as too low to eat well on. */
export const MIN_SAFE_KCAL = 1200;

/**
 * How flat a rate has to be to read as "maintain". This is about intent, not
 * measurement: RATE_BANDS.maintain (±0.3%/wk) is the noise floor the review
 * engine uses to decide whether observed weight actually moved, which is far
 * too wide here — someone who deliberately sets +0.5 lb/wk meant to gain.
 */
export const FLAT_RATE_LB_PER_WEEK = 0.1;

/** Calorie target implied by a rate, rounded to 10 kcal like the rest of the app. */
export function kcalForRate(maintenanceKcal: number, rateLbPerWeek: number): number {
  return Math.round((maintenanceKcal + rateLbPerWeek * KCAL_PER_LB_PER_WEEK) / 10) * 10;
}

/** Inverse of `kcalForRate` — used to re-anchor after a hand-set calorie number. */
export function rateForKcal(maintenanceKcal: number, kcal: number): number {
  return round3((kcal - maintenanceKcal) / KCAL_PER_LB_PER_WEEK);
}

/** The default rate for a goal, in lb/week at this bodyweight. */
export function recommendedRate(goal: Goal, weightLb: number): number {
  // Snapped to the slider's step so the default always lands on a tick and
  // the label can't disagree with where the thumb renders.
  const raw = RATE_BANDS[goal].target * weightLb;
  return round2(Math.round(raw / RATE_SLIDER.step) * RATE_SLIDER.step);
}

/**
 * Whether a rate sits inside the healthy band for the goal it implies.
 * `aggressive` = farther from zero than the band allows (too fast to hold on
 * to lean mass when cutting, too fat-gainy when bulking); `conservative` =
 * closer to zero than the band's floor, i.e. slower progress than intended.
 */
export type RateStatus = "in_band" | "aggressive" | "conservative";

export type RateClass = {
  goal: Goal;
  /** Rate as a fraction of bodyweight per week (the unit RATE_BANDS uses). */
  pctPerWeek: number;
  status: RateStatus;
};

export function classifyRate(rateLbPerWeek: number, weightLb: number): RateClass {
  const pctPerWeek = weightLb > 0 ? rateLbPerWeek / weightLb : 0;

  if (weightLb <= 0 || Math.abs(rateLbPerWeek) < FLAT_RATE_LB_PER_WEEK) {
    return { goal: "maintain", pctPerWeek, status: "in_band" };
  }

  if (rateLbPerWeek > 0) {
    const band = RATE_BANDS.bulk;
    return {
      goal: "bulk",
      pctPerWeek,
      status:
        pctPerWeek > band.max
          ? "aggressive"
          : pctPerWeek < band.min
          ? "conservative"
          : "in_band",
    };
  }

  // Cut band is negative: min (-1.0%/wk) is the fast rail, max (-0.5%/wk) the slow one.
  const band = RATE_BANDS.cut;
  return {
    goal: "cut",
    pctPerWeek,
    status:
      pctPerWeek < band.min
        ? "aggressive"
        : pctPerWeek > band.max
        ? "conservative"
        : "in_band",
  };
}

/** The goal a rate implies — what gets written to `profile.goal`. */
export function goalForRate(rateLbPerWeek: number, weightLb: number): Goal {
  return classifyRate(rateLbPerWeek, weightLb).goal;
}

export function clampRate(rateLbPerWeek: number): number {
  return Math.min(RATE_SLIDER.max, Math.max(RATE_SLIDER.min, rateLbPerWeek));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
