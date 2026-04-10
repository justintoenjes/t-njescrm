import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sipUsername = process.env.SIP_USERNAME;
  const sipPassword = process.env.SIP_PASSWORD;

  if (!sipUsername || !sipPassword) {
    return NextResponse.json({ error: 'SIP not configured in .env' }, { status: 404 });
  }

  return NextResponse.json({
    sipUsername,
    sipPassword,
    wsUrl: process.env.SIP_GATEWAY_WS_URL || 'wss://microcrm/ws-sip',
  });
}
