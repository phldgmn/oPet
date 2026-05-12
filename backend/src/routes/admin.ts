import { Hono } from 'hono'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, resolve, join } from 'node:path'
import { prisma } from '../db.js'
import { authMiddleware, signToken } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { createAuditLog } from '../lib/audit.js'
import { exportSignatures } from '../lib/export.js'
import { importNewsFromEnabledSources } from '../lib/news.js'
import { toApiNewsSourceFeedUrl, toStoredNewsSourceFeedUrl } from '../lib/newsSources.js'
import type { AppVariables } from '../types.js'
import { t } from '../lib/i18n.js'

export const adminRoutes = new Hono<{ Variables: AppVariables }>()

const ROLE_VALUES = ['admin', 'organizer', 'reader'] as const
const WRITE_ROLES = ['admin', 'organizer'] as const

type Role = (typeof ROLE_VALUES)[number]

function normalizeRole(role?: string | null): Role {
  const value = (role ?? '').toLowerCase()
  if (value === 'moderator') return 'organizer'
  if (ROLE_VALUES.includes(value as Role)) return value as Role
  return 'reader'
}

function isAdmin(role?: string | null): boolean {
  return normalizeRole(role) === 'admin'
}

function canWritePetitions(role?: string | null): boolean {
  const normalized = normalizeRole(role)
  return (WRITE_ROLES as readonly string[]).includes(normalized)
}

function isSupportedImageReference(value: string): boolean {
  if (value.startsWith('/uploads/')) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const imageReferenceSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.union([
    z.string().max(2048).refine(
      (value) => isSupportedImageReference(value),
      'Image must be an absolute http(s) URL or an /uploads/* path',
    ),
    z.null(),
  ]).optional(),
)

function toApiNewsSource<T extends { feedUrl: string }>(source: T): T {
  return { ...source, feedUrl: toApiNewsSourceFeedUrl(source.feedUrl) }
}

async function getAccessiblePetitionIds(userId: string): Promise<string[]> {
  const links = await prisma.petitionUserAccess.findMany({
    where: { userId },
    select: { petitionId: true },
  })
  return links.map((link) => link.petitionId)
}

async function ensurePetitionAccess(userId: string, role: string, petitionId: string) {
  if (isAdmin(role)) return true
  const access = await prisma.petitionUserAccess.findUnique({
    where: { userId_petitionId: { userId, petitionId } },
    select: { userId: true },
  })
  if (!access) return false
  return true
}

// ── Auth ──────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

adminRoutes.post('/login', rateLimit(10, 60_000), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.invalid_credentials') }, 422)

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!user) return c.json({ error: t(c, 'api.invalid_credentials') }, 401)

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!valid) return c.json({ error: t(c, 'api.invalid_credentials') }, 401)

  const role = normalizeRole(user.role)
  const token = signToken({ userId: user.id, email: user.email, role })
  await createAuditLog('user.login', 'User', user.id, user.id)

  return c.json({ token, user: { id: user.id, email: user.email, role } })
})

// All routes below require authentication
adminRoutes.use('*', authMiddleware)

