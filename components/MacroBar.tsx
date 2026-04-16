export function MacroBar({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
}) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-medium text-neutral-600">
        <span>{label}</span>
        <span>
          {Math.round(current)} / {Math.round(target)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function MacroRow({
  target,
  current,
}: {
  target: { proteinG: number; fatG: number; carbG: number; kcal: number };
  current: { proteinG: number; fatG: number; carbG: number; kcal: number };
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-neutral-500">kcal</span>
        <span className="text-lg font-semibold">
          {Math.round(current.kcal)}{" "}
          <span className="text-sm text-neutral-500">/ {target.kcal}</span>
        </span>
      </div>
      <MacroBar label="Protein" current={current.proteinG} target={target.proteinG} color="#26a55e" />
      <MacroBar label="Fat" current={current.fatG} target={target.fatG} color="#f59e0b" />
      <MacroBar label="Carbs" current={current.carbG} target={target.carbG} color="#3b82f6" />
    </div>
  );
}
