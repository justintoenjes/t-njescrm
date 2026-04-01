import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { readFile, readdir } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: {
      lead: { select: { assignedToId: true } },
      opportunity: { select: { assignedToId: true, lead: { select: { assignedToId: true } } } },
    },
  });
  if (!attachment) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  const ownerId = attachment.lead?.assignedToId ?? attachment.opportunity?.assignedToId ?? attachment.opportunity?.lead?.assignedToId;
  if (!isAdmin && ownerId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const subDir = attachment.leadId ? `leads/${attachment.leadId}` : `opportunities/${attachment.opportunityId}`;
  const dir = path.join(UPLOAD_DIR, subDir);
  const prefix = `${attachment.id}_`;

  try {
    const files = await readdir(dir);
    const match = files.find(f => f.startsWith(prefix));
    if (!match) return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 });

    const buffer = await readFile(path.join(dir, match));
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 });
  }
}
