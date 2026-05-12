import { JSX } from 'solid-js'
import { A } from '@solidjs/router'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { t } from '@/lib/i18n'
import { createResource, Show } from 'solid-js'
import { api } from '@/lib/api'

interface LayoutProps {
  children?: JSX.Element
}

export default function Layout(props: LayoutProps) {
  const [settings] = createResource(api.getSiteSettings)

  return (
    <div class="min-h-screen flex flex-col">
      <header class="bg-background/95 border-b border-border shadow-sm">
        <div class="container mx-auto px-4 py-3 flex items-center justify-between">
          <A href="/" class="flex items-baseline gap-2 font-bold tracking-tight" aria-label={settings()?.publicSiteTitle ?? '4|change'}>
            <Show when={settings()?.logoUrl}>
              {(logoUrl) => <img src={logoUrl()} alt="" class="h-10 w-auto" />}
            </Show>
            <span class="text-2xl uppercase text-primary md:text-3xl">4|change</span>
          </A>
          <div class="flex items-center gap-4">
            <p class="hidden text-sm text-muted-foreground md:block">
              {settings()?.publicClaim ?? 'Gemeinsam Veränderung sichtbar machen'}
            </p>
            <nav class="flex gap-4 text-sm">
              <A href="/" class="hover:text-primary transition-colors" activeClass="text-primary font-medium">{t('app.petitions')}</A>
              <A href="/privacy" class="hover:text-primary transition-colors">{t('app.privacy')}</A>
              <A href="/imprint" class="hover:text-primary transition-colors">{t('app.imprint')}</A>
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main class="container mx-auto px-4 pt-8 pb-12 flex-1">
        {props.children}
      </main>

      <footer class="bg-card border-t py-5 text-center text-sm text-muted-foreground">
        <div class="container mx-auto px-4">
          &copy; {new Date().getFullYear()} {settings()?.publicSiteTitle ?? '4|change'} &mdash; {t('app.open_petition_platform')} &mdash;{' '}
          <A href="/privacy" class="hover:underline">{t('app.privacy')}</A>
          {' '}&bull;{' '}
          <A href="/imprint" class="hover:underline">{t('app.imprint')}</A>
        </div>
      </footer>
    </div>
  )
}
