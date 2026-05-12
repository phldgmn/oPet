import { createResource, createSignal, For, Show } from 'solid-js'
import { adminApi, NewsItem } from '@/lib/api'
import { getToken, isAdmin } from '@/stores/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field'

export default function NewsRadarPage() {
  const token = getToken() ?? ''
  const isAdminUser = isAdmin()
  const [name, setName] = createSignal('')
  const [feedUrl, setFeedUrl] = createSignal('')
  const [enabled, setEnabled] = createSignal(true)
  const [manualSourceId, setManualSourceId] = createSignal('')
  const [manualTitle, setManualTitle] = createSignal('')
  const [manualUrl, setManualUrl] = createSignal('')
  const [manualExcerpt, setManualExcerpt] = createSignal('')
  const [manualPublishedAt, setManualPublishedAt] = createSignal('')
  const [message, setMessage] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [importing, setImporting] = createSignal(false)

  const [sources, { refetch: refetchSources }] = createResource(() => token, adminApi.getNewsSources)
  const [items, { refetch: refetchItems }] = createResource(() => token, (authToken) => adminApi.getNewsItems(authToken))

  async function createSource(e: Event) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      await adminApi.createNewsSource(token, { name: name().trim(), feedUrl: feedUrl().trim() || undefined, enabled: enabled() })
      setName('')
      setFeedUrl('')
      setEnabled(true)
      setMessage('Quelle gespeichert.')
      await refetchSources()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Quelle konnte nicht gespeichert werden.')
    }
  }

  async function createManualItem(e: Event) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      await adminApi.createNewsItem(token, {
        sourceId: manualSourceId(),
        title: manualTitle().trim(),
        url: manualUrl().trim(),
        excerpt: manualExcerpt().trim() || undefined,
        publishedAt: manualPublishedAt() || undefined,
        status: 'draft',
      })
      setManualTitle('')
      setManualUrl('')
      setManualExcerpt('')
      setManualPublishedAt('')
      setMessage('Meldung als Entwurf gespeichert.')
      await refetchItems()
      await refetchSources()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Meldung konnte nicht gespeichert werden.')
    }
  }

  async function runImport() {
    setImporting(true)
    setError(null)
    setMessage(null)
    try {
      const result = await adminApi.importNews(token)
      setMessage(`${result.imported} Meldungen importiert, ${result.skipped} übersprungen.`)
      await refetchItems()
      await refetchSources()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen.')
    } finally {
      setImporting(false)
    }
  }

  async function setStatus(item: NewsItem, status: NewsItem['status']) {
    await adminApi.updateNewsItemStatus(token, item.id, status)
    await refetchItems()
  }

  return (
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">Pressespiegel</h1>
          <p class="mt-1 text-sm text-muted-foreground">RSS-Meldungen werden als Entwurf importiert und erst nach Freigabe öffentlich angezeigt.</p>
        </div>
        <Show when={isAdminUser}>
          <Button onClick={runImport} disabled={importing()}>
            {importing() ? 'Importiert…' : 'Import jetzt starten'}
          </Button>
        </Show>
      </div>

      <Show when={message()}>
        {(msg) => <Alert><AlertDescription>{msg()}</AlertDescription></Alert>}
      </Show>
      <Show when={error()}>
        {(msg) => <Alert variant="destructive"><AlertDescription>{msg()}</AlertDescription></Alert>}
      </Show>

      <div class="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div class="space-y-6">
          <Card>
            <CardHeader><CardTitle>Neue Quelle</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createSource} class="space-y-4">
                <TextField>
                  <TextFieldLabel>Name</TextFieldLabel>
                  <TextFieldInput required value={name()} onInput={(e) => setName(e.currentTarget.value)} />
                </TextField>
                <TextField>
                  <TextFieldLabel>RSS/Atom URL</TextFieldLabel>
                  <TextFieldInput type="url" value={feedUrl()} onInput={(e) => setFeedUrl(e.currentTarget.value)} />
                </TextField>
                <label class="flex items-center gap-2 text-sm">
                  <Checkbox checked={enabled()} onChange={setEnabled} />
                  Aktiv
                </label>
                <Button type="submit">Quelle hinzufügen</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Manuelle Meldung</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createManualItem} class="space-y-4">
                <label class="block text-sm">
                  <span class="mb-1 block">Quelle</span>
                  <select
                    required
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={manualSourceId()}
                    onChange={(e) => setManualSourceId(e.currentTarget.value)}
                  >
                    <option value="">Quelle auswählen…</option>
                    <For each={sources()?.sources ?? []}>
                      {(source) => <option value={source.id}>{source.name}</option>}
                    </For>
                  </select>
                </label>
                <TextField>
                  <TextFieldLabel>Titel</TextFieldLabel>
                  <TextFieldInput required value={manualTitle()} onInput={(e) => setManualTitle(e.currentTarget.value)} />
                </TextField>
                <TextField>
                  <TextFieldLabel>Artikel-URL</TextFieldLabel>
                  <TextFieldInput required type="url" value={manualUrl()} onInput={(e) => setManualUrl(e.currentTarget.value)} />
                </TextField>
                <TextField>
                  <TextFieldLabel>Veröffentlicht am (optional)</TextFieldLabel>
                  <TextFieldInput type="date" value={manualPublishedAt()} onInput={(e) => setManualPublishedAt(e.currentTarget.value)} />
                </TextField>
                <label class="block text-sm">
                  <span class="mb-1 block">Kurztext (optional)</span>
                  <textarea
                    class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    maxLength={500}
                    value={manualExcerpt()}
                    onInput={(e) => setManualExcerpt(e.currentTarget.value)}
                  />
                </label>
                <Button type="submit">Meldung hinzufügen</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Quellen</CardTitle></CardHeader>
            <CardContent class="space-y-3">
              <For each={sources()?.sources ?? []}>
                {(source) => (
                  <div class="rounded border border-border p-3">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-medium">{source.name}</p>
                        <p class="truncate text-xs text-muted-foreground">{source.feedUrl || 'Manuell (kein RSS-Feed)'}</p>
                        <p class="mt-1 text-xs text-muted-foreground">{source._count?.items ?? 0} Meldungen</p>
                      </div>
                      <Checkbox
                        checked={source.enabled}
                        onChange={async (checked) => {
                          await adminApi.updateNewsSource(token, source.id, { enabled: checked })
                          await refetchSources()
                        }}
                      />
                    </div>
                  </div>
                )}
              </For>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Review Queue</CardTitle></CardHeader>
          <CardContent class="space-y-3">
            <Show when={(items()?.items.length ?? 0) > 0} fallback={<p class="text-sm text-muted-foreground">Noch keine Meldungen importiert.</p>}>
              <For each={items()?.items ?? []}>
                {(item) => (
                  <article class="rounded border border-border p-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-xs font-medium uppercase text-primary">{item.source?.name ?? 'Quelle'} · {item.status}</p>
                        <h2 class="mt-1 font-semibold">{item.title}</h2>
                        <Show when={item.excerpt}>
                          <p class="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</p>
                        </Show>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" class="mt-2 inline-block text-sm text-primary hover:underline">
                          Quelle öffnen
                        </a>
                      </div>
                      <Show when={isAdminUser}>
                        <div class="flex shrink-0 gap-2">
                          <Button size="sm" variant={item.status === 'approved' ? 'default' : 'outline'} onClick={() => setStatus(item, 'approved')}>Freigeben</Button>
                          <Button size="sm" variant={item.status === 'hidden' ? 'default' : 'outline'} onClick={() => setStatus(item, 'hidden')}>Ausblenden</Button>
                          <Button size="sm" variant={item.status === 'draft' ? 'default' : 'outline'} onClick={() => setStatus(item, 'draft')}>Entwurf</Button>
                        </div>
                      </Show>
                    </div>
                  </article>
                )}
              </For>
            </Show>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
