import { describe, it, expect } from 'vitest'
import {
  ThirdPartySearchProvider, ProviderRegistry, buildProviderChain, builtinAdapter,
  cacheKeyOf, resetSearchStats, getSearchStats, getCircuitStates, PROVIDER_SERVICE_ID,
} from '../src/index'
import { getEngineSpec } from '../src/engine-spec'

function mkAdapter(id: string, search: any, available = () => true) {
  return { id, label: id, available, search }
}

function cfg(over: any = {}) {
  return {
    provider: 'sev', timeoutMs: 5000, maxResults: 10, snippetMaxLength: 200, mergeResults: false,
    fallbackProviders: [], maxProviderQueries: 3, maxPerDomain: 2, relevanceSort: false, cacheEnabled: true, cacheTtlMs: 600000,
    maxProviderConcurrency: 3, circuitEnabled: false, circuitFailureLimit: 3, circuitCooldownMs: 15000,
    fetchAllowPrivate: true, statsEnabled: false,
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

function mkRegistry(ctx: any, entries: Array<[string, any]>) {
  const sources = new Map(entries)
  return { sources, list: () => [...sources.keys()] }
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
    expect(res.sources.map((s) => s.url)).toEqual(['https://a.example/1', 'https://b.example/1'])
    expect(res.sources[0].title).toBe('Gamma term here')
  })

  it('dedupes by domain and sorts BEFORE slicing to maxResults', async () => {
    // 6 条结果里相关的那条排在最后：先截断的话它永远进不了返回集
    const items: any[] = []
    for (let i = 1; i <= 5; i++) items.push({ url: 'https://a.example/' + i, title: 'plain ' + i })
    items.push({ url: 'https://b.example/1', title: 'gamma needle here' })
    const sources = new Map<string, any>()
    sources.set('sev', mkAdapter('sev', async () => ({ sources: items })))
    const c = cfg({ provider: 'sev', maxPerDomain: 2, relevanceSort: true, cacheEnabled: false })
    const res = await makeProvider({ sources, list: () => ['sev'] }, c).search({ query: 'needle gamma', maxResults: 4 })
    expect(res.sources[0].url).toBe('https://b.example/1')
    const aCount = res.sources.filter((s: any) => s.url.startsWith('https://a.example')).length
    expect(aCount).toBe(2) // 域名限额 2 条 + b.example 补位
  })

  it('coalesces concurrent identical queries (stampede protection)', async () => {
    let calls = 0
    const sources = new Map<string, any>()
    sources.set('sev', mkAdapter('sev', async () => { calls++; await new Promise((r) => setTimeout(r, 30)); return { sources: [{ url: 'https://s/1' }] } }))
    const p = makeProvider({ sources, list: () => ['sev'] }, cfg({ cacheEnabled: true }))
    await Promise.all([p.search({ query: 'samek', maxResults: 5 }), p.search({ query: 'samek', maxResults: 5 })])
    expect(calls).toBe(1)
  })

  it('trips the circuit breaker on a failing fallback and then skips it', async () => {
    resetSearchStats()
    let failCalls = 0
    const sources = new Map<string, any>()
    sources.set('f1', mkAdapter('f1', async () => { throw new Error('f1 boom') }))
    sources.set('f2', mkAdapter('f2', async () => { failCalls++; throw new Error('f2 boom') }))
    sources.set('ok', mkAdapter('ok', async () => ({ sources: [{ url: 'https://ok/1' }] })))
    const c = cfg({ provider: 'f1', fallbackProviders: ['f2', 'ok'], cacheEnabled: false, circuitEnabled: true, circuitFailureLimit: 2, circuitCooldownMs: 60000 })
    const p = makeProvider({ sources, list: () => ['f1', 'f2', 'ok'] }, c)
    await p.search({ query: 'q', maxResults: 5 })
    await p.search({ query: 'q', maxResults: 5 })
    expect(failCalls).toBe(2)
    await p.search({ query: 'q2', maxResults: 5 })
    // 第 3 次：f2 已熔断被跳过（只试 f1 与 ok）
    expect(failCalls).toBe(2)
  })

  it('exposes circuit state via getCircuitStates (for the stats panel)', async () => {
    const sources = new Map<string, any>()
    sources.set('f1', mkAdapter('f1', async () => { throw new Error('down') }))
    sources.set('ok', mkAdapter('ok', async () => ({ sources: [{ url: 'https://ok/1' }] })))
    const c = cfg({ provider: 'f1', fallbackProviders: ['ok'], cacheEnabled: false, circuitEnabled: true, circuitFailureLimit: 1, circuitCooldownMs: 60000 })
    await makeProvider({ sources, list: () => ['f1', 'ok'] }, c).search({ query: 'cq', maxResults: 5 })
    expect(getCircuitStates().f1?.open).toBe(true)
    expect(getCircuitStates().f1?.failures).toBe(0) // 熔断后失败计数清零
  })

  it('records per-source stats', async () => {
    resetSearchStats()
    const sources = new Map<string, any>()
    sources.set('good', mkAdapter('good', async () => ({ sources: [{ url: 'https://g/1' }] })))
    sources.set('bad', mkAdapter('bad', async () => { throw new Error('bad') }))
    const c = cfg({ provider: 'bad', fallbackProviders: ['good'], cacheEnabled: false, statsEnabled: true })
    await makeProvider({ sources, list: () => ['good', 'bad'] }, c).search({ query: 'q', maxResults: 5 })
    const st = getSearchStats()
    expect(st.good.requests).toBe(1)
    expect(st.good.errors).toBe(0)
    expect(st.bad.requests).toBe(1)
    expect(st.bad.errors).toBe(1)
    expect(st.bad.lastError).toContain('bad')
  })

  it('stats avgLatencyMs uses success count (0 when all failed)', async () => {
    resetSearchStats()
    const sources = new Map<string, any>()
    sources.set('good', mkAdapter('good', async () => ({ sources: [{ url: 'https://g/1' }] })))
    sources.set('bad', mkAdapter('bad', async () => { throw new Error('bad') }))
    const c = cfg({ provider: 'bad', fallbackProviders: ['good'], cacheEnabled: false, statsEnabled: true })
    await makeProvider({ sources, list: () => ['good', 'bad'] }, c).search({ query: 'q2', maxResults: 5 })
    const st = getSearchStats()
    expect(st.bad.avgLatencyMs).toBe(0)
    expect(st.good.avgLatencyMs).toBeGreaterThanOrEqual(0)
  })

  it('caps fallback attempts by maxProviderQueries in non-merge mode too', async () => {
    const calls: string[] = []
    const mkFail = (id: string) => mkAdapter(id, async () => { calls.push(id); throw new Error(id + ' down') })
    const sources = new Map<string, any>()
    sources.set('p1', mkFail('p1'))
    sources.set('f1', mkFail('f1'))
    sources.set('ok', mkAdapter('ok', async () => { calls.push('ok'); return { sources: [{ url: 'https://ok/1' }] } }))
    const c = cfg({ provider: 'p1', fallbackProviders: [], maxProviderQueries: 2, cacheEnabled: false })
    await expect(
      makeProvider({ sources, list: () => ['p1', 'f1', 'ok'] }, c).search({ query: 'q', maxResults: 5 }),
    ).rejects.toThrowError(/所有可用搜索源均失败/)
    // 预算 2（主源 + 1 个降级源）：第 3 个可用源不应被消耗
    expect(calls).toEqual(['p1', 'f1'])
  })

  it('propagates abort instead of reporting all-sources-failed', async () => {
    const calls: string[] = []
    const sources = new Map<string, any>()
    sources.set('slow', {
      id: 'slow', label: 'slow',
      search: (_i: any, signal?: AbortSignal) => new Promise((_res, rej) => {
        signal?.addEventListener('abort', () => rej(new Error('stalled')), { once: true })
      }),
    })
    sources.set('backup', mkAdapter('backup', async () => { calls.push('backup'); return { sources: [{ url: 'https://y/1' }] } }))
    const c = cfg({ provider: 'slow', fallbackProviders: ['backup'], timeoutMs: 60, cacheEnabled: false })
    await expect(
      makeProvider({ sources, list: () => ['slow', 'backup'] }, c).search({ query: 'x', maxResults: 5 }),
    ).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    expect(calls).toEqual([]) // 超时后不再继续烧降级链
  })
})

