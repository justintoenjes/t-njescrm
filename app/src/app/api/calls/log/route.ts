import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const filter = searchParams.get('filter'); // 'missed' | 'incoming' | 'outgoing' | null (all)
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 50;

  const where: Record<string, unknown> = {};
  if (filter === 'missed') {
    where.answered = false;
    where.direction = 'incoming';
  } else if (filter === 'incoming') {
    where.direction = 'incoming';
  } else if (filter === 'outgoing') {
    where.direction = 'outgoing';
  }

  const [calls, total, unseenCount] = await Promise.all([
    prisma.callLog.findMany({
      where,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, companyRef: { select: { name: true } } } },
      },
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.callLog.count({ where }),
    prisma.callLog.count({ where: { seen: false, answered: false, direction: 'incoming' } }),
  ]);

  return NextResponse.json({ calls, total, unseenCount, page, pages: Math.ceil(total / limit) });
}

// Mark calls as seen
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ids } = await req.json();

  if (ids === 'all') {
    await prisma.callLog.updateMany({
      where: { seen: false },
      data: { seen: true },
    });
  } else if (Array.isArray(ids)) {
    await prisma.callLog.updateMany({
      where: { id: { in: ids } },
      data: { seen: true },
    });
  }

  return NextResponse.json({ ok: true });
}
