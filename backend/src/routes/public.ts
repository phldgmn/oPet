import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../db.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { generateToken, hashToken } from '../lib/tokens.js'
import { sendVerificationEmail, sendWithdrawalEmail } from '../lib/email.js'
import { createAuditLog } from '../lib/audit.js'
import { getLocale, t } from '../lib/i18n.js'

export const publicRoutes = new Hono()

const dbUrl = (process.env.DATABASE_URL ?? '').trim()
const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')

// ── Petition listing ──────────────────────────────────────────────────────────

publicRoutes.get('/petitions', async (c) => {
  const search = c.req.query('search') ?? ''
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '10')))
  const skip = (page - 1) * limit

  const searchFilter = (field: 'title' | 'summary') =>
    isPostgres
      ? { [field]: { contains: search, mode: 'insensitive' as const } }
      : { [field]: { contains: search } }

  const where = {
    status: 'active' as const,
    ...(search
      ? {
          OR: [searchFilter('title'), searchFilter('summary')],
        }
      : {}),
  }

  const [petitions, total] = await Promise.all([
    prisma.petition.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        imageUrl: true,
        thumbnailImageUrl: true,
        recipientName: true,
        status: true,
        goalCount: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        _count: { select: { signatures: { where: { verified: true, withdrawn: false } } } },
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

// ── Single petition ───────────────────────────────────────────────────────────

publicRoutes.get('/petitions/:slug', async (c) => {
  const petition = await prisma.petition.findUnique({
    where: { slug: c.req.param('slug') },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      body: true,
      imageUrl: true,
      thumbnailImageUrl: true,
      recipientName: true,
      recipientDescription: true,
      status: true,
      goalCount: true,
      startsAt: true,
      endsAt: true,
      createdAt: true,
      allowPublicNames: true,
      allowComments: true,
      requireVerification: true,
      _count: {
        select: {
          signatures: {
            where: {
              verified: true,
              withdrawn: false,
            },
          },
        },
      },
    },
  })

  if (!petition || !['active', 'completed'].includes(petition.status)) {
    return c.json({ error: t(c, 'api.not_found') }, 404)
  }

  let publicComments = []
  if (petition.allowComments) {
    publicComments = await prisma.signature.findMany({
      where: {
        petitionId: petition.id,
        verified: true,
        withdrawn: false,
        publicOptIn: true,
        comment: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        fullName: true,
        city: true,
        comment: true,
        createdAt: true,
      },
    })
  }

  const { _count, ...petitionWithoutCount } = petition
  return c.json({
    ...petitionWithoutCount,
    signatureCount: petition._count.signatures,
    publicComments,
  })
})

publicRoutes.get('/petitions/:slug/updates', async (c) => {
  const includeVersionHistory = c.req.query('includeVersionHistory') === 'true'
  const petition = await prisma.petition.findUnique({
    where: { slug: c.req.param('slug') },
    select: { id: true, status: true },
  })

  if (!petition || !['active', 'completed'].includes(petition.status)) {
    return c.json({ error: t(c, 'api.not_found') }, 404)
  }

  const updates = await prisma.petitionUpdate.findMany({
    where: {
      petitionId: petition.id,
      versions: { some: {} },
    },
    orderBy: [{ lastPublishedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        ...(includeVersionHistory ? {} : { take: 1 }),
      },
    },
  })

  return c.json({
    updates: updates.map((update) => {
      const latestVersion = update.versions[0] ?? null
      return {
        id: update.id,
        isDeleted: !!update.deletedAt,
        deletedAt: update.deletedAt,
        createdAt: update.createdAt,
        lastPublishedAt: update.lastPublishedAt,
        latestVersion,
        versions: includeVersionHistory ? update.versions : undefined,
      }
    }),
  })
})

publicRoutes.get('/petitions/:slug/updates/:updateId/versions/:versionNumber', async (c) => {
  const versionNumber = parseInt(c.req.param('versionNumber'))
  if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
    return c.json({ error: t(c, 'api.invalid_version_number') }, 422)
  }

  const version = await prisma.petitionUpdateVersion.findFirst({
    where: {
      petitionUpdateId: c.req.param('updateId'),
      versionNumber,
      petitionUpdate: {
        petition: {
          slug: c.req.param('slug'),
          status: { in: ['active', 'completed'] },
        },
      },
    },
  })

  if (!version) return c.json({ error: t(c, 'api.not_found') }, 404)
  return c.json(version)
})

// ── Sign petition ─────────────────────────────────────────────────────────────

const signSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  city: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  comment: z.string().max(1000).optional(),
  publicOptIn: z.boolean().default(false),
  updatesOptIn: z.boolean().default(false),
  recipientShareOptIn: z.boolean().default(false),
})

