import { prisma } from '../db.js'

export interface ParsedFeedItem {
  title: string
  url: string
  excerpt?: string
  publishedAt?: Date
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function getTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!match) return undefined
  return stripTags(match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, '$1'))
}

function getAtomLink(block: string): string | undefined {
  const match = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)
  return match?.[1] ? decodeEntities(match[1].trim()) : undefined
}

function normalizeUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value.trim()).toString()
  } catch {
    return undefined
  }
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function parseFeed(xml: string): ParsedFeedItem[] {
  const blocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ].map((match) => match[0])

  return blocks
    .map((block) => {
      const url = normalizeUrl(getTag(block, 'link') ?? getAtomLink(block) ?? getTag(block, 'guid'))
      const title = getTag(block, 'title')
      if (!url || !title) return null

      const excerpt = (getTag(block, 'description') ?? getTag(block, 'summary') ?? getTag(block, 'content'))?.slice(0, 500)
      const publishedAt = parseDate(getTag(block, 'pubDate') ?? getTag(block, 'published') ?? getTag(block, 'updated'))
      return { title: title.slice(0, 300), url, excerpt, publishedAt }
    })
    .filter((item): item is ParsedFeedItem => item !== null)
}

export async function importNewsFromEnabledSources() {
  const sources = await prisma.newsSource.findMany({ where: { enabled: true } })
  let imported = 0
  let skipped = 0

  for (const source of sources) {
    try {
      const response = await fetch(source.feedUrl, {
        headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      })
      if (!response.ok) {
        skipped++
        continue
      }

      const xml = await response.text()
      const items = parseFeed(xml).slice(0, 20)
      for (const item of items) {
        const existing = await prisma.newsItem.findUnique({ where: { url: item.url } })
        if (existing) {
          skipped++
          continue
        }

        await prisma.newsItem.create({
          data: {
            sourceId: source.id,
            title: item.title,
            url: item.url,
            excerpt: item.excerpt,
            publishedAt: item.publishedAt,
            status: 'draft',
          },
        })
        imported++
      }
    } catch {
      skipped++
    }
  }

  return { imported, skipped, sources: sources.length }
}
