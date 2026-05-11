import { JSX } from 'solid-js'
import { A } from '@solidjs/router'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { t } from '@/lib/i18n'

interface LayoutProps {
  children?: JSX.Element
}

export default function Layout(props: LayoutProps) {
  return (
    <div class="min-h-screen flex flex-col">
      <header class="bg-card border-b shadow-sm">
        <div class="container mx-auto px-4 py-3 flex items-center justify-between">
          <A href="/" class="flex items-baseline gap-1 font-bold tracking-tight" aria-label="4CHANGE.NOW">
            <span class="text-3xl text-primary">4|CHANGE</span>
            <span class="text-xl text-foreground/70">.NOW</span>
          </A>
          <div class="flex items-center gap-4">
            <p class="hidden text-sm text-muted-foreground md:block">
              Gemeinsam Veränderung sichtbar machen
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
          &copy; {new Date().getFullYear()} oPet &mdash; {t('app.open_petition_platform')} &mdash;{' '}
          <A href="/privacy" class="hover:underline">{t('app.privacy')}</A>
          {' '}&bull;{' '}
          <A href="/imprint" class="hover:underline">{t('app.imprint')}</A>
        </div>
      </footer>
    </div>
  )
}
