/**
 * dsh-web-search-thirdparty — DSH search provider facade.
 *
 * Registers ONE provider on the `ctx.web` search seam (id = "web-search-thirdparty")
 * and routes internally to the configured third-party engine (SearXNG / Tavily /
 * Serper / Brave / Bing / Google CSE). The profile patch points `web.searchProvider`
 * at this facade, so it replaces the built-in DeepSeek-only search without touching
 * or disabling the built-in `deepseek-official` provider (no WEB_PROVIDER_AMBIGUOUS).
 *
 * Result normalization mirrors the official seam: `{ sources: [{url,title?,snippet?,publishedAt?}], content?, truncated? }`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { WebError } from '@deepseek-ai/dsh-web'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'

/** Stable provider id registered on `ctx.web` (must match cordis.patch.yml `web.searchProvider`). */
export const PROVIDER_ID = 'web-search-thirdparty'
export const FETCH_PROVIDER_ID = 'web-search-thirdparty-fetch'
export const PROVIDER_SERVICE_ID = 'web-search-thirdparty'
/** 插件名（loader row id 用短名，与官方 web-search-deepseek 同风格）。 */
export const name = 'web-search-thirdparty'
/** 注册进哪个服务缝。 */
export const inject = ['web']

/** Settings 分区名（在 DSH 设置页自动渲染一节 UI）。 */
const SETTINGS_NAMESPACE = settingsNamespace('dsh-web-search-thirdparty')

/** 默认 SearXNG 公共实例 —— 无任何 key 也能开箱即用。 */
const DEFAULT_SEARXNG_BASE_URL = 'https://searx.be'

// ─────────────────────────────────────────────────────────────────────────────
// Config / settings schema
// ─────────────────────────────────────────────────────────────────────────────

export interface Config {
  provider: string
  timeoutMs: number
  /** 单次请求最多返回的搜索结果条数。 */
  maxResults: number
  /** 清洗后 snippet 的最大长度。 */
  snippetMaxLength: number
  /** 是否合并多个可用源的结果（false=仅主源，失败自动降级到下一个可用源）。 */
  mergeResults: boolean
  /** 附加降级源 id 列表（空=自动使用其它全部可用源）。 */
  fallbackProviders: string[]
  /** 合并/降级时最多查询的源数。 */
  maxProviderQueries: number
  /** 每个域名最多保留的结果数（0=不限制）。 */
  maxPerDomain: number
  /** 是否按查询词与标题/摘要的相关度排序。 */
  relevanceSort: boolean
  /** 是否启用结果缓存（省 key 额度）。 */
  cacheEnabled: boolean
  /** 缓存有效期（ms）。 */
  cacheTtlMs: number
  /** 抓取最大字符数。 */
  fetchMaxBodyChars: number
  /** 抓取超时（ms）。 */
  fetchTimeoutMs: number
  /** 抓取 User-Agent。 */
  fetchUserAgent: string
  /** 网络层失败重试次数。 */
  retryCount: number
  /** 重试指数退避基数（ms）。 */
  retryBackoffMs: number
  /** 额外请求头（JSON 字符串，如 {"X-Foo":"bar"}），应用到所有源。 */
  extraHeadersJson: string
  searxngBaseURL: string
  /** 各 keyed 引擎 endpoint（可自建/内网代理/镜像）。 */
  tavilyEndpoint: string
  serperEndpoint: string
  braveEndpoint: string
  googleEndpoint: string
  searxngLanguage: string
  searxngCategories: string
  searxngSafesearch: number
  tavilyApiKey: string
  tavilyApiKeyEnv: string
  tavilySearchDepth: string
  serperApiKey: string
  serperApiKeyEnv: string
  serperLanguage: string
  braveApiKey: string
  braveApiKeyEnv: string
  braveCountry: string
  braveSearchLang: string
  bingApiKey: string
  bingApiKeyEnv: string
  bingEndpoint: string
  bingMarket: string
  googleApiKey: string
  googleApiKeyEnv: string
  googleSearchEngineId: string
  googleSearchEngineIdEnv: string
  googleLanguage: string
}

