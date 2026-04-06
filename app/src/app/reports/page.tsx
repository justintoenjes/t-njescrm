'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { TrendingUp, ArrowRight, Target, DollarSign } from 'lucide-react';
import Header from '@/components/Header';
import { useCategory } from '@/lib/category-context';
import { OPP_STAGE_LABELS } from '@/lib/opportunity';
import { OpportunityStage } from '@prisma/client';

type FunnelData = { leads: number; withOpportunity: number; won: number };
type WinRateData = { won: number; lost: number; rate: number | null };
type PipelineRow = { stage: string; count: number; value: number; weighted: number };
type CategoryReport = {
  funnel: FunnelData;
  winRate: WinRateData;
  pipeline: PipelineRow[];
  pipelineTotal: { value: number; weighted: number };
};

const STAGE_WEIGHT_LABELS: Record<string, string> = {
  PROPOSAL: '20%', NEGOTIATION: '50%', CLOSING: '80%',
  SCREENING: '10%', INTERVIEW: '30%', OFFER: '60%',
};

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function FunnelChart({ data, isRecruiting }: { data: FunnelData; isRecruiting: boolean }) {
  const max = Math.max(data.leads, 1);
  const steps = [
    { label: isRecruiting ? 'Kandidaten' : 'Leads', value: data.leads, color: 'bg-tc-blue' },
    { label: isRecruiting ? 'Mit Stelle' : 'Mit Opportunity', value: data.withOpportunity, color: 'bg-amber-500' },
    { label: isRecruiting ? 'Eingestellt' : 'Gewonnen', value: data.won, color: 'bg-emerald-500' },
  ];

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={step.label}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">{step.label}</span>
              {i > 0 && (
                <span className="text-xs text-gray-400">
                  ({steps[i - 1].value > 0 ? pct(step.value / steps[i - 1].value) : '–'} von {steps[i - 1].label})
                </span>
              )}
            </div>
            <span className="text-sm font-semibold text-gray-900">{step.value}</span>
          </div>
          <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
            <div
              className={`h-full ${step.color} rounded-lg transition-all duration-500`}
              style={{ width: `${Math.max((step.value / max) * 100, step.value > 0 ? 3 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function WinRateCard({ data, isRecruiting }: { data: WinRateData; isRecruiting: boolean }) {
  const wonLabel = isRecruiting ? 'Eingestellt' : 'Gewonnen';
  const lostLabel = isRecruiting ? 'Abgelehnt' : 'Verloren';

  return (
    <div className="text-center">
      <div className="text-5xl font-bold text-tc-dark mb-2">
        {data.rate !== null ? pct(data.rate) : '–'}
      </div>
      <div className="text-sm text-gray-500 mb-4">Win-Rate</div>
      <div className="flex justify-center gap-6 text-sm">
        <div>
          <span className="font-semibold text-emerald-600">{data.won}</span>
          <span className="text-gray-500 ml-1">{wonLabel}</span>
        </div>
        <div>
          <span className="font-semibold text-red-500">{data.lost}</span>
          <span className="text-gray-500 ml-1">{lostLabel}</span>
        </div>
      </div>
    </div>
  );
}

function PipelineTable({ rows, total, isRecruiting }: { rows: PipelineRow[]; total: { value: number; weighted: number }; isRecruiting: boolean }) {
  if (rows.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-6">Keine offenen {isRecruiting ? 'Stellen' : 'Opportunities'}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-100">
            <th className="py-2 font-medium">Stage</th>
            <th className="py-2 font-medium text-right">Anzahl</th>
            {!isRecruiting && <th className="py-2 font-medium text-right">Wert</th>}
            {!isRecruiting && <th className="py-2 font-medium text-right">Gewichtet</th>}
            <th className="py-2 font-medium text-right">Gewicht</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.stage} className="border-b border-gray-50">
              <td className="py-2.5 font-medium text-gray-900">
                {OPP_STAGE_LABELS[row.stage as OpportunityStage] ?? row.stage}
              </td>
              <td className="py-2.5 text-right text-gray-700">{row.count}</td>
              {!isRecruiting && <td className="py-2.5 text-right text-gray-700">{fmt(row.value)}</td>}
              {!isRecruiting && <td className="py-2.5 text-right font-medium text-tc-dark">{fmt(row.weighted)}</td>}
              <td className="py-2.5 text-right text-gray-400">{STAGE_WEIGHT_LABELS[row.stage] ?? '–'}</td>
            </tr>
          ))}
        </tbody>
        {!isRecruiting && (
          <tfoot>
            <tr className="border-t-2 border-gray-200 font-semibold">
              <td className="py-2.5">Gesamt</td>
              <td className="py-2.5 text-right">{rows.reduce((s, r) => s + r.count, 0)}</td>
              <td className="py-2.5 text-right">{fmt(total.value)}</td>
              <td className="py-2.5 text-right text-tc-dark">{fmt(total.weighted)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { category } = useCategory();
  const [data, setData] = useState<Record<string, CategoryReport> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    setLoading(true);
    fetch('/api/reports')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (status === 'loading' || !session) return null;

  const isRecruiting = category === 'RECRUITING';
  const cat = isRecruiting ? 'RECRUITING' : 'VERTRIEB';
  const report = data?.[cat];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-tc-dark">
          {isRecruiting ? 'Recruiting' : 'Vertrieb'} — Reporting
        </h1>

        {loading ? (
          <div className="text-center py-20 text-gray-400 animate-pulse">Lade Daten…</div>
        ) : !report ? (
          <div className="text-center py-20 text-gray-400">Keine Daten verfügbar</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Conversion Funnel */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-tc-blue" />
                <h2 className="font-semibold text-gray-900">Conversion Funnel</h2>
              </div>
              <FunnelChart data={report.funnel} isRecruiting={isRecruiting} />
              {report.funnel.leads > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-center gap-2 text-sm text-gray-500">
                  <span>Gesamt-Conversion:</span>
                  <span className="font-semibold text-tc-dark">
                    {pct(report.funnel.won / report.funnel.leads)}
                  </span>
                  <span className="text-xs">
                    ({isRecruiting ? 'Kandidat' : 'Lead'} → {isRecruiting ? 'Eingestellt' : 'Gewonnen'})
                  </span>
                </div>
              )}
            </div>

            {/* Win-Rate */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-4 justify-center">
                <Target size={18} className="text-tc-blue" />
                <h2 className="font-semibold text-gray-900">Win-Rate</h2>
              </div>
              <WinRateCard data={report.winRate} isRecruiting={isRecruiting} />
            </div>

            {/* Pipeline Forecast */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={18} className="text-tc-blue" />
                <h2 className="font-semibold text-gray-900">Pipeline Forecast</h2>
                {!isRecruiting && report.pipelineTotal.weighted > 0 && (
                  <span className="ml-auto text-lg font-bold text-tc-dark">
                    {fmt(report.pipelineTotal.weighted)}
                  </span>
                )}
              </div>
              <PipelineTable rows={report.pipeline} total={report.pipelineTotal} isRecruiting={isRecruiting} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
