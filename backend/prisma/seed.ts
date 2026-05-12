import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { resolve } from 'path'
import { isPostgresDatabaseUrl, resolveDatabaseUrl } from '../src/lib/databaseUrl.js'

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${resolve(import.meta.dir, '..', 'opet.db')}`
}

const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL, resolve(import.meta.dir, '..'))
process.env.DATABASE_URL = databaseUrl
const isPostgres = isPostgresDatabaseUrl(databaseUrl)
const adapter = isPostgres
  ? new PrismaPg(databaseUrl)
  : new PrismaLibSql({ url: databaseUrl })

const prisma = new PrismaClient({ adapter })

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.ADMIN_PASSWORD || 'changeme-admin-password'

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Admin user already exists: ${email}`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, passwordHash, role: 'admin' },
  })

  console.log(`Created admin user: ${user.email} (id: ${user.id})`)
  console.log('IMPORTANT: Change the admin password before going to production!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
