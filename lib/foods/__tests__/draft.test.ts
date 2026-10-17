import { describe, expect, it } from "vitest";
import type { Food } from "@/lib/db/schema";
import { EMPTY_CUSTOM, draftFromFood, inputFromDraft, nutritionChanged } from "../draft";

const food: Food = {
  id: 1,
  slug: "custom-1",
  name: "Protein powder",
  kcalPer100: 428.6,
  proteinPer100: 85.7,
  fatPer100: 5.4,
  carbPer100: 10.7,
  unit: "g",
  builtin: 0,
  favorite: 0,
  category: "supplement",
  servingSize: 28,
};

describe("inputFromDraft", () => {
  it("converts per-serving values to per-100", () => {
    const input = inputFromDraft({
      ...EMPTY_CUSTOM,
      name: " Bar ",
      servingSize: "50",
      kcalPerServing: "200",
      proteinPerServing: "20",
      fatPerServing: "7",
      carbPerServing: "22",
      fiberPerServing: "",
    });
    expect(input).toEqual({
      name: "Bar",
      category: "other",
      kcalPer100: 400,
      proteinPer100: 40,
      fatPer100: 14,
      carbPer100: 44,
      unit: "g",
      servingSize: 50,
    });
  });

  it("rejects incomplete or invalid drafts", () => {
    expect(inputFromDraft(EMPTY_CUSTOM)).toBeNull();
    const ok = draftFromFood(food);
    expect(inputFromDraft({ ...ok, servingSize: "0" })).toBeNull();
    expect(inputFromDraft({ ...ok, name: "  " })).toBeNull();
    expect(inputFromDraft({ ...ok, fatPerServing: "" })).toBeNull();
  });
});

describe("draftFromFood", () => {
  it("shows the stored serving size", () => {
    const d = draftFromFood(food);
    expect(d.servingSize).toBe("28");
    expect(d.kcalPerServing).toBe("120");
    expect(d.proteinPerServing).toBe("24");
    expect(d.fiberPerServing).toBe("");
  });

  it("falls back to a 100 serving for older foods", () => {
    const d = draftFromFood({ ...food, servingSize: undefined });
    expect(d.servingSize).toBe("100");
    expect(d.kcalPerServing).toBe("428.6");
  });

  it("round-trips an untouched draft exactly, so renames don't fork", () => {
    const input = inputFromDraft({ ...draftFromFood(food), name: "Whey" }, food)!;
    expect(input.name).toBe("Whey");
    expect(nutritionChanged(food, input)).toBe(false);
  });

  it("keeps exact values for legacy foods whose per-serving strings are rounded", () => {
    const legacy = { ...food, servingSize: undefined, kcalPer100: 33.33 };
    const input = inputFromDraft(draftFromFood(legacy), legacy)!;
    expect(input.kcalPer100).toBe(33.33);
    expect(nutritionChanged(legacy, input)).toBe(false);
  });

  it("flags real nutrition edits", () => {
    const input = inputFromDraft({ ...draftFromFood(food), proteinPerServing: "25" }, food)!;
    expect(nutritionChanged(food, input)).toBe(true);
  });
});
