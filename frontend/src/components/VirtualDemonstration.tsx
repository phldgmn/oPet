import { For, Show } from 'solid-js'
import type { PublicComment } from '@/lib/api'

interface VirtualDemonstrationProps {
  signatureCount: number
  comments?: PublicComment[]
}

const GENERIC_MESSAGES = [
  'Hier muss endlich etwas passieren',
  'Schutz braucht Stimmen',
  'Keine Stimme geht verloren',
  'Gemeinsam sichtbar',
  'Für Veränderung',
]

function messageFor(index: number, comments: PublicComment[]) {
  const publicComment = comments[index % Math.max(comments.length, 1)]?.comment
  return publicComment || GENERIC_MESSAGES[index % GENERIC_MESSAGES.length]
}

export function VirtualDemonstration(props: VirtualDemonstrationProps) {
  const avatarCount = () => Math.min(120, Math.max(0, props.signatureCount))
  const comments = () => props.comments ?? []

  return (
    <section class="overflow-hidden rounded-lg border border-border bg-card">
      <div class="border-b border-border px-5 py-4">
        <p class="text-sm font-semibold uppercase tracking-wide text-primary">Virtuelle Demonstration</p>
        <h2 class="text-2xl font-bold">Die Unterstützung wird sichtbar</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {props.signatureCount.toLocaleString()} bestätigte Stimmen stehen auf dem Platz.
        </p>
      </div>

      <div class="relative min-h-[280px] bg-[linear-gradient(180deg,hsl(var(--accent))_0%,hsl(var(--background))_58%,hsl(var(--border))_58%,hsl(var(--border))_100%)] p-5">
        <div class="absolute left-5 top-5 rounded-full bg-card/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
          Stimmungsbarometer: entschlossen
        </div>
        <div class="grid grid-cols-6 gap-x-3 gap-y-5 pt-14 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
          <For each={Array.from({ length: avatarCount() })}>
            {(_, index) => {
              const showSign = () => index() % 5 === 0
              const hue = () => (index() * 37) % 360

              return (
                <div class="group flex min-h-16 flex-col items-center justify-end" style={{ 'animation-delay': `${(index() % 8) * 80}ms` }}>
                  <Show when={showSign()}>
                    <div
                      class="mb-1 max-w-24 rotate-[-2deg] rounded-sm border border-foreground/20 bg-card px-1.5 py-1 text-center text-[10px] font-semibold leading-tight shadow-sm transition group-hover:scale-110"
                      title={messageFor(index(), comments())}
                    >
                      {messageFor(index(), comments()).slice(0, 42)}
                    </div>
                  </Show>
                  <div class="virtual-avatar">
                    <div class="h-3 w-3 rounded-full" style={{ background: `hsl(${hue()} 45% 45%)` }} />
                    <div class="mt-0.5 h-5 w-4 rounded-t-full bg-primary/80" />
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </div>
    </section>
  )
}
