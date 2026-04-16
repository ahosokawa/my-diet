import { db, type Combo, type Food, type MealLog, type Profile, type ScheduleDay, type Targets, type WeightEntry } from "./schema";
import seedFoods from "./seed-foods.json";

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get("me");
}

export async function saveProfile(p: Omit<Profile, "id" | "createdAt"> & { createdAt?: number }): Promise<void> {
  await db.profile.put({
    id: "me",
    createdAt: p.createdAt ?? Date.now(),
    ...p,
  });
}

export async function getCurrentTargets(): Promise<Targets | undefined> {
  const today = todayStr();
  const all = await db.targets.orderBy("dateEffective").toArray();
  const active = all.filter((t) => t.dateEffective <= today).pop();
  return active ?? all[0];
}

export async function saveTargets(t: Omit<Targets, "id">): Promise<void> {
  await db.targets.add(t);
}

export async function hasPendingTargetChange(): Promise<boolean> {
  const today = todayStr();
  const future = await db.targets.where("dateEffective").above(today).count();
  return future > 0;
}

export async function isReviewEligible(): Promise<boolean> {
  const p = await getProfile();
  if (!p) return false;
  const ageMs = Date.now() - p.createdAt;
  return ageMs >= 7 * 24 * 60 * 60 * 1000;
}

export async function listFoods(): Promise<Food[]> {
  const all = await db.foods.orderBy("name").toArray();
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

export async function addCustomFood(f: Omit<Food, "id" | "builtin" | "slug" | "favorite"> & { slug?: string }): Promise<number> {
  const slug = f.slug ?? `custom-${Date.now()}`;
  const id = await db.foods.add({ ...f, slug, builtin: 0, favorite: 0 });
  return id as number;
}

export async function updateFood(id: number, patch: Partial<Food>): Promise<void> {
  await db.foods.update(id, patch);
}

export async function deleteFood(id: number): Promise<void> {
  await db.foods.delete(id);
}

export async function seedFoodsIfEmpty(): Promise<void> {
  const count = await db.foods.count();
  if (count > 0) return;
  const rows: Food[] = (seedFoods as Food[]).map((f) => ({ ...f, builtin: 1, favorite: 0 }));
  await db.foods.bulkAdd(rows);
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
    out.push(byDay.get(w) ?? { weekday: w as ScheduleDay["weekday"], mealTimes: ["08:00", "12:00", "18:00"] });
  }
  return out;
}

export async function saveScheduleDay(day: ScheduleDay): Promise<void> {
  await db.schedule.put(day);
}

export async function saveWholeSchedule(days: ScheduleDay[]): Promise<void> {
  await db.schedule.bulkPut(days);
}

export async function logMeal(entry: Omit<MealLog, "id" | "loggedAt">): Promise<number> {
  const id = await db.mealLogs.add({ ...entry, loggedAt: Date.now() });
  return id as number;
}

export async function getMealLogsForDate(date: string): Promise<MealLog[]> {
  return db.mealLogs.where("date").equals(date).sortBy("index");
}

export async function deleteMealLog(id: number): Promise<void> {
  await db.mealLogs.delete(id);
}

export async function addWeight(w: Omit<WeightEntry, "id">): Promise<void> {
  await db.weights.put(w);
}

export async function listWeights(limit = 60): Promise<WeightEntry[]> {
  const all = await db.weights.orderBy("date").reverse().limit(limit).toArray();
  return all.reverse();
}

export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
