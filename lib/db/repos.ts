import { db, type Combo, type Food, type MealLog, type NotifPrefs, type Profile, type ScheduleDay, type Snack, type Targets, type WeightEntry } from "./schema";
import seedFoods from "./seed-foods.json";
import { todayStr } from "@/lib/date";
import { defaultMealTimes } from "@/lib/schedule/week";
import { isReviewWindowOpen, wasReviewedThisWeek } from "@/lib/review/window";
import { hasReviewData, splitWeights } from "@/lib/review/engine";
import { macrosFromKcal } from "@/lib/nutrition/macros";
import { effectiveWeightLb, maintenanceKcal, recentAvgWeight } from "@/lib/nutrition/maintenance";
import { kcalForRate } from "@/lib/nutrition/rate";
import { nutritionChanged, type CustomFoodInput } from "@/lib/foods/draft";

export { todayStr };

export const REVIEW_ELIGIBLE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  id: "me",
  enabled: 0,
  mealLeadMin: 20,
  weighInEnabled: 1,
  weighInTime: "07:00",
  reviewEnabled: 1,
  reviewTime: "08:00",
};

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get("me");
}

export async function saveProfile(p: Omit<Profile, "id" | "createdAt"> & { createdAt?: number }): Promise<void> {
  await db.profile.put({
    ...p,
    id: "me",
    createdAt: p.createdAt ?? Date.now(),
  });
}

export async function getTargetsForDate(date: string): Promise<Targets | undefined> {
  const active = await db.targets
    .where("dateEffective")
    .belowOrEqual(date)
    .reverse()
    .first();
  if (active) return active;
  return db.targets.orderBy("dateEffective").first();
}

export async function getCurrentTargets(): Promise<Targets | undefined> {
  return getTargetsForDate(todayStr());
}

export async function saveTargets(t: Omit<Targets, "id">): Promise<void> {
  await db.transaction("rw", db.targets, async () => {
    await db.targets.where("dateEffective").equals(t.dateEffective).delete();
    await db.targets.add(t);
  });
}

// How far the recomputed number has to move before targets are rewritten.
// Below this it's noise from a single weigh-in and not worth a new row.
export const TARGET_DRIFT_KCAL = 25;

/**
 * Keeps the active targets row honest against bodyweight. Targets are anchored
 * to a weekly rate, so as the trailing 7-day weigh-in average moves, both
 * maintenance and the protein/fat grams (which are per-lb) move with it.
 * Called on /today mount. No-ops when there are no weigh-ins in the window,
 * when nothing has drifted, or before onboarding is finished.
 */
export async function syncTargetsToWeight(date = todayStr()): Promise<boolean> {
  const [profile, targets, weights] = await Promise.all([
    getProfile(),
    getTargetsForDate(date),
    listWeights(30),
  ]);
  if (!profile || !targets) return false;
  if (recentAvgWeight(weights, date) === null) return false;

  const weightLb = effectiveWeightLb(profile, weights, date);
  const kcal = kcalForRate(maintenanceKcal(profile, weightLb), targets.rateLbPerWeek);
  const m = macrosFromKcal({
    kcal,
    weightLb,
    proteinPerLb: targets.proteinPerLb,
    fatPerLb: targets.fatPerLb,
  });
  if (Math.abs(m.kcal - targets.kcal) < TARGET_DRIFT_KCAL) return false;

  await saveTargets({
    dateEffective: date,
    kcal: m.kcal,
    proteinG: m.proteinG,
    fatG: m.fatG,
    carbG: m.carbG,
    proteinPerLb: targets.proteinPerLb,
    fatPerLb: targets.fatPerLb,
    rateLbPerWeek: targets.rateLbPerWeek,
    source: targets.source,
  });
  return true;
}

export async function hasPendingTargetChange(): Promise<boolean> {
  const today = todayStr();
  const future = await db.targets.where("dateEffective").above(today).count();
  return future > 0;
}

export async function getPendingTargets(): Promise<Targets | undefined> {
  const today = todayStr();
  return db.targets.where("dateEffective").above(today).first();
}

export async function isReviewEligible(): Promise<boolean> {
  const p = await getProfile();
  if (!p) return false;
  return Date.now() - p.createdAt >= REVIEW_ELIGIBLE_AFTER_MS;
}

