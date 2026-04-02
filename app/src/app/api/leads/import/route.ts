import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = session.user.role === 'ADMIN';
  let body: { rows: Record<string, string>[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const { rows } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Keine Daten' }, { status: 400 });
  }

  const errors: string[] = [];
  const toCreate: { firstName: string; lastName: string; companyId?: string; email?: string; phone?: string; assignedToId?: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Support firstName/lastName columns OR single name column
    const hasNameParts = row.firstName?.trim() || row.lastName?.trim();
    const hasName = row.name?.trim();
    if (!hasNameParts && !hasName) {
      errors.push(`Zeile ${i + 2}: 'name' oder 'firstName'/'lastName' fehlt`);
      continue;
    }

    let firstName: string;
    let lastName: string;
    if (hasNameParts) {
      firstName = row.firstName?.trim() ?? '';
      lastName = row.lastName?.trim() ?? '';
    } else {
      // Split "name" at last space
      const full = row.name.trim();
      const lastSpace = full.lastIndexOf(' ');
      if (lastSpace > 0) {
        firstName = full.substring(0, lastSpace);
        lastName = full.substring(lastSpace + 1);
      } else {
        firstName = full;
        lastName = '';
      }
    }

    let companyId: string | undefined;
    const companyName = row.company?.trim();
    if (companyName) {
      const company = await prisma.company.upsert({
        where: { name: companyName },
        update: {},
        create: { name: companyName },
      });
      companyId = company.id;
    }

    toCreate.push({
      firstName,
      lastName,
      companyId,
      email: row.email?.trim() || undefined,
      phone: normalizePhone(row.phone?.trim()) || undefined,
      assignedToId: isAdmin && row.assignedToId?.trim() ? row.assignedToId.trim() : session.user.id,
    });
  }

  if (errors.length > 0 && toCreate.length === 0) return NextResponse.json({ errors }, { status: 422 });

  let created = 0;
  if (toCreate.length > 0) {
    const result = await prisma.lead.createMany({ data: toCreate, skipDuplicates: true });
    created = result.count;
  }
  return NextResponse.json({ created, errors });
}
