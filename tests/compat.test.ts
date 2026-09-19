import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest'
import { createServer, Server } from 'node:http'
import {
  ThirdPartySearchProvider, ProviderRegistry, builtinAdapter, syncKeyAvailable,
  PROVIDER_SERVICE_ID, searchSearxng,
} from '../src/index'
import { installSettingsSectionCompat } from '../src/settings-compat'
import { getEngineSpec } from '../src/engine-spec'
import { isPrivateIp, isPrivateName, assertPublicUrl } from '../src/net'
import { getCacheStats, resetRuntimeState } from '../src/state'

function settingsMock() { return (globalThis as any).__dshSettingsMock as { installSettingsSection?: (...a: any[]) => void } }
function envMock() { return (globalThis as any).__dshEnvMock as { values: Record<string, string> } }

function cfg(over: any = {}) {
  return {
    provider: 'searxng', timeoutMs: 5000, maxResults: 10, snippetMaxLength: 200, mergeResults: false,
    fallbackProviders: [], maxProviderQueries: 3, maxPerDomain: 2, relevanceSort: false, cacheEnabled: false, cacheTtlMs: 600000,
    maxProviderConcurrency: 3, circuitEnabled: false, circuitFailureLimit: 3, circuitCooldownMs: 15000,
    enableFetchProvider: true, fetchAllowPrivate: false, statsEnabled: false,
    searxngBaseURL: 'http://x', searxngLanguage: '', searxngCategories: 'general', searxngSafesearch: 0,
    tavilyApiKey: '', tavilyApiKeyEnv: 'TAVILY_API_KEY', tavilySearchDepth: 'basic', tavilyEndpoint: 'http://x',
    serperApiKey: '', serperApiKeyEnv: '', serperLanguage: '', serperEndpoint: 'http://x',
    braveApiKey: '', braveApiKeyEnv: '', braveCountry: '', braveSearchLang: '', braveEndpoint: 'http://x',
    bingApiKey: '', bingApiKeyEnv: '', bingEndpoint: 'http://x', bingMarket: 'en-US',
    googleApiKey: '', googleApiKeyEnv: '', googleSearchEngineId: '', googleSearchEngineIdEnv: '', googleLanguage: '', googleEndpoint: 'http://x',
    fetchMaxBodyChars: 60000, fetchTimeoutMs: 15000, fetchUserAgent: 't', retryCount: 0, retryBackoffMs: 0, extraHeadersJson: '',
    ...over,
  }
}

function mkAdapter(id: string, search: any, available = () => true) {
  return { id, label: id, available, search }
}

function makeProvider(registry: any, c: any, extraServices: Record<string, any> = {}) {
  const ctx = {
    get: (n: string) => (n === PROVIDER_SERVICE_ID ? registry : extraServices[n]),
    web: {},
  }
  return new ThirdPartySearchProvider(() => ({ ctx, cfg: c }))
}

describe('settings section install (two generations of the DSH settings API)', () => {
  it('uses the legacy top-level helper when it exists (<= 0.1.1-rc.2)', () => {
    const calls: any[] = []
    settingsMock().installSettingsSection = (...args: any[]) => { calls.push(args) }
    const ctx: any = { inject: () => { throw new Error('新路径不应被走到') }, logger: { warn: () => {} } }
    const hooks = { setSource: () => {}, onChange: () => {} }
    installSettingsSectionCompat(ctx, 'ns-x', {}, { a: 1 }, hooks)
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toBe('ns-x')
    expect(calls[0][4]).toBe(hooks)
    settingsMock().installSettingsSection = undefined
  })

  it('uses ctx.settings.installSection on >= 0.1.2', () => {
    const calls: any[] = []
    const ctx: any = {
      inject: (deps: string[], cb: any) => { expect(deps).toEqual(['settings']); cb({ settings: { installSection: (...a: any[]) => calls.push(a) } }) },
      logger: { warn: () => {} },
    }
    const hooks = { setSource: () => {}, onChange: () => {} }
    installSettingsSectionCompat(ctx, 'ns-y', {}, { a: 1 }, hooks)
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toBe('ns-y')
  })

  it('falls back to register/watch when a future service lacks installSection', () => {
    const sources: any[] = []
    const watched: any[] = []
    const sctx: any = {
      settings: {
        register: (ns: string, _schema: any, opts: any) => {
          sources.push({ ns, opts })
          return { get: () => opts.base, watch: (fn: any) => { watched.push(fn); return () => {} } }
        },
      },
      effect: (fn: any) => { const d = fn(); return () => d?.() },
    }
    const ctx: any = { inject: (_d: string[], cb: any) => cb(sctx), logger: { warn: () => {} } }
    let current: any
    installSettingsSectionCompat(ctx, 'ns-z', {}, { b: 2 }, { setSource: (fn) => { current = fn() }, onChange: () => {} })
    expect(sources[0].ns).toBe('ns-z')
    expect(sources[0].opts.base).toEqual({ b: 2 })
    expect(watched).toHaveLength(1)
    expect(current).toEqual({ b: 2 })
  })
})

