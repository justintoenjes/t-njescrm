import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { dialMethod: true, emailSignature: true },
  });
  return NextResponse.json(user ?? { dialMethod: 'tel', emailSignature: '' });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }

  const { dialMethod, emailSignature } = body;
  const validMethods = ['tel', 'fritzbox'];
  if (dialMethod && !validMethods.includes(dialMethod)) {
    return NextResponse.json({ error: 'Ungültige Wählmethode' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(dialMethod !== undefined ? { dialMethod } : {}),
      ...(emailSignature !== undefined ? { emailSignature } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
