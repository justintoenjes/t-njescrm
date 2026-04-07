import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { dialMethod: true, emailSignature: true, nameOrder: true, password: true },
  });
  return NextResponse.json({
    dialMethod: user?.dialMethod ?? 'tel',
    emailSignature: user?.emailSignature ?? '',
    nameOrder: user?.nameOrder ?? 'lastFirst',
    hasPassword: !!(user?.password),
  });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }

  const { dialMethod, emailSignature, nameOrder, currentPassword, newPassword, deletePassword } = body;
  const validMethods = ['tel', 'fritzbox'];
  if (dialMethod && !validMethods.includes(dialMethod)) {
    return NextResponse.json({ error: 'Ungültige Wählmethode' }, { status: 400 });
  }
  const validNameOrders = ['firstLast', 'lastFirst'];
  if (nameOrder && !validNameOrders.includes(nameOrder)) {
    return NextResponse.json({ error: 'Ungültige Namensreihenfolge' }, { status: 400 });
  }

  // Password management
  if (deletePassword) {
    await prisma.user.update({ where: { id: session.user.id }, data: { password: '' } });
    return NextResponse.json({ ok: true });
  }

  if (newPassword !== undefined) {
    if (newPassword.length < 6) return NextResponse.json({ error: 'Neues Passwort muss mindestens 6 Zeichen haben' }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
    // If user has a password, verify current password
    if (user?.password) {
      if (!currentPassword) return NextResponse.json({ error: 'Aktuelles Passwort erforderlich' }, { status: 400 });
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return NextResponse.json({ error: 'Aktuelles Passwort ist falsch' }, { status: 400 });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: session.user.id }, data: { password: hashed } });
    return NextResponse.json({ ok: true });
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
