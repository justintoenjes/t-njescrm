import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { pickTagColor } from '@/lib/tags';

type Ctx = { params: Promise<{ id: string }> };

// POST: assign a tag to the company; creates the tag if it doesn't exist yet.
// Open to all users — tags are part of the shared contact directory.
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 }); }
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name erforderlich' }, { status: 400 });
  if (name.length > 40) return NextResponse.json({ error: 'Tag-Name zu lang (max. 40 Zeichen)' }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id }, select: { id: true } });
  if (!company) return NextResponse.json({ error: 'Firma nicht gefunden' }, { status: 404 });

  // Case-insensitive reuse of existing tags to avoid "Partner"/"partner" duplicates
  const existing = await prisma.tag.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  const tag = existing ?? await prisma.tag.create({ data: { name, color: pickTagColor(name.toLowerCase()) } });

  await prisma.company.update({
    where: { id },
    data: { tags: { connect: { id: tag.id } } },
  });

  return NextResponse.json(tag, { status: existing ? 200 : 201 });
}

// DELETE ?tagId=…: remove a tag from this company (tag itself remains)
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tagId = new URL(request.url).searchParams.get('tagId');
  if (!tagId) return NextResponse.json({ error: 'tagId erforderlich' }, { status: 400 });

  await prisma.company.update({
    where: { id },
    data: { tags: { disconnect: { id: tagId } } },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
