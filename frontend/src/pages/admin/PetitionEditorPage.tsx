import { createResource, createSignal, Show } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import { adminApi } from '@/lib/api.js'
import { canWritePetitions, getToken, isAdmin } from '@/stores/auth.js'
import QuillEditor from '@/components/QuillEditor.js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TextField, TextFieldDescription, TextFieldInput, TextFieldLabel,
} from '@/components/ui/text-field'
import { t } from '@/lib/i18n'

interface PetitionFormData {
  slug: string
  title: string
  summary: string
  body: string
  imageUrl: string
  thumbnailImageUrl: string
  recipientName: string
  recipientDescription: string
  status: string
  goalCount: string
  allowPublicNames: boolean
  allowComments: boolean
  requireVerification: boolean
  startsAt: string
  endsAt: string
}

const emptyForm = (): PetitionFormData => ({
  slug: '',
  title: '',
  summary: '',
  body: '',
  imageUrl: '',
  thumbnailImageUrl: '',
  recipientName: '',
  recipientDescription: '',
  status: 'draft',
  goalCount: '',
  allowPublicNames: false,
  allowComments: false,
  requireVerification: true,
  startsAt: '',
  endsAt: '',
})

type StatusOpt = { label: string; value: string }
const STATUS_OPTIONS: StatusOpt[] = [
  { value: 'draft', label: 'app.status_draft' },
  { value: 'active', label: 'app.status_active' },
  { value: 'paused', label: 'app.status_paused' },
  { value: 'completed', label: 'app.status_completed' },
  { value: 'archived', label: 'app.status_archived' },
]