publicRoutes.post('/petitions/:slug/sign', rateLimit(10, 60_000), async (c) => {
  const petition = await prisma.petition.findUnique({ where: { slug: c.req.param('slug') } })

  if (!petition || petition.status !== 'active') {
    return c.json({ error: t(c, 'api.petition_not_found_or_not_active') }, 404)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = signSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: t(c, 'api.validation_error'), details: parsed.error.flatten() }, 422)
  }

  const data = parsed.data

  // Check for existing signature
  const existing = await prisma.signature.findUnique({
    where: { petitionId_email: { petitionId: petition.id, email: data.email } },
  })

  if (existing) {
    if (existing.withdrawn) {
      // Allow re-signing after withdrawal
      await prisma.signature.update({
        where: { id: existing.id },
        data: {
          fullName: data.fullName,
          city: data.city,
          country: data.country,
          comment: data.comment,
          publicOptIn: data.publicOptIn,
          updatesOptIn: data.updatesOptIn,
          recipientShareOptIn: data.recipientShareOptIn,
          withdrawn: false,
          withdrawnAt: null,
          verified: false,
          verifiedAt: null,
        },
      })

      if (petition.requireVerification) {
        const { token, hash } = generateToken()
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
        await prisma.verificationToken.create({
          data: { signatureId: existing.id, tokenHash: hash, expiresAt, type: 'verify' },
        })
        await sendVerificationEmail(data.email, data.fullName, petition.title, token, getLocale(c))
      }

      return c.json({ message: t(c, 'api.re_signed_please_verify_your_email') })
    }

    return c.json({ error: t(c, 'api.you_have_already_signed_this_petition') }, 409)
  }

  const signature = await prisma.signature.create({
    data: {
      petitionId: petition.id,
      fullName: data.fullName,
      email: data.email,
      city: data.city,
      country: data.country,
      comment: data.comment,
      publicOptIn: data.publicOptIn,
      updatesOptIn: data.updatesOptIn,
      recipientShareOptIn: data.recipientShareOptIn,
      verified: !petition.requireVerification,
      verifiedAt: petition.requireVerification ? null : new Date(),
    },
  })

  if (petition.requireVerification) {
    const { token, hash } = generateToken()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await prisma.verificationToken.create({
      data: { signatureId: signature.id, tokenHash: hash, expiresAt, type: 'verify' },
    })
    await sendVerificationEmail(data.email, data.fullName, petition.title, token, getLocale(c))
  }

  await createAuditLog('signature.created', 'Signature', signature.id, undefined, {
    petitionId: petition.id,
  })

  return c.json(
    {
      message: petition.requireVerification
        ? t(c, 'api.signed_successfully_please_check_your_email_to_verify')
        : t(c, 'api.signed_successfully'),
      signatureId: signature.id,
    },
    201,
  )
})

// ── Verify email ──────────────────────────────────────────────────────────────

publicRoutes.get('/verify/:token', async (c) => {
  const rawToken = c.req.param('token') ?? ''
  const hash = hashToken(rawToken)

  const tokenRecord = await prisma.verificationToken.findUnique({
    where: { tokenHash: hash },
    include: { signature: { include: { petition: true } } },
  })

  if (!tokenRecord) return c.json({ error: t(c, 'api.invalid_token') }, 400)
  if (tokenRecord.usedAt) return c.json({ error: t(c, 'api.token_already_used') }, 400)
  if (tokenRecord.expiresAt < new Date()) return c.json({ error: t(c, 'api.token_expired') }, 400)
  if (tokenRecord.type !== 'verify') return c.json({ error: t(c, 'api.wrong_token_type') }, 400)

  await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    }),
    prisma.signature.update({
      where: { id: tokenRecord.signatureId },
      data: { verified: true, verifiedAt: new Date() },
    }),
  ])

  await createAuditLog('signature.verified', 'Signature', tokenRecord.signatureId)

  return c.json({
    message: t(c, 'api.email_verified_successfully'),
    petitionSlug: tokenRecord.signature.petition.slug,
    petitionTitle: tokenRecord.signature.petition.title,
  })
})

// ── Request withdrawal ────────────────────────────────────────────────────────

const withdrawRequestSchema = z.object({ email: z.string().email() })

publicRoutes.post('/petitions/:slug/withdraw-request', rateLimit(5, 60_000), async (c) => {
  const petition = await prisma.petition.findUnique({ where: { slug: c.req.param('slug') } })
  if (!petition) return c.json({ error: t(c, 'api.not_found') }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = withdrawRequestSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: t(c, 'api.invalid_email') }, 422)

  const signature = await prisma.signature.findUnique({
    where: { petitionId_email: { petitionId: petition.id, email: parsed.data.email } },
  })

  // Return success regardless to avoid email enumeration
  if (!signature || signature.withdrawn) {
    return c.json({ message: t(c, 'api.if_a_matching_signature_was_found_a_withdrawal_email_has_been_sent') })
  }

  const { token, hash } = generateToken()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await prisma.verificationToken.create({
    data: { signatureId: signature.id, tokenHash: hash, expiresAt, type: 'withdraw' },
  })
  await sendWithdrawalEmail(parsed.data.email, signature.fullName, petition.title, token, getLocale(c))

  return c.json({ message: t(c, 'api.if_a_matching_signature_was_found_a_withdrawal_email_has_been_sent') })
})

// ── Confirm withdrawal ────────────────────────────────────────────────────────

publicRoutes.post('/withdraw/:token', rateLimit(10, 60_000), async (c) => {
  const rawToken = c.req.param('token') ?? ''
  const hash = hashToken(rawToken)

  const tokenRecord = await prisma.verificationToken.findUnique({
    where: { tokenHash: hash },
    include: { signature: { include: { petition: true } } },
  })

  if (!tokenRecord) return c.json({ error: t(c, 'api.invalid_token') }, 400)
  if (tokenRecord.usedAt) return c.json({ error: t(c, 'api.token_already_used') }, 400)
  if (tokenRecord.expiresAt < new Date()) return c.json({ error: t(c, 'api.token_expired') }, 400)
  if (tokenRecord.type !== 'withdraw') return c.json({ error: t(c, 'api.wrong_token_type') }, 400)

  await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    }),
    prisma.signature.update({
      where: { id: tokenRecord.signatureId },
      data: { withdrawn: true, withdrawnAt: new Date() },
    }),
  ])

  await createAuditLog('signature.withdrawn', 'Signature', tokenRecord.signatureId)

  return c.json({
    message: t(c, 'api.your_signature_has_been_withdrawn'),
    petitionSlug: tokenRecord.signature.petition.slug,
    petitionTitle: tokenRecord.signature.petition.title,
  })
})
