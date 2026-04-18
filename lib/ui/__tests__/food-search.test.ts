import { describe, expect, it } from "vitest";
import { rankFoods, scoreFood } from "../food-search";

describe("scoreFood", () => {
  it("returns 0 for empty query", () => {
    expect(scoreFood("Chicken breast", "")).toBe(0);
  });

  it("gives prefix matches the highest score", () => {
    expect(scoreFood("Chicken breast", "chi")).toBe(3);
  });

  it("gives word-prefix matches score 2", () => {
    expect(scoreFood("Chicken breast", "bre")).toBe(2);
  });

  it("gives substring-only matches score 1", () => {
    expect(scoreFood("Chicken breast", "east")).toBe(1);
  });

  it("returns 0 when no match", () => {
    expect(scoreFood("Chicken breast", "zzz")).toBe(0);
  });

  it("is case insensitive", () => {
    expect(scoreFood("CHICKEN", "chi")).toBe(3);
  });

  it("treats hyphenated tokens as separate words", () => {
    expect(scoreFood("sun-dried tomato", "dried")).toBe(2);
  });
});

describe("rankFoods", () => {
  const foods = [
    { name: "Chickpea", favorite: 0 },
    { name: "Chicken breast", favorite: 0 },
    { name: "Sandwich, chicken", favorite: 0 },
    { name: "Rice", favorite: 0 },
  ];

  it("returns all foods unchanged when query is empty", () => {
    expect(rankFoods(foods, "")).toEqual(foods);
  });

  it("prefix matches rank above word-prefix above substring", () => {
    const result = rankFoods(foods, "chic");
    expect(result.map((f) => f.name)).toEqual([
      "Chickpea",
      "Chicken breast",
      "Sandwich, chicken",
    ]);
  });

  it("filters out zero-score foods", () => {
    const result = rankFoods(foods, "chic");
    expect(result.find((f) => f.name === "Rice")).toBeUndefined();
  });

  it("favorites break ties at same score", () => {
    const tied = [
      { name: "Chicken breast", favorite: 0 },
      { name: "Chicken thigh", favorite: 1 },
    ];
    const result = rankFoods(tied, "chi");
    expect(result[0].name).toBe("Chicken thigh");
  });

  it("preserves input order for same-score tie without favorite", () => {
    const result = rankFoods(
      [
        { name: "Chicken A", favorite: 0 },
        { name: "Chicken B", favorite: 0 },
      ],
      "chi"
    );
    expect(result.map((f) => f.name)).toEqual(["Chicken A", "Chicken B"]);
  });
});
