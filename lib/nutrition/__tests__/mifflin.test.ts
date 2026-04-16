import { describe, it, expect } from "vitest";
import { mifflinStJeorBmr, tdee, lbToKg, inToCm } from "../mifflin";

describe("mifflinStJeorBmr", () => {
  it("computes male BMR correctly", () => {
    // 30yo male, 180lb (81.6kg), 70in (177.8cm)
    // BMR = 10*81.6 + 6.25*177.8 - 5*30 + 5 = 816 + 1111.25 - 150 + 5 = 1782.25
    const result = mifflinStJeorBmr({
      sex: "male",
      age: 30,
      weightLb: 180,
      heightIn: 70,
    });
    expect(result).toBeCloseTo(1782.25, 0);
  });

  it("computes female BMR correctly", () => {
    // 25yo female, 140lb (63.5kg), 65in (165.1cm)
    // BMR = 10*63.5 + 6.25*165.1 - 5*25 - 161 = 635 + 1031.88 - 125 - 161 = 1380.88
    const result = mifflinStJeorBmr({
      sex: "female",
      age: 25,
      weightLb: 140,
      heightIn: 65,
    });
    expect(result).toBeCloseTo(1380.88, 0);
  });
});

describe("tdee", () => {
  it("applies activity factor", () => {
    const bmr = mifflinStJeorBmr({ sex: "male", age: 30, weightLb: 180, heightIn: 70 });
    const result = tdee({ sex: "male", age: 30, weightLb: 180, heightIn: 70, activity: "moderate" });
    expect(result).toBeCloseTo(bmr * 1.55, 0);
  });
});

describe("conversions", () => {
  it("converts lbs to kg", () => {
    expect(lbToKg(220)).toBeCloseTo(99.79, 1);
  });
  it("converts inches to cm", () => {
    expect(inToCm(72)).toBeCloseTo(182.88, 1);
  });
});