describe('cache key', () => {
  it('includes post-processing options (maxPerDomain)', async () => {
    let calls = 0
    const sources = new Map<string, any>()
    sources.set('sev', mkAdapter('sev', async () => { calls++; return { sources: [{ url: 'https://c/1' }] } }))
    await makeProvider({ sources, list: () => ['sev'] }, cfg({ cacheEnabled: true })).search({ query: 'q', maxResults: 5 })
    await makeProvider({ sources, list: () => ['sev'] }, cfg({ cacheEnabled: true })).search({ query: 'q', maxResults: 5 })
    expect(calls).toBe(1) // 同配置命中缓存
    await makeProvider({ sources, list: () => ['sev'] }, cfg({ cacheEnabled: true, maxPerDomain: 0 })).search({ query: 'q', maxResults: 5 })
    expect(calls).toBe(2) // maxPerDomain 变了 → 新缓存 key，重新请求
  })

  it('diverges when an engine endpoint changes (switching instances must not hit stale cache)', () => {
    const base = cfg()
    expect(cacheKeyOf(base, 'q', 8)).toBe(cacheKeyOf({ ...base }, 'q', 8))
    expect(cacheKeyOf(base, 'q', 8))
      .not.toBe(cacheKeyOf({ ...base, searxngBaseURL: 'http://self-hosted:8888' }, 'q', 8))
    expect(cacheKeyOf(base, 'q', 8))
      .not.toBe(cacheKeyOf({ ...base, tavilyEndpoint: 'http://mirror/tavily' }, 'q', 8))
  })
})

