import { createEffect, createMemo, createResource, createSignal, For, Show } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { api, SignPayload } from '@/lib/api.js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { TextField, TextFieldInput, TextFieldLabel, TextFieldTextArea } from '@/components/ui/text-field'
import { StatusBadge, type PetitionStatus } from '@/components/StatusBadge'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { t } from '@/lib/i18n'
import { buildShareText, buildShareUrl } from '@/lib/share'
import { VirtualDemonstration } from '@/components/VirtualDemonstration'

export default function PetitionPage() {
  const params = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [petition] = createResource(() => params.slug, api.getPetition)
  const [updates] = createResource(() => params.slug, (slug) =>
    api.getPetitionUpdates(slug, { includeVersionHistory: true }),
  )
  const [expandedUpdates, setExpandedUpdates] = createSignal<Set<string>>(new Set())
  const [historyShownUpdates, setHistoryShownUpdates] = createSignal<Set<string>>(new Set())

  const [form, setForm] = createSignal<SignPayload>({
    fullName: '',
    email: '',
    city: '',
    country: '',
    comment: '',
    publicOptIn: false,
    updatesOptIn: false,
    recipientShareOptIn: false,
    website: '',
    formStartedAt: Date.now(),
  })
  const [copied, setCopied] = createSignal(false)
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const progress = createMemo(() => {
    const p = petition()
    if (!p?.goalCount) return null
    return Math.min(100, Math.round((p.signatureCount / p.goalCount) * 100))
  })
  const shareText = createMemo(() => {
    const p = petition()
    return p ? buildShareText(p) : ''
  })
  const shareUrl = createMemo(() => buildShareUrl(params.slug))
  const shareLinks = createMemo(() => ({
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText()} ${shareUrl()}`)}`,
    email: `mailto:?subject=${encodeURIComponent('Petition unterstützen')}&body=${encodeURIComponent(`${shareText()}\n\n${shareUrl()}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl())}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(shareUrl())}`,
  }))

  createEffect(() => {
    const p = petition()
    if (!p) return
    const description = stripHtml(p.summary || p.body).slice(0, 160)
    document.title = `${p.title} | 4|change`
    setMeta('description', description)
    setMeta('og:title', p.title, 'property')
    setMeta('og:description', shareText() || description, 'property')
    setMeta('og:url', buildShareUrl(p.slug), 'property')
    if (p.imageUrl || p.thumbnailImageUrl) {
      setMeta('og:image', p.imageUrl || p.thumbnailImageUrl || '', 'property')
    }
  })

  function update<K extends keyof SignPayload>(key: K, value: SignPayload[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleExpanded(updateId: string) {
    setExpandedUpdates((prev) => {
      const next = new Set(prev)
      if (next.has(updateId)) next.delete(updateId)
      else next.add(updateId)
      return next
    })
  }

  function toggleHistory(updateId: string) {
    setHistoryShownUpdates((prev) => {
      const next = new Set(prev)
      if (next.has(updateId)) next.delete(updateId)
      else next.add(updateId)
      return next
    })
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (submitting()) return
    setError(null)
    setSubmitting(true)
    try {
      await api.signPetition(params.slug, form())
      navigate(`/petition/${params.slug}/success`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('app.submission_failed_please_try_again'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCopyShare() {
    await navigator.clipboard.writeText(`${shareText()} ${shareUrl()}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <Show when={petition.loading}>
        <div class="space-y-4">
          <Skeleton class="h-8 w-2/3 rounded" animate />
          <Skeleton class="h-4 w-1/3 rounded" animate />
          <Skeleton class="h-40 w-full rounded" animate />
        </div>
      </Show>

      <Show when={petition.error}>
        <Alert variant="destructive">
          <AlertDescription>{t('app.petition_not_found')}</AlertDescription>
        </Alert>
      </Show>

      <Show when={petition()}>
        {(p) => (
          <div class="space-y-8">
            <section class="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div class="flex min-h-[360px] flex-col justify-end overflow-hidden rounded-lg border border-border bg-card">
                <Show when={p().imageUrl}>
                  <img
                    src={p().imageUrl ?? undefined}
                    alt={p().title}
                    class="h-56 w-full object-cover md:h-72"
                  />
                </Show>
                <div class="p-6">
                  <div class="mb-3 flex flex-wrap items-center gap-3">
                    <StatusBadge status={p().status as PetitionStatus} type="petition" />
                    <span class="text-sm font-medium text-primary">4|change</span>
                  </div>
                  <h1 class="max-w-4xl break-words text-4xl font-extrabold tracking-tight md:text-5xl">{p().title}</h1>
                  <Show when={p().summary}>
                    <div class="petition-summary mt-4 max-w-3xl text-lg text-muted-foreground" innerHTML={p().summary} />
                  </Show>
                </div>
              </div>

              <Card class="self-stretch">
                <CardHeader>
                  <CardTitle>Aktueller Stand</CardTitle>
                </CardHeader>
                <CardContent class="space-y-5">
                  <div>
                    <p class="text-4xl font-extrabold text-primary">{p().signatureCount.toLocaleString()}</p>
                    <p class="text-sm text-muted-foreground">bestätigte Unterschriften</p>
                  </div>
                  <Show when={p().goalCount}>
                    <div>
                      <div class="mb-2 flex justify-between text-sm">
                        <span>{progress()}% erreicht</span>
                        <span>Ziel: {p().goalCount?.toLocaleString()}</span>
                      </div>
                      <Progress value={progress() ?? 0} />
                    </div>
                  </Show>
                  <p class="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
                    Jede Stimme zählt erst nach der Bestätigung per E-Mail. So bleibt die Petition niedrigschwellig und besser gegen Missbrauch geschützt.
                  </p>
                  <div class="grid grid-cols-2 gap-2">
                    <Button variant="outline" as="a" href={shareLinks().whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</Button>
                    <Button variant="outline" as="a" href={shareLinks().facebook} target="_blank" rel="noopener noreferrer">Facebook</Button>
                    <Button variant="outline" as="a" href={shareLinks().x} target="_blank" rel="noopener noreferrer">X</Button>
                    <Button variant="outline" onClick={handleCopyShare}>{copied() ? t('app.copied') : t('app.copy_link')}</Button>
                  </div>
                </CardContent>
              </Card>
            </section>

            <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            {/* Petition details */}
            <div class="min-w-0">
              <p class="mb-1 text-muted-foreground">
                {t('app.to')}:{' '}
                <Show when={p().recipientDescription} fallback={<strong>{p().recipientName}</strong>}>
                  {' '}
                  <HoverCard openDelay={150} closeDelay={100}>
                    <HoverCardTrigger
                      as="button"
                      type="button"
                      class="inline-flex items-center rounded-sm underline decoration-dotted underline-offset-4 hover:text-foreground"
                    >
                      <strong>{p().recipientName}</strong>
                    </HoverCardTrigger>
                    <HoverCardContent class="w-80">
                      <div class="petition-body text-sm text-foreground" innerHTML={p().recipientDescription!} />
                    </HoverCardContent>
                  </HoverCard>
                </Show>
              </p>
              <p class="text-sm text-muted-foreground mb-4">
                {t('app.var_signatures', { count: p().signatureCount.toLocaleString() })}
                <Show when={p().goalCount}> {t('app.of_var_goal', { goal: p().goalCount?.toLocaleString() ?? '' })}</Show>
              </p>

              <div
                class="petition-body mb-8 leading-relaxed"
                innerHTML={p().body}
              />

              <Show when={p().allowComments && p().publicComments?.length}>
                <section class="mt-8 rounded-lg border border-border bg-card p-6">
                  <h2 class="text-xl font-semibold">{t('app.supporter_voices')}</h2>
                  <div class="mt-4 space-y-4">
                    <For each={(p().publicComments ?? []).slice(0, 5)}>
                      {(entry) => (
                        <blockquote class="border-l-4 border-primary pl-4 text-sm">
                          <p>{entry.comment}</p>
                          <footer class="mt-2 text-muted-foreground">
                            {entry.fullName ?? t('app.anonymous')}{entry.city ? `, ${entry.city}` : ''}
                          </footer>
                        </blockquote>
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <VirtualDemonstration signatureCount={p().signatureCount} comments={p().publicComments ?? []} />

              <Show when={!updates.loading}>
                <section class="mb-8">
                  <h2 class="text-lg font-bold mb-3">{t('app.updates')}</h2>
                  <Show
                    when={(updates()?.updates.length ?? 0) > 0}
                    fallback={<p class="text-sm text-muted-foreground">{t('app.no_updates_published_yet')}</p>}
                  >
                    <div class="space-y-4">
                      <For each={updates()?.updates}>
                        {(update) => (
                          <Card>
                            <button
                              type="button"
                              class="w-full px-4 py-3 text-left"
                              onClick={() => toggleExpanded(update.id)}
                            >
                              <div class="flex items-center justify-between gap-3">
                                <div class="flex min-w-0 items-center gap-3">
                                  <Show when={update.latestVersion?.thumbnailImageUrl}>
                                    <img
                                      src={update.latestVersion?.thumbnailImageUrl ?? undefined}
                                      alt={update.latestVersion?.title ?? 'Update thumbnail'}
                                      class="h-10 w-14 shrink-0 rounded border object-cover"
                                    />
                                  </Show>
                                  <div class="text-base font-semibold">
                                    {update.isDeleted ? t('app.deleted_update') : (update.latestVersion?.title ?? t('app.published_update'))}
                                  </div>
                                </div>
                                <div class="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(update.latestVersion?.publishedAt ?? update.createdAt).toLocaleString()}
                                </div>
                              </div>
                            </button>
                            <Show when={expandedUpdates().has(update.id)}>
                              <CardContent class="space-y-3 pt-0">
                                <Show when={!update.isDeleted && update.latestVersion}>
                                  <Show when={update.latestVersion!.imageUrl}>
                                    <img
                                      src={update.latestVersion!.imageUrl ?? undefined}
                                      alt={update.latestVersion!.title}
                                      class="h-56 w-full rounded border object-cover"
                                    />
                                  </Show>
                                  <div class="petition-body" innerHTML={update.latestVersion!.content} />
                                </Show>
                                <Show when={update.isDeleted}>
                                  <p class="text-sm text-muted-foreground">
                                    {t('app.this_update_was_deleted')}
                                  </p>
                                  <Show when={update.latestVersion}>
                                    <div class="rounded border p-3">
                                      <div class="text-sm font-medium">
                                        {t('app.latest_published')}: {update.latestVersion?.title}
                                      </div>
                                      <p class="text-xs text-muted-foreground mt-1">
                                        {t('app.published_var', { date: new Date(update.latestVersion!.publishedAt).toLocaleString() })}
                                      </p>
                                      <Show when={update.latestVersion!.imageUrl}>
                                        <img
                                          src={update.latestVersion!.imageUrl ?? undefined}
                                          alt={update.latestVersion!.title}
                                          class="mt-2 h-48 w-full rounded border object-cover"
                                        />
                                      </Show>
                                      <div class="petition-body mt-2 text-sm" innerHTML={update.latestVersion!.content} />
                                    </div>
                                  </Show>
                                </Show>

                                <Show when={(update.versions?.length ?? 0) > 1}>
                                  <div class="border-t pt-3">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => toggleHistory(update.id)}
                                    >
                                      {historyShownUpdates().has(update.id) ? t('app.hide_version_history') : t('app.show_version_history')}
                                    </Button>
                                  </div>
                                </Show>

                                <Show when={historyShownUpdates().has(update.id) && update.versions && update.versions!.length > 1}>
                                  <div class="space-y-3">
                                    <h3 class="text-sm font-semibold">{t('app.version_history')}</h3>
                                    <For each={update.versions!.slice(1)}>
                                      {(version) => (
                                        <div class="rounded border p-3">
                                          <div class="text-sm font-medium">
                                            v{version.versionNumber}: {version.title}
                                          </div>
                                          <p class="text-xs text-muted-foreground mt-1">
                                            {t('app.published_var', { date: new Date(version.publishedAt).toLocaleString() })}
                                          </p>
                                          <Show when={version.imageUrl}>
                                            <img
                                              src={version.imageUrl ?? undefined}
                                              alt={version.title}
                                              class="mt-2 h-40 w-full rounded border object-cover"
                                            />
                                          </Show>
                                          <div class="petition-body mt-2 text-sm" innerHTML={version.content} />
                                        </div>
                                      )}
                                    </For>
                                  </div>
                                </Show>
                              </CardContent>
                            </Show>
                          </Card>
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
              </Show>

              <Show when={p().allowPublicNames && p().signatures && p().signatures!.length > 0}>
                <h2 class="text-lg font-bold mb-4">{t('app.recent_signers')}</h2>
                <div class="flex flex-col gap-3 mb-8">
                  <For each={p().signatures}>
                    {(sig) => (
                      <Card>
                        <CardContent class="py-3">
                          <strong>{sig.fullName}</strong>
                          <Show when={sig.city || sig.country}>
                            <span class="text-muted-foreground text-sm ml-2">
                              {[sig.city, sig.country].filter(Boolean).join(', ')}
                            </span>
                          </Show>
                          <Show when={sig.comment}>
                            <p class="mt-1 text-sm text-muted-foreground">"{sig.comment}"</p>
                          </Show>
                        </CardContent>
                      </Card>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Signature form */}
            <aside class="min-w-0">
              <Card class="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
                <CardHeader>
                  <CardTitle>{t('app.sign_this_petition')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Show when={error()}>
                    <Alert variant="destructive" class="mb-4">
                      <AlertDescription>{error()}</AlertDescription>
                    </Alert>
                  </Show>

                  <Show
                    when={p().status === 'active'}
                    fallback={
                      <Alert>
                        <AlertDescription>
                          {t('app.this_petition_is_currently_var_and_not_accepting_new_signatures', { status: p().status })}
                        </AlertDescription>
                      </Alert>
                    }
                  >
                    <form onSubmit={handleSubmit} class="space-y-4">
                      <TextField class="hidden" aria-hidden="true">
                        <TextFieldLabel>Website</TextFieldLabel>
                        <TextFieldInput
                          type="text"
                          tabindex="-1"
                          autocomplete="off"
                          value={form().website ?? ''}
                          onInput={(e) => update('website', e.currentTarget.value)}
                        />
                      </TextField>
                      <TextField>
                        <TextFieldLabel>{t('app.full_name')}</TextFieldLabel>
                        <TextFieldInput
                          type="text"
                          required
                          value={form().fullName}
                          onInput={(e) => update('fullName', e.currentTarget.value)}
                        />
                      </TextField>

                      <TextField>
                        <TextFieldLabel>{t('app.email_address')}</TextFieldLabel>
                        <TextFieldInput
                          type="email"
                          required
                          value={form().email}
                          onInput={(e) => update('email', e.currentTarget.value)}
                        />
                      </TextField>
                      <p class="text-sm text-muted-foreground">
                        Deine Unterschrift zählt erst, nachdem du den Bestätigungslink in der E-Mail angeklickt hast.
                      </p>

                      <div class="grid grid-cols-2 gap-3">
                        <TextField>
                          <TextFieldLabel>{t('app.city')}</TextFieldLabel>
                          <TextFieldInput
                            type="text"
                            value={form().city ?? ''}
                            onInput={(e) => update('city', e.currentTarget.value)}
                          />
                        </TextField>
                        <TextField>
                          <TextFieldLabel>{t('app.country')}</TextFieldLabel>
                          <TextFieldInput
                            type="text"
                            value={form().country ?? ''}
                            onInput={(e) => update('country', e.currentTarget.value)}
                          />
                        </TextField>
                      </div>

                      <Show when={p().allowComments}>
                        <TextField>
                          <TextFieldLabel>{t('app.comment_optional')}</TextFieldLabel>
                          <TextFieldTextArea
                            rows={3}
                            maxLength={1000}
                            value={form().comment ?? ''}
                            onInput={(e) => update('comment', e.currentTarget.value)}
                          />
                        </TextField>
                      </Show>

                      <div class="flex flex-col gap-2">
                        <Show when={p().allowPublicNames}>
                          <label class="flex items-center gap-2 cursor-pointer text-sm">
                            <Checkbox
                              checked={form().publicOptIn}
                              onChange={(checked) => update('publicOptIn', checked)}
                            />
                            {t('app.display_my_name_publicly')}
                          </label>
                        </Show>
                        <label class="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox
                            checked={form().updatesOptIn}
                            onChange={(checked) => update('updatesOptIn', checked)}
                          />
                          {t('app.send_me_updates_about_this_petition')}
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox
                            checked={form().recipientShareOptIn}
                            onChange={(checked) => update('recipientShareOptIn', checked)}
                          />
                          {t('app.share_my_signature_with_the_recipient')}
                        </label>
                      </div>

                      <p class="text-xs text-muted-foreground">{t('app.signature_withdrawal_note')}</p>
                      <p class="text-xs text-muted-foreground">
                        {t('app.by_signing_you_agree_to_our')}{' '}
                        <a href="/privacy" target="_blank" class="underline">{t('app.privacy_policy')}</a>.
                        {p().requireVerification && ` ${t('app.you_will_receive_a_confirmation_email')}`}
                      </p>

                      <Button type="submit" class="w-full" disabled={submitting()}>
                        {submitting() ? t('app.submitting') : t('app.sign_petition')}
                      </Button>
                    </form>
                  </Show>
                </CardContent>
              </Card>
            </aside>
          </div>
          </div>
        )}
      </Show>
    </div>
  )
}

function stripHtml(value: string) {
  const el = document.createElement('div')
  el.innerHTML = value
  return el.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function setMeta(key: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}
