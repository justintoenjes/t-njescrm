'use client';

type KPI = {
  label: string;
  value: string | number;
  color?: string;
};

type Props = {
  kpis: KPI[];
};

export default function KPIBar({ kpis }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${
            kpi.color ?? 'bg-gray-50 text-gray-700 border-gray-200'
          }`}
        >
          <span className="font-bold">{kpi.value}</span>
          <span className="opacity-70">{kpi.label}</span>
        </div>
      ))}
    </div>
  );
}
