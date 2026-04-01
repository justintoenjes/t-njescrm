import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { LeadCategory } from '@prisma/client';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') as LeadCategory | null;

  const templates = await prisma.productTemplate.findMany({
    where: category ? { category } : {},
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { opportunities: true } },
      opportunities: {
        select: { stage: true, leadId: true },
      },
    },
  });

  const result = templates.map(({ opportunities, ...t }) => {
    // Deduplicate leads, count by opp stage
    const leadIds = new Set(opportunities.map(o => o.leadId));
    const phaseDistribution: Record<string, number> = {};
    for (const opp of opportunities) {
      phaseDistribution[opp.stage] = (phaseDistribution[opp.stage] ?? 0) + 1;
    }
    return {
      ...t,
      candidateCount: leadIds.size,
      phaseDistribution,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { name, description, defaultValue, category } = body;
  if (!name) return NextResponse.json({ error: 'Name erforderlich' }, { status: 400 });

  const template = await prisma.productTemplate.create({
    data: {
      name,
      description: description || null,
      defaultValue: defaultValue ?? null,
      category: category || 'VERTRIEB',
    },
    include: { _count: { select: { opportunities: true } } },
  });
  return NextResponse.json(template, { status: 201 });
}
