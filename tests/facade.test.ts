import { describe, it, expect } from 'vitest'
import { ThirdPartySearchProvider, ProviderRegistry, PROVIDER_SERVICE_ID } from '../src/index'

function mkAdapter(id: string, search: any, available = () => true) {
  return { id, label: id, available, search }
}

function cfg(over: any = {}) {
  return {
    provider: 'sev', timeoutMs: 5000, maxResults: 10, snippetMaxLength: 200, mergeResults: false,
    fallbackProviders: [], maxProviderQueries: 3, maxPerDomain: 2, relevanceSort: false, cacheEnabled: true, cacheTtlMs: 600000,
    searxngBaseURL: 'http://x', searxngLanguage: '', searxngCategories: 'general', searxngSafesearch: 0,
    tavilyApiKey: '', tavilyApiKeyEnv: '', tavilySearchDepth: 'basic', tavilyEndpoint: 'http://x',
    serperApiKey: '', serperApiKeyEnv: '', serperLanguage: '', serperEndpoint: 'http://x',
    braveApiKey: '', braveApiKeyEnv: '', braveCountry: '', braveSearchLang: '', braveEndpoint: 'http://x',
    bingApiKey: '', bingApiKeyEnv: '', bingEndpoint: 'http://x', bingMarket: 'en-US',
    googleApiKey: '', googleApiKeyEnv: '', googleSearchEngineId: '', googleSearchEngineIdEnv: '', googleLanguage: '', googleEndpoint: 'http://x',
    fetchMaxBodyChars: 60000, fetchTimeoutMs: 15000, fetchUserAgent: 't', retryCount: 0, retryBackoffMs: 0, extraHeadersJson: '',
    ...over,
  }
}

function makeProvider(registry: any, c: any) {
  const ctx = { get: (n: string) => (n === PROVIDER_SERVICE_ID ? registry : undefined), web: {} }
  return new ThirdPartySearchProvider(() => ({ ctx, cfg: c }))
}

describe('facade behavior', () => {
  it('auto-fallbacks when primary throws', async () => {
    const calls: string[] = []
    const sources = new Map<string, any>()
    sources.set('primary', mkAdapter('primary', async () => { calls.push('primary'); throw new Error('boom') }))
    sources.set('backup', mkAdapter('backup', async () => { calls.push('backup'); return { sources: [{ url: 'https://b/1' }] } }))
    const c = cfg({ provider: 'primary', cacheEnabled: false })
    const res = await makeProvider({ sources, list: () => [...sources.keys()] }, c).search({ query: 'x', maxResults: 5 })
    expect(calls).toEqual(['primary', 'backup'])
    expect(res.sources[0].url).toBe('https://b/1')
  })

  it('merges and de-dupes by url', async () => {
    const sources = new Map<string, any>()
    sources.set('a', mkAdapter('a', async () => ({ sources: [{ url: 'https://x/1' }, { url: 'https://x/2' }] })))
    sources.set('b', mkAdapter('b', async () => ({ sources: [{ url: 'https://x/2' }, { url: 'https://x/3' }] })))
    const c = cfg({ provider: 'a', mergeResults: true, fallbackProviders: ['b'], maxProviderQueries: 2, cacheEnabled: false, maxPerDomain: 0 })
    const res = await makeProvider({ sources, list: () => ['a', 'b'] }, c).search({ query: 'x', maxResults: 10 })
    expect(res.sources.map((s) => s.url)).toEqual(['https://x/1', 'https://x/2', 'https://x/3'])
  })

  it('caches identical queries (no second upstream call)', async () => {
    let calls = 0
    const sources = new Map<string, any>()
    sources.set('sev', mkAdapter('sev', async () => { calls++; return { sources: [{ url: 'https://c/1' }] } }))
    const p = makeProvider({ sources, list: () => ['sev'] }, cfg({ cacheEnabled: true }))
    await p.search({ query: 'same', maxResults: 5 })
    await p.search({ query: 'same', maxResults: 5 })
    expect(calls).toBe(1)
  })

  it('applies domain dedupe and relevance sort', async () => {
    const sources = new Map<string, any>()
    sources.set('sev', mkAdapter('sev', async () => ({
      sources: [
        { url: 'https://a.example/1', title: 'Gamma term here' },
        { url: 'https://a.example/2', title: 'plain' },
        { url: 'https://b.example/1', title: 'other' },
      ],
    })))
    const c = cfg({ provider: 'sev', maxPerDomain: 1, relevanceSort: true, cacheEnabled: false })
    const res = await makeProvider({ sources, list: () => ['sev'] }, c).search({ query: 'gamma term', maxResults: 10 })
    // domain dedupe keeps a.example/1 + b.example/1; relevance puts the gamma-title first
    expect(res.sources.map((s) => s.url)).toEqual(['https://a.example/1', 'https://b.example/1'])
    expect(res.sources[0].title).toBe('Gamma term here')
  })
})

describe('ProviderRegistry duplicate id', () => {
  it('rejects registering the same id twice', () => {
    const ctx = { effect: (fn: any) => { const d = fn(); return () => d?.() } }
    const reg = new ProviderRegistry(ctx as any)
    reg.register(mkAdapter('dup', async () => ({ sources: [] })))
    expect(() => reg.register(mkAdapter('dup', async () => ({ sources: [] })))).toThrowError(/already registered/i)
  })
})