export const Config = z.object({
  /** 当前路由到的第三方引擎 id：searxng | tavily | serper | brave | bing | google-cse */
  provider: z.string().default('searxng'),
  /** 单次搜索超时（ms）。 */
  timeoutMs: z.number().step(100).min(1000).max(120000).default(30000),
  /** 单次请求最多返回的搜索结果条数。 */
  maxResults: z.number().step(1).min(1).max(20).default(8),
  /** 清洗后 snippet 的最大长度。 */
  snippetMaxLength: z.number().step(10).min(40).max(2000).default(260),
  /** 是否合并多个可用源的结果。 */
  mergeResults: z.boolean().default(false),
  /** 附加降级源 id 列表（空=自动使用其它全部可用源）。 */
  fallbackProviders: z.array(z.string()).default([]),
  /** 合并/降级时最多查询的源数。 */
  maxProviderQueries: z.number().step(1).min(1).max(6).default(2),
  /** 每个域名最多保留的结果数（0=不限制）。 */
  maxPerDomain: z.number().step(1).min(0).max(20).default(2),
  /** 是否按查询词与标题/摘要的相关度排序。 */
  relevanceSort: z.boolean().default(false),
  /** 是否启用结果缓存（省 key 额度）。 */
  cacheEnabled: z.boolean().default(true),
  /** 缓存有效期（ms）。 */
  cacheTtlMs: z.number().step(1000).min(1000).max(86400000).default(60000),
  /** 抓取最大字符数。 */
  fetchMaxBodyChars: z.number().step(500).min(500).max(500000).default(60000),
  /** 抓取超时（ms）。 */
  fetchTimeoutMs: z.number().step(1000).min(1000).max(120000).default(15000),
  /** 抓取 User-Agent。 */
  fetchUserAgent: z.string().default('deepseek-harness-web-search-thirdparty/0.1.0'),
  /** 网络层失败重试次数。 */
  retryCount: z.number().step(1).min(0).max(5).default(1),
  /** 重试指数退避基数（ms）。 */
  retryBackoffMs: z.number().step(50).min(0).max(10000).default(250),
  /** 额外请求头（JSON 字符串，如 {"X-Foo":"bar"}）。 */
  extraHeadersJson: z.string().default(''),
  /** 各 keyed 引擎 endpoint（可自建/内网代理/镜像）。 */
  tavilyEndpoint: z.string().default('https://api.tavily.com/search'),
  serperEndpoint: z.string().default('https://google.serper.dev/search'),
  braveEndpoint: z.string().default('https://api.search.brave.com/res/v1/web/search'),
  googleEndpoint: z.string().default('https://www.googleapis.com/customsearch/v1'),
  // ── SearXNG（无 key，默认）──
  searxngBaseURL: z.string().default(DEFAULT_SEARXNG_BASE_URL),
  searxngLanguage: z.string().default(''),
  searxngCategories: z.string().default('general'),
  searxngSafesearch: z.number().min(0).max(2).default(0),
  // ── Tavily ──
  tavilyApiKey: z.string().role('secret').default(''),
  tavilyApiKeyEnv: z.string().role('credential-ref').default('TAVILY_API_KEY'),
  tavilySearchDepth: z.string().default('basic'),
  // ── Serper（Google SERP）──
  serperApiKey: z.string().role('secret').default(''),
  serperApiKeyEnv: z.string().role('credential-ref').default('SERPER_API_KEY'),
  serperLanguage: z.string().default(''),
  // ── Brave Search ──
  braveApiKey: z.string().role('secret').default(''),
  braveApiKeyEnv: z.string().role('credential-ref').default('BRAVE_API_KEY'),
  braveCountry: z.string().default(''),
  braveSearchLang: z.string().default(''),
  // ── Bing Web Search ──
  bingApiKey: z.string().role('secret').default(''),
  bingApiKeyEnv: z.string().role('credential-ref').default('BING_SEARCH_API_KEY'),
  bingEndpoint: z.string().default('https://api.bing.microsoft.com/v7.0/search'),
  bingMarket: z.string().default('en-US'),
  // ── Google Custom Search ──
  googleApiKey: z.string().role('secret').default(''),
  googleApiKeyEnv: z.string().role('credential-ref').default('GOOGLE_CSE_API_KEY'),
  googleSearchEngineId: z.string().default(''),
  googleSearchEngineIdEnv: z.string().role('credential-ref').default('GOOGLE_CSE_ID'),
  googleLanguage: z.string().default(''),
})

// ─────────────────────────────────────────────────────────────────────────────
// 归一化类型（对齐官方 ctx.web search seam）
// ─────────────────────────────────────────────────────────────────────────────

interface SearchSource {
  url: string
  title?: string
  snippet?: string
  publishedAt?: string
}

interface SearchResult {
  sources: SearchSource[]
  content?: string
  truncated?: boolean
}

interface SearchRequest {
  query: string
  maxResults?: number
}

interface SearchProvider {
  id: string
  available(): boolean
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult>
}

interface WebFetchRequest {
  url: string
}

interface WebFetchBody {
  kind: 'text' | 'html'
  content: string
}

interface WebFetchResult {
  url: string
  statusCode: number
  body: WebFetchBody
  truncated: boolean
}

interface WebFetchProvider {
  id: string
  available(): boolean
  fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>
}

type AppContext = Context & {
  web: {
    registerSearchProvider(provider: SearchProvider): () => void
    registerFetchProvider(provider: WebFetchProvider): () => void
  }
}

/** 每个引擎一次操作所需的已解析配置快照。 */
interface Resolved {
  ctx: AppContext
  cfg: Config
}

