#!/bin/sh
set -e

echo "Applying database schema..."
# Migrate name → firstName/lastName if old column still exists
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function migrate() {
  const hasName = await prisma.\$queryRawUnsafe(
    \"SELECT column_name FROM information_schema.columns WHERE table_name='Lead' AND column_name='name'\"
  );
  if (hasName.length > 0) {
    console.log('Migrating Lead.name → firstName/lastName...');
    await prisma.\$executeRawUnsafe('ALTER TABLE \"Lead\" ADD COLUMN IF NOT EXISTS \"firstName\" TEXT NOT NULL DEFAULT \'\'');
    await prisma.\$executeRawUnsafe('ALTER TABLE \"Lead\" ADD COLUMN IF NOT EXISTS \"lastName\" TEXT NOT NULL DEFAULT \'\'');
    await prisma.\$executeRawUnsafe(\`
      UPDATE \"Lead\" SET
        \"firstName\" = CASE WHEN position(' ' in \"name\") > 0
          THEN left(\"name\", length(\"name\") - length(substring(\"name\" from '([^ ]+)\$')) - 1)
          ELSE \"name\" END,
        \"lastName\" = CASE WHEN position(' ' in \"name\") > 0
          THEN substring(\"name\" from '([^ ]+)\$')
          ELSE '' END
      WHERE \"firstName\" = '' AND \"lastName\" = ''
    \`);
    await prisma.\$executeRawUnsafe('ALTER TABLE \"Lead\" DROP COLUMN IF EXISTS \"name\"');
    console.log('Migration complete.');
  }
  await prisma.\$disconnect();
}
migrate().catch(e => { console.error('Name migration error:', e); });
"
npx prisma db push --accept-data-loss

echo "Seeding default config..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function seed() {
  await prisma.globalConfig.upsert({ where: { key: 'days_warm' }, update: {}, create: { key: 'days_warm', value: '14' } });
  await prisma.globalConfig.upsert({ where: { key: 'days_cold' }, update: {}, create: { key: 'days_cold', value: '30' } });
  await prisma.globalConfig.upsert({ where: { key: 'default_formal_address' }, update: {}, create: { key: 'default_formal_address', value: 'false' } });
  await prisma.\$disconnect();
}
seed().catch(e => { console.error(e); process.exit(1); });
"

echo "Seeding initial admin user..."
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function seedAdmin() {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log('Users already exist, skipping admin seed.');
    await prisma.\$disconnect();
    return;
  }
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('INITIAL_ADMIN_EMAIL or INITIAL_ADMIN_PASSWORD not set, skipping admin seed.');
    await prisma.\$disconnect();
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { name: 'Admin', email, password: hash, role: 'ADMIN' } });
  console.log('Initial admin created:', email);
  await prisma.\$disconnect();
}
seedAdmin().catch(e => { console.error(e); process.exit(1); });
"

echo "Starting application..."
exec node server.js
