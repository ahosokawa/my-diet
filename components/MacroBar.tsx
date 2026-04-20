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
    <div
      data-macro={label.toLowerCase()}
      data-current={Math.round(current)}
      data-target={Math.round(target)}
    >
      <div className="mb-1 flex justify-between text-xs font-medium text-fg-2">
        <span>{label}</span>
        <span>
          {Math.round(current)} <span className="text-fg-3">/ {Math.round(target)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
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
    <div
      className="space-y-2.5"
      data-macro-row
      data-kcal-current={Math.round(current.kcal)}
      data-kcal-target={target.kcal}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-fg-2">kcal</span>
        <span className="text-lg font-semibold tabular-nums">
          {Math.round(current.kcal)}{" "}
          <span className="text-sm font-normal text-fg-3">/ {target.kcal}</span>
        </span>
      </div>
      <MacroBar label="Protein" current={current.proteinG} target={target.proteinG} color="#26a55e" />
      <MacroBar label="Fat" current={current.fatG} target={target.fatG} color="#f59e0b" />
      <MacroBar label="Carbs" current={current.carbG} target={target.carbG} color="#3b82f6" />
    </div>
  );
}
