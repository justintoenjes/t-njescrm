import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

async function getLeadIdForNote(note: { leadId: string | null; opportunityId: string | null }): Promise<string | null> {
  if (note.leadId) return note.leadId;
  if (note.opportunityId) {
    const opp = await prisma.opportunity.findUnique({ where: { id: note.opportunityId }, select: { leadId: true } });
    return opp?.leadId ?? null;
  }
  return null;
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { leadId, opportunityId } = body as { leadId?: string; opportunityId?: string };

  // Exactly one target must be set
  if ((!leadId && !opportunityId) || (leadId && opportunityId)) {
    return NextResponse.json({ error: 'Genau ein Ziel (leadId oder opportunityId) angeben' }, { status: 400 });
  }

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return NextResponse.json({ error: 'Notiz nicht gefunden' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';

  // Check access to note's current parent
  const currentLeadId = await getLeadIdForNote(note);
  if (!currentLeadId) {
    console.error(`Orphaned note ${id}: leadId=${note.leadId}, opportunityId=${note.opportunityId}`);
    return NextResponse.json({ error: 'Verwaiste Notiz' }, { status: 400 });
  }

  if (!isAdmin) {
    const lead = await prisma.lead.findUnique({ where: { id: currentLeadId }, select: { assignedToId: true } });
    if (lead?.assignedToId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Validate target and ensure same lead family
  if (leadId) {
    if (leadId !== currentLeadId) {
      return NextResponse.json({ error: 'Notiz kann nur innerhalb desselben Leads verschoben werden' }, { status: 400 });
    }
    // Move to lead directly
    const updated = await prisma.note.update({
      where: { id },
      data: { leadId, opportunityId: null },
      include: { author: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  }

  if (opportunityId) {
    const targetOpp = await prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { leadId: true } });
    if (!targetOpp) return NextResponse.json({ error: 'Opportunity nicht gefunden' }, { status: 404 });
    if (targetOpp.leadId !== currentLeadId) {
      return NextResponse.json({ error: 'Opportunity gehört nicht zu diesem Lead' }, { status: 400 });
    }
    // Move to opportunity
    const updated = await prisma.note.update({
      where: { id },
      data: { opportunityId, leadId: null },
      include: { author: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'Ungültiges Ziel' }, { status: 400 });
}
