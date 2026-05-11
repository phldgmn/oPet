import { createResource, createSignal, For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { api, Petition } from '@/lib/api.js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { TextField, TextFieldInput } from '@/components/ui/text-field'
import { StatusBadge, type PetitionStatus } from '@/components/StatusBadge'
import { PaginationControls } from '@/components/PaginationControls'
import { t } from '@/lib/i18n'

export default function Home() {
  const [search, setSearch] = createSignal('')
  const [query, setQuery] = createSignal('')
  const [page, setPage] = createSignal(1)

  const [data] = createResource(
    () => ({ search: query(), page: page() }),
    (params) => api.getPetitions(params),
  )

  function handleSearch(e: Event) {
    e.preventDefault()
    setQuery(search())
    setPage(1)
  }

  function signaturePct(p: Petition) {
    return p.goalCount ? Math.min(100, Math.round((p.signatureCount / p.goalCount) * 100)) : null
  }

  return (
    <div>
      <section class="py-12">
        <p class="text-sm font-medium uppercase tracking-wide text-primary">oPet</p>
        <h1 class="mt-2 text-4xl font-bold tracking-tight">
          Aktuelle Kampagnen
        </h1>
        <p class="mt-4 max-w-2xl text-muted-foreground">
          Unterstütze aktive Petitionen, verfolge ihren Fortschritt und teile Anliegen, die mehr Stimmen brauchen.
        </p>
      </section>

      <section class="pb-8">
        <form onSubmit={handleSearch} class="max-w-lg mx-auto flex gap-2">
          <TextField class="flex-1">
            <TextFieldInput
              type="search"
              placeholder={t('app.search_petitions')}
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
          </TextField>
          <Button type="submit">{t('app.search_2')}</Button>
        </form>
      </section>

      {/* Loading state */}
      <Show when={data.loading}>
        <div class="grid gap-5" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))">
          <For each={[1, 2, 3]}>{() => (
            <Card>
              <CardHeader>
                <Skeleton class="h-5 w-3/4 rounded" animate />
              </CardHeader>
              <CardContent class="space-y-2">
                <Skeleton class="h-4 w-full rounded" animate />
                <Skeleton class="h-4 w-5/6 rounded" animate />
              </CardContent>
            </Card>
          )}</For>
        </div>
      </Show>

      {/* Error state */}
      <Show when={data.error}>
        <Alert variant="destructive">
          <AlertDescription>{t('app.failed_to_load_petitions_please_try_again')}</AlertDescription>
        </Alert>
      </Show>

      {/* Success state */}
      <Show when={data()}>
        {(result) => (
          <>
            {/* Empty state */}
            <Show when={result().petitions.length === 0}>
              <Alert>
                <AlertDescription>
                  {query()
                    ? t('app.no_petitions_found_for_var', { query: query() })
                    : t('app.no_petitions_found_2')}
                </AlertDescription>
              </Alert>
            </Show>

            {/* Petition cards grid */}
            <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <For each={result().petitions}>
                {(petition) => (
                  <a
                    href={`/petition/${petition.slug}`}
                    class="rounded-xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <h2 class="text-xl font-semibold text-card-foreground">
                      {petition.title}
                    </h2>
                    <div class="mt-2 line-clamp-3 text-sm text-muted-foreground" innerHTML={petition.summary} />
                    <div class="mt-4">
                      <div class="mb-2 flex items-center justify-between text-sm">
                        <span class="font-medium">{petition.signatureCount.toLocaleString()} Unterschriften</span>
                        <Show when={petition.goalCount}>
                          {(goal) => <span class="text-muted-foreground">Ziel: {goal().toLocaleString()}</span>}
                        </Show>
                      </div>
                      <Show when={signaturePct(petition) !== null}>
                        <Progress value={signaturePct(petition) ?? 0} />
                      </Show>
                    </div>
                    <div class="mt-4 text-sm font-medium text-primary">
                      Jetzt unterschreiben →
                    </div>
                  </a>
                )}
              </For>
            </div>

            {/* Pagination controls */}
            <PaginationControls
              page={page()}
              totalPages={result().totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </Show>
    </div>
  )
}
