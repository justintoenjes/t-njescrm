import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/phone';

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { number, label } = body as { number?: string; label?: string };

  const norm = normalizePhone(number);
  if (!norm) return NextResponse.json({ error: 'Nummer ungültig' }, { status: 400 });
  const trimmed = (label ?? '').trim();
  if (!trimmed) return NextResponse.json({ error: 'Name erforderlich' }, { status: 400 });

  const saved = await prisma.phoneLabel.upsert({
    where: { number: norm },
    update: { label: trimmed },
    create: { number: norm, label: trimmed, createdById: session.user.id },
  });

  return NextResponse.json(saved);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const norm = normalizePhone(searchParams.get('number'));
  if (!norm) return NextResponse.json({ error: 'Nummer ungültig' }, { status: 400 });

  await prisma.phoneLabel.deleteMany({ where: { number: norm } });
  return NextResponse.json({ ok: true });
}
