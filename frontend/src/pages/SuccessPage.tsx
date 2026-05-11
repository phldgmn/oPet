import { useParams } from '@solidjs/router'
import { A } from '@solidjs/router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { t } from '@/lib/i18n'
import { createMemo, createResource, createSignal } from 'solid-js'
import { api } from '@/lib/api'
import { buildShareText, buildShareUrl } from '@/lib/share'

export default function SuccessPage() {
  const params = useParams<{ slug: string }>()
  const [copied, setCopied] = createSignal(false)
  const [petition] = createResource(() => params.slug, api.getPetition)
  const [settings] = createResource(api.getSiteSettings)

  const shareText = createMemo(() => {
    const p = petition()
    return p ? buildShareText(p) : (settings()?.defaultShareText ?? 'Ich habe unterschrieben. Mach doch auch mit!')
  })
  const shareUrl = createMemo(() => buildShareUrl(params.slug))

  const links = {
    whatsapp: () => `https://wa.me/?text=${encodeURIComponent(`${shareText()} ${shareUrl()}`)}`,
    email: () => `mailto:?subject=${encodeURIComponent('Petition unterstützen')}&body=${encodeURIComponent(`${shareText()}\n\n${shareUrl()}`)}`,
    facebook: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl())}`,
    x: () => `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(shareUrl())}`,
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText()} ${shareUrl()}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  return (
    <div class="max-w-lg mx-auto mt-16 text-center">
      <Card>
        <CardContent class="pt-8 pb-8 space-y-6">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground">✓</div>
          <h1>Bitte bestätige deine E-Mail-Adresse</h1>
          <p>
            Wir haben dir einen Bestätigungslink geschickt. Erst nach dem Klick auf diesen Link wird deine Unterschrift gezählt.
          </p>
          <p class="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
            Danach erscheint deine Stimme in der virtuellen Demonstration und im Fortschritt der Kampagne.
          </p>
          <div class="space-y-4">
            <h2 class="text-lg font-semibold">{t('app.share')}</h2>
            <div class="flex flex-wrap gap-2 justify-center">
              <Button variant="outline" as="a" href={links.whatsapp()} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </Button>
              <Button variant="outline" as="a" href={links.email()} target="_blank" rel="noopener noreferrer">
                E-Mail
              </Button>
              <Button variant="outline" as="a" href={links.facebook()} target="_blank" rel="noopener noreferrer">
                Facebook
              </Button>
              <Button variant="outline" as="a" href={links.x()} target="_blank" rel="noopener noreferrer">
                X
              </Button>
            </div>
            <Button variant="outline" onClick={handleCopy} class="w-full">
              {copied() ? t('app.copied') : t('app.copy_link')}
            </Button>
          </div>
          <Button variant="outline" as={A} href={`/petition/${params.slug}`}>
            ← {t('app.back_to_petition')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