// ─────────────────────────────────────────────────────────────────────────────
// 凭据解析：字面量 → credentials 服务 → 启动环境变量（对齐官方 web-search-deepseek）
// ─────────────────────────────────────────────────────────────────────────────

interface KeySpec {
  literal: string | undefined
  envRef: string
  envVar: string
}

async function resolveApiKey(ctx: AppContext, spec: KeySpec): Promise<string | undefined> {
  const literal = spec.literal ?? ''
  if (literal.length > 0) return literal
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    try {
      const resolved = await credentials.resolve(credentialRef(spec.envRef))
      if (resolved !== undefined && typeof resolved.value === 'string' && resolved.value.length > 0) {
        return resolved.value
      }
    } catch {
      /* 回落到启动环境 */
    }
  }
  const ambient = launchEnvironmentOf(ctx).get(spec.envVar)
  if (ambient !== undefined && ambient.value.length > 0) return ambient.value
  return undefined
}

function requireKey(providerLabel: string, value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new WebError(`${providerLabel}: 没有可用的 API key（在设置页填字面量、配置 credentials 引用，或导出对应环境变量）`, 'WEB_PROVIDER_CREDENTIAL_MISSING')
  }
  return value
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP 小工具 + 错误归一化（WEB_PROVIDER_ERROR / WEB_ABORTED）
// ─────────────────────────────────────────────────────────────────────────────

