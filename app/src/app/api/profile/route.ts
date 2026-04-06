import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { dialMethod: true, emailSignature: true, nameOrder: true },
  });
  return NextResponse.json(user ?? { dialMethod: 'tel', emailSignature: '', nameOrder: 'lastFirst' });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }

  const { dialMethod, emailSignature, nameOrder } = body;
  const validMethods = ['tel', 'fritzbox'];
  if (dialMethod && !validMethods.includes(dialMethod)) {
    return NextResponse.json({ error: 'Ungültige Wählmethode' }, { status: 400 });
  }
  const validNameOrders = ['firstLast', 'lastFirst'];
  if (nameOrder && !validNameOrders.includes(nameOrder)) {
    return NextResponse.json({ error: 'Ungültige Namensreihenfolge' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(dialMethod !== undefined ? { dialMethod } : {}),
      ...(emailSignature !== undefined ? { emailSignature } : {}),
      ...(nameOrder !== undefined ? { nameOrder } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
