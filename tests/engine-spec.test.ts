import { describe, it, expect } from 'vitest'
import { ENGINE_SPECS, engineInputs } from '../src/engine-spec'
import { ENGINES, BUILTIN_LABELS, builtinKeyAvailable, cfgFromTestBody } from '../src/index'

// 与 Config 字段保持一致的样例：spec 引用了不存在的字段时这里会当场失败（防漂移哨兵）
const SAMPLE_CONFIG: Record<string, any> = {
  provider: 'searxng', timeoutMs: 30000, maxResults: 8, snippetMaxLength: 260,
  mergeResults: false, fallbackProviders: [], maxProviderQueries: 2, maxPerDomain: 2,
  relevanceSort: false, cacheEnabled: true, cacheTtlMs: 60000, maxProviderConcurrency: 3,
  circuitEnabled: true, circuitFailureLimit: 3, circuitCooldownMs: 15000,
  fetchAllowPrivate: false, statsEnabled: true,
  fetchMaxBodyChars: 60000, fetchTimeoutMs: 15000, fetchUserAgent: 'ua', retryCount: 1, retryBackoffMs: 250, extraHeadersJson: '',
  searxngBaseURL: 'https://searx.be', searxngLanguage: '', searxngCategories: 'general', searxngSafesearch: 0,
  tavilyEndpoint: 'https://api.tavily.com/search',
  tavilyApiKey: '', tavilyApiKeyEnv: 'TAVILY_API_KEY', tavilySearchDepth: 'basic',
  serperEndpoint: 'https://google.serper.dev/search', serperApiKey: '', serperApiKeyEnv: 'SERPER_API_KEY', serperLanguage: '',
  braveEndpoint: 'https://api.search.brave.com/res/v1/web/search', braveApiKey: '', braveApiKeyEnv: 'BRAVE_API_KEY', braveCountry: '', braveSearchLang: '',
  bingEndpoint: 'https://api.bing.microsoft.com/v7.0/search', bingApiKey: '', bingApiKeyEnv: 'BING_SEARCH_API_KEY', bingMarket: 'en-US',
  googleEndpoint: 'https://www.googleapis.com/customsearch/v1', googleApiKey: '', googleApiKeyEnv: 'GOOGLE_CSE_API_KEY', googleSearchEngineId: '', googleSearchEngineIdEnv: 'GOOGLE_CSE_ID', googleLanguage: '',
}

describe('engine-spec integrity (single source of truth)', () => {
  it('every spec has an implementation, and vice versa', () => {
    expect(new Set(ENGINE_SPECS.map((s) => s.id))).toEqual(new Set(Object.keys(ENGINES)))
  })

  it('BUILTIN_LABELS stays derived from specs', () => {
    for (const s of ENGINE_SPECS) expect(BUILTIN_LABELS[s.id]).toBe(s.label)
  })

  it('references only existing config fields', () => {
    for (const s of ENGINE_SPECS) {
      expect(SAMPLE_CONFIG).toHaveProperty(s.endpointKey)
      for (const input of engineInputs(s)) {
        expect(SAMPLE_CONFIG).toHaveProperty(input.configKey)
        if (input.envRefKey !== undefined) expect(SAMPLE_CONFIG).toHaveProperty(input.envRefKey)
      }
      for (const f of s.fields) expect(SAMPLE_CONFIG).toHaveProperty(f.key)
    }
  })

  it('availability: credential-free engines usable, keyed engines not on empty config', async () => {
    const ctx = { get: () => undefined, web: {} }
    for (const s of ENGINE_SPECS) {
      const needsCredential = engineInputs(s).some((i) => i.envRefKey !== undefined)
      const available = await builtinKeyAvailable(ctx as any, SAMPLE_CONFIG as any, s.id)
      expect(available).toBe(!needsCredential)
    }
  })
})

describe('cfgFromTestBody (spec-driven mapping)', () => {
  it('maps url → searxngBaseURL', () => {
    const next = cfgFromTestBody({ ...SAMPLE_CONFIG }, { provider: 'searxng', url: 'http://lan:8080' })
    expect(next.searxngBaseURL).toBe('http://lan:8080')
    expect(next.provider).toBe('searxng')
  })

  it('maps key → tavilyApiKey and caps maxResults', () => {
    const next = cfgFromTestBody({ ...SAMPLE_CONFIG }, { provider: 'tavily', key: 'tvly-x', maxResults: 99 })
    expect(next.tavilyApiKey).toBe('tvly-x')
    expect(next.maxResults).toBe(20)
  })

  it('maps key + cx for google-cse', () => {
    const next = cfgFromTestBody({ ...SAMPLE_CONFIG }, { provider: 'google-cse', key: 'gk', cx: 'cx9' })
    expect(next.googleApiKey).toBe('gk')
    expect(next.googleSearchEngineId).toBe('cx9')
  })

  it('unknown provider leaves config untouched', () => {
    const next = cfgFromTestBody({ ...SAMPLE_CONFIG }, { provider: 'nope', key: 'x' })
    expect(next.provider).toBe('searxng')
    expect(next.tavilyApiKey).toBe('')
  })
})
