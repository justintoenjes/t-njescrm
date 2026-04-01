import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const note = await prisma.note.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });
  if (!note) return NextResponse.json({ error: 'Notiz nicht gefunden' }, { status: 404 });

  // Only author or admin can delete
  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && note.authorId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.note.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
