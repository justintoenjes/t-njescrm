import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ leads: [], companies: [], templates: [], opportunities: [] });

  const isAdmin = session.user.role === 'ADMIN';
  const category = new URL(request.url).searchParams.get('category') ?? undefined;

  const containsQ = { contains: q, mode: 'insensitive' as const };

  const [leads, companies, templates, opportunities] = await Promise.all([
    prisma.lead.findMany({
      where: {
        AND: [
          isAdmin ? {} : { assignedToId: session.user.id },
          category ? { category: category as any } : {},
          { archived: false },
          {
            OR: [
              { firstName: containsQ },
              { lastName: containsQ },
              { email: containsQ },
              { phone: containsQ },
              { companyRef: { name: containsQ } },
            ],
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        companyRef: { select: { id: true, name: true } },
      },
      take: 5,
      orderBy: { lastContactedAt: 'desc' },
    }),

    prisma.company.findMany({
      where: { OR: [{ name: containsQ }, { website: containsQ }] },
      select: { id: true, name: true, website: true },
      take: 5,
      orderBy: { name: 'asc' },
    }),

    prisma.productTemplate.findMany({
      where: {
        AND: [
          category ? { category: category as any } : {},
          { OR: [{ name: containsQ }, { description: containsQ }] },
        ],
      },
      select: { id: true, name: true, category: true },
      take: 5,
      orderBy: { name: 'asc' },
    }),

    prisma.opportunity.findMany({
      where: {
        AND: [
          isAdmin ? {} : { assignedToId: session.user.id },
          {
            OR: [
              { title: containsQ },
              { lead: { firstName: containsQ } },
              { lead: { lastName: containsQ } },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        stage: true,
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({ leads, companies, templates, opportunities });
}
