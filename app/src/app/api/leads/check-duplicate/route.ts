import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }

  const { email, phone } = body;
  const normalizedPhone = normalizePhone(phone);
  const duplicates: { id: string; name: string; matchedBy: string }[] = [];

  if (email) {
    const byEmail = await prisma.lead.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, archived: false },
      select: { id: true, name: true },
    });
    if (byEmail) {
      duplicates.push({ id: byEmail.id, name: byEmail.name, matchedBy: 'email' });
    }
  }

  if (normalizedPhone) {
    const byPhone = await prisma.lead.findFirst({
      where: { phone: normalizedPhone, archived: false },
      select: { id: true, name: true },
    });
    if (byPhone && !duplicates.some(d => d.id === byPhone.id)) {
      duplicates.push({ id: byPhone.id, name: byPhone.name, matchedBy: 'phone' });
    }
  }

  return NextResponse.json({ duplicates });
}