adminRoutes.post('/uploads/image', async (c) => {
  const user = c.get('user')
  const role = normalizeRole(user.role)
  if (!canWritePetitions(role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const body = await c.req.parseBody()
  const rawFile = body.file
  const file = rawFile instanceof File ? rawFile : Array.isArray(rawFile) ? rawFile[0] : null

  if (!file) return c.json({ error: 'No file provided in field "file"' }, 422)
  if (!file.type.startsWith('image/')) return c.json({ error: 'Only image uploads are allowed' }, 422)
  if (file.size > 8 * 1024 * 1024) return c.json({ error: 'Image is too large (max 8MB)' }, 422)

  const mimeExtensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/avif': '.avif',
  }

  const explicitExtension = extname(file.name || '').toLowerCase()
  const extension = explicitExtension || mimeExtensions[file.type] || '.bin'
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`
  const uploadDir = resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'))
  const outputPath = resolve(uploadDir, filename)

  await mkdir(uploadDir, { recursive: true })
  await writeFile(outputPath, new Uint8Array(await file.arrayBuffer()))

  return c.json({ url: `/uploads/${filename}` }, 201)
})

// ── Dashboard ─────────────────────────────────────────────────────────────────

adminRoutes.get('/dashboard', async (c) => {
  const user = c.get('user')
  const role = normalizeRole(user.role)
  const petitionIds = isAdmin(role) ? null : await getAccessiblePetitionIds(user.userId)

  const petitionWhere = petitionIds ? { id: { in: petitionIds } } : undefined
  const signatureWhere = petitionIds ? { petitionId: { in: petitionIds }, withdrawn: false } : { withdrawn: false }

  const [
    totalPetitions,
    activePetitions,
    totalSignatures,
    verifiedSignatures,
    recentSignatures,
    recentPetitions,
  ] = await Promise.all([
    prisma.petition.count({ where: petitionWhere }),
    prisma.petition.count({ where: { ...(petitionWhere ?? {}), status: 'active' } }),
    prisma.signature.count({ where: signatureWhere }),
    prisma.signature.count({
      where: {
        ...(petitionIds ? { petitionId: { in: petitionIds } } : {}),
        verified: true,
        withdrawn: false,
      },
    }),
    prisma.signature.findMany({
      take: 5,
      where: petitionIds ? { petitionId: { in: petitionIds } } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { petition: { select: { title: true, slug: true } } },
    }),
    prisma.petition.findMany({
      take: 5,
      where: petitionWhere,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { signatures: { where: { verified: true, withdrawn: false } } } } },
    }),
  ])

  return c.json({
    stats: { totalPetitions, activePetitions, totalSignatures, verifiedSignatures },
    recentSignatures,
    recentPetitions: recentPetitions.map((p) => ({
      ...p,
      signatureCount: p._count.signatures,
    })),
  })
})

// ── Petitions ─────────────────────────────────────────────────────────────────

const petitionSchema = z.object({
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  title: z.string().min(4).max(200),
  summary: z.string().min(10).max(1500),
  body: z.string().min(20),
  imageUrl: imageReferenceSchema,
  thumbnailImageUrl: imageReferenceSchema,
  recipientName: z.string().min(2).max(200),
  recipientDescription: z.string().max(1500).optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'archived']).default('draft'),
  goalCount: z.number().int().positive().optional(),
  allowPublicNames: z.boolean().default(false),
  allowComments: z.boolean().default(false),
  requireVerification: z.boolean().default(true),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
})

// ── Site Settings ─────────────────────────────────────────────────────────────

const siteSettingsSchema = z.object({
  publicSiteTitle: z.string().min(2).max(120),
  publicClaim: z.string().min(2).max(200),
  logoUrl: z.string().max(2048).nullable().optional(),
  defaultShareText: z.string().min(2).max(280),
})

adminRoutes.get('/site-settings', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const settings = await prisma.siteSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  })
  return c.json(settings)
})

adminRoutes.put('/site-settings', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = siteSettingsSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const settings = await prisma.siteSettings.upsert({
    where: { id: 'default' },
    update: parsed.data,
    create: { id: 'default', ...parsed.data },
  })

  await createAuditLog('site_settings.updated', 'SiteSettings', settings.id, user.userId)
  return c.json(settings)
})

// ── News Radar ────────────────────────────────────────────────────────────────

const newsSourceSchema = z.object({
  name: z.string().min(2).max(160),
  feedUrl: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().url().max(2048).optional(),
  ),
  enabled: z.boolean().default(true),
})

const newsItemCreateSchema = z.object({
  sourceId: z.string().uuid(),
  title: z.string().trim().min(2).max(300),
  url: z.string().url().max(2048),
  excerpt: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().max(500).optional(),
  ),
  publishedAt: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.date().optional(),
  ),
  status: z.enum(['draft', 'approved', 'hidden']).default('draft'),
})

const newsItemStatusSchema = z.object({
  status: z.enum(['draft', 'approved', 'hidden']),
})

adminRoutes.get('/news/sources', async (c) => {
  const user = c.get('user')
  if (!canWritePetitions(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const sources = await prisma.newsSource.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } },
  })
  return c.json({ sources: sources.map(toApiNewsSource) })
})

adminRoutes.post('/news/sources', async (c) => {
  const user = c.get('user')
  if (!canWritePetitions(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = newsSourceSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const source = await prisma.newsSource.create({
    data: {
      name: parsed.data.name,
      feedUrl: toStoredNewsSourceFeedUrl(parsed.data.feedUrl),
      enabled: parsed.data.enabled,
    },
  })
  await createAuditLog('news_source.created', 'NewsSource', source.id, user.userId)
  return c.json(toApiNewsSource(source), 201)
})

adminRoutes.put('/news/sources/:id', async (c) => {
  const user = c.get('user')
  if (!canWritePetitions(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = newsSourceSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const source = await prisma.newsSource.update({
    where: { id: c.req.param('id') },
    data: {
      ...parsed.data,
      ...(parsed.data.feedUrl !== undefined ? { feedUrl: toStoredNewsSourceFeedUrl(parsed.data.feedUrl) } : {}),
    },
  })
  await createAuditLog('news_source.updated', 'NewsSource', source.id, user.userId)
  return c.json(toApiNewsSource(source))
})

adminRoutes.delete('/news/sources/:id', async (c) => {
  const user = c.get('user')
  if (!canWritePetitions(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  await prisma.newsSource.delete({ where: { id: c.req.param('id') } })
  await createAuditLog('news_source.deleted', 'NewsSource', c.req.param('id'), user.userId)
  return c.json({ message: 'News source deleted' })
})

adminRoutes.get('/news/items', async (c) => {
  const user = c.get('user')
  if (!canWritePetitions(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const status = c.req.query('status')
  const where = status && ['draft', 'approved', 'hidden'].includes(status) ? { status } : undefined
  const items = await prisma.newsItem.findMany({
    where,
    take: 100,
    orderBy: [{ createdAt: 'desc' }],
    include: { source: { select: { id: true, name: true } } },
  })
  return c.json({ items })
})

adminRoutes.post('/news/items', async (c) => {
  const user = c.get('user')
  if (!canWritePetitions(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = newsItemCreateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const source = await prisma.newsSource.findUnique({
    where: { id: parsed.data.sourceId },
    select: { id: true },
  })
  if (!source) return c.json({ error: t(c, 'api.not_found') }, 404)

  const item = await prisma.newsItem.create({
    data: {
      sourceId: parsed.data.sourceId,
      title: parsed.data.title,
      url: parsed.data.url,
      excerpt: parsed.data.excerpt,
      publishedAt: parsed.data.publishedAt,
      status: parsed.data.status,
    },
    include: { source: { select: { id: true, name: true } } },
  })

  await createAuditLog('news_item.created', 'NewsItem', item.id, user.userId, { status: item.status })
  return c.json(item, 201)
})

adminRoutes.put('/news/items/:id/status', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = newsItemStatusSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const item = await prisma.newsItem.update({
    where: { id: c.req.param('id') },
    data: { status: parsed.data.status },
    include: { source: { select: { id: true, name: true } } },
  })
  await createAuditLog('news_item.status_updated', 'NewsItem', item.id, user.userId, { status: item.status })
  return c.json(item)
})

adminRoutes.post('/news/import', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const result = await importNewsFromEnabledSources()
  await createAuditLog('news.imported', 'NewsItem', 'bulk', user.userId, result)
  return c.json(result)
})

adminRoutes.get('/petitions', async (c) => {
  const user = c.get('user')
  const role = normalizeRole(user.role)
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20')))
  const status = c.req.query('status')
  const skip = (page - 1) * limit

  const petitionIds = isAdmin(role) ? null : await getAccessiblePetitionIds(user.userId)
  const where = {
    ...(status ? { status } : {}),
    ...(petitionIds ? { id: { in: petitionIds } } : {}),
  }

  const [petitions, total] = await Promise.all([
    prisma.petition.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { signatures: { where: { verified: true, withdrawn: false } } } },
        creator: { select: { email: true } },
      },
    }),
    prisma.petition.count({ where }),
  ])

  return c.json({
    petitions: petitions.map((p) => ({ ...p, signatureCount: p._count.signatures })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
})

adminRoutes.get('/petitions/:id', async (c) => {
  const user = c.get('user')
  const role = normalizeRole(user.role)
  const petitionId = c.req.param('id')

  const petition = await prisma.petition.findUnique({
    where: { id: petitionId },
    include: {
      creator: { select: { email: true } },
      _count: { select: { signatures: true } },
    },
  })
  if (!petition) return c.json({ error: t(c, 'api.not_found') }, 404)

  if (!isAdmin(role)) {
    const canAccess = await ensurePetitionAccess(user.userId, role, petitionId)
    if (!canAccess) return c.json({ error: t(c, 'api.forbidden') }, 403)
  }

  return c.json(petition)
})

adminRoutes.post('/petitions', async (c) => {
  const user = c.get('user')
  const role = normalizeRole(user.role)
  if (!isAdmin(role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = petitionSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const existing = await prisma.petition.findUnique({ where: { slug: parsed.data.slug } })
  if (existing) return c.json({ error: t(c, 'api.slug_already_in_use') }, 409)

  const petition = await prisma.petition.create({
    data: {
      ...parsed.data,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
      createdBy: user.userId,
    },
  })

  await createAuditLog('petition.created', 'Petition', petition.id, user.userId)
  return c.json(petition, 201)
})

adminRoutes.put('/petitions/:id', async (c) => {
  const user = c.get('user')
  const role = normalizeRole(user.role)
  if (!canWritePetitions(role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = petitionSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const petitionId = c.req.param('id')
  const existing = await prisma.petition.findUnique({ where: { id: petitionId } })
  if (!existing) return c.json({ error: t(c, 'api.not_found') }, 404)

  if (!isAdmin(role)) {
    const canAccess = await ensurePetitionAccess(user.userId, role, petitionId)
    if (!canAccess) return c.json({ error: t(c, 'api.forbidden') }, 403)
  }

  const petition = await prisma.petition.update({
    where: { id: petitionId },
    data: {
      ...parsed.data,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
    },
  })

  await createAuditLog('petition.updated', 'Petition', petition.id, user.userId)
  return c.json(petition)
})

adminRoutes.delete('/petitions/:id', async (c) => {
  const user = c.get('user')
  const role = normalizeRole(user.role)
  if (!canWritePetitions(role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const petitionId = c.req.param('id')
  const existing = await prisma.petition.findUnique({ where: { id: petitionId } })
  if (!existing) return c.json({ error: t(c, 'api.not_found') }, 404)

  if (!isAdmin(role)) {
    const canAccess = await ensurePetitionAccess(user.userId, role, petitionId)
    if (!canAccess) return c.json({ error: t(c, 'api.forbidden') }, 403)
  }

  await prisma.petition.update({
    where: { id: petitionId },
    data: { status: 'archived' },
  })

  await createAuditLog('petition.archived', 'Petition', petitionId, user.userId)
  return c.json({ message: t(c, 'api.petition_archived') })
})

// ── Petition Updates ──────────────────────────────────────────────────────────

const petitionUpdateDraftSchema = z.object({
  title: z.string().min(2).max(200),
  content: z.string().min(1),
  imageUrl: imageReferenceSchema,
  thumbnailImageUrl: imageReferenceSchema,
})

const petitionUpdatePatchSchema = petitionUpdateDraftSchema.partial()

const petitionUpdatePublishSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  content: z.string().min(1).optional(),
  imageUrl: imageReferenceSchema,
  thumbnailImageUrl: imageReferenceSchema,
})

adminRoutes.get('/petitions/:id/updates', async (c) => {
  const petition = await prisma.petition.findUnique({ where: { id: c.req.param('id') } })
  if (!petition) return c.json({ error: t(c, 'api.not_found') }, 404)

  const updates = await prisma.petitionUpdate.findMany({
    where: { petitionId: petition.id },
    orderBy: [{ lastPublishedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      creator: { select: { id: true, email: true } },
      updater: { select: { id: true, email: true } },
      deleter: { select: { id: true, email: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: { publisher: { select: { id: true, email: true } } },
      },
    },
  })

  return c.json({ updates })
})

adminRoutes.post('/petitions/:id/updates', async (c) => {
  const user = c.get('user')
  const petition = await prisma.petition.findUnique({ where: { id: c.req.param('id') } })
  if (!petition) return c.json({ error: t(c, 'api.not_found') }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = petitionUpdateDraftSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const update = await prisma.petitionUpdate.create({
    data: {
      petitionId: petition.id,
      currentTitle: parsed.data.title,
      currentContent: parsed.data.content,
      currentImageUrl: parsed.data.imageUrl,
      currentThumbnailImageUrl: parsed.data.thumbnailImageUrl,
      createdBy: user.userId,
      updatedBy: user.userId,
    },
    include: {
      creator: { select: { id: true, email: true } },
      updater: { select: { id: true, email: true } },
      versions: true,
    },
  })

  await createAuditLog('petition.update.created', 'PetitionUpdate', update.id, user.userId, {
    petitionId: petition.id,
  })

  return c.json(update, 201)
})

adminRoutes.put('/petitions/:id/updates/:updateId', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = petitionUpdatePatchSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)
  if (!Object.keys(parsed.data).length) return c.json({ error: t(c, 'api.no_changes_provided') }, 422)

  const existing = await prisma.petitionUpdate.findUnique({ where: { id: c.req.param('updateId') } })
  if (!existing || existing.petitionId !== c.req.param('id')) return c.json({ error: t(c, 'api.not_found') }, 404)
  if (existing.deletedAt) return c.json({ error: t(c, 'api.update_is_deleted') }, 409)

  const update = await prisma.petitionUpdate.update({
    where: { id: existing.id },
    data: {
      currentTitle: parsed.data.title,
      currentContent: parsed.data.content,
      currentImageUrl: parsed.data.imageUrl,
      currentThumbnailImageUrl: parsed.data.thumbnailImageUrl,
      updatedBy: user.userId,
    },
    include: {
      creator: { select: { id: true, email: true } },
      updater: { select: { id: true, email: true } },
      deleter: { select: { id: true, email: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: { publisher: { select: { id: true, email: true } } },
      },
    },
  })

  await createAuditLog('petition.update.modified', 'PetitionUpdate', update.id, user.userId, {
    petitionId: existing.petitionId,
  })

  return c.json(update)
})

adminRoutes.get('/petitions/:id/updates/:updateId/versions', async (c) => {
  const existing = await prisma.petitionUpdate.findUnique({
    where: { id: c.req.param('updateId') },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: { publisher: { select: { id: true, email: true } } },
      },
      creator: { select: { id: true, email: true } },
      updater: { select: { id: true, email: true } },
      deleter: { select: { id: true, email: true } },
    },
  })
  if (!existing || existing.petitionId !== c.req.param('id')) return c.json({ error: t(c, 'api.not_found') }, 404)
  return c.json(existing)
})

adminRoutes.post('/petitions/:id/updates/:updateId/publish', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = petitionUpdatePublishSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const existing = await prisma.petitionUpdate.findUnique({
    where: { id: c.req.param('updateId') },
    include: {
      versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
    },
  })
  if (!existing || existing.petitionId !== c.req.param('id')) return c.json({ error: t(c, 'api.not_found') }, 404)
  if (existing.deletedAt) return c.json({ error: t(c, 'api.update_is_deleted') }, 409)

  const title = parsed.data.title ?? existing.currentTitle
  const content = parsed.data.content ?? existing.currentContent
  const imageUrl = parsed.data.imageUrl ?? existing.currentImageUrl
  const thumbnailImageUrl = parsed.data.thumbnailImageUrl ?? existing.currentThumbnailImageUrl
  const publishedAt = new Date()
  const versionNumber = (existing.versions[0]?.versionNumber ?? 0) + 1

  const version = await prisma.$transaction(async (tx) => {
    const createdVersion = await tx.petitionUpdateVersion.create({
      data: {
        petitionUpdateId: existing.id,
        versionNumber,
        title,
        content,
        imageUrl,
        thumbnailImageUrl,
        publishedAt,
        publishedBy: user.userId,
      },
      include: { publisher: { select: { id: true, email: true } } },
    })

    await tx.petitionUpdate.update({
      where: { id: existing.id },
      data: {
        currentTitle: title,
        currentContent: content,
        currentImageUrl: imageUrl,
        currentThumbnailImageUrl: thumbnailImageUrl,
        lastPublishedAt: publishedAt,
        updatedBy: user.userId,
      },
    })

    return createdVersion
  })

  await createAuditLog('petition.update.published', 'PetitionUpdate', existing.id, user.userId, {
    petitionId: existing.petitionId,
    versionNumber,
  })

  return c.json(version, 201)
})

adminRoutes.delete('/petitions/:id/updates/:updateId', async (c) => {
  const user = c.get('user')
  const existing = await prisma.petitionUpdate.findUnique({ where: { id: c.req.param('updateId') } })
  if (!existing || existing.petitionId !== c.req.param('id')) return c.json({ error: t(c, 'api.not_found') }, 404)

  if (existing.deletedAt) {
    return c.json({ message: t(c, 'api.update_already_deleted') })
  }

  await prisma.petitionUpdate.update({
    where: { id: existing.id },
    data: {
      deletedAt: new Date(),
      deletedBy: user.userId,
    },
  })

  await createAuditLog('petition.update.deleted', 'PetitionUpdate', existing.id, user.userId, {
    petitionId: existing.petitionId,
  })

  return c.json({ message: t(c, 'api.update_deleted') })
})

// ── Signatures ────────────────────────────────────────────────────────────────

adminRoutes.get('/petitions/:id/signatures', async (c) => {
  const user = c.get('user')
  const role = normalizeRole(user.role)

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50')))
  const skip = (page - 1) * limit
  const verified = c.req.query('verified')
  const withdrawn = c.req.query('withdrawn')

  const petitionId = c.req.param('id')
  const petition = await prisma.petition.findUnique({ where: { id: petitionId } })
  if (!petition) return c.json({ error: t(c, 'api.not_found') }, 404)

  if (!isAdmin(role)) {
    const canAccess = await ensurePetitionAccess(user.userId, role, petitionId)
    if (!canAccess) return c.json({ error: t(c, 'api.forbidden') }, 403)
  }

  const where = {
    petitionId,
    ...(verified !== undefined ? { verified: verified === 'true' } : {}),
    ...(withdrawn !== undefined ? { withdrawn: withdrawn === 'true' } : {}),
  }

  const [signatures, total] = await Promise.all([
    prisma.signature.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        riskSignals: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    }),
    prisma.signature.count({ where }),
  ])

  return c.json({ signatures, total, page, totalPages: Math.ceil(total / limit) })
})

adminRoutes.delete('/signatures/:id', async (c) => {
  const user = c.get('user')
  const role = normalizeRole(user.role)
  if (!canWritePetitions(role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const sig = await prisma.signature.findUnique({ where: { id: c.req.param('id') } })
  if (!sig) return c.json({ error: t(c, 'api.not_found') }, 404)

  if (!isAdmin(role)) {
    const canAccess = await ensurePetitionAccess(user.userId, role, sig.petitionId)
    if (!canAccess) return c.json({ error: t(c, 'api.forbidden') }, 403)
  }

  await prisma.signature.update({
    where: { id: c.req.param('id') },
    data: { withdrawn: true, withdrawnAt: new Date() },
  })

  await createAuditLog('signature.admin_removed', 'Signature', c.req.param('id'), user.userId)
  return c.json({ message: t(c, 'api.signature_removed') })
})

// ── Export ────────────────────────────────────────────────────────────────────

const exportSchema = z.object({
  format: z.enum(['csv', 'json']),
  petitionId: z.string().optional(),
  verified: z.boolean().optional(),
  withdrawn: z.boolean().optional(),
  country: z.string().optional(),
})

adminRoutes.post('/export', async (c) => {
  const user = c.get('user')
  const role = normalizeRole(user.role)
  const body = await c.req.json().catch(() => null)
  const parsed = exportSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const { format, ...filters } = parsed.data

  const allowedPetitionIds = isAdmin(role) ? undefined : await getAccessiblePetitionIds(user.userId)
  if (!isAdmin(role)) {
    if (filters.petitionId && !allowedPetitionIds.includes(filters.petitionId)) {
      return c.json({ error: t(c, 'api.forbidden') }, 403)
    }
    if (!filters.petitionId) {
      filters.petitionId = undefined
    }
  }

  const result = await exportSignatures(format, filters, allowedPetitionIds)

  await prisma.export.create({
    data: {
      petitionId: filters.petitionId ?? null,
      createdBy: user.userId,
      format,
      filtersJson: JSON.stringify(filters),
    },
  })

  await createAuditLog('export.created', 'Export', 'bulk', user.userId, { format, filters })

  c.header('Content-Type', result.contentType)
  c.header('Content-Disposition', `attachment; filename="${result.filename}"`)
  return c.body(result.data)
})

// ── Audit logs ────────────────────────────────────────────────────────────────

adminRoutes.get('/audit', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50')))
  const skip = (page - 1) * limit

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { email: true } } },
    }),
    prisma.auditLog.count(),
  ])

  return c.json({ logs, total, page, totalPages: Math.ceil(total / limit) })
})

// ── Backup & Restore ──────────────────────────────────────────────────────────

adminRoutes.get('/backup', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const petitions = await prisma.petition.findMany({
    include: {
      signatures: true,
      updates: {
        include: {
          versions: {
            orderBy: { versionNumber: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  const siteSettings = await prisma.siteSettings.findUnique({ where: { id: 'default' } })
  const newsSources = await prisma.newsSource.findMany({
    include: { items: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    siteSettings,
    newsSources,
    petitions: petitions.map(({ signatures, updates, ...petition }) => ({
      ...petition,
      signatures,
      updates,
    })),
  }

  await createAuditLog('backup.created', 'System', 'backup', user.userId)

  const filename = `4change-backup-${new Date().toISOString().split('T')[0]}.json`
  c.header('Content-Type', 'application/json')
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.json(backup)
})

const backupSignatureSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  verified: z.boolean().default(false),
  withdrawn: z.boolean().default(false),
  publicOptIn: z.boolean().default(false),
  updatesOptIn: z.boolean().default(false),
  recipientShareOptIn: z.boolean().default(false),
  createdAt: z.string().optional(),
  verifiedAt: z.string().nullable().optional(),
  withdrawnAt: z.string().nullable().optional(),
})

const backupPetitionSchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable().optional(),
  thumbnailImageUrl: z.string().nullable().optional(),
  recipientName: z.string(),
  recipientDescription: z.string().nullable().optional(),
  status: z.string().default('draft'),
  goalCount: z.number().nullable().optional(),
  allowPublicNames: z.boolean().default(false),
  allowComments: z.boolean().default(false),
  requireVerification: z.boolean().default(true),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  signatures: z.array(backupSignatureSchema).optional().default([]),
  updates: z.array(
    z.object({
      currentTitle: z.string(),
      currentContent: z.string(),
      currentImageUrl: z.string().nullable().optional(),
      currentThumbnailImageUrl: z.string().nullable().optional(),
      lastPublishedAt: z.string().nullable().optional(),
      deletedAt: z.string().nullable().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
      versions: z.array(
        z.object({
          versionNumber: z.number().int().positive(),
          title: z.string(),
          content: z.string(),
          imageUrl: z.string().nullable().optional(),
          thumbnailImageUrl: z.string().nullable().optional(),
          publishedAt: z.string().optional(),
        }),
      ).optional().default([]),
    }),
  ).optional().default([]),
})

const restoreSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  siteSettings: siteSettingsSchema.partial().nullable().optional(),
  newsSources: z.array(
    z.object({
      name: z.string(),
      feedUrl: z.string(),
      enabled: z.boolean().default(true),
      items: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
          excerpt: z.string().nullable().optional(),
          publishedAt: z.string().nullable().optional(),
          status: z.string().default('draft'),
        }),
      ).optional().default([]),
    }),
  ).optional().default([]),
  petitions: z.array(backupPetitionSchema),
})

adminRoutes.post('/restore', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = restoreSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: t(c, 'api.invalid_backup_format'), details: parsed.error.flatten() }, 422)
  }

  let restoredPetitions = 0
  let restoredSignatures = 0
  let restoredUpdates = 0
  let restoredUpdateVersions = 0

  await prisma.$transaction(async (tx) => {
    if (parsed.data.siteSettings) {
      await tx.siteSettings.upsert({
        where: { id: 'default' },
        update: parsed.data.siteSettings,
        create: { id: 'default', ...parsed.data.siteSettings },
      })
    }

    for (const source of parsed.data.newsSources) {
      const restoredSource = await tx.newsSource.upsert({
        where: { feedUrl: source.feedUrl },
        update: { name: source.name, enabled: source.enabled },
        create: { name: source.name, feedUrl: source.feedUrl, enabled: source.enabled },
      })

      for (const item of source.items) {
        await tx.newsItem.upsert({
          where: { url: item.url },
          update: {
            title: item.title,
            excerpt: item.excerpt ?? null,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            status: item.status,
            sourceId: restoredSource.id,
          },
          create: {
            sourceId: restoredSource.id,
            title: item.title,
            url: item.url,
            excerpt: item.excerpt ?? null,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            status: item.status,
          },
        })
      }
    }

    for (const petitionData of parsed.data.petitions) {
      const { signatures, updates, createdAt, startsAt, endsAt, ...petitionFields } = petitionData

      const petition = await tx.petition.upsert({
        where: { slug: petitionFields.slug },
        update: {
          title: petitionFields.title,
          summary: petitionFields.summary,
          body: petitionFields.body,
          imageUrl: petitionFields.imageUrl ?? null,
          thumbnailImageUrl: petitionFields.thumbnailImageUrl ?? null,
          recipientName: petitionFields.recipientName,
          recipientDescription: petitionFields.recipientDescription ?? null,
          status: petitionFields.status,
          goalCount: petitionFields.goalCount ?? null,
          allowPublicNames: petitionFields.allowPublicNames,
          allowComments: petitionFields.allowComments,
          requireVerification: petitionFields.requireVerification,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
        },
        create: {
          slug: petitionFields.slug,
          title: petitionFields.title,
          summary: petitionFields.summary,
          body: petitionFields.body,
          imageUrl: petitionFields.imageUrl ?? null,
          thumbnailImageUrl: petitionFields.thumbnailImageUrl ?? null,
          recipientName: petitionFields.recipientName,
          recipientDescription: petitionFields.recipientDescription ?? null,
          status: petitionFields.status,
          goalCount: petitionFields.goalCount ?? null,
          allowPublicNames: petitionFields.allowPublicNames,
          allowComments: petitionFields.allowComments,
          requireVerification: petitionFields.requireVerification,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
          createdBy: user.userId,
          ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
        },
      })
      restoredPetitions++

      for (const sig of signatures) {
        const { createdAt: sigCreatedAt, verifiedAt, withdrawnAt, ...sigFields } = sig

        await tx.signature.upsert({
          where: { petitionId_email: { petitionId: petition.id, email: sigFields.email } },
          update: {
            fullName: sigFields.fullName,
            city: sigFields.city ?? null,
            country: sigFields.country ?? null,
            comment: sigFields.comment ?? null,
            verified: sigFields.verified,
            withdrawn: sigFields.withdrawn,
            publicOptIn: sigFields.publicOptIn,
            updatesOptIn: sigFields.updatesOptIn,
            recipientShareOptIn: sigFields.recipientShareOptIn,
            verifiedAt: verifiedAt ? new Date(verifiedAt) : null,
            withdrawnAt: withdrawnAt ? new Date(withdrawnAt) : null,
          },
          create: {
            petitionId: petition.id,
            fullName: sigFields.fullName,
            email: sigFields.email,
            city: sigFields.city ?? null,
            country: sigFields.country ?? null,
            comment: sigFields.comment ?? null,
            verified: sigFields.verified,
            withdrawn: sigFields.withdrawn,
            publicOptIn: sigFields.publicOptIn,
            updatesOptIn: sigFields.updatesOptIn,
            recipientShareOptIn: sigFields.recipientShareOptIn,
            verifiedAt: verifiedAt ? new Date(verifiedAt) : null,
            withdrawnAt: withdrawnAt ? new Date(withdrawnAt) : null,
            ...(sigCreatedAt ? { createdAt: new Date(sigCreatedAt) } : {}),
          },
        })
        restoredSignatures++
      }

      await tx.petitionUpdate.deleteMany({ where: { petitionId: petition.id } })
      for (const backupUpdate of updates) {
        const { versions, createdAt: updateCreatedAt, updatedAt, deletedAt, lastPublishedAt, ...updateFields } = backupUpdate
        const createdUpdate = await tx.petitionUpdate.create({
          data: {
            petitionId: petition.id,
            currentTitle: updateFields.currentTitle,
            currentContent: updateFields.currentContent,
            currentImageUrl: updateFields.currentImageUrl ?? null,
            currentThumbnailImageUrl: updateFields.currentThumbnailImageUrl ?? null,
            lastPublishedAt: lastPublishedAt ? new Date(lastPublishedAt) : null,
            deletedAt: deletedAt ? new Date(deletedAt) : null,
            createdBy: user.userId,
            updatedBy: user.userId,
            deletedBy: deletedAt ? user.userId : null,
            ...(updateCreatedAt ? { createdAt: new Date(updateCreatedAt) } : {}),
            ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
          },
        })
        restoredUpdates++

        for (const version of versions) {
          await tx.petitionUpdateVersion.create({
            data: {
              petitionUpdateId: createdUpdate.id,
              versionNumber: version.versionNumber,
              title: version.title,
              content: version.content,
              imageUrl: version.imageUrl ?? null,
              thumbnailImageUrl: version.thumbnailImageUrl ?? null,
              publishedAt: version.publishedAt ? new Date(version.publishedAt) : new Date(),
              publishedBy: user.userId,
            },
          })
          restoredUpdateVersions++
        }
      }
    }
  })

  await createAuditLog('backup.restored', 'System', 'restore', user.userId, {
    restoredPetitions,
    restoredSignatures,
    restoredUpdates,
    restoredUpdateVersions,
  })

  return c.json({
    message: t(c, 'api.restore_complete'),
    restoredPetitions,
    restoredSignatures,
    restoredUpdates,
    restoredUpdateVersions,
  })
})

// ── Users ─────────────────────────────────────────────────────────────────────

const userCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  role: z.enum(ROLE_VALUES).default('reader'),
  petitionIds: z.array(z.string()).optional().default([]),
})

const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(12).optional(),
  role: z.enum(ROLE_VALUES).optional(),
  petitionIds: z.array(z.string()).optional(),
})

adminRoutes.get('/users', async (c) => {
  const actorUser = c.get('user')
  if (!isAdmin(actorUser.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      petitionAccess: {
        select: {
          petitionId: true,
          petition: { select: { id: true, title: true, slug: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return c.json(users.map((u) => ({
    id: u.id,
    email: u.email,
    role: normalizeRole(u.role),
    createdAt: u.createdAt,
    petitionIds: u.petitionAccess.map((a) => a.petitionId),
    petitions: u.petitionAccess.map((a) => a.petition),
  })))
})

adminRoutes.post('/users', async (c) => {
  const actorUser = c.get('user')
  if (!isAdmin(actorUser.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = userCreateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) return c.json({ error: t(c, 'api.email_already_in_use') }, 409)

  if (parsed.data.petitionIds.length > 0) {
    const foundCount = await prisma.petition.count({ where: { id: { in: parsed.data.petitionIds } } })
    if (foundCount !== parsed.data.petitionIds.length) {
      return c.json({ error: t(c, 'api.one_or_more_petition_assignments_are_invalid') }, 422)
    }
  }
  if (parsed.data.role !== 'admin' && parsed.data.petitionIds.length === 0) {
    return c.json({ error: t(c, 'api.organizer_and_reader_users_must_be_assigned_to_at_least_one_petition') }, 422)
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      petitionAccess: {
        create: parsed.data.role === 'admin'
          ? []
          : parsed.data.petitionIds.map((petitionId) => ({ petitionId })),
      },
    },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      petitionAccess: {
        select: {
          petitionId: true,
          petition: { select: { id: true, title: true, slug: true } },
        },
      },
    },
  })

  await createAuditLog('user.created', 'User', user.id, actorUser.userId, {
    role: user.role,
    petitionIds: user.petitionAccess.map((a) => a.petitionId),
  })

  return c.json({
    id: user.id,
    email: user.email,
    role: normalizeRole(user.role),
    createdAt: user.createdAt,
    petitionIds: user.petitionAccess.map((a) => a.petitionId),
    petitions: user.petitionAccess.map((a) => a.petition),
  }, 201)
})

adminRoutes.put('/users/:id', async (c) => {
  const actorUser = c.get('user')
  if (!isAdmin(actorUser.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const targetUserId = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = userUpdateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)

  const existing = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!existing) return c.json({ error: t(c, 'api.not_found') }, 404)

  if (parsed.data.email && parsed.data.email !== existing.email) {
    const emailInUse = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (emailInUse) return c.json({ error: t(c, 'api.email_already_in_use') }, 409)
  }

  if (parsed.data.petitionIds && parsed.data.petitionIds.length > 0) {
    const foundCount = await prisma.petition.count({ where: { id: { in: parsed.data.petitionIds } } })
    if (foundCount !== parsed.data.petitionIds.length) {
      return c.json({ error: t(c, 'api.one_or_more_petition_assignments_are_invalid') }, 422)
    }
  }

  const nextRole = parsed.data.role ? normalizeRole(parsed.data.role) : normalizeRole(existing.role)
  const currentAssignments = await prisma.petitionUserAccess.findMany({
    where: { userId: targetUserId },
    select: { petitionId: true },
  })
  const effectivePetitionIds = parsed.data.petitionIds ?? currentAssignments.map((entry) => entry.petitionId)
  if (nextRole !== 'admin' && effectivePetitionIds.length === 0) {
    return c.json({ error: t(c, 'api.organizer_and_reader_users_must_be_assigned_to_at_least_one_petition') }, 422)
  }

  await prisma.$transaction(async (tx) => {
    const updateData: {
      email?: string
      passwordHash?: string
      role?: string
    } = {}

    if (parsed.data.email) updateData.email = parsed.data.email
    if (parsed.data.role) updateData.role = nextRole
    if (parsed.data.password) updateData.passwordHash = await bcrypt.hash(parsed.data.password, 12)

    await tx.user.update({
      where: { id: targetUserId },
      data: updateData,
    })

    if (parsed.data.petitionIds !== undefined || nextRole === 'admin') {
      await tx.petitionUserAccess.deleteMany({ where: { userId: targetUserId } })
      if (nextRole !== 'admin') {
        const petitionIds = parsed.data.petitionIds ?? currentAssignments.map((entry) => entry.petitionId)
        if (petitionIds.length > 0) {
          await tx.petitionUserAccess.createMany({
            data: petitionIds.map((petitionId) => ({ userId: targetUserId, petitionId })),
            skipDuplicates: true,
          })
        }
      }
    }
  })

  const updated = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      petitionAccess: {
        select: {
          petitionId: true,
          petition: { select: { id: true, title: true, slug: true } },
        },
      },
    },
  })
  if (!updated) return c.json({ error: t(c, 'api.not_found') }, 404)

  await createAuditLog('user.updated', 'User', targetUserId, actorUser.userId, {
    role: updated?.role,
    petitionIds: updated?.petitionAccess.map((a) => a.petitionId) ?? [],
  })

  return c.json({
    id: updated.id,
    email: updated.email,
    role: normalizeRole(updated.role),
    createdAt: updated.createdAt,
    petitionIds: updated.petitionAccess.map((a) => a.petitionId),
    petitions: updated.petitionAccess.map((a) => a.petition),
  })
})

adminRoutes.delete('/users/:id', async (c) => {
  const actorUser = c.get('user')
  if (!isAdmin(actorUser.role)) return c.json({ error: t(c, 'api.forbidden') }, 403)

  const targetUserId = c.req.param('id')
  if (targetUserId === actorUser.userId) return c.json({ error: t(c, 'api.you_cannot_delete_your_own_account') }, 422)

  const existing = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!existing) return c.json({ error: t(c, 'api.not_found') }, 404)

  await prisma.$transaction([
    prisma.petitionUserAccess.deleteMany({ where: { userId: targetUserId } }),
    prisma.user.delete({ where: { id: targetUserId } }),
  ])

  await createAuditLog('user.deleted', 'User', targetUserId, actorUser.userId)
  return c.json({ message: t(c, 'api.user_deleted') })
})
