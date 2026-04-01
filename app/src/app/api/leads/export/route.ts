import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeLeadPhase, LeadPhase } from '@/lib/phase';
import { LeadCategory } from '@prisma/client';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = session.user.role === 'ADMIN';
  const { searchParams } = new URL(request.url);
  const phaseFilter = searchParams.get('phase') as LeadPhase | null;
  const categoryFilter = searchParams.get('category') as LeadCategory | null;

  const leads = await prisma.lead.findMany({
    where: {
      ...(isAdmin ? {} : { assignedToId: session.user.id }),
      ...(categoryFilter ? { category: categoryFilter } : {}),
    },
    include: {
      companyRef: { select: { id: true, name: true } },
      assignedTo: { select: { name: true } },
      opportunities: { select: { stage: true } },
      _count: { select: { notes: true, opportunities: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const withPhase = leads.map(l => ({
    ...l,
    phase: computeLeadPhase({ ...l, _noteCount: l._count.notes }),
  }));

  const filtered = phaseFilter ? withPhase.filter(l => l.phase === phaseFilter) : withPhase;

  const headers = ['id', 'name', 'company', 'email', 'phone', 'category', 'phase', 'archived', 'assignedTo', 'lastContactedAt', 'createdAt', 'notesCount', 'opportunitiesCount'];

  const rows = filtered.map(l => [
    l.id, l.name, l.companyRef?.name ?? '', l.email ?? '', l.phone ?? '',
    l.category, l.phase, l.archived ? 'ja' : 'nein',
    l.assignedTo?.name ?? '',
    l.lastContactedAt ? l.lastContactedAt.toISOString() : '',
    l.createdAt.toISOString(),
    l._count.notes, l._count.opportunities,
  ]);

  const escape = (v: unknown) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
