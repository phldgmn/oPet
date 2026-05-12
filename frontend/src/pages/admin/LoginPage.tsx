import { createSignal, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { adminApi } from '@/lib/api.js'
import { login } from '@/stores/auth.js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field'
import { t } from '@/lib/i18n'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  async function handleSubmit(e: Event) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await adminApi.login(email(), password())
      login(res.token, res.user)
      navigate('/admin/dashboard', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('app.login_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-background">
      <Card class="w-full max-w-sm">
        <CardHeader class="text-center">
          <CardTitle class="text-2xl">✊ 4|change {t('app.admin')}</CardTitle>
          <CardDescription>{t('app.sign_in_to_manage_petitions')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Show when={error()}>
            <Alert variant="destructive" class="mb-4">
              <AlertDescription>{error()}</AlertDescription>
            </Alert>
          </Show>

          <form onSubmit={handleSubmit} class="space-y-4">
            <TextField>
              <TextFieldLabel>{t('app.email')}</TextFieldLabel>
              <TextFieldInput
                type="email"
                required
                autocomplete="email"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
              />
            </TextField>
            <TextField>
              <TextFieldLabel>{t('app.password')}</TextFieldLabel>
              <TextFieldInput
                type="password"
                required
                autocomplete="current-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
            </TextField>
            <Button type="submit" class="w-full mt-2" disabled={loading()}>
              {loading() ? t('app.signing_in') : t('app.sign_in')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
