export function buildShareText(petition: { title: string; summary?: string }) {
  return `Ich habe die Petition "${petition.title}" unterschrieben. Mach doch auch mit!`
}

export function buildShareUrl(slug: string) {
  return `${window.location.origin}/petition/${slug}`
}
