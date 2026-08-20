import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createServer, Server } from 'node:http'
import { searchSearxng, searchTavily, searchBrave } from '../src/index'

let server: Server
const captured: any = {}

function cfg(over: any = {}) {
  return {
    provider: 'searxng', timeoutMs: 8000, maxResults: 3, snippetMaxLength: 200, mergeResults: false,
    fallbackProviders: [], maxProviderQueries: 2, maxPerDomain: 2, relevanceSort: false, cacheEnabled: false, cacheTtlMs: 60000,
    searxngBaseURL: 'http://127.0.0.1:9333', searxngLanguage: '', searxngCategories: 'general', searxngSafesearch: 0,
    tavilyApiKey: 'k', tavilyApiKeyEnv: '', tavilySearchDepth: 'basic', tavilyEndpoint: 'http://127.0.0.1:9333/tavily',
    serperApiKey: '', serperApiKeyEnv: '', serperLanguage: '', serperEndpoint: 'http://x',
    braveApiKey: 'bk', braveApiKeyEnv: '', braveCountry: '', braveSearchLang: '', braveEndpoint: 'http://127.0.0.1:9333/brave',
    bingApiKey: '', bingApiKeyEnv: '', bingEndpoint: 'http://x', bingMarket: 'en-US',
    googleApiKey: '', googleApiKeyEnv: '', googleSearchEngineId: '', googleSearchEngineIdEnv: '', googleLanguage: '', googleEndpoint: 'http://x',
    fetchMaxBodyChars: 60000, fetchTimeoutMs: 15000, fetchUserAgent: 't/1', retryCount: 0, retryBackoffMs: 0, extraHeadersJson: '',
    ...over,
  }
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1:9333')
    res.setHeader('content-type', 'application/json')
    if (u.pathname === '/search') { // searxng
      captured.searx = Object.fromEntries(u.searchParams.entries())
      res.end(JSON.stringify({ results: [{ url: 'https://s/1', title: 'SX', content: 'searx snippet' }] }))
    } else if (u.pathname === '/tavily') {
      let b = ''
      req.on('data', (c: Buffer) => (b += c))
      req.on('end', () => { captured.tavily = JSON.parse(b || '{}'); res.end(JSON.stringify({ answer: 'ans', results: [{ url: 'https://t/1', title: 'TV', content: 'tavily snippet', published_date: '2026-01-01' }] })) })
    } else if (u.pathname === '/brave') {
      captured.brave = { token: req.headers['x-subscription-token'], country: u.searchParams.get('country'), search_lang: u.searchParams.get('search_lang'), q: u.searchParams.get('q') }
      res.end(JSON.stringify({ web: { results: [{ url: 'https://b/1', title: 'BR', description: 'brave snippet' }] } }))
    } else { res.statusCode = 404; res.end('{}') }
  })
  await new Promise<void>((r) => server.listen(9333, '127.0.0.1', () => r()))
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

describe('searxng engine', () => {
  it('sends language/categories/safesearch and normalizes results', async () => {
    const res = await searchSearxng({ ctx: {}, cfg: cfg({ searxngLanguage: 'zh', searxngCategories: 'general', searxngSafesearch: 1 }) }, { query: 'aomori', maxResults: 3 })
    expect(captured.searx.q).toBe('aomori')
    expect(captured.searx.format).toBe('json')
    expect(captured.searx.language).toBe('zh')
    expect(captured.searx.safesearch).toBe('1')
    expect(res.sources[0]).toMatchObject({ url: 'https://s/1', title: 'SX', snippet: 'searx snippet' })
  })
})

describe('tavily engine', () => {
  it('sends search_depth and maps answer to content', async () => {
    const res = await searchTavily({ ctx: {}, cfg: cfg({ tavilySearchDepth: 'advanced' }) }, { query: 'q', maxResults: 3 })
    expect(captured.tavily.search_depth).toBe('advanced')
    expect(captured.tavily.apikey ?? captured.tavily.api_key).toBe('k')
    expect(res.content).toBe('ans')
    expect(res.sources[0].publishedAt).toBe('2026-01-01')
  })
})

describe('brave engine', () => {
  it('sends subscription token and advanced params', async () => {
    const res = await searchBrave({ ctx: {}, cfg: cfg({ braveCountry: 'jp', braveSearchLang: 'ja' }) }, { query: 'deepseek', maxResults: 3 })
    expect(captured.brave.token).toBe('bk')
    expect(captured.brave.country).toBe('jp')
    expect(captured.brave.search_lang).toBe('ja')
    expect(captured.brave.q).toBe('deepseek')
    expect(res.sources[0].url).toBe('https://b/1')
  })
})
