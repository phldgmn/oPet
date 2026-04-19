import { createResource, createSignal, For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { adminApi, AdminPetition } from '@/lib/api.js'
import { canWritePetitions, getToken, isAdmin } from '@/stores/auth.js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PaginationControls } from '@/components/PaginationControls'
import { StatusBadge, type PetitionStatus } from '@/components/StatusBadge'
import { t } from '@/lib/i18n'

type StatusOpt = { label: string; value: string }
const STATUS_OPTIONS: StatusOpt[] = [
  { value: '', label: 'app.filter_all_statuses' },
  { value: 'draft', label: 'app.status_draft' },
  { value: 'active', label: 'app.status_active' },
  { value: 'paused', label: 'app.status_paused' },
  { value: 'completed', label: 'app.status_completed' },
  { value: 'archived', label: 'app.status_archived' },
]

export default function PetitionsPage() {
  const token = getToken() ?? ''
  const [page, setPage] = createSignal(1)
  const [statusFilter, setStatusFilter] = createSignal('')
  const [archiveTarget, setArchiveTarget] = createSignal<AdminPetition | null>(null)
  const [archiveError, setArchiveError] = createSignal<string | null>(null)

  const [data, { refetch }] = createResource(
    () => ({ page: page(), status: statusFilter() }),
    (params) => adminApi.getPetitions(token, params),
  )

  async function handleArchive() {
    const p = archiveTarget()
    if (!p) return
    setArchiveError(null)
    try {
      await adminApi.archivePetition(token, p.id)
      refetch()
    } catch (e: unknown) {
      setArchiveError(e instanceof Error ? e.message : t('app.failed_to_archive_petition'))
    }
  }

  return (
    <div>
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold">{t('app.petitions')}</h1>
        <Show when={isAdmin()}>
          <Button as={A} href="/admin/petitions/new">+ {t('app.new_petition')}</Button>
        </Show>
      </div>

      <Show when={archiveError()}>
        <Alert variant="destructive" class="mb-4">
          <AlertDescription>{archiveError()}</AlertDescription>
        </Alert>
      </Show>

      <div class="flex gap-3 mb-5">
        <Select
          options={STATUS_OPTIONS}
          optionValue="value"
          optionTextValue="label"
          value={STATUS_OPTIONS.find(o => o.value === statusFilter()) ?? null}
          onChange={(opt) => { setStatusFilter(opt?.value ?? ''); setPage(1) }}
          itemComponent={(props) => (
            <SelectItem item={props.item}>{t(props.item.rawValue.label)}</SelectItem>
          )}
        >
          <SelectTrigger class="w-[180px]">
            <SelectValue<StatusOpt>>{(state) => t(state.selectedOption()?.label ?? 'app.filter_all_statuses')}</SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>
      </div>

      <Show when={data.loading}>
        <Skeleton class="h-64 w-full rounded-lg" animate />
      </Show>

      <Show when={data.error}>
        <Alert variant="destructive">
          <AlertDescription>{t('app.failed_to_load_petitions')}</AlertDescription>
        </Alert>
      </Show>

      <Show when={data()}>
        {(d) => (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('app.title')}</TableHead>
                  <TableHead>{t('app.status_2')}</TableHead>
                  <TableHead>{t('app.signatures')}</TableHead>
                  <TableHead>{t('app.created')}</TableHead>
                  <TableHead>{t('app.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show
                  when={d().petitions.length > 0}
                  fallback={
                    <TableRow>
                      <TableCell colspan={5} class="text-center text-muted-foreground py-8">
                        {t('app.no_petitions_found')}
                      </TableCell>
                    </TableRow>
                  }
                >
                  <For each={d().petitions}>
                    {(p: AdminPetition) => (
                      <TableRow>
                        <TableCell>
                          <div class="flex items-center gap-3">
                            <Show when={p.thumbnailImageUrl || p.imageUrl}>
                              <img
                                src={p.thumbnailImageUrl ?? p.imageUrl ?? undefined}
                                alt={p.title}
                                class="h-10 w-14 rounded border object-cover"
                              />
                            </Show>
                            <div>
                              <div class="font-semibold text-sm">{p.title}</div>
                              <div class="text-xs text-muted-foreground">/{p.slug}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status as PetitionStatus} type="petition" />
                        </TableCell>
                        <TableCell class="text-sm">
                          {(p.signatureCount ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell class="text-sm text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div class="flex gap-1.5">
                            <Show when={canWritePetitions()}>
                              <Button as={A} href={`/admin/petitions/${p.id}/edit`} variant="outline" size="sm">
                                {t('app.edit')}
                              </Button>
                              <Button as={A} href={`/admin/petitions/${p.id}/updates`} variant="outline" size="sm">
                                {t('app.updates')}
                              </Button>
                            </Show>
                            <Button as={A} href={`/admin/petitions/${p.id}/signatures`} variant="outline" size="sm">
                              {t('app.signatures')}
                            </Button>
                            <Show when={canWritePetitions() && p.status !== 'archived'}>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setArchiveTarget(p)}
                              >
                                {t('app.archive')}
                              </Button>
                            </Show>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </For>
                </Show>
              </TableBody>
            </Table>

            <PaginationControls
              page={page()}
              totalPages={d().totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </Show>

      <ConfirmDialog
        open={archiveTarget() !== null}
        onOpenChange={(open) => { if (!open) setArchiveTarget(null) }}
        title={t('app.archive_petition')}
        description={t('app.archive_var_it_will_no_longer_accept_signatures', { title: archiveTarget()?.title ?? '' })}
        confirmLabel={t('app.archive')}
        variant="destructive"
        onConfirm={handleArchive}
      />
    </div>
  )
}
