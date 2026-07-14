import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

// PATCH: rename tag / change color — admin only (affects all companies using it)
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { name, color } = body;
  if (name !== undefined && !name?.trim()) return NextResponse.json({ error: 'Name darf nicht leer sein' }, { status: 400 });

  try {
    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(color !== undefined ? { color } : {}),
      },
    });
    return NextResponse.json(tag);
  } catch {
    return NextResponse.json({ error: 'Tag existiert bereits oder wurde nicht gefunden' }, { status: 409 });
  }
}

// DELETE: remove tag globally — admin only
export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.tag.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ success: true });
}
