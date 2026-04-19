import { createResource, createSignal, For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { api, Petition } from '@/lib/api.js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
      <section class="text-center py-12 pb-8">
        <h1 class="text-4xl font-extrabold mb-3">{t('app.make_your_voice_heard')}</h1>
        <p class="text-lg text-muted-foreground max-w-xl mx-auto mb-8">{t('app.browse_active_petitions_and_add_your_signature_to_causes_that_matter')}</p>
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

      <Show when={data.error}>
        <Alert variant="destructive">
          <AlertDescription>{t('app.failed_to_load_petitions_please_try_again')}</AlertDescription>
        </Alert>
      </Show>

      <Show when={data()}>
        {(result) => (
          <>
            <Show when={result().petitions.length === 0}>
              <Alert>
                <AlertDescription>
                  {query()
                    ? t('app.no_petitions_found_for_var', { query: query() })
                    : t('app.no_petitions_found_2')}
                </AlertDescription>
              </Alert>
            </Show>

            <div class="grid gap-5" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))">
              <For each={result().petitions}>
                {(petition) => (
                  <A href={`/petition/${petition.slug}`} class="no-underline text-inherit">
                    <Card class="h-full cursor-pointer transition-shadow hover:shadow-md">
                      <Show when={petition.thumbnailImageUrl || petition.imageUrl}>
                        <img
                          src={petition.thumbnailImageUrl ?? petition.imageUrl ?? undefined}
                          alt={petition.title}
                          class="h-40 w-full rounded-t-lg object-cover"
                        />
                      </Show>
                      <CardHeader class="pb-2">
                        <CardTitle class="text-base leading-snug">{petition.title}</CardTitle>
                        <p class="text-sm text-muted-foreground">
                          {t('app.to')}: <strong>{petition.recipientName}</strong>
                        </p>
                      </CardHeader>
                      <CardContent>
                        <Show when={petition.summary}>
                          <div class="text-sm line-clamp-3 mb-3 text-muted-foreground" innerHTML={petition.summary} />
                        </Show>
                        <Show when={petition.goalCount}>
                          <Progress
                            value={signaturePct(petition) ?? 0}
                            class="mb-2"
                          />
                        </Show>
                      </CardContent>
                      <CardFooter class="flex items-center gap-2 pt-0">
                        <StatusBadge status={petition.status as PetitionStatus} type="petition" />
                        <span class="text-xs text-muted-foreground ml-auto">
                          {petition.goalCount
                            ? `${petition.signatureCount} / ${petition.goalCount}`
                            : t('app.var_signatures', { count: petition.signatureCount })}
                        </span>
                      </CardFooter>
                    </Card>
                  </A>
                )}
              </For>
            </div>

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
