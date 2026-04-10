import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { decryptSipPassword } from '@/lib/sip-crypto';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { dialMethod: true, sipUsername: true, sipPassword: true },
  });

  if (!user || user.dialMethod !== 'sip' || !user.sipUsername || !user.sipPassword) {
    return NextResponse.json({ error: 'SIP not configured' }, { status: 404 });
  }

  try {
    const password = decryptSipPassword(user.sipPassword);
    return NextResponse.json({
      sipUsername: user.sipUsername,
      sipPassword: password,
      wsUrl: process.env.SIP_GATEWAY_WS_URL || 'wss://microcrm/ws-sip',
    });
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt SIP credentials' }, { status: 500 });
  }
}