export async function markReviewDone(date: string): Promise<void> {
  await db.profile.update("me", { lastReviewedDate: date });
}

export type ReviewState = {
  eligible: boolean;
  windowOpen: boolean;
  doneThisWeek: boolean;
  // False when either weekly window has zero weigh-ins — the review page
  // can't compute a suggestion, so entry points should not advertise one.
  hasWeightData: boolean;
  lastReviewedDate?: string;
  pendingTargets?: Targets;
  daysUntilEligible: number;
};

export async function getReviewState(today: string): Promise<ReviewState> {
  const p = await getProfile();
  const eligible = !!p && Date.now() - p.createdAt >= REVIEW_ELIGIBLE_AFTER_MS;
  const daysUntilEligible = p
    ? Math.max(
        0,
        Math.ceil(7 - (Date.now() - p.createdAt) / (24 * 60 * 60 * 1000))
      )
    : 7;
  const pending = await getPendingTargets();
  const { current, previous } = splitWeights(await listWeights(30), today);
  return {
    eligible,
    windowOpen: isReviewWindowOpen(today),
    doneThisWeek: wasReviewedThisWeek(p?.lastReviewedDate, today),
    hasWeightData: hasReviewData(current, previous),
    lastReviewedDate: p?.lastReviewedDate,
    pendingTargets: pending,
    daysUntilEligible,
  };
}

/** Foods offered in the picker — archived foods are left out. */
export async function listFoods(): Promise<Food[]> {
  const all = (await db.foods.orderBy("name").toArray()).filter((f) => !f.archived);
  return all.sort((a, b) => {
    if (a.favorite !== b.favorite) return b.favorite - a.favorite;
    return a.name.localeCompare(b.name);
  });
}

export async function toggleFavoriteFood(id: number): Promise<void> {
  const f = await db.foods.get(id);
  if (!f) return;
  await db.foods.update(id, { favorite: f.favorite ? 0 : 1 });
}

export async function getFoodsByIds(ids: number[]): Promise<Food[]> {
  const all = await db.foods.bulkGet(ids);
  return all.filter((f): f is Food => !!f);
}