describe('provider chain availability', () => {
  function fakeRegistryCtx() {
    return { effect: (fn: any) => { const d = fn(); return () => d?.() } }
  }

  it('includes keyed sources whose key lives only in the credentials service', async () => {
    const credentials = { resolve: async () => ({ value: 'from-credentials' }) }
    const reg = new ProviderRegistry(fakeRegistryCtx() as any)
    reg.register(builtinAdapter({} as any, getEngineSpec('searxng')!), true)
    reg.register(builtinAdapter({} as any, getEngineSpec('tavily')!), true)
    const c = cfg({ provider: 'searxng', tavilyApiKey: '', tavilyApiKeyEnv: 'TAVILY_API_KEY' })
    const ctx = { get: (n: string) => (n === 'credentials' ? credentials : undefined), web: {} }
    const chain = await buildProviderChain(c, reg, ctx as any)
    expect(chain).toContain('tavily')
  })

  it('excludes keyed sources without any resolvable credential', async () => {
    const credentials = { resolve: async () => { throw new Error('no such credential') } }
    const reg = new ProviderRegistry(fakeRegistryCtx() as any)
    reg.register(builtinAdapter({} as any, getEngineSpec('searxng')!), true)
    reg.register(builtinAdapter({} as any, getEngineSpec('tavily')!), true)
    const c = cfg({ provider: 'searxng', tavilyApiKey: '', tavilyApiKeyEnv: 'TAVILY_API_KEY' })
    const ctx = { get: (n: string) => (n === 'credentials' ? credentials : undefined), web: {} }
    const chain = await buildProviderChain(c, reg, ctx as any)
    expect(chain).toEqual(['searxng'])
  })

  it('respects adapter-provided sync available() for custom sources', async () => {
    const reg = new ProviderRegistry(fakeRegistryCtx() as any)
    reg.register(mkAdapter('off', async () => ({ sources: [] }), () => false))
    reg.register(mkAdapter('on', async () => ({ sources: [] }), () => true))
    const chain = await buildProviderChain(cfg({ provider: 'searxng' }), reg as any)
    expect(chain).toContain('on')
    expect(chain).not.toContain('off')
  })
})

describe('ProviderRegistry duplicate id', () => {
  it('warns and replaces on duplicate id instead of throwing (hot-reload safe)', () => {
    const warnings: any[] = []
    const ctx = {
      effect: (fn: any) => { const d = fn(); return () => d?.() },
      logger: { warn: (...a: any[]) => warnings.push(a) },
    }
    const reg = new ProviderRegistry(ctx as any)
    reg.register(mkAdapter('dup', async () => ({ sources: [] })))
    expect(() => reg.register(mkAdapter('dup', async () => ({ sources: [] })))).not.toThrow()
    expect(reg.list().filter((id) => id === 'dup')).toHaveLength(1)
    expect(warnings.length).toBeGreaterThan(0)
  })
})
