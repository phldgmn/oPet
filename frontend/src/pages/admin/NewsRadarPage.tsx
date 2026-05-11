import { createResource, createSignal, For, Show } from 'solid-js'
import { adminApi, NewsItem } from '@/lib/api'
import { getToken } from '@/stores/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field'

export default function NewsRadarPage() {
  const token = getToken() ?? ''
  const [name, setName] = createSignal('')
  const [feedUrl, setFeedUrl] = createSignal('')
  const [enabled, setEnabled] = createSignal(true)
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
      await adminApi.createNewsSource(token, { name: name().trim(), feedUrl: feedUrl().trim(), enabled: enabled() })
      setName('')
      setFeedUrl('')
      setEnabled(true)
      setMessage('Quelle gespeichert.')
      await refetchSources()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Quelle konnte nicht gespeichert werden.')
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
        <Button onClick={runImport} disabled={importing()}>
          {importing() ? 'Importiert…' : 'Import jetzt starten'}
        </Button>
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
                  <TextFieldInput required type="url" value={feedUrl()} onInput={(e) => setFeedUrl(e.currentTarget.value)} />
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
            <CardHeader><CardTitle>Quellen</CardTitle></CardHeader>
            <CardContent class="space-y-3">
              <For each={sources()?.sources ?? []}>
                {(source) => (
                  <div class="rounded border border-border p-3">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-medium">{source.name}</p>
                        <p class="truncate text-xs text-muted-foreground">{source.feedUrl}</p>
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
                      <div class="flex shrink-0 gap-2">
                        <Button size="sm" variant={item.status === 'approved' ? 'default' : 'outline'} onClick={() => setStatus(item, 'approved')}>Freigeben</Button>
                        <Button size="sm" variant={item.status === 'hidden' ? 'default' : 'outline'} onClick={() => setStatus(item, 'hidden')}>Ausblenden</Button>
                        <Button size="sm" variant={item.status === 'draft' ? 'default' : 'outline'} onClick={() => setStatus(item, 'draft')}>Entwurf</Button>
                      </div>
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