describe('provider availability', () => {
  it('reports unavailable when a keyed engine has no literal, no env and no credentials service', () => {
    const ctx: any = { get: () => undefined, web: {} }
    expect(syncKeyAvailable(ctx, cfg({ provider: 'tavily' }) as any, 'tavily')).toBe(false)
    expect(syncKeyAvailable(ctx, cfg({ provider: 'searxng' }) as any, 'searxng')).toBe(true)
  })

  it('stays optimistic while a credentials service could still supply the key', () => {
    const ctx: any = { get: (n: string) => (n === 'credentials' ? {} : undefined), web: {} }
    expect(syncKeyAvailable(ctx, cfg({ provider: 'tavily' }) as any, 'tavily')).toBe(true)
  })

  it('accepts a key from the launch environment', () => {
    envMock().values.TAVILY_API_KEY = 'env-key'
    const ctx: any = { get: () => undefined, web: {} }
    expect(syncKeyAvailable(ctx, cfg({ provider: 'tavily' }) as any, 'tavily')).toBe(true)
    delete envMock().values.TAVILY_API_KEY
  })

  it('probes asynchronously and reports the probed result through available()', async () => {
    const sources = new Map<string, any>([['tavily', mkAdapter('tavily', async () => ({ sources: [] }))]])
    const registry = { sources, list: () => [...sources.keys()] }
    const credentials = { resolve: async () => ({ value: 'from-credentials' }) }
    const p = makeProvider(registry, cfg({ provider: 'tavily' }), { credentials })
    expect(p.available()).toBe(true) // 探测前：credentials 服务在场 → 乐观
    await p.refreshAvailability()
    expect(p.available()).toBe(true)
  })
})

describe('facade honesty and robustness', () => {
  it('reports truncated=true when the facade itself cuts results to maxResults', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ url: 'https://t/' + i }))
    const sources = new Map<string, any>([['sev', mkAdapter('sev', async () => ({ sources: many }))]])
    const res = await makeProvider({ sources, list: () => ['sev'] }, cfg({ provider: 'sev', maxPerDomain: 0 })).search({ query: 'q', maxResults: 3 })
    expect(res.sources).toHaveLength(3)
    expect(res.truncated).toBe(true)
  })

  it('reports truncated=false when nothing was cut', async () => {
    const sources = new Map<string, any>([['sev', mkAdapter('sev', async () => ({ sources: [{ url: 'https://t/1' }] }))]])
    const res = await makeProvider({ sources, list: () => ['sev'] }, cfg({ provider: 'sev', maxPerDomain: 0 })).search({ query: 'q', maxResults: 5 })
    expect(res.truncated).toBe(false)
  })

  it('rejects a third party source that claims a built-in engine id', () => {
    const warnings: any[] = []
    const ctx = { effect: (fn: any) => { const d = fn(); return () => d?.() }, logger: { warn: (...a: any[]) => warnings.push(a) } }
    const reg = new ProviderRegistry(ctx as any)
    reg.register(builtinAdapter({} as any, getEngineSpec('searxng')!), true)
    const before = reg.list().length
    reg.register(mkAdapter('searxng', async () => ({ sources: [] }))) // 第三方冒充内置 id
    expect(reg.list().length).toBe(before)
    expect(warnings.length).toBeGreaterThan(0)
  })
})

describe('cache', () => {
  it('includes extraHeadersJson in the cache key', async () => {
    const { cacheKeyOf } = await import('../src/state')
    const base = cfg()
    expect(cacheKeyOf(base as any, 'q', 8)).toBe(cacheKeyOf({ ...base } as any, 'q', 8))
    expect(cacheKeyOf(base as any, 'q', 8)).not.toBe(cacheKeyOf({ ...base, extraHeadersJson: '{"X-Foo":"bar"}' } as any, 'q', 8))
  })

  it('counts hits and misses', async () => {
    resetRuntimeState()
    let calls = 0
    const sources = new Map<string, any>([['sev', mkAdapter('sev', async () => { calls++; return { sources: [{ url: 'https://c/1' }] } })]])
    const p = makeProvider({ sources, list: () => ['sev'] }, cfg({ provider: 'sev', cacheEnabled: true }))
    await p.search({ query: 'hits', maxResults: 5 })
    await p.search({ query: 'hits', maxResults: 5 })
    expect(calls).toBe(1)
    const stats = getCacheStats()
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(1)
  })
})

describe('SSRF guard', () => {
  it('blocks private, loopback, metadata and special-purpose ranges', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '198.18.0.1', '240.0.0.1']) {
      expect([ip, isPrivateIp(ip)]).toEqual([ip, true])
    }
    for (const ip of ['::1', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '2002::1', '2001:0:1::1', '64:ff9b::7f00:1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
      expect([ip, isPrivateIp(ip)]).toEqual([ip, true])
    }
    expect(isPrivateIp('93.184.216.34')).toBe(false)
    expect(isPrivateIp('2606:4700::1111')).toBe(false)
    expect(isPrivateName('localhost')).toBe(true)
    expect(isPrivateName('metadata.google.internal')).toBe(true)
    expect(isPrivateName('example.com')).toBe(false)
  })

  it('rejects a loopback fetch target unless fetchAllowPrivate is set', async () => {
    const url = new URL('http://127.0.0.1:9/x')
    await expect(assertPublicUrl(url, cfg() as any)).rejects.toMatchObject({ code: 'WEB_FETCH_BLOCKED_PRIVATE' })
    await expect(assertPublicUrl(url, cfg({ fetchAllowPrivate: true }) as any)).resolves.toBeUndefined()
  })
})

describe('result pipeline', () => {
  let server: Server
  const hits: string[] = []
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url || '')
      res.setHeader('content-type', 'application/json')
      res.end('this is not json')
    })
    await new Promise<void>((r) => server.listen(9477, '127.0.0.1', () => r()))
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  it('does not retry a non-JSON response (it is not a transient failure)', async () => {
    hits.length = 0
    const c = cfg({ provider: 'searxng', searxngBaseURL: 'http://127.0.0.1:9477', retryCount: 3, retryBackoffMs: 0, fetchAllowPrivate: true })
    await expect(searchSearxng({ ctx: {} as any, cfg: c as any }, { query: 'q', maxResults: 3 }))
      .rejects.toThrowError(/不是合法 JSON/)
    expect(hits).toHaveLength(1)
  })
})
