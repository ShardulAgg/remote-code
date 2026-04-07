"use client";

interface StatsBarProps {
  label: string;
  used: number;
  total: number;
}

export function StatsBar({ label, used, total }: StatsBarProps) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;

  let barColor: string;
  if (pct >= 90) {
    barColor = "bg-danger";
  } else if (pct >= 70) {
    barColor = "bg-warning";
  } else {
    barColor = "bg-success";
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-surface-lighter rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