// `slug` is a unique index; the random suffix keeps two saves in the same
// millisecond (or under a frozen test clock) from colliding.
function customSlug(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function addCustomFood(f: CustomFoodInput & { slug?: string }): Promise<number> {
  const slug = f.slug ?? customSlug();
  const id = await db.foods.add({ ...f, slug, builtin: 0, favorite: 0 });
  return id as number;
}

/**
 * Edit a custom food; returns the id of the row now in use. Name/category/
 * serving-size changes apply in place. A nutrition change forks a new row and
 * archives the old one, so meals already logged keep what was actually eaten;
 * combos are templates for future meals and move to the new row.
 */
export async function updateCustomFood(id: number, input: CustomFoodInput): Promise<number> {
  return db.transaction("rw", db.foods, db.combos, async () => {
    const old = await db.foods.get(id);
    if (!old || old.builtin) throw new Error(`Not an editable food: ${id}`);
    if (!nutritionChanged(old, input)) {
      await db.foods.put({ ...old, ...input });
      return id;
    }
    const newId = (await db.foods.add({
      ...input,
      slug: customSlug(),
      builtin: 0,
      favorite: old.favorite,
    })) as number;
    await db.foods.update(id, { archived: 1, replacedBy: newId });
    await db.combos
      .filter((c) => c.items.some((it) => it.foodId === id))
      .modify((c) => {
        c.items = c.items.map((it) => (it.foodId === id ? { ...it, foodId: newId } : it));
      });
    return newId;
  });
}

/** "Delete" for custom foods: hide it, but keep the row for history. */
export async function archiveFood(id: number): Promise<void> {
  const f = await db.foods.get(id);
  if (!f || f.builtin) throw new Error(`Not an editable food: ${id}`);
  await db.foods.update(id, { archived: 1 });
}

/**
 * Ensure every builtin food from seed-foods.json exists. Adds missing slugs
 * only — existing rows (including user-modified favorites) are never touched.
 */
export async function syncBuiltinFoods(): Promise<void> {
  const rows: Food[] = (seedFoods as Food[]).map((f) => ({ ...f, builtin: 1, favorite: 0 }));
  const count = await db.foods.count();
  if (count === 0) {
    await db.foods.bulkAdd(rows);
    return;
  }
  const existing = new Set(await db.foods.orderBy("slug").keys());
  const missing = rows.filter((f) => !existing.has(f.slug));
  if (missing.length > 0) await db.foods.bulkAdd(missing);
}

export async function listCombos(): Promise<Combo[]> {
  return db.combos.orderBy("createdAt").reverse().toArray();
}

export async function saveCombo(name: string, items: Combo["items"]): Promise<number> {
  const id = await db.combos.add({ name, items, createdAt: Date.now() });
  return id as number;
}

export async function deleteCombo(id: number): Promise<void> {
  await db.combos.delete(id);
}

export async function getSchedule(): Promise<ScheduleDay[]> {
  const rows = await db.schedule.toArray();
  const byDay = new Map<number, ScheduleDay>();
  rows.forEach((r) => byDay.set(r.weekday, r));
  const out: ScheduleDay[] = [];
  for (let w = 0; w < 7; w++) {
    out.push(byDay.get(w) ?? { weekday: w as ScheduleDay["weekday"], mealTimes: defaultMealTimes(3) });
  }
  return out;
}

export async function saveWholeSchedule(days: ScheduleDay[]): Promise<void> {
  await db.schedule.bulkPut(days);
}

export async function logMeal(entry: Omit<MealLog, "id" | "loggedAt">): Promise<number> {
  const existing = await db.mealLogs
    .where("[date+index]")
    .equals([entry.date, entry.index])
    .first();
  const loggedAt = Date.now();
  if (existing?.id != null) {
    await db.mealLogs.update(existing.id, { ...entry, loggedAt });
    return existing.id;
  }
  const id = await db.mealLogs.add({ ...entry, loggedAt });
  return id as number;
}

export async function getMealLogsForDate(date: string): Promise<MealLog[]> {
  return db.mealLogs.where("date").equals(date).sortBy("index");
}

export async function getMealLog(date: string, index: number): Promise<MealLog | undefined> {
  return db.mealLogs.where("[date+index]").equals([date, index]).first();
}

export async function deleteMealLog(date: string, index: number): Promise<void> {
  await db.mealLogs.where("[date+index]").equals([date, index]).delete();
}

// Saves a snack. Without an id it's created; returns the row id either way.
export async function saveSnack(entry: Omit<Snack, "loggedAt">): Promise<number> {
  const loggedAt = Date.now();
  if (entry.id != null) {
    await db.snacks.put({ ...entry, loggedAt });
    return entry.id;
  }
  const row: Snack = { ...entry, loggedAt };
  delete row.id;
  return (await db.snacks.add(row)) as number;
}

export async function getSnack(id: number): Promise<Snack | undefined> {
  return db.snacks.get(id);
}

// Ordered by time of day, then by creation.
export async function getSnacksForDate(date: string): Promise<Snack[]> {
  const rows = await db.snacks.where("date").equals(date).toArray();
  return rows.sort((a, b) => a.time.localeCompare(b.time) || (a.id ?? 0) - (b.id ?? 0));
}

export async function deleteSnack(id: number): Promise<void> {
  await db.snacks.delete(id);
}

export async function addWeight(w: Omit<WeightEntry, "id">): Promise<void> {
  await db.weights.put(w);
}

export async function updateWeight(id: number, lbs: number): Promise<void> {
  await db.weights.update(id, { lbs });
}

export async function deleteWeight(id: number): Promise<void> {
  await db.weights.delete(id);
}

export async function listWeights(limit = 60): Promise<WeightEntry[]> {
  const all = await db.weights.orderBy("date").reverse().limit(limit).toArray();
  return all.reverse();
}

export async function getNotifPrefs(): Promise<NotifPrefs> {
  const row = await db.prefs.get("me");
  return row ?? DEFAULT_NOTIF_PREFS;
}

export async function saveNotifPrefs(p: Omit<NotifPrefs, "id">): Promise<void> {
  await db.prefs.put({ id: "me", ...p });
}
