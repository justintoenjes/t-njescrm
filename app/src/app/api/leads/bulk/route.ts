import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }

  const { ids, action, value } = body as { ids: string[]; action: string; value?: string };
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Keine Leads ausgewählt' }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: 'Maximal 200 Leads gleichzeitig' }, { status: 400 });
  }

  const isAdmin = session.user.role === 'ADMIN';

  // Non-admins can only modify their own leads
  const where = isAdmin
    ? { id: { in: ids } }
    : { id: { in: ids }, assignedToId: session.user.id };

  let updated: number;

  switch (action) {
    case 'archive':
      ({ count: updated } = await prisma.lead.updateMany({ where, data: { archived: true } }));
      break;
    case 'unarchive':
      ({ count: updated } = await prisma.lead.updateMany({ where, data: { archived: false } }));
      break;
    case 'assign':
      if (!isAdmin) return NextResponse.json({ error: 'Nur Admins können zuweisen' }, { status: 403 });
      if (!value) return NextResponse.json({ error: 'Kein User angegeben' }, { status: 400 });
      ({ count: updated } = await prisma.lead.updateMany({ where, data: { assignedToId: value } }));
      break;
    default:
      return NextResponse.json({ error: `Unbekannte Aktion: ${action}` }, { status: 400 });
  }

  return NextResponse.json({ updated });
}
