export type Rankable = {
  name: string;
  favorite: number;
};

export function scoreFood(name: string, query: string): number {
  if (!query) return 0;
  const n = name.toLowerCase();
  const words = n.split(/[\s,/()-]+/).filter(Boolean);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  let total = 0;
  for (const t of tokens) {
    let best = 0;
    if (n.startsWith(t)) best = 3;
    else if (words.some((w) => w.startsWith(t))) best = 2;
    else if (n.includes(t)) best = 1;
    if (best === 0) return 0;
    total += best;
  }
  return total;
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
