import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { LeadCategory, OpportunityStage } from '@prisma/client';

const VERTRIEB_STAGES: OpportunityStage[] = ['PROPOSAL', 'NEGOTIATION', 'CLOSING', 'WON', 'LOST'];
const RECRUITING_STAGES: OpportunityStage[] = ['SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];

const STAGE_WEIGHTS: Record<string, number> = {
  PROPOSAL: 0.2,
  NEGOTIATION: 0.5,
  CLOSING: 0.8,
  SCREENING: 0.1,
  INTERVIEW: 0.3,
  OFFER: 0.6,
};

const WON_STAGES: OpportunityStage[] = ['WON', 'HIRED'];
const LOST_STAGES: OpportunityStage[] = ['LOST', 'REJECTED'];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = session.user.role === 'ADMIN';
  const userFilter = isAdmin ? {} : { assignedToId: session.user.id };

  // Fetch all non-archived leads with their opportunities
  const leads = await prisma.lead.findMany({
    where: { archived: false, ...userFilter },
    select: {
      id: true,
      category: true,
      opportunities: {
        select: { stage: true, value: true },
      },
    },
  });

  const result: Record<LeadCategory, {
    funnel: { leads: number; withOpportunity: number; won: number };
    winRate: { won: number; lost: number; rate: number | null };
    pipeline: { stage: string; count: number; value: number; weighted: number }[];
    pipelineTotal: { value: number; weighted: number };
  }> = {} as any;

  for (const cat of ['VERTRIEB', 'RECRUITING'] as LeadCategory[]) {
    const catLeads = leads.filter(l => l.category === cat);
    const stages = cat === 'VERTRIEB' ? VERTRIEB_STAGES : RECRUITING_STAGES;
    const openStages = stages.filter(s => !WON_STAGES.includes(s) && !LOST_STAGES.includes(s));

    // Funnel
    const totalLeads = catLeads.length;
    const withOpp = catLeads.filter(l => l.opportunities.length > 0).length;
    const wonLeads = catLeads.filter(l =>
      l.opportunities.some(o => WON_STAGES.includes(o.stage))
    ).length;

    // Win-Rate (opportunity-level)
    const allOpps = catLeads.flatMap(l => l.opportunities);
    const wonCount = allOpps.filter(o => WON_STAGES.includes(o.stage)).length;
    const lostCount = allOpps.filter(o => LOST_STAGES.includes(o.stage)).length;
    const closedTotal = wonCount + lostCount;

    // Pipeline (open stages only)
    const pipeline = openStages.map(stage => {
      const stageOpps = allOpps.filter(o => o.stage === stage);
      const value = stageOpps.reduce((sum, o) => sum + (o.value ?? 0), 0);
      return {
        stage,
        count: stageOpps.length,
        value,
        weighted: value * (STAGE_WEIGHTS[stage] ?? 0),
      };
    }).filter(p => p.count > 0);

    const pipelineTotal = {
      value: pipeline.reduce((s, p) => s + p.value, 0),
      weighted: pipeline.reduce((s, p) => s + p.weighted, 0),
    };

    result[cat] = {
      funnel: { leads: totalLeads, withOpportunity: withOpp, won: wonLeads },
      winRate: { won: wonCount, lost: lostCount, rate: closedTotal > 0 ? wonCount / closedTotal : null },
      pipeline,
      pipelineTotal,
    };
  }

  return NextResponse.json(result);
}
