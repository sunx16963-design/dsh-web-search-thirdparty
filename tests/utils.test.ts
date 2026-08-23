import { describe, it, expect } from 'vitest'
import { cleanSnippet, decodeEntities, normalizePublishedAt, domainOf, dedupeByDomain, queryTokens, sortByRelevance } from '../src/index'

describe('cleanSnippet', () => {
  it('strips html tags and collapses whitespace', () => {
    expect(cleanSnippet('<h1>A</h1> &nbsp;   B\t\tC\nD', 200)).toBe('A B C D')
  })
  it('removes table-bar noise and seps', () => {
    expect(cleanSnippet('a | b | --- | c', 200)).toBe('a b c')
  })
  it('truncates with ellipsis at the limit', () => {
    const s = cleanSnippet('1234567890', 5)
    expect(s!.length).toBe(5)
    expect(s!.endsWith('…')).toBe(true)
  })
  it('returns undefined for empty', () => {
    expect(cleanSnippet('   ', 10)).toBeUndefined()
  })
})

describe('domainOf', () => {
  it('drops www and lowercases', () => {
    expect(domainOf('https://www.Example.com/path')).toBe('example.com')
    expect(domainOf('https://a.b.co.uk/x')).toBe('a.b.co.uk')
  })
})

describe('dedupeByDomain', () => {
  const mk = (url: string) => ({ url })
  it('keeps at most `limit` per domain', () => {
    const out = dedupeByDomain([mk('https://a.example/1'), mk('https://a.example/2'), mk('https://b.example/1')], 1)
    expect(out.map((s) => s.url)).toEqual(['https://a.example/1', 'https://b.example/1'])
  })
  it('0 means unlimited', () => {
    const out = dedupeByDomain([mk('https://a.example/1'), mk('https://a.example/2')], 0)
    expect(out.length).toBe(2)
  })
})

describe('sortByRelevance', () => {
  it('ranks query-token hits in title above snippet', () => {
    const sources = [
      { url: 'u1', title: 'nothing', snippet: 'gamma term' },
      { url: 'u2', title: 'Gamma term here', snippet: 'x' },
      { url: 'u3', title: 'plain', snippet: 'no' },
    ]
    const sorted = sortByRelevance(sources, 'gamma term')
    expect(sorted.map((s) => s.url)).toEqual(['u2', 'u1', 'u3'])
  })
})

describe('queryTokens', () => {
  it('splits on non-alnum and CJK is kept', () => {
    expect(queryTokens('DeepSeek AI 青森')).toEqual(['deepseek', 'ai', '青森'])
  })
})

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities incl. CJK', () => {
    expect(decodeEntities('&amp; &copy; &#39; &#x27; &#x4e2d;')).toBe('& © \' \' 中')
  })
  it('keeps unknown entities verbatim', () => {
    expect(decodeEntities('&nosuch; 5&lt;6')).toBe('&nosuch; 5<6')
  })
  it('flows through cleanSnippet', () => {
    expect(cleanSnippet('A &hellip;B&nbsp;&amp;&#x4e2d;', 200)).toBe('A …B &中')
  })
})

describe('normalizePublishedAt', () => {
  it('normalizes parseable dates to ISO', () => {
    expect(normalizePublishedAt('2026-01-01')).toBe('2026-01-01T00:00:00.000Z')
    expect(normalizePublishedAt(1735689600)).toBe('2025-01-01T00:00:00.000Z') // 秒级时间戳
  })
  it('drops prose ages and empty values (Brave page_age style)', () => {
    expect(normalizePublishedAt('2 hours ago')).toBeUndefined()
    expect(normalizePublishedAt(undefined)).toBeUndefined()
    expect(normalizePublishedAt('')).toBeUndefined()
  })
})
