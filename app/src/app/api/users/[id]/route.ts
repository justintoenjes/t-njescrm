import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/users/[id] — Admin: update user (password reset)
export async function PUT(request: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { password } = body;

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Passwort muss mindestens 6 Zeichen haben' }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id },
    data: { password: hashed },
  });

  return NextResponse.json({ ok: true });
}