function parseHeaders(json?: string): Record<string, string> {
  if (json === undefined || json === '') return {}
  try {
    const o = JSON.parse(json)
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o as Record<string, string> : {}
  } catch { return {} }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(providerLabel: string, r: Resolved, url: string, init: RequestInit, signal?: AbortSignal): Promise<any> {
  const cfg = r.cfg
  const extra = parseHeaders(cfg.extraHeadersJson)
  const retries = Math.max(0, Number(cfg.retryCount) || 0)
  const backoff = Math.max(0, Number(cfg.retryBackoffMs) || 0)
  let lastError: unknown = undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && backoff > 0) await sleepMs(backoff * Math.pow(2, attempt - 1))
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...(asHeaders(init.headers)), ...extra },
        ...(signal !== undefined ? { signal } : {}),
      })
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const body: any = await res.json()
          const m = body?.errors?.[0]?.message ?? body?.error?.message ?? body?.error ?? body?.message
          if (typeof m === 'string' && m.length > 0) detail = m
        } catch { /* 保留 HTTP 状态 */ }
        throw new WebError(`${providerLabel} error: ${detail}`, 'WEB_PROVIDER_ERROR')
      }
      return await res.json() as any
    } catch (error) {
      if (signal?.aborted === true || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')) {
        throw new WebError(`${providerLabel} search aborted`, 'WEB_ABORTED', { cause: error })
      }
      // HTTP / 解析类错误不可重试（4xx/5xx 业务错误）；仅重试网络层失败（TypeError: fetch failed）
      if (error instanceof WebError) throw error
      lastError = error
      if (attempt >= retries) {
        throw new WebError(`${providerLabel} request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
      }
    }
  }
  throw new WebError(`${providerLabel} request failed: ${String(lastError)}`, 'WEB_PROVIDER_ERROR', { cause: lastError })
}

function asHeaders(h: any): Record<string, string> {
  if (h === undefined) return {}
  if (h instanceof Headers) {
    const out: Record<string, string> = {}
    h.forEach((v, k) => { out[k] = v })
    return out
  }
  return h as Record<string, string>
}

/** 按 url 去重，丢掉空 url。 */
function dedupe(sources: SearchSource[]): SearchSource[] {
  const seen = new Set<string>()
  const out: SearchSource[] = []
  for (const s of sources) {
    if (!s.url || s.url.length === 0) continue
    if (seen.has(s.url)) continue
    seen.add(s.url)
    out.push(s)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 六个引擎实现
// ─────────────────────────────────────────────────────────────────────────────

export async function searchSearxng(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { ctx, cfg } = r
  const base = cfg.searxngBaseURL.length > 0 ? cfg.searxngBaseURL : DEFAULT_SEARXNG_BASE_URL
  const url = new URL('/search', base)
  url.searchParams.set('q', req.query)
  url.searchParams.set('format', 'json')
  if (cfg.searxngLanguage.length > 0) url.searchParams.set('language', cfg.searxngLanguage)
  if (cfg.searxngCategories.length > 0) url.searchParams.set('categories', cfg.searxngCategories)
  url.searchParams.set('safesearch', String(cfg.searxngSafesearch))
  const data = await fetchJson('SearXNG', r, url.toString(), { headers: { accept: 'application/json' } }, signal)
  const raw = Array.isArray(data?.results) ? data.results : []
  return {
    sources: dedupe(raw.map((item: any): SearchSource => ({
      url: String(item?.url ?? '').trim(),
      ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
      ...(item?.content != null && String(item.content).length > 0 ? { snippet: String(item.content) } : {}),
      ...(item?.publishedDate != null && String(item.publishedDate).length > 0 ? { publishedAt: String(item.publishedDate) } : {}),
    }))),
  }
}

export async function searchTavily(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { ctx, cfg } = r
  const apiKey = requireKey('Tavily', await resolveApiKey(ctx, {
    literal: cfg.tavilyApiKey, envRef: cfg.tavilyApiKeyEnv, envVar: 'TAVILY_API_KEY',
  }))
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query: req.query,
    search_depth: cfg.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic',
    include_answer: true,
    max_results: req.maxResults ?? 8,
  }
  const data = await fetchJson('Tavily', r, r.cfg.tavilyEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, signal)
  const raw = Array.isArray(data?.results) ? data.results : []
  const answer = typeof data?.answer === 'string' && data.answer.length > 0 ? data.answer : undefined
  return {
    sources: dedupe(raw.map((item: any): SearchSource => ({
      url: String(item?.url ?? '').trim(),
      ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
      ...(item?.content != null && String(item.content).length > 0 ? { snippet: String(item.content) } : {}),
      ...(item?.published_date != null && String(item.published_date).length > 0 ? { publishedAt: String(item.published_date) } : {}),
    }))),
    ...(answer !== undefined ? { content: answer } : {}),
  }
}

export async function searchSerper(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { ctx, cfg } = r
  const apiKey = requireKey('Serper', await resolveApiKey(ctx, {
    literal: cfg.serperApiKey, envRef: cfg.serperApiKeyEnv, envVar: 'SERPER_API_KEY',
  }))
  const body: Record<string, unknown> = { q: req.query }
  if (cfg.serperLanguage.length > 0) body.gl = cfg.serperLanguage
  const data = await fetchJson('Serper', r, r.cfg.serperEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
  }, signal)
  const raw = Array.isArray(data?.organic) ? data.organic : []
  const answer = data?.answerBox?.answer ?? data?.knowledgeGraph?.description
  return {
    sources: dedupe(raw.map((item: any): SearchSource => ({
      url: String(item?.link ?? '').trim(),
      ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
      ...(item?.snippet != null && String(item.snippet).length > 0 ? { snippet: String(item.snippet) } : {}),
      ...(item?.date != null && String(item.date).length > 0 ? { publishedAt: String(item.date) } : {}),
    }))),
    ...(typeof answer === 'string' && answer.length > 0 ? { content: answer } : {}),
  }
}

export async function searchBrave(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { ctx, cfg } = r
  const apiKey = requireKey('Brave', await resolveApiKey(ctx, {
    literal: cfg.braveApiKey, envRef: cfg.braveApiKeyEnv, envVar: 'BRAVE_API_KEY',
  }))
  const url = new URL(r.cfg.braveEndpoint)
  url.searchParams.set('q', req.query)
  url.searchParams.set('count', String(req.maxResults ?? 8))
  if (cfg.braveCountry.length > 0) url.searchParams.set('country', cfg.braveCountry)
  if (cfg.braveSearchLang.length > 0) url.searchParams.set('search_lang', cfg.braveSearchLang)
  const data = await fetchJson('Brave', r, url.toString(), {
    headers: { accept: 'application/json', 'x-subscription-token': apiKey },
  }, signal)
  const raw = Array.isArray(data?.web?.results) ? data.web.results : []
  return {
    sources: dedupe(raw.map((item: any): SearchSource => ({
      url: String(item?.url ?? '').trim(),
      ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
      ...(item?.description != null && String(item.description).length > 0 ? { snippet: String(item.description) } : {}),
      ...(item?.page_age != null && String(item.page_age).length > 0 ? { publishedAt: String(item.page_age) } : {}),
    }))),
  }
}

export async function searchBing(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { ctx, cfg } = r
  const apiKey = requireKey('Bing', await resolveApiKey(ctx, {
    literal: cfg.bingApiKey, envRef: cfg.bingApiKeyEnv, envVar: 'BING_SEARCH_API_KEY',
  }))
  const url = new URL(cfg.bingEndpoint)
  url.searchParams.set('q', req.query)
  url.searchParams.set('mkt', cfg.bingMarket)
  url.searchParams.set('count', String(req.maxResults ?? 8))
  const data = await fetchJson('Bing', r, url.toString(), {
    headers: { accept: 'application/json', 'ocp-apim-subscription-key': apiKey },
  }, signal)
  const raw = Array.isArray(data?.webPages?.value) ? data.webPages.value : []
  return {
    sources: dedupe(raw.map((item: any): SearchSource => ({
      url: String(item?.url ?? '').trim(),
      ...(item?.name != null && String(item.name).length > 0 ? { title: String(item.name) } : {}),
      ...(item?.snippet != null && String(item.snippet).length > 0 ? { snippet: String(item.snippet) } : {}),
      ...(item?.datePublished != null && String(item.datePublished).length > 0 ? { publishedAt: String(item.datePublished) } : {}),
    }))),
  }
}

export async function searchGoogleCse(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { ctx, cfg } = r
  const apiKey = requireKey('Google CSE', await resolveApiKey(ctx, {
    literal: cfg.googleApiKey, envRef: cfg.googleApiKeyEnv, envVar: 'GOOGLE_CSE_API_KEY',
  }))
  const cx = await resolveApiKey(ctx, {
    literal: cfg.googleSearchEngineId, envRef: cfg.googleSearchEngineIdEnv, envVar: 'GOOGLE_CSE_ID',
  })
  if (cx === undefined || cx.length === 0) {
    throw new WebError('Google CSE: 需要配置 Search Engine ID (cx)', 'WEB_PROVIDER_CREDENTIAL_MISSING')
  }
  const url = new URL(r.cfg.googleEndpoint)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('cx', cx)
  url.searchParams.set('q', req.query)
  url.searchParams.set('alt', 'json')
  url.searchParams.set('num', String(Math.min(req.maxResults ?? 8, 10)))
  if (cfg.googleLanguage.length > 0) url.searchParams.set('lr', cfg.googleLanguage)
  const data = await fetchJson('Google CSE', r, url.toString(), {}, signal)
  const raw = Array.isArray(data?.items) ? data.items : []
  return {
    sources: dedupe(raw.map((item: any): SearchSource => {
      const meta = item?.pagemap?.metatags?.[0] ?? {}
      const pub = meta['article:published_time'] ?? item?.pagemap?.newsarticle?.[0]?.datepublished
      return {
        url: String(item?.link ?? '').trim(),
        ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
        ...(item?.snippet != null && String(item.snippet).length > 0 ? { snippet: String(item.snippet) } : {}),
        ...(pub != null && String(pub).length > 0 ? { publishedAt: String(pub) } : {}),
      }
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 门面 provider：available() + 内部路由
// ─────────────────────────────────────────────────────────────────────────────

const ENGINES: Record<string, (r: Resolved, req: SearchRequest, signal?: AbortSignal) => Promise<SearchResult>> = {
  searxng: searchSearxng,
  tavily: searchTavily,
  serper: searchSerper,
  brave: searchBrave,
  bing: searchBing,
  'google-cse': searchGoogleCse,
}

const ENGINE_IDS: Array<keyof typeof ENGINES> = Object.keys(ENGINES) as Array<keyof typeof ENGINES>

/** 清洗并截断 snippet：去 HTML 标签、折叠空白、限制长度。 */
export function cleanSnippet(text: string | undefined, max: number): string | undefined {
  if (text === undefined) return undefined
  let sn = String(text)
  sn = sn.replace(/<[^>]+>/g, ' ')
  sn = sn.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
  sn = sn.replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  sn = sn.split(' | ').join(' ').replace(/(\|\s*---+\s*)+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (sn.length > max) sn = sn.slice(0, max - 1).trimEnd() + '…'
  return sn.length > 0 ? sn : undefined
}

/** 取 URL 的根域名（去 www.）。 */
function domainOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return url.toLowerCase()
  }
}

/** 每个域名最多保留 limit 条（0=不限制）。 */
function dedupeByDomain<T extends SearchSource>(sources: T[], limit: number): T[] {
  if (limit <= 0) return sources
  const seen = new Map<string, number>()
  const out: T[] = []
  for (const src of sources) {
    const d = domainOf(src.url)
    const c = seen.get(d) ?? 0
    if (c >= limit) continue
    seen.set(d, c + 1)
    out.push(src)
  }
  return out
}

function queryTokens(query: string): string[] {
  return (query || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(Boolean)
}

function relevanceScore(src: SearchSource, tokens: string[]): number {
  const t = (src.title ?? '').toLowerCase()
  const sn = (src.snippet ?? '').toLowerCase()
  let score = 0
  for (const tok of tokens) {
    if (t.includes(tok)) score += 2
    if (sn.includes(tok)) score += 1
  }
  return score
}

/** 按查询词与标题/摘要的相关度降序排序（稳定：同分保持原序）。 */
function sortByRelevance(sources: SearchSource[], query: string): SearchSource[] {
  const tokens = queryTokens(query)
  return [...sources].sort((a, b) => relevanceScore(b, tokens) - relevanceScore(a, tokens))
}

/** 简单 TTL 内存缓存（省 key 额度，避免重复请求）。 */
const cacheStore = new Map<string, { at: number; result: SearchResult }>()

function cacheKeyOf(cfg: Config, query: string, maxResults: number): string {
  return [cfg.provider, cfg.mergeResults ? 'm' : 'f', (cfg.fallbackProviders ?? []).join(','),
    String(cfg.maxProviderQueries), query, String(maxResults)].join('|')
}

function cacheGet(key: string, ttlMs: number): SearchResult | undefined {
  const entry = cacheStore.get(key)
  if (entry === undefined) return undefined
  if (Date.now() - entry.at > ttlMs) { cacheStore.delete(key); return undefined }
  return entry.result
}

function cacheSet(key: string, result: SearchResult, ttlMs: number): void {
  if (cacheStore.size > 500) {
    const now = Date.now()
    for (const [k, v] of [...cacheStore]) { if (now - v.at > ttlMs) cacheStore.delete(k) }
  }
  cacheStore.set(key, { at: Date.now(), result })
}

/** 同步判断某 provider 是否“可用”（key 是否已配）。searxng 恒可用。 */
function hasConfiguredKey(cfg: Config, id: string): boolean {
  switch (id) {
    case 'searxng': return true
    case 'tavily': return (cfg.tavilyApiKey ?? '').length > 0 || !!process.env[cfg.tavilyApiKeyEnv || 'TAVILY_API_KEY']
    case 'serper': return (cfg.serperApiKey ?? '').length > 0 || !!process.env[cfg.serperApiKeyEnv || 'SERPER_API_KEY']
    case 'brave': return (cfg.braveApiKey ?? '').length > 0 || !!process.env[cfg.braveApiKeyEnv || 'BRAVE_API_KEY']
    case 'bing': return (cfg.bingApiKey ?? '').length > 0 || !!process.env[cfg.bingApiKeyEnv || 'BING_SEARCH_API_KEY']
    case 'google-cse': return ((cfg.googleApiKey ?? '').length > 0 && (cfg.googleSearchEngineId ?? '').length > 0)
      || (!!process.env[cfg.googleApiKeyEnv || 'GOOGLE_CSE_API_KEY'] && !!process.env[cfg.googleSearchEngineIdEnv || 'GOOGLE_CSE_ID'])
    default: return false
  }
}

/** 内置引擎的展示名（对外暴露给第三方作者参考）。 */
export const BUILTIN_LABELS: Record<string, string> = {
  searxng: 'SearXNG', tavily: 'Tavily', serper: 'Serper', brave: 'Brave', bing: 'Bing', 'google-cse': 'Google CSE',
}

/** 归一化的一条搜索结果（供自定义源返回）。 */
export interface SearchSourceItem {
  url: string
  title?: string
  snippet?: string
  publishedAt?: string
}

/**
* 开放注册用的搜索源适配器。任何 Cordis 插件都可把它 register 进
* `web-search-thirdparty` 服务，从而给本插件添加自定义搜索源。
*/
export interface SearchSourceAdapter {
  /** 唯一 id（不能与已有源重复）。 */
  id: string
  /** 展示名。 */
  label: string
  /** 可选：当前 config 下是否可用（缺省视为可用）。 */
  available?(config: Record<string, unknown>): boolean
  /** 执行一次搜索，返回归一化结果。 */
  search(
    input: { query: string; maxResults?: number; config: Record<string, unknown> },
    signal?: AbortSignal,
  ): Promise<{ sources: SearchSourceItem[]; content?: string }>
}

/** 本插件的开放注册表服务（其它插件 inject: [PROVIDER_SERVICE_ID]）。 */
export class ProviderRegistry extends Service {
  readonly sources = new Map<string, SearchSourceAdapter>()
  constructor(ctx: Context) { super(ctx, PROVIDER_SERVICE_ID) }

  register(adapter: SearchSourceAdapter): () => void {
    if (this.sources.has(adapter.id)) {
      throw new WebError('search source "' + adapter.id + '" is already registered', 'WEB_DUPLICATE_PROVIDER')
    }
    return this.ctx.effect(() => {
      this.sources.set(adapter.id, adapter)
      return () => { this.sources.delete(adapter.id) }
    }, 'web-search-thirdparty: register ' + adapter.id)
  }

  list(): string[] { return [...this.sources.keys()] }
}

/** 把内置引擎包装成统一 adapter（内部用）。 */
function builtinAdapter(ctx: AppContext, id: keyof typeof ENGINES, label: string): SearchSourceAdapter {
  const fn = ENGINES[id]
  return {
    id: String(id),
    label,
    available: (config) => hasConfiguredKey(config as unknown as Config, String(id)),
    search: async ({ query, maxResults, config }, signal) =>
      fn({ ctx, cfg: config as unknown as Config }, { query, maxResults }, signal),
  }
}

/** 构造要尝试的 provider 链：[主源, 其余可用源]，按注册表顺序，去重。 */
export function buildProviderChain(cfg: Config, registry: ProviderRegistry): string[] {
  const chain: string[] = []
  const pushUnique = (id: string) => { if (!chain.includes(id)) chain.push(id) }
  pushUnique(cfg.provider)
  for (const id of cfg.fallbackProviders ?? []) pushUnique(id)
  for (const [id, adapter] of [...registry.sources.entries()].sort()) {
    if (chain.includes(id)) continue
    if (adapter.available?.(cfg as unknown as Record<string, unknown>) ?? true) pushUnique(id)
  }
  return chain
}

export class ThirdPartySearchProvider implements SearchProvider {
  readonly id = PROVIDER_ID
  constructor(private readonly resolveOptions: () => Resolved) {}

  available(): boolean {
    const r = this.resolveOptions()
    const registry = r.ctx.get(PROVIDER_SERVICE_ID) as ProviderRegistry | undefined
    return registry !== undefined && registry.sources.has(r.cfg.provider)
  }

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
    const r = this.resolveOptions()
    const registry = r.ctx.get(PROVIDER_SERVICE_ID) as ProviderRegistry | undefined
    if (registry === undefined) {
      throw new WebError('web-search-thirdparty 注册表服务不可用', 'WEB_PLUGIN_ERROR')
    }
    const primary = r.cfg.provider
    if (!registry.sources.has(primary)) {
      throw new WebError(
        'web-search-thirdparty: 未注册的搜索源 "' + primary + '"（已注册: ' + registry.list().join(', ') + '）',
        'WEB_PROVIDER_CONFIGURED_UNAVAILABLE',
      )
    }
    const maxResults = Math.min(request.maxResults ?? r.cfg.maxResults, r.cfg.maxResults)
    const cacheKey = cacheKeyOf(r.cfg, request.query, maxResults)
    if (r.cfg.cacheEnabled && signal?.aborted !== true) {
      const hit = cacheGet(cacheKey, r.cfg.cacheTtlMs)
      if (hit !== undefined) return hit
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('search timeout after ' + r.cfg.timeoutMs + 'ms')), r.cfg.timeoutMs)
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      const chain = buildProviderChain(r.cfg, registry as ProviderRegistry)
      const targets = r.cfg.mergeResults ? chain.slice(0, Math.max(1, r.cfg.maxProviderQueries)) : chain
      const sources: SearchSource[] = []
      const seen = new Set<string>()
      let content: string | undefined
      const failures: string[] = []

      for (const id of targets) {
        const adapter = registry.sources.get(id)
        if (adapter === undefined) continue
        try {
          const result = await adapter.search(
            { query: request.query, maxResults, config: r.cfg as unknown as Record<string, unknown> },
            controller.signal,
          )
          for (const src of result.sources) {
            if (!src.url || seen.has(src.url)) continue
            seen.add(src.url)
            sources.push({ ...src })
          }
          if (content === undefined && result.content !== undefined) content = result.content
          if (!r.cfg.mergeResults && sources.length > 0) break
        } catch (error) {
          failures.push(id + ':' + (error instanceof Error ? error.message : String(error)))
        }
      }

      if (sources.length === 0 && failures.length > 0) {
        throw new WebError('web-search-thirdparty: 所有可用搜索源均失败 — ' + failures[0], 'WEB_PROVIDER_ERROR')
      }

      let cleaned = sources.slice(0, maxResults).map((src) => ({
        ...src,
        ...(src.snippet !== undefined ? { snippet: cleanSnippet(src.snippet, r.cfg.snippetMaxLength) } : {}),
      }))
      // 域名去重 + 相关度排序
      cleaned = dedupeByDomain(cleaned, r.cfg.maxPerDomain)
      if (r.cfg.relevanceSort) cleaned = sortByRelevance(cleaned, request.query)

      const result: SearchResult = {
        sources: cleaned,
        ...(content !== undefined ? { content } : {}),
        truncated: false,
      }
      if (r.cfg.cacheEnabled) cacheSet(cacheKey, result, r.cfg.cacheTtlMs)
      return result
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

function resolveOptions(ctx: AppContext, cfg: Config): Resolved {
  return { ctx, cfg }
}

// ─────────────────────────────────────────────────────────────────────────────
// 测试连接 REST 路由（POST /api/web-search-thirdparty/test）
// 输入：{ provider, key?, url?, cx?, maxResults? } —— 不用先保存，按表单当前值试搜。
// ─────────────────────────────────────────────────────────────────────────────

function sendJson(res: any, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 1_000_000) {
        reject(new Error('request body too large'))
        req.destroy?.()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  })
}

/** 用当前配置 + 表单传入值，组装一次测试搜索用 config。 */
function cfgFromTestBody(cfg: Config, body: any): Config {
  const next: Config = { ...cfg }
  const provider = typeof body?.provider === 'string' ? body.provider : cfg.provider
  next.provider = provider
  const max = Number(body?.maxResults)
  if (Number.isInteger(max) && max > 0) next.maxResults = Math.min(max, 20)
  const key = typeof body?.key === 'string' ? body.key : ''
  const url = typeof body?.url === 'string' ? body.url : ''
  const cx = typeof body?.cx === 'string' ? body.cx : ''
  if (provider === 'searxng' && url.length > 0) next.searxngBaseURL = url
  if (provider === 'tavily' && key.length > 0) next.tavilyApiKey = key
  if (provider === 'serper' && key.length > 0) next.serperApiKey = key
  if (provider === 'brave' && key.length > 0) next.braveApiKey = key
  if (provider === 'bing' && key.length > 0) next.bingApiKey = key
  if (provider === 'google-cse') {
    if (key.length > 0) next.googleApiKey = key
    if (cx.length > 0) next.googleSearchEngineId = cx
  }
  return next
}

function registerTestRoute(ctx: AppContext, current: () => Config): void {
  ctx.inject(['webServer'], (webCtx: any) => {
    webCtx.effect(() => {
      const handler = async (req: any, res: any): Promise<void> => {
        if ((req.method ?? '') !== 'POST') {
          sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'POST only' } })
          return
        }
        let body: any
        try {
          body = await readJsonBody(req)
        } catch {
          sendJson(res, 400, { ok: false, error: { code: 'bad-json', message: 'invalid JSON body' } })
          return
        }
        const provider = String(body?.provider ?? '')
        const engine = ENGINES[provider]
        if (engine === undefined) {
          sendJson(res, 200, { ok: false, message: '未知供应商: ' + provider })
          return
        }
        const r: Resolved = { ctx, cfg: cfgFromTestBody(current(), body) }
        const started = Date.now()
        try {
          const result = await engine(r, { query: 'test', maxResults: 1 }, undefined)
          const latencyMs = Date.now() - started
          const first = result.sources[0]
          sendJson(res, 200, {
            ok: true,
            provider,
            latencyMs,
            sources: result.sources.length,
            sample: (first !== undefined
              ? { title: first.title ?? null, url: first.url }
              : null),
          })
        } catch (error) {
          sendJson(res, 200, {
            ok: false,
            provider,
            latencyMs: Date.now() - started,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
      const dispose = webCtx.webServer.register({ kind: 'exact', path: '/api/web-search-thirdparty/test', handler })
      return () => { dispose?.() }
    }, 'web-search-thirdparty: test route')
  })
}

/** 简易抓取 provider：取正文文本并截断，供官方 web_fetch 工具使用。 */
export class LocalFetchProvider implements WebFetchProvider {
  readonly id = FETCH_PROVIDER_ID
  constructor(private readonly resolveOptions: () => Resolved) {}

  available(): boolean {
    return true
  }

  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      throw new WebError(`invalid URL: ${request.url}`, 'WEB_FETCH_INVALID_URL')
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new WebError(`unsupported protocol "${url.protocol}" — only http(s) allowed`, 'WEB_PROVIDER_ERROR')
    }
    const r = this.resolveOptions()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error(`web fetch timeout after ${r.cfg.fetchTimeoutMs}ms`)), r.cfg.fetchTimeoutMs)
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'user-agent': r.cfg.fetchUserAgent, 'accept': 'text/html,text/*;q=0.9,application/json;q=0.8' },
      })
      const text = await res.text()
      const truncated = text.length > r.cfg.fetchMaxBodyChars
      const content = truncated ? text.slice(0, r.cfg.fetchMaxBodyChars) : text
      return {
        url: url.toString(),
        statusCode: res.status,
        body: { kind: 'text', content },
        truncated,
      }
    } catch (error) {
      if (signal?.aborted === true || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')) {
        throw new WebError('web fetch aborted', 'WEB_ABORTED', { cause: error })
      }
      if (error instanceof WebError) throw error
      throw new WebError('web fetch failed: ' + String(error), 'WEB_PROVIDER_ERROR', { cause: error })
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 插件入口：注册 settings 分区 + 注册 provider + 测试路由
// ─────────────────────────────────────────────────────────────────────────────

export function apply(ctx: AppContext, config: Config): void {
  let current = () => config
  installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => { current = source },
    onChange: () => {},
  })
  // 开放注册表服务：提供在 ctx 上，其它插件可注入注册自定义搜索源。
  const registry = new ProviderRegistry(ctx)
  for (const id of ENGINE_IDS) {
    registry.register(builtinAdapter(ctx, id, BUILTIN_LABELS[String(id)] ?? String(id)))
  }
  ctx.web.registerSearchProvider(new ThirdPartySearchProvider(() => resolveOptions(ctx, current())))
  ctx.web.registerFetchProvider(new LocalFetchProvider(() => resolveOptions(ctx, current())))
  registerTestRoute(ctx, current)
  ctx.logger?.info?.('[web-search-thirdparty] 第三方搜索 provider 已注册（id=' + PROVIDER_ID + '，源码数 ' + registry.list().join(',') + '）')
}
