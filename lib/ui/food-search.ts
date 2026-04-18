export type Rankable = {
  name: string;
  favorite: number;
};

export function scoreFood(name: string, query: string): number {
  if (!query) return 0;
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n.startsWith(q)) return 3;
  for (const word of n.split(/[\s,/()-]+/)) {
    if (word && word.startsWith(q)) return 2;
  }
  return n.includes(q) ? 1 : 0;
}

export function rankFoods<T extends Rankable>(foods: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return foods;
  const scored: Array<{ food: T; score: number; idx: number }> = [];
  foods.forEach((food, idx) => {
    const score = scoreFood(food.name, q);
    if (score > 0) scored.push({ food, score, idx });
  });
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.food.favorite !== b.food.favorite) return b.food.favorite - a.food.favorite;
    return a.idx - b.idx;
  });
  return scored.map((s) => s.food);
}
