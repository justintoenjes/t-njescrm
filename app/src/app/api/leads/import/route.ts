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
  const toCreate: { name: string; companyId?: string; email?: string; phone?: string; assignedToId?: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name?.trim()) {
      errors.push(`Zeile ${i + 2}: 'name' fehlt`);
      continue;
    }

    let companyId: string | undefined;
    const companyName = row.company?.trim();
    if (companyName) {
      const existing = await prisma.company.findFirst({ where: { name: companyName } });
      if (existing) {
        companyId = existing.id;
      } else {
        const created = await prisma.company.create({ data: { name: companyName } });
        companyId = created.id;
      }
    }

    toCreate.push({
      name: row.name.trim(),
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
