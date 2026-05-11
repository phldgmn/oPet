import { createResource, createSignal, For, Show } from 'solid-js'
import { useParams } from '@solidjs/router'
import { adminApi, Signature } from '@/lib/api.js'
import { canWritePetitions, getToken } from '@/stores/auth.js'
import { StatusBadge } from '@/components/StatusBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PaginationControls } from '@/components/PaginationControls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { t } from '@/lib/i18n'

const VERIFIED_OPTIONS = [
  { value: 'all', label: 'app.filter_all_verified_unverified' },
  { value: 'true', label: 'app.filter_verified_only' },
  { value: 'false', label: 'app.filter_unverified_only' },
]

const WITHDRAWN_OPTIONS = [
  { value: 'false', label: 'app.filter_active_only' },
  { value: 'true', label: 'app.filter_withdrawn_only' },
  { value: 'all', label: 'app.filter_all' },
]

type FilterOption = { value: string; label: string }

export default function SignaturesPage() {
  const token = getToken() ?? ''
  const params = useParams<{ id: string }>()

  const [page, setPage] = createSignal(1)
  const [verifiedFilter, setVerifiedFilter] = createSignal<FilterOption>(VERIFIED_OPTIONS[0])
  const [withdrawnFilter, setWithdrawnFilter] = createSignal<FilterOption>(WITHDRAWN_OPTIONS[0])
  const [removeTarget, setRemoveTarget] = createSignal<Signature | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [exporting, setExporting] = createSignal(false)

  const [data, { refetch }] = createResource(
    () => ({
      page: page(),
      verified: verifiedFilter().value !== 'all' ? verifiedFilter().value === 'true' : undefined,
      withdrawn: withdrawnFilter().value !== 'all' ? withdrawnFilter().value === 'true' : undefined,
    }),
    (filters) => adminApi.getSignatures(token, params.id, filters),
  )

  function deriveSigStatus(sig: Signature): 'withdrawn' | 'verified' | 'pending' {
    if (sig.withdrawn) return 'withdrawn'
    if (sig.verified) return 'verified'
    return 'pending'
  }

  async function handleQuickExport() {
    setError(null)
    setExporting(true)
    try {
      await adminApi.exportSignatures(token, 'csv', {
        petitionId: params.id,
        verified: verifiedFilter().value !== 'all' ? verifiedFilter().value === 'true' : undefined,
        withdrawn: withdrawnFilter().value !== 'all' ? withdrawnFilter().value === 'true' : undefined,
        country: undefined,
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('app.export_failed'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <h1 class="page-title">{t('app.signatures')}</h1>

      {/* Filters */}
      <div class="flex flex-wrap gap-3 mb-5 items-center">
        <Select<FilterOption>
          options={VERIFIED_OPTIONS}
          optionValue="value"
          optionTextValue="label"
          value={verifiedFilter()}
          onChange={(opt) => { if (opt) { setVerifiedFilter(opt); setPage(1) } }}
          itemComponent={(p) => <SelectItem item={p.item}>{t(p.item.rawValue.label)}</SelectItem>}
        >
          <SelectTrigger class="w-[250px]">
            <SelectValue<FilterOption>>{(s) => t(s.selectedOption()?.label ?? 'app.filter_all_verified_unverified')}</SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>

        <Select<FilterOption>
          options={WITHDRAWN_OPTIONS}
          optionValue="value"
          optionTextValue="label"
          value={withdrawnFilter()}
          onChange={(opt) => { if (opt) { setWithdrawnFilter(opt); setPage(1) } }}
          itemComponent={(p) => <SelectItem item={p.item}>{t(p.item.rawValue.label)}</SelectItem>}
        >
          <SelectTrigger class="w-[180px]">
            <SelectValue<FilterOption>>{(s) => t(s.selectedOption()?.label ?? 'app.filter_active_only')}</SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>

        <Button
          variant="outline"
          onClick={handleQuickExport}
          disabled={exporting()}
        >
          {exporting() ? t('app.exporting') : t('app.export_csv')}
        </Button>
      </div>

      <Show when={data.loading}>
        <div class="space-y-2 mb-4">
          <Skeleton class="h-8 w-full rounded" animate />
          <Skeleton class="h-8 w-full rounded" animate />
          <Skeleton class="h-8 w-full rounded" animate />
        </div>
      </Show>

      <Show when={data.error}>
        <Alert variant="destructive">
          <AlertDescription>{t('app.failed_to_load_signatures')}</AlertDescription>
        </Alert>
      </Show>

      <Show when={error()}>
        {(msg) => (
          <Alert variant="destructive" class="mb-4">
            <AlertDescription>{msg()}</AlertDescription>
          </Alert>
        )}
      </Show>

      <Show when={data()}>
        {(d) => (
          <>
            <p class="text-sm text-muted-foreground mb-3">
              {t('app.var_signature_s_found', { count: d().total.toLocaleString() })}
            </p>

            <Card class="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('app.name')}</TableHead>
                    <TableHead>{t('app.email')}</TableHead>
                    <TableHead>{t('app.location')}</TableHead>
                    <TableHead>{t('app.status_2')}</TableHead>
                    <TableHead>{t('app.date')}</TableHead>
                    <TableHead>{t('app.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Show
                    when={d().signatures.length > 0}
                    fallback={
                      <TableRow>
                        <TableCell colspan={6} class="text-center text-muted-foreground">
                          {t('app.no_signatures_found')}
                        </TableCell>
                      </TableRow>
                    }
                  >
                    <For each={d().signatures}>
                      {(sig) => (
                        <TableRow>
                          <TableCell class="font-medium">{sig.fullName}</TableCell>
                          <TableCell class="text-sm">{sig.email}</TableCell>
                          <TableCell class="text-sm text-muted-foreground">
                            {[sig.city, sig.country].filter(Boolean).join(', ') || t('app.text')}
                          </TableCell>
                          <TableCell>
                            <div class="flex flex-wrap items-center gap-2">
                              <StatusBadge status={deriveSigStatus(sig)} type="signature" />
                              <Show when={(sig.riskSignals?.length ?? 0) > 0}>
                                <span class="rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground" title={sig.riskSignals?.map((risk) => risk.reason).join(', ')}>
                                  Risiko {sig.riskSignals?.length}
                                </span>
                              </Show>
                            </div>
                          </TableCell>
                          <TableCell class="text-sm text-muted-foreground">
                            {new Date(sig.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Show when={canWritePetitions() && !sig.withdrawn}>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setRemoveTarget(sig)}
                              >
                                {t('app.remove')}
                              </Button>
                            </Show>
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </TableBody>
              </Table>
            </Card>

            <PaginationControls
              page={page()}
              totalPages={d().totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </Show>

      <ConfirmDialog
        open={removeTarget() !== null}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null) }}
        title={t('app.remove_signature')}
        description={t('app.remove_signature_from_var', { name: removeTarget()?.fullName ?? '' })}
        confirmLabel={t('app.remove')}
        variant="destructive"
        onConfirm={async () => {
          const sig = removeTarget()
          if (!sig) return
          try {
            await adminApi.removeSignature(token, sig.id)
            refetch()
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : t('app.failed_to_remove_signature'))
          }
        }}
      />
    </div>
  )
}
