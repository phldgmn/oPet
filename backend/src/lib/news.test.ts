import { describe, expect, test } from 'bun:test'
import { parseFeed } from './news.js'

describe('news feed parsing', () => {
  test('parses RSS items into draftable news payloads', () => {
    const items = parseFeed(`
      <rss><channel>
        <item>
          <title><![CDATA[ Meldung eins ]]></title>
          <link>https://example.org/a?x=1&amp;y=2</link>
          <description><![CDATA[<p>Kurzer Text</p>]]></description>
          <pubDate>Mon, 11 May 2026 10:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `)

    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Meldung eins')
    expect(items[0].url).toBe('https://example.org/a?x=1&y=2')
    expect(items[0].excerpt).toBe('Kurzer Text')
    expect(items[0].publishedAt?.toISOString()).toBe('2026-05-11T10:00:00.000Z')
  })

  test('ignores items without usable title or URL', () => {
    const items = parseFeed(`
      <rss><channel>
        <item><title>Missing URL</title></item>
        <item><link>not a url</link><title>Bad URL</title></item>
      </channel></rss>
    `)

    expect(items).toHaveLength(0)
  })
})
