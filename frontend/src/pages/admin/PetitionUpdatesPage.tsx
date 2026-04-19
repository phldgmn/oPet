import { createMemo, createResource, createSignal, Show } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import QuillEditor from '@/components/QuillEditor.js'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { adminApi } from '@/lib/api.js'
import { getToken } from '@/stores/auth.js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field'
import { t } from '@/lib/i18n'

export default function PetitionUpdatesPage() {
  const token = getToken() ?? ''
  const params = useParams<{ id: string }>()

  const [message, setMessage] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [saving, setSaving] = createSignal(false)
  const [imageUploading, setImageUploading] = createSignal(false)
  const [publishInFlight, setPublishInFlight] = createSignal(false)
  const [deleteTargetId, setDeleteTargetId] = createSignal<string | null>(null)

  const [petition] = createResource(() => params.id, (id) => adminApi.getPetition(token, id))
  const [updates, { refetch }] = createResource(() => params.id, (id) => adminApi.getPetitionUpdates(token, id))

  const [selectedUpdateId, setSelectedUpdateId] = createSignal<string | null>(null)
  const [title, setTitle] = createSignal('')
  const [content, setContent] = createSignal('')
  const [imageUrl, setImageUrl] = createSignal('')
  const [thumbnailImageUrl, setThumbnailImageUrl] = createSignal('')

  const selectedUpdate = createMemo(() =>
    updates()?.updates.find((item) => item.id === selectedUpdateId()) ?? null,
  )

  function selectUpdate(id: string) {
    const item = updates()?.updates.find((it) => it.id === id)
    if (!item) return
    setSelectedUpdateId(item.id)
    setTitle(item.currentTitle)
    setContent(item.currentContent)
    setImageUrl(item.currentImageUrl ?? '')
    setThumbnailImageUrl(item.currentThumbnailImageUrl ?? '')
    setError(null)
    setMessage(null)
  }

  async function reloadAndKeepSelection() {
    const previousSelection = selectedUpdateId()
    await refetch()

    const data = updates()?.updates ?? []
    if (!data.length) {
      setSelectedUpdateId(null)
      return
    }

    const existingSelection = previousSelection
      ? data.find((item) => item.id === previousSelection)
      : null

    const next = existingSelection ?? data[0]
    setSelectedUpdateId(next.id)
    setTitle(next.currentTitle)
    setContent(next.currentContent)
    setImageUrl(next.currentImageUrl ?? '')
    setThumbnailImageUrl(next.currentThumbnailImageUrl ?? '')
  }

  async function uploadImage(field: 'imageUrl' | 'thumbnailImageUrl', file?: File) {
    if (!file || imageUploading()) return
    setError(null)
    setImageUploading(true)
    try {
      const uploaded = await adminApi.uploadImage(token, file)
      if (field === 'imageUrl') setImageUrl(uploaded.url)
      else setThumbnailImageUrl(uploaded.url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload image')
    } finally {
      setImageUploading(false)
    }
  }

  async function handleCreateOrSave() {
    setError(null)
    setMessage(null)
    setSaving(true)
    try {
      if (!title().trim() || !content().trim()) {
        throw new Error(t('app.title_and_content_are_required'))
      }

      if (!selectedUpdateId()) {
        const created = await adminApi.createPetitionUpdate(token, params.id, {
          title: title().trim(),
          content: content().trim(),
          imageUrl: imageUrl().trim() || null,
          thumbnailImageUrl: thumbnailImageUrl().trim() || null,
        })
        setSelectedUpdateId(created.id)
        setMessage(t('app.draft_update_created'))
      } else {
        await adminApi.updatePetitionUpdate(token, params.id, selectedUpdateId()!, {
          title: title().trim(),
          content: content().trim(),
          imageUrl: imageUrl().trim() || null,
          thumbnailImageUrl: thumbnailImageUrl().trim() || null,
        })
        setMessage(t('app.draft_update_saved'))
      }
      await reloadAndKeepSelection()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('app.failed_to_save_update'))
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    setError(null)
    setMessage(null)
    setPublishInFlight(true)
    try {
      if (!title().trim() || !content().trim()) {
        throw new Error(t('app.title_and_content_are_required'))
      }

      let currentId = selectedUpdateId()
      if (!currentId) {
        const created = await adminApi.createPetitionUpdate(token, params.id, {
          title: title().trim(),
          content: content().trim(),
          imageUrl: imageUrl().trim() || null,
          thumbnailImageUrl: thumbnailImageUrl().trim() || null,
        })
        currentId = created.id
        setSelectedUpdateId(created.id)
      }

      await adminApi.publishPetitionUpdate(token, params.id, currentId, {
        title: title().trim(),
        content: content().trim(),
        imageUrl: imageUrl().trim() || null,
        thumbnailImageUrl: thumbnailImageUrl().trim() || null,
      })
      setMessage(t('app.update_published_as_a_new_immutable_version'))
      await reloadAndKeepSelection()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('app.failed_to_publish_update'))
    } finally {
      setPublishInFlight(false)
    }
  }

  async function handleDelete() {
    const id = deleteTargetId()
    if (!id) return

    setError(null)
    setMessage(null)
    try {
      await adminApi.deletePetitionUpdate(token, params.id, id)
      setMessage(t('app.update_deleted_timeline_placeholder_remains_publicly_visible'))
      setDeleteTargetId(null)
      await reloadAndKeepSelection()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('app.failed_to_delete_update'))
    }
  }

  return (
    <div class="space-y-5">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h1 class="text-2xl font-bold">{t('app.petition_updates')}</h1>
          <Show when={petition()}>
            {(p) => (
              <p class="text-sm text-muted-foreground mt-1">
                {p().title}
              </p>
            )}
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" as={A} href={`/admin/petitions/${params.id}/edit`}>
            {t('app.back_to_petition')}
          </Button>
          <Show when={petition()}>
            {(p) => (
              <Button variant="outline" as="a" href={`/petition/${p().slug}`} target="_blank">
                {t('app.open_public_page')} ↗
              </Button>
            )}
          </Show>
        </div>
      </div>

      <Show when={updates.loading || petition.loading}>
        <Skeleton class="h-64 w-full rounded-lg" animate />
      </Show>

      <Show when={error()}>
        <Alert variant="destructive">
          <AlertDescription>{error()}</AlertDescription>
        </Alert>
      </Show>

      <Show when={message()}>
        <Alert>
          <AlertDescription>{message()}</AlertDescription>
        </Alert>
      </Show>

      <div class="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">{t('app.existing_updates')}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2">
            <Button
              variant="outline"
              class="w-full justify-start"
              onClick={() => {
                setSelectedUpdateId(null)
                setTitle('')
                setContent('')
                setImageUrl('')
                setThumbnailImageUrl('')
                setError(null)
                setMessage(null)
              }}
            >
              + {t('app.new_draft_update')}
            </Button>

            <Show
              when={(updates()?.updates.length ?? 0) > 0}
              fallback={<p class="text-sm text-muted-foreground">{t('app.no_updates_yet')}</p>}
            >
              {updates()?.updates.map((update) => {
                const active = selectedUpdateId() === update.id
                const lastVersion = update.versions[0]
                return (
                  <button
                    type="button"
                    class={`w-full rounded border px-3 py-2 text-left text-sm transition-colors ${active ? 'border-foreground/50 bg-muted' : 'hover:bg-muted/40'}`}
                    onClick={() => selectUpdate(update.id)}
                  >
                    <div class="font-medium line-clamp-2">{update.currentTitle}</div>
                    <Show when={update.currentThumbnailImageUrl}>
                      <img
                        src={update.currentThumbnailImageUrl ?? undefined}
                        alt="Update thumbnail"
                        class="mt-2 h-14 w-full rounded border object-cover"
                      />
                    </Show>
                    <div class="text-xs text-muted-foreground mt-1">
                      {update.deletedAt ? t('app.deleted') : t('app.var_published_version_s', { count: update.versions.length })}
                    </div>
                    <Show when={lastVersion}>
                      <div class="text-xs text-muted-foreground mt-0.5">
                        {t('app.latest')}: v{lastVersion?.versionNumber} {t('app.on')} {new Date(lastVersion!.publishedAt).toLocaleString()}
                      </div>
                    </Show>
                  </button>
                )
              })}
            </Show>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="text-base">
              <Show when={selectedUpdate()} fallback={t('app.new_draft_update')}>
                {(item) => `${t('app.editing')}: ${item().currentTitle}`}
              </Show>
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <TextField>
              <TextFieldLabel>{t('app.title_2')}</TextFieldLabel>
              <TextFieldInput
                type="text"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                required
              />
            </TextField>

            <div class="space-y-1">
              <label class="text-sm font-medium">{t('app.content')}</label>
              <QuillEditor
                id="petition-update-editor"
                value={content()}
                onValueChange={setContent}
                placeholder={t('app.write_your_petition_update_here')}
                minHeight="14rem"
              />
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField>
                <TextFieldLabel>Update Image URL</TextFieldLabel>
                <TextFieldInput
                  type="url"
                  value={imageUrl()}
                  onInput={(e) => setImageUrl(e.currentTarget.value)}
                  placeholder="https://example.com/update.jpg"
                />
              </TextField>
              <TextField>
                <TextFieldLabel>Update Thumbnail URL</TextFieldLabel>
                <TextFieldInput
                  type="url"
                  value={thumbnailImageUrl()}
                  onInput={(e) => setThumbnailImageUrl(e.currentTarget.value)}
                  placeholder="https://example.com/update-thumb.jpg"
                />
              </TextField>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField>
                <TextFieldLabel>Upload Update Image</TextFieldLabel>
                <TextFieldInput
                  type="file"
                  accept="image/*"
                  disabled={imageUploading()}
                  onChange={(e) => uploadImage('imageUrl', e.currentTarget.files?.[0])}
                />
              </TextField>
              <TextField>
                <TextFieldLabel>Upload Update Thumbnail</TextFieldLabel>
                <TextFieldInput
                  type="file"
                  accept="image/*"
                  disabled={imageUploading()}
                  onChange={(e) => uploadImage('thumbnailImageUrl', e.currentTarget.files?.[0])}
                />
              </TextField>
            </div>

            <Show when={imageUrl() || thumbnailImageUrl()}>
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Show when={imageUrl()}>
                  <div>
                    <p class="mb-1 text-xs font-medium text-muted-foreground">Image preview</p>
                    <img src={imageUrl()} alt="Update image preview" class="h-40 w-full rounded border object-cover" />
                  </div>
                </Show>
                <Show when={thumbnailImageUrl()}>
                  <div>
                    <p class="mb-1 text-xs font-medium text-muted-foreground">Thumbnail preview</p>
                    <img src={thumbnailImageUrl()} alt="Update thumbnail preview" class="h-24 w-40 rounded border object-cover" />
                  </div>
                </Show>
              </div>
            </Show>

            <div class="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleCreateOrSave}
                disabled={saving() || (!!selectedUpdateId() && !!selectedUpdate()?.deletedAt)}
              >
                {saving() ? t('app.saving') : selectedUpdateId() ? t('app.save_draft') : t('app.create_draft')}
              </Button>
              <Button
                variant="secondary"
                onClick={handlePublish}
                disabled={publishInFlight() || !!selectedUpdate()?.deletedAt}
              >
                {publishInFlight() ? t('app.publishing') : selectedUpdateId() ? t('app.publish_new_version') : t('app.publish_now')}
              </Button>
              <Button
                variant="destructive"
                disabled={!selectedUpdateId() || !!selectedUpdate()?.deletedAt}
                onClick={() => setDeleteTargetId(selectedUpdateId())}
              >
                {t('app.delete_update')}
              </Button>
            </div>

            <Show when={selectedUpdate()}>
              {(item) => (
                <div class="space-y-2 border-t pt-4">
                  <h2 class="text-sm font-semibold">{t('app.published_versions')}</h2>
                  <Show
                    when={item().versions.length > 0}
                    fallback={<p class="text-sm text-muted-foreground">{t('app.no_published_versions_yet')}</p>}
                  >
                    <div class="space-y-3">
                      {item().versions.map((version) => (
                        <Card>
                          <CardHeader class="pb-2">
                            <CardTitle class="text-sm">
                              v{version.versionNumber}: {version.title}
                            </CardTitle>
                            <p class="text-xs text-muted-foreground">
                              {t('app.published')} {new Date(version.publishedAt).toLocaleString()}
                              {version.publisher ? ` ${t('app.by')} ${version.publisher.email}` : ''}
                            </p>
                          </CardHeader>
                          <CardContent>
                            <Show when={version.imageUrl}>
                              <img
                                src={version.imageUrl ?? undefined}
                                alt={version.title}
                                class="mb-3 h-44 w-full rounded border object-cover"
                              />
                            </Show>
                            <div class="petition-body text-sm" innerHTML={version.content} />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </Show>
                </div>
              )}
            </Show>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteTargetId() !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null)
        }}
        title={t('app.delete_update')}
        description={t('app.delete_this_update_from_the_visible_timeline_a_placeholder_stays_and_p')}
        confirmLabel={t('app.delete')}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
