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
