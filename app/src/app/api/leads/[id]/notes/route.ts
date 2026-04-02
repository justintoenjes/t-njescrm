import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { sanitizeNoteContent } from '@/lib/sanitize-note';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RBAC: Only admin or assigned user can add notes
  const lead = await prisma.lead.findUnique({ where: { id }, select: { assignedToId: true } });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role !== 'ADMIN' && lead.assignedToId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { content, contactMade } = body;

  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.note.create({
      data: { content: sanitizeNoteContent(content), leadId: id, authorId: session.user.id },
    });
    if (contactMade) {
      await tx.lead.update({
        where: { id },
        data: { lastContactedAt: new Date(), missedCallsCount: 0, noShowCount: 0 },
      });
    }
    return created;
  });

  return NextResponse.json(note, { status: 201 });
}
