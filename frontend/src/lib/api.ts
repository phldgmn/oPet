import { getCurrentLocale, t } from '@/lib/i18n.js'
const API_URL = import.meta.env.VITE_API_URL || ''

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Accept-Language': getCurrentLocale(),
    ...(options.headers as Record<string, string> | undefined),
  }
  const isFormData = options.body instanceof FormData
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error || t('app.request_failed'), body)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) return res.json() as Promise<T>
  return res.text() as unknown as T
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message)
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface PublicComment {
  fullName: string | null
  city: string | null
  comment: string
  createdAt: string
}

export interface Petition {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  imageUrl?: string | null
  thumbnailImageUrl?: string | null
  recipientName: string
  recipientDescription?: string
  status: string
  goalCount?: number
  allowPublicNames: boolean
  allowComments: boolean
  requireVerification: boolean
  startsAt?: string
  endsAt?: string
  createdAt: string
  signatureCount: number
  signatures?: PublicSignature[]
  publicComments?: PublicComment[]
}

export interface SiteSettings {
  id: string
  publicSiteTitle: string
  publicClaim: string
  logoUrl?: string | null
  defaultShareText: string
  createdAt: string
  updatedAt: string
}

export interface NewsSource {
  id: string
  name: string
  feedUrl: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  _count?: { items: number }
}

export interface NewsItem {
  id: string
  sourceId: string
  title: string
  url: string
  excerpt?: string | null
  publishedAt?: string | null
  status: 'draft' | 'approved' | 'hidden'
  createdAt: string
  updatedAt: string
  source?: { id: string; name: string }
}

export interface PublicSignature {
  fullName: string
  city?: string
  country?: string
  comment?: string
  createdAt: string
}

export interface PetitionUpdateVersion {
  id: string
  petitionUpdateId: string
  versionNumber: number
  title: string
  content: string
  imageUrl?: string | null
  thumbnailImageUrl?: string | null
  publishedAt: string
  publishedBy?: string
  publisher?: { id: string; email: string }
}

export interface PublicPetitionUpdate {
  id: string
  isDeleted: boolean
  deletedAt?: string
  createdAt: string
  lastPublishedAt?: string
  latestVersion?: PetitionUpdateVersion
  versions?: PetitionUpdateVersion[]
}

export interface SignPayload {
  fullName: string
  email: string
  city?: string
  country?: string
  comment?: string
  publicOptIn: boolean
  updatesOptIn: boolean
  recipientShareOptIn: boolean
  website?: string
  formStartedAt?: number
}