export default function PetitionEditorPage() {
  const token = getToken() ?? ''
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const isEdit = !!params.id

  const [form, setForm] = createSignal<PetitionFormData>(emptyForm())
  const [saving, setSaving] = createSignal(false)
  const [imageUploading, setImageUploading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [success, setSuccess] = createSignal<string | null>(null)

  if (!canWritePetitions()) {
    return (
      <Alert variant="destructive" class="mb-4">
        <AlertDescription>{t('app.you_do_not_have_permission_to_edit_petitions')}</AlertDescription>
      </Alert>
    )
  }

  if (!isEdit && !isAdmin()) {
    return (
      <Alert variant="destructive" class="mb-4">
        <AlertDescription>{t('app.only_admins_can_create_petitions')}</AlertDescription>
      </Alert>
    )
  }

  const [existing] = createResource(
    () => (isEdit ? params.id : undefined),
    async (id) => {
      const p = await adminApi.getPetition(token, id!)
      setForm({
        slug: p.slug,
        title: p.title,
        summary: p.summary,
        body: p.body,
        imageUrl: p.imageUrl ?? '',
        thumbnailImageUrl: p.thumbnailImageUrl ?? '',
        recipientName: p.recipientName,
        recipientDescription: p.recipientDescription ?? '',
        status: p.status,
        goalCount: p.goalCount ? String(p.goalCount) : '',
        allowPublicNames: p.allowPublicNames,
        allowComments: p.allowComments,
        requireVerification: p.requireVerification,
        startsAt: p.startsAt ? new Date(p.startsAt).toISOString().slice(0, 16) : '',
        endsAt: p.endsAt ? new Date(p.endsAt).toISOString().slice(0, 16) : '',
      })
      return p
    },
  )

  function update<K extends keyof PetitionFormData>(key: K, value: PetitionFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function autoSlug(title: string) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)
  }

  async function uploadImage(
    field: 'imageUrl' | 'thumbnailImageUrl',
    file?: File,
  ) {
    if (!file || imageUploading()) return
    setError(null)
    setImageUploading(true)
    try {
      const uploaded = await adminApi.uploadImage(token, file)
      update(field, uploaded.url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload image')
    } finally {
      setImageUploading(false)
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (saving()) return
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const f = form()
      const normalizedImageUrl = f.imageUrl.trim()
      const normalizedThumbnailImageUrl = f.thumbnailImageUrl.trim()
      const payload = {
        slug: f.slug,
        title: f.title,
        summary: f.summary,
        body: f.body,
        imageUrl: normalizedImageUrl ? normalizedImageUrl : null,
        thumbnailImageUrl: normalizedThumbnailImageUrl ? normalizedThumbnailImageUrl : null,
        recipientName: f.recipientName,
        recipientDescription: f.recipientDescription || undefined,
        status: f.status,
        goalCount: f.goalCount ? parseInt(f.goalCount) : undefined,
        allowPublicNames: f.allowPublicNames,
        allowComments: f.allowComments,
        requireVerification: f.requireVerification,
        startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : undefined,
        endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : undefined,
      }
      if (isEdit) {
        await adminApi.updatePetition(token, params.id!, payload)
        setSuccess(t('app.petition_updated_successfully'))
      } else {
        const created = await adminApi.createPetition(token, payload)
        navigate(`/admin/petitions/${created.id}/edit`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('app.failed_to_save_petition'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="max-w-3xl">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold">{isEdit ? t('app.edit_petition') : t('app.new_petition')}</h1>
        <div class="flex items-center gap-2">
          <Show when={isEdit && params.id}>
            <Button variant="outline" size="sm" as="a" href={`/admin/petitions/${params.id}/updates`}>
              {t('app.manage_updates')}
            </Button>
          </Show>
          <Show when={isEdit && existing()}>
            <Button variant="outline" size="sm" as="a" href={`/petition/${existing()?.slug}`} target="_blank">
              {t('app.view_public_page')} ↗
            </Button>
          </Show>
        </div>
      </div>

      <Show when={existing.loading}>
        <Skeleton class="h-64 w-full rounded-lg mb-4" animate />
      </Show>

      <Show when={error()}>
        <Alert variant="destructive" class="mb-4">
          <AlertDescription>{error()}</AlertDescription>
        </Alert>
      </Show>
      <Show when={success()}>
        <Alert class="mb-4">
          <AlertDescription>{success()}</AlertDescription>
        </Alert>
      </Show>

      <form onSubmit={handleSubmit} class="space-y-4">
        <Card>
          <CardHeader><CardTitle>{t('app.basic_information')}</CardTitle></CardHeader>
          <CardContent class="space-y-4">
            <TextField>
              <TextFieldLabel>{t('app.title_2')}</TextFieldLabel>
              <TextFieldInput
                type="text"
                required
                value={form().title}
                onInput={(e) => {
                  update('title', e.currentTarget.value)
                  if (!isEdit) update('slug', autoSlug(e.currentTarget.value))
                }}
              />
            </TextField>

            <TextField>
              <TextFieldLabel>{t('app.slug')}</TextFieldLabel>
              <TextFieldInput
                type="text"
                required
                pattern="[a-z0-9-]+"
                value={form().slug}
                onInput={(e) => update('slug', e.currentTarget.value)}
              />
              <TextFieldDescription>{t('app.url')}: /petition/{form().slug || '…'}</TextFieldDescription>
            </TextField>

            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium">{t('app.summary_shown_in_listing')}</label>
              <QuillEditor
                id="summary"
                value={form().summary}
                onValueChange={(val) => update('summary', val)}
                placeholder={t('app.short_summary_shown_in_the_petition_listing')}
                minHeight="5rem"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium">{t('app.body_full_petition_text')}</label>
              <QuillEditor
                id="body"
                value={form().body}
                onValueChange={(val) => update('body', val)}
                placeholder={t('app.full_petition_text')}
                minHeight="14rem"
              />
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField>
                <TextFieldLabel>Hero Image URL</TextFieldLabel>
                <TextFieldInput
                  type="url"
                  value={form().imageUrl}
                  onInput={(e) => update('imageUrl', e.currentTarget.value)}
                  placeholder="https://example.com/hero.jpg"
                />
              </TextField>
              <TextField>
                <TextFieldLabel>Thumbnail URL</TextFieldLabel>
                <TextFieldInput
                  type="url"
                  value={form().thumbnailImageUrl}
                  onInput={(e) => update('thumbnailImageUrl', e.currentTarget.value)}
                  placeholder="https://example.com/thumb.jpg"
                />
              </TextField>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField>
                <TextFieldLabel>Upload Hero Image</TextFieldLabel>
                <TextFieldInput
                  type="file"
                  accept="image/*"
                  disabled={imageUploading()}
                  onChange={(e) => uploadImage('imageUrl', e.currentTarget.files?.[0])}
                />
              </TextField>
              <TextField>
                <TextFieldLabel>Upload Thumbnail</TextFieldLabel>
                <TextFieldInput
                  type="file"
                  accept="image/*"
                  disabled={imageUploading()}
                  onChange={(e) => uploadImage('thumbnailImageUrl', e.currentTarget.files?.[0])}
                />
              </TextField>
            </div>

            <Show when={form().imageUrl || form().thumbnailImageUrl}>
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Show when={form().imageUrl}>
                  <div>
                    <p class="mb-1 text-xs font-medium text-muted-foreground">Hero preview</p>
                    <img src={form().imageUrl} alt="Hero preview" class="h-40 w-full rounded border object-cover" />
                  </div>
                </Show>
                <Show when={form().thumbnailImageUrl}>
                  <div>
                    <p class="mb-1 text-xs font-medium text-muted-foreground">Thumbnail preview</p>
                    <img
                      src={form().thumbnailImageUrl}
                      alt="Thumbnail preview"
                      class="h-24 w-40 rounded border object-cover"
                    />
                  </div>
                </Show>
              </div>
            </Show>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('app.recipient')}</CardTitle></CardHeader>
          <CardContent class="space-y-4">
            <TextField>
              <TextFieldLabel>{t('app.recipient_name')}</TextFieldLabel>
              <TextFieldInput
                type="text"
                required
                value={form().recipientName}
                onInput={(e) => update('recipientName', e.currentTarget.value)}
              />
            </TextField>

            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium">{t('app.recipient_description')}</label>
              <QuillEditor
                id="recipientDescription"
                value={form().recipientDescription}
                onValueChange={(val) => update('recipientDescription', val)}
                placeholder={t('app.brief_description_of_the_petition_recipient')}
                minHeight="5rem"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('app.settings')}</CardTitle></CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('app.status_2')}</label>
                <Select
                  options={STATUS_OPTIONS}
                  optionValue="value"
                  optionTextValue="label"
                  value={STATUS_OPTIONS.find(o => o.value === form().status) ?? null}
                  onChange={(opt) => update('status', opt?.value ?? 'draft')}
                  itemComponent={(props) => (
                    <SelectItem item={props.item}>{t(props.item.rawValue.label)}</SelectItem>
                  )}
                >
                  <SelectTrigger>
                    <SelectValue<StatusOpt>>{(state) => t(state.selectedOption()?.label ?? 'app.status_draft')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <TextField>
                <TextFieldLabel>{t('app.signature_goal')}</TextFieldLabel>
                <TextFieldInput
                  type="number"
                  min="1"
                  value={form().goalCount}
                  onInput={(e) => update('goalCount', e.currentTarget.value)}
                />
              </TextField>

              <TextField>
                <TextFieldLabel>{t('app.starts_at')}</TextFieldLabel>
                <TextFieldInput
                  type="datetime-local"
                  value={form().startsAt}
                  onInput={(e) => update('startsAt', e.currentTarget.value)}
                />
              </TextField>

              <TextField>
                <TextFieldLabel>{t('app.ends_at')}</TextFieldLabel>
                <TextFieldInput
                  type="datetime-local"
                  value={form().endsAt}
                  onInput={(e) => update('endsAt', e.currentTarget.value)}
                />
              </TextField>
            </div>

            <div class="flex flex-col gap-3 pt-1">
              <label class="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={form().requireVerification}
                  onChange={(checked) => update('requireVerification', checked)}
                />
                {t('app.require_email_verification')}
              </label>
              <label class="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={form().allowPublicNames}
                  onChange={(checked) => update('allowPublicNames', checked)}
                />
                {t('app.allow_public_names')}
              </label>
              <label class="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={form().allowComments}
                  onChange={(checked) => update('allowComments', checked)}
                />
                {t('app.allow_comments')}
              </label>
            </div>
          </CardContent>
        </Card>

        <div class="flex gap-3 pb-8">
          <Button type="submit" disabled={saving()}>
            {saving() ? t('app.saving') : isEdit ? t('app.save_changes') : t('app.create_petition')}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/admin/petitions')}>
            {t('app.cancel')}
          </Button>
        </div>
      </form>
    </div>
  )
}
