type HapticKind = "light" | "medium" | "success" | "warning" | "error";
type VibrateFn = (pattern: number | number[]) => boolean;

const PATTERN: Record<HapticKind, number | number[]> = {
  light: 8,
  medium: 14,
  success: [10, 30, 10],
  warning: [20, 40, 20],
  error: [30, 60, 30, 60, 30],
};

export function haptic(kind: HapticKind = "light") {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: VibrateFn };
  if (!nav.vibrate) return;
  try {
    nav.vibrate(PATTERN[kind]);
  } catch {
    // ignore
  }
}
