export const MANUAL_NEWS_SOURCE_PREFIX = 'manual://news-source/'

export function toStoredNewsSourceFeedUrl(feedUrl?: string): string {
  const value = feedUrl?.trim()
  if (value) return value
  return `${MANUAL_NEWS_SOURCE_PREFIX}${crypto.randomUUID()}`
}

export function toApiNewsSourceFeedUrl(feedUrl: string): string {
  return feedUrl.startsWith(MANUAL_NEWS_SOURCE_PREFIX) ? '' : feedUrl
}

export function isImportableNewsSourceFeedUrl(feedUrl: string): boolean {
  try {
    const parsed = new URL(feedUrl)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