export const api = {
  getSiteSettings: () => request<SiteSettings>('/api/site-settings'),

  getNews: (params?: { limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.limit) q.set('limit', String(params.limit))
    return request<{ items: NewsItem[] }>(`/api/news?${q}`)
  },

  getPetitions: (params?: { search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.search) q.set('search', params.search)
    if (params?.page) q.set('page', String(params.page))
    if (params?.limit) q.set('limit', String(params.limit))
    return request<{ petitions: Petition[]; total: number; page: number; totalPages: number }>(
      `/api/petitions?${q}`,
    )
  },

  getPetition: (slug: string) => request<Petition>(`/api/petitions/${slug}`),

  getPetitionUpdates: (slug: string, params?: { includeVersionHistory?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.includeVersionHistory) q.set('includeVersionHistory', 'true')
    return request<{ updates: PublicPetitionUpdate[] }>(`/api/petitions/${slug}/updates?${q}`)
  },

  getPetitionUpdateVersion: (slug: string, updateId: string, versionNumber: number) =>
    request<PetitionUpdateVersion>(
      `/api/petitions/${slug}/updates/${updateId}/versions/${versionNumber}`,
    ),

  signPetition: (slug: string, payload: SignPayload) =>
    request<{ message: string; signatureId: string }>(`/api/petitions/${slug}/sign`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  requestWithdrawal: (slug: string, email: string) =>
    request<{ message: string }>(`/api/petitions/${slug}/withdraw-request`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyToken: (token: string) =>
    request<{ message: string; petitionSlug: string; petitionTitle: string }>(
      `/api/verify/${token}`,
    ),

  withdrawToken: (token: string) =>
    request<{ message: string; petitionSlug: string; petitionTitle: string }>(
      `/api/withdraw/${token}`,
      { method: 'POST' },
    ),
}

// ── Admin API ─────────────────────────────────────────────────────────────────

export interface AdminPetition extends Petition {
  creator?: { email: string }
  _count?: { signatures: number }
}

export interface Signature {
  id: string
  petitionId: string
  fullName: string
  email: string
  city?: string
  country?: string
  comment?: string
  verified: boolean
  withdrawn: boolean
  publicOptIn: boolean
  updatesOptIn: boolean
  recipientShareOptIn: boolean
  createdAt: string
  verifiedAt?: string
  withdrawnAt?: string
  riskSignals?: SignatureRiskSignal[]
}

export interface SignatureRiskSignal {
  id: string
  signatureId: string
  reason: string
  metadataJson?: string | null
  createdAt: string
}

export interface AdminPetitionUpdate {
  id: string
  petitionId: string
  currentTitle: string
  currentContent: string
  currentImageUrl?: string | null
  currentThumbnailImageUrl?: string | null
  lastPublishedAt?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
  creator?: { id: string; email: string }
  updater?: { id: string; email: string }
  deleter?: { id: string; email: string }
  versions: PetitionUpdateVersion[]
}

export interface DashboardStats {
  totalPetitions: number
  activePetitions: number
  totalSignatures: number
  verifiedSignatures: number
}

export type AdminUserRole = 'admin' | 'organizer' | 'reader'

export interface AdminUserSummary {
  id: string
  email: string
  role: AdminUserRole
  createdAt: string
  petitionIds: string[]
  petitions: { id: string; title: string; slug: string }[]
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; role: AdminUserRole } }>(
      '/api/admin/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    ),

  getDashboard: (token: string) =>
    request<{ stats: DashboardStats; recentSignatures: Signature[]; recentPetitions: AdminPetition[] }>(
      '/api/admin/dashboard',
      {},
      token,
    ),

  getPetitions: (token: string, params?: { page?: number; limit?: number; status?: string }) => {
    const q = new URLSearchParams()
    if (params?.page) q.set('page', String(params.page))
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.status) q.set('status', params.status)
    return request<{ petitions: AdminPetition[]; total: number; totalPages: number }>(
      `/api/admin/petitions?${q}`,
      {},
      token,
    )
  },

  getPetition: (token: string, id: string) =>
    request<AdminPetition>(`/api/admin/petitions/${id}`, {}, token),

  createPetition: (token: string, data: Partial<AdminPetition>) =>
    request<AdminPetition>('/api/admin/petitions', { method: 'POST', body: JSON.stringify(data) }, token),

  updatePetition: (token: string, id: string, data: Partial<AdminPetition>) =>
    request<AdminPetition>(`/api/admin/petitions/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),

  archivePetition: (token: string, id: string) =>
    request<{ message: string }>(`/api/admin/petitions/${id}`, { method: 'DELETE' }, token),

  getPetitionUpdates: (token: string, petitionId: string) =>
    request<{ updates: AdminPetitionUpdate[] }>(`/api/admin/petitions/${petitionId}/updates`, {}, token),

  getPetitionUpdateVersions: (token: string, petitionId: string, updateId: string) =>
    request<AdminPetitionUpdate>(
      `/api/admin/petitions/${petitionId}/updates/${updateId}/versions`,
      {},
      token,
    ),

  createPetitionUpdate: (
    token: string,
    petitionId: string,
    data: { title: string; content: string; imageUrl?: string | null; thumbnailImageUrl?: string | null },
  ) =>
    request<AdminPetitionUpdate>(
      `/api/admin/petitions/${petitionId}/updates`,
      { method: 'POST', body: JSON.stringify(data) },
      token,
    ),

  updatePetitionUpdate: (
    token: string,
    petitionId: string,
    updateId: string,
    data: { title?: string; content?: string; imageUrl?: string | null; thumbnailImageUrl?: string | null },
  ) =>
    request<AdminPetitionUpdate>(
      `/api/admin/petitions/${petitionId}/updates/${updateId}`,
      { method: 'PUT', body: JSON.stringify(data) },
      token,
    ),

  publishPetitionUpdate: (
    token: string,
    petitionId: string,
    updateId: string,
    data?: { title?: string; content?: string; imageUrl?: string | null; thumbnailImageUrl?: string | null },
  ) =>
    request<PetitionUpdateVersion>(
      `/api/admin/petitions/${petitionId}/updates/${updateId}/publish`,
      { method: 'POST', body: JSON.stringify(data ?? {}) },
      token,
    ),

  deletePetitionUpdate: (token: string, petitionId: string, updateId: string) =>
    request<{ message: string }>(
      `/api/admin/petitions/${petitionId}/updates/${updateId}`,
      { method: 'DELETE' },
      token,
    ),

  getSignatures: (
    token: string,
    petitionId: string,
    params?: { page?: number; verified?: boolean; withdrawn?: boolean },
  ) => {
    const q = new URLSearchParams()
    if (params?.page) q.set('page', String(params.page))
    if (params?.verified !== undefined) q.set('verified', String(params.verified))
    if (params?.withdrawn !== undefined) q.set('withdrawn', String(params.withdrawn))
    return request<{ signatures: Signature[]; total: number; totalPages: number }>(
      `/api/admin/petitions/${petitionId}/signatures?${q}`,
      {},
      token,
    )
  },

  removeSignature: (token: string, id: string) =>
    request<{ message: string }>(`/api/admin/signatures/${id}`, { method: 'DELETE' }, token),

  getSiteSettings: (token: string) =>
    request<SiteSettings>('/api/admin/site-settings', {}, token),

  updateSiteSettings: (token: string, data: Pick<SiteSettings, 'publicSiteTitle' | 'publicClaim' | 'defaultShareText'> & { logoUrl?: string | null }) =>
    request<SiteSettings>('/api/admin/site-settings', { method: 'PUT', body: JSON.stringify(data) }, token),

  getNewsSources: (token: string) =>
    request<{ sources: NewsSource[] }>('/api/admin/news/sources', {}, token),

  createNewsSource: (token: string, data: { name: string; feedUrl: string; enabled: boolean }) =>
    request<NewsSource>('/api/admin/news/sources', { method: 'POST', body: JSON.stringify(data) }, token),

  updateNewsSource: (token: string, id: string, data: Partial<{ name: string; feedUrl: string; enabled: boolean }>) =>
    request<NewsSource>(`/api/admin/news/sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),

  deleteNewsSource: (token: string, id: string) =>
    request<{ message: string }>(`/api/admin/news/sources/${id}`, { method: 'DELETE' }, token),

  getNewsItems: (token: string, params?: { status?: string }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    return request<{ items: NewsItem[] }>(`/api/admin/news/items?${q}`, {}, token)
  },

  updateNewsItemStatus: (token: string, id: string, status: NewsItem['status']) =>
    request<NewsItem>(`/api/admin/news/items/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }, token),

  importNews: (token: string) =>
    request<{ imported: number; skipped: number; sources: number }>('/api/admin/news/import', { method: 'POST' }, token),

  uploadImage: async (token: string, file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<{ url: string }>(
      '/api/admin/uploads/image',
      { method: 'POST', body },
      token,
    )
  },

  exportSignatures: async (
    token: string,
    format: 'csv' | 'json',
    filters: { petitionId?: string; verified?: boolean; withdrawn?: boolean; country?: string },
  ) => {
    const res = await fetch(`${API_URL}/api/admin/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': getCurrentLocale(),
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ format, ...filters }),
    })
    if (!res.ok) throw new ApiError(res.status, t('app.export_failed'))
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `signatures.${format}`
    a.click()
    URL.revokeObjectURL(url)
  },

  getUsers: (token: string) =>
    request<AdminUserSummary[]>(
      '/api/admin/users',
      {},
      token,
    ),

  createUser: (
    token: string,
    data: { email: string; password: string; role: AdminUserRole; petitionIds?: string[] },
  ) => request<AdminUserSummary>('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }, token),

  updateUser: (
    token: string,
    id: string,
    data: { email?: string; password?: string; role?: AdminUserRole; petitionIds?: string[] },
  ) => request<AdminUserSummary>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),

  deleteUser: (token: string, id: string) =>
    request<{ message: string }>(`/api/admin/users/${id}`, { method: 'DELETE' }, token),

  backup: async (token: string) => {
    const res = await fetch(`${API_URL}/api/admin/backup`, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Language': getCurrentLocale() },
    })
    if (!res.ok) throw new ApiError(res.status, t('app.backup_failed'))
    const disposition = res.headers.get('content-disposition') ?? ''
    const match = disposition.match(/filename="([^"]+)"/)
    const filename = match ? match[1] : `opet-backup-${new Date().toISOString().split('app.t')[0]}.json`
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  restore: async (token: string, file: File) => {
    const text = await file.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(t('app.invalid_json_format_in_backup_file'))
    }
    return request<{ message: string; restoredPetitions: number; restoredSignatures: number }>(
      '/api/admin/restore',
      { method: 'POST', body: JSON.stringify(data) },
      token,
    )
  },
}
