import { JSX, Show, For, createEffect, createMemo, createResource, createSignal } from 'solid-js'
import { A, useLocation, useNavigate } from '@solidjs/router'
import { adminApi, AdminPetition } from '@/lib/api.js'
import { canWritePetitions, getToken, getUser, isAdmin, isAuthenticated, logout } from '@/stores/auth.js'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { t } from '@/lib/i18n'
import { HandFist } from 'lucide-solid'

interface AdminLayoutProps {
  children?: JSX.Element
}

interface BreadcrumbEntry {
  label: string
  href?: string
}

const RECENT_PETITIONS_LIMIT = 5

function truncateLabel(value: string, max = 28) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export default function AdminLayout(props: AdminLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()

  createEffect(() => {
    if (!isAuthenticated()) {
      navigate('/admin/login', { replace: true })
    }
  })

  function handleLogout() {
    logout()
    navigate('/admin/login', { replace: true })
  }

  const inPetitionsScope = createMemo(() => location.pathname.startsWith('/admin/petitions'))

  const activePetitionId = createMemo(() => {
    const match = location.pathname.match(/^\/admin\/petitions\/([^/]+)/)
    return match?.[1]
  })

  const [petitionsOpen, setPetitionsOpen] = createSignal(inPetitionsScope())

  createEffect(() => {
    if (inPetitionsScope()) {
      setPetitionsOpen(true)
    }
  })

  const [recentPetitions] = createResource(
    () => (isAuthenticated() ? getToken() ?? null : null),
    async (token) => {
      const data = await adminApi.getPetitions(token, { page: 1, limit: RECENT_PETITIONS_LIMIT })
      return data.petitions
    },
  )

  const [activePetition] = createResource(
    () => {
      const id = activePetitionId()
      const token = getToken()
      if (!id || !token) return null

      const items = recentPetitions()
      if (items?.some((petition) => petition.id === id)) return null

      return { token, id }
    },
    async (input) => adminApi.getPetition(input.token, input.id),
  )

  const sidebarPetitions = createMemo<AdminPetition[]>(() => {
    const petitions = [...(recentPetitions() ?? [])]
    const active = activePetition()

    if (active && !petitions.some((petition) => petition.id === active.id)) {
      petitions.unshift(active)
    }

    return petitions
  })

  const activePetitionTitle = createMemo(() => {
    const id = activePetitionId()
    if (!id) return undefined

    const petition = sidebarPetitions().find((item) => item.id === id)
    return petition?.title ?? t('app.petition_var', { id: id.slice(0, 8) })
  })

  const breadcrumbs = createMemo<BreadcrumbEntry[]>(() => {
    const path = location.pathname
    const entries: BreadcrumbEntry[] = [{ label: t('app.admin'), href: '/admin/dashboard' }]

    if (path === '/admin/dashboard') {
      entries.push({ label: t('app.dashboard') })
      return entries
    }

    if (path.startsWith('/admin/petitions')) {
      if (path === '/admin/petitions') {
        entries.push({ label: t('app.petitions') })
        return entries
      }

      entries.push({ label: t('app.petitions'), href: '/admin/petitions' })

      if (path === '/admin/petitions/new') {
        entries.push({ label: t('app.new') })
        return entries
      }

      const id = activePetitionId()
      if (id) {
        entries.push({
          label: activePetitionTitle() ?? t('app.petition_var', { id: id.slice(0, 8) }),
          href: `/admin/petitions/${id}/edit`,
        })
      }

      if (path.endsWith('/signatures')) {
        entries.push({ label: t('app.signatures') })
      } else if (path.endsWith('/updates')) {
        entries.push({ label: t('app.updates') })
      } else if (path.endsWith('/edit')) {
        entries.push({ label: t('app.edit') })
      }

      return entries
    }

    if (path === '/admin/export') {
      entries.push({ label: t('app.export') })
      return entries
    }

    if (path === '/admin/backup') {
      entries.push({ label: t('app.backup') })
      return entries
    }

    if (path === '/admin/users') {
      entries.push({ label: t('app.users') })
      return entries
    }

    if (path === '/admin/settings') {
      entries.push({ label: 'Auftritt' })
      return entries
    }

    if (path === '/admin/news') {
      entries.push({ label: 'Pressespiegel' })
      return entries
    }

    return entries
  })

  const bottomNavItems = createMemo<[string, string][]>(() => {
    const items: [string, string][] = [['/admin/export', `📤 ${t('app.export')}`]]
    if (canWritePetitions()) {
      items.push(['/admin/news', '📰 Pressespiegel'])
    }
    if (isAdmin()) {
      items.push(['/admin/settings', '🎨 Auftritt'])
      items.push(['/admin/backup', `💾 ${t('app.backup')}`])
      items.push(['/admin/users', `👤 ${t('app.users')}`])
    }
    return items
  })

  const isPetitionRouteActive = (petitionId: string) =>
    location.pathname.startsWith(`/admin/petitions/${petitionId}/`)

  return (
    <Show when={isAuthenticated()} fallback={null}>
      <div class="min-h-screen flex">
        <aside class="w-[320px] bg-slate-800 text-slate-300 flex flex-col shrink-0">
          <div class="px-5 py-6">
            <A href="/admin/dashboard" class="text-xl font-bold text-white no-underline">
              <div class="mt-1 inline-block">
                <HandFist class="mb-1 inline-block" size={24} strokeWidth={1} /> 4|change {t('app.admin')} 
              </div>
              <div class="inline-block ml-1 float-end">
                <LanguageSwitcher />
              </div>
            </A>
          </div>

          <nav class="flex-1 flex flex-col gap-1 px-3 overflow-y-auto">
            <A
              href="/admin/dashboard"
              class="px-3 py-2 rounded text-slate-300 no-underline text-sm transition-colors hover:bg-white/10"
              activeClass="bg-white/10 text-white"
            >
              📊 {t('app.dashboard')}
            </A>

            <div class="mt-1 rounded-md border border-white/10 bg-slate-900/30">
              <div class="flex items-center gap-1 p-1">
                <A
                  href="/admin/petitions"
                  class="flex-1 px-2.5 py-2 rounded text-slate-300 no-underline text-sm transition-colors hover:bg-white/10"
                  activeClass="bg-white/10 text-white"
                >
                  📋 {t('app.petitions')}
                </A>
                <button
                  type="button"
                  class="h-8 w-8 rounded text-slate-300 hover:bg-white/10 hover:text-white"
                  aria-label={petitionsOpen() ? t('app.collapse_petitions') : t('app.expand_petitions')}
                  onClick={() => setPetitionsOpen((open) => !open)}
                >
                  {petitionsOpen() ? '▾' : '▸'}
                </button>
              </div>

              <Show when={petitionsOpen()}>
                <div class="px-2 pb-2">
                  <Show
                    when={sidebarPetitions().length > 0}
                    fallback={<p class="px-2 py-1 text-xs text-slate-400">{t('app.no_petitions_yet')}</p>}
                  >
                    <For each={sidebarPetitions()}>
                      {(petition) => (
                        <div class="mb-1 rounded border border-transparent bg-slate-900/30 hover:border-white/10">
                          <div class="flex items-center gap-1 p-1">
                            <A
                              href={`/admin/petitions/${petition.id}/edit`}
                              class="min-w-0 flex-1 rounded px-2 py-1.5 text-xs text-slate-300 no-underline hover:bg-white/10"
                              classList={{
                                'bg-white/10 text-white': isPetitionRouteActive(petition.id),
                              }}
                              title={petition.title}
                            >
                              {truncateLabel(petition.title)}
                            </A>
                            <A
                              href={`/admin/petitions/${petition.id}/updates`}
                              class="rounded px-2 py-1 text-[11px] font-medium text-slate-300 no-underline hover:bg-white/10 hover:text-white"
                              classList={{
                                'bg-white/10 text-white': location.pathname === `/admin/petitions/${petition.id}/updates`,
                              }}
                            >
                              {t('app.updates')}
                            </A>
                            <A
                              href={`/admin/petitions/${petition.id}/signatures`}
                              class="rounded px-2 py-1 text-[11px] font-medium text-slate-300 no-underline hover:bg-white/10 hover:text-white"
                              classList={{
                                'bg-white/10 text-white': location.pathname === `/admin/petitions/${petition.id}/signatures`,
                              }}
                            >
                              {t('app.signatures')}
                            </A>
                          </div>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </Show>
            </div>

            <For each={bottomNavItems()}>
              {([href, label]) => (
                <A
                  href={href}
                  class="px-3 py-2 rounded text-slate-300 no-underline text-sm transition-colors hover:bg-white/10"
                  activeClass="bg-white/10 text-white"
                >
                  {label}
                </A>
              )}
            </For>
          </nav>

          <div class="px-5 py-4 mt-auto">
            <Button
              variant="ghost"
              class="w-full text-slate-300 hover:text-white hover:bg-white/10"
              onClick={handleLogout}
            >
              {t('app.sign_out')}
            </Button>
          </div>
        </aside>

        <div class="flex-1 flex flex-col overflow-auto">
          <main class="p-8 flex-1">
            <Show when={breadcrumbs().length > 1}>
              <Breadcrumb class="mb-6">
                <BreadcrumbList>
                  <For each={breadcrumbs()}>
                    {(entry, index) => {
                      const isLast = () => index() === breadcrumbs().length - 1

                      return (
                        <>
                          <BreadcrumbItem>
                            <Show
                              when={!isLast() && entry.href}
                              fallback={<span class="text-foreground">{entry.label}</span>}
                            >
                              <BreadcrumbLink href={entry.href}>{entry.label}</BreadcrumbLink>
                            </Show>
                          </BreadcrumbItem>
                          <Show when={!isLast()}>
                            <BreadcrumbSeparator />
                          </Show>
                        </>
                      )
                    }}
                  </For>
                </BreadcrumbList>
              </Breadcrumb>
            </Show>
            {props.children}
          </main>
        </div>
      </div>
    </Show>
  )
}
