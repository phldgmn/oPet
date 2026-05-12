import { createResource, createSignal, Show } from 'solid-js'
import { adminApi } from '@/lib/api'
import { getToken } from '@/stores/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TextField, TextFieldInput, TextFieldLabel, TextFieldTextArea } from '@/components/ui/text-field'

export default function SiteSettingsPage() {
  const token = getToken() ?? ''
  const [publicSiteTitle, setPublicSiteTitle] = createSignal('4|change')
  const [publicClaim, setPublicClaim] = createSignal('Gemeinsam Veränderung sichtbar machen')
  const [logoUrl, setLogoUrl] = createSignal('')
  const [defaultShareText, setDefaultShareText] = createSignal('Ich habe unterschrieben. Mach doch auch mit!')
  const [saving, setSaving] = createSignal(false)
  const [message, setMessage] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  const [settings] = createResource(
    () => token,
    async (authToken) => {
      const data = await adminApi.getSiteSettings(authToken)
      setPublicSiteTitle(data.publicSiteTitle)
      setPublicClaim(data.publicClaim)
      setLogoUrl(data.logoUrl ?? '')
      setDefaultShareText(data.defaultShareText)
      return data
    },
  )

  async function handleSubmit(e: Event) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await adminApi.updateSiteSettings(token, {
        publicSiteTitle: publicSiteTitle().trim(),
        publicClaim: publicClaim().trim(),
        logoUrl: logoUrl().trim() || null,
        defaultShareText: defaultShareText().trim(),
      })
      setMessage('Einstellungen gespeichert.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Einstellungen konnten nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="max-w-3xl">
      <h1 class="mb-6 text-2xl font-bold">Öffentlicher Auftritt</h1>
      <Show when={settings.loading}>
        <p class="text-sm text-muted-foreground">Einstellungen werden geladen…</p>
      </Show>
      <Show when={message()}>
        {(msg) => <Alert class="mb-4"><AlertDescription>{msg()}</AlertDescription></Alert>}
      </Show>
      <Show when={error()}>
        {(msg) => <Alert variant="destructive" class="mb-4"><AlertDescription>{msg()}</AlertDescription></Alert>}
      </Show>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} class="space-y-4">
            <TextField>
              <TextFieldLabel>Öffentlicher Name</TextFieldLabel>
              <TextFieldInput value={publicSiteTitle()} onInput={(e) => setPublicSiteTitle(e.currentTarget.value)} />
            </TextField>
            <TextField>
              <TextFieldLabel>Claim</TextFieldLabel>
              <TextFieldInput value={publicClaim()} onInput={(e) => setPublicClaim(e.currentTarget.value)} />
            </TextField>
            <TextField>
              <TextFieldLabel>Logo URL</TextFieldLabel>
              <TextFieldInput value={logoUrl()} onInput={(e) => setLogoUrl(e.currentTarget.value)} placeholder="/uploads/logo.png" />
            </TextField>
            <TextField>
              <TextFieldLabel>Standard-Teiltext</TextFieldLabel>
              <TextFieldTextArea rows={3} value={defaultShareText()} onInput={(e) => setDefaultShareText(e.currentTarget.value)} />
            </TextField>
            <Button type="submit" disabled={saving()}>
              {saving() ? 'Speichert…' : 'Speichern'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
