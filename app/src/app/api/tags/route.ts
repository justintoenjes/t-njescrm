import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

// GET: all tags with usage count (for pickers and filters)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tags = await prisma.tag.findMany({
    include: { _count: { select: { companies: true } } },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(
    tags.map(t => ({ id: t.id, name: t.name, color: t.color, companyCount: t._count.companies }))
  );
}
