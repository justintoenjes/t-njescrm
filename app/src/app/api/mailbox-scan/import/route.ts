import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/phone';
import { LeadCategory } from '@prisma/client';

type ImportContact = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  company?: string;
};

type ImportRequest = {
  contacts: ImportContact[];
  category: 'VERTRIEB' | 'RECRUITING';
};

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: ImportRequest;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }

  const { contacts, category } = body;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: 'Keine Kontakte' }, { status: 400 });
  }

  const errors: string[] = [];
  const toCreate: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    companyId?: string;
    category: LeadCategory;
    assignedToId: string;
  }[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    if (!c.firstName?.trim() && !c.lastName?.trim()) {
      errors.push(`Kontakt ${i + 1}: Kein Name`);
      continue;
    }

    let companyId: string | undefined;
    if (c.company?.trim()) {
      const company = await prisma.company.upsert({
        where: { name: c.company.trim() },
        update: {},
        create: { name: c.company.trim() },
      });
      companyId = company.id;
    }

    toCreate.push({
      firstName: c.firstName?.trim() ?? '',
      lastName: c.lastName?.trim() ?? '',
      email: c.email?.trim() || undefined,
      phone: normalizePhone(c.phone?.trim()) || undefined,
      companyId,
      category: category as LeadCategory,
      assignedToId: session.user.id,
    });
  }

  if (errors.length > 0 && toCreate.length === 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  let created = 0;
  if (toCreate.length > 0) {
    const result = await prisma.lead.createMany({ data: toCreate, skipDuplicates: true });
    created = result.count;
  }

  return NextResponse.json({ created, errors });
}
