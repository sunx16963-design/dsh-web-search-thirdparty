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
 *
 * 模块划分：config（配置）/ engine-spec（引擎单表）/ text + html（纯函数）/
 * net（SSRF 与重定向）/ state（缓存·熔断·统计）/ settings-compat（设置分区两代 API）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { WebError } from '@deepseek-ai/dsh-web'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { ENGINE_SPECS, getEngineSpec, engineInputs } from './engine-spec.js'
import type { EngineSpec } from './engine-spec.js'
import { Config, DEFAULT_SEARXNG_BASE_URL } from './config.js'
import type { AppContext, KeySpec, Resolved, SearchProvider, SearchRequest, SearchResult, SearchSource, WebFetchProvider, WebFetchRequest, WebFetchResult } from './types.js'
import { cleanSnippet, dedupe, dedupeByDomain, normalizePublishedAt, sortByRelevance, toSource } from './text.js'
import { htmlToMarkdown } from './html.js'
import { assertPublicUrl, fetchManualRedirects } from './net.js'
import {
  cacheGetOrCompute, cacheKeyOf, circuitMarkFailure, circuitMarkSuccess, circuitOpen,
  getCacheStats, getCircuitStates, getSearchStats, recordStat, resetRuntimeState, resetSearchStats,
  runWithConcurrency,
} from './state.js'
import { installSettingsSectionCompat } from './settings-compat.js'

// 对外重导出：保持历史导出面（第三方按需引用 / 测试引用），实现已迁到独立模块。
export { Config, DEFAULT_SEARXNG_BASE_URL } from './config.js'
export {
  cleanSnippet, dedupe, dedupeByDomain, domainOf, normalizePublishedAt, queryTokens,
  sortByRelevance, toSource,
} from './text.js'
export { decodeEntities, htmlToMarkdown, stripInlineTags, NAMED_ENTITIES } from './html.js'
export { assertPublicUrl, fetchManualRedirects, isPrivateIp, isPrivateName, MAX_REDIRECT_HOPS, stripHostBrackets } from './net.js'
export {
  activeEndpointsOf, cacheKeyOf, getCacheStats, getCircuitStates, getSearchStats,
  resetCacheStats, resetRuntimeState, resetSearchStats,
} from './state.js'
export type { AppContext, Resolved, SearchRequest, SearchResult, SearchSource, WebFetchRequest, WebFetchResult } from './types.js'

/** Stable provider id registered on `ctx.web` (must match cordis.patch.yml `web.searchProvider`). */
export const PROVIDER_ID = 'web-search-thirdparty'
export const FETCH_PROVIDER_ID = 'web-search-thirdparty-fetch'
export const PROVIDER_SERVICE_ID = 'web-search-thirdparty'
/** 插件名（loader row id 用短名，与官方 web-search-deepseek 同风格）。 */
export const name = 'web-search-thirdparty'
/** 注册进哪个服务缝。 */
export const inject = ['web']

/** Settings 分区名（在 DSH 设置页自动渲染一节 UI）。 */
const SETTINGS_NAMESPACE = 'dsh-web-search-thirdparty'

// ─────────────────────────────────────────────────────────────────────────────
// 凭据解析：字面量 → credentials 服务 → 启动环境变量（对齐官方 web-search-deepseek）
// ─────────────────────────────────────────────────────────────────────────────

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
  try {
    const ambient = launchEnvironmentOf(ctx).get(spec.envVar)
    if (ambient !== undefined && ambient.value.length > 0) return ambient.value
  } catch {
    /* 启动环境不可用时按未配置处理 */
  }
  return undefined
}

/** 按引擎 spec 解析全部凭据输入行（任一缺失即抛 WEB_PROVIDER_CREDENTIAL_MISSING）。 */
async function resolveEngineKeys(r: Resolved, id: string): Promise<string[]> {
  const spec = getEngineSpec(id)
  if (spec === undefined) throw new WebError('未知引擎: ' + id, 'WEB_PROVIDER_ERROR')
  const bag = r.cfg as unknown as Record<string, string | undefined>
  const keys: string[] = []
  for (const input of engineInputs(spec)) {
    if (input.envRefKey === undefined || input.envVar === undefined) continue // 非凭据输入
    const key = await resolveApiKey(r.ctx, {
      literal: bag[input.configKey],
      envRef: bag[input.envRefKey] || input.envVar,
      envVar: input.envVar,
    })
    keys.push(requireKey(spec.label, key, input.testBodyField === 'cx' ? 'Search Engine ID (cx)' : 'API key'))
  }
  return keys
}

function requireKey(providerLabel: string, value: string | undefined, what = 'API key'): string {
  if (value === undefined || value.length === 0) {
    throw new WebError(`${providerLabel}: 没有可用的 ${what}（在设置页填字面量、配置 credentials 引用，或导出对应环境变量）`, 'WEB_PROVIDER_CREDENTIAL_MISSING')
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

/** 从错误响应里提取人类可读的 detail（保留 HTTP 状态码兜底）。 */
async function httpErrorDetail(res: any): Promise<string> {
  try {
    const raw = await res.text()
    try {
      const body: any = JSON.parse(raw)
      const m = body?.errors?.[0]?.message ?? body?.error?.message ?? body?.error ?? body?.message
      if (typeof m === 'string' && m.length > 0) return `${m} (HTTP ${res.status})`
    } catch { /* 非 JSON 响应体 */ }
  } catch { /* 响应体读取失败 */ }
  return `HTTP ${res.status}`
}

async function fetchJson(providerLabel: string, r: Resolved, url: string, init: RequestInit, signal?: AbortSignal): Promise<any> {
  const cfg = r.cfg
  const extra = parseHeaders(cfg.extraHeadersJson)
  const retries = Math.max(0, Number(cfg.retryCount) || 0)
  const backoff = Math.max(0, Number(cfg.retryBackoffMs) || 0)
  let lastDetail = ''
  let sleptRetryAfter = false
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && backoff > 0 && !sleptRetryAfter) {
      // 指数退避 + 随机抖动（上限 10s），避免同刻重试踩踏
      const jitter = 0.5 + Math.random() * 0.5
      await sleepMs(Math.min(backoff * Math.pow(2, attempt - 1) * jitter, 10000))
    }
    sleptRetryAfter = false
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...(asHeaders(init.headers)), ...extra },
        ...(signal !== undefined ? { signal } : {}),
      })
      if (!res.ok) {
        lastDetail = await httpErrorDetail(res)
        // 仅瞬态状态可重试（429 / 5xx）；其余 4xx 业务错误立即失败
        const transient = res.status === 429 || res.status >= 500
        if (!transient || attempt >= retries) {
          throw new WebError(`${providerLabel} error: ${lastDetail}`, 'WEB_PROVIDER_ERROR')
        }
        // 尊重 Retry-After（上限 10s，避免长阻塞）；已等过就跳过下一轮退避，避免双重等待
        const retryAfter = Number(res.headers.get('retry-after'))
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          sleptRetryAfter = true
          await sleepMs(Math.min(retryAfter * 1000, 10000))
        }
        try { await res.arrayBuffer() } catch { /* 连接释放失败不阻塞重试 */ }
        continue
      }
      try {
        return await res.json() as any
      } catch (parseError) {
        // 非 JSON 响应不是瞬态故障：重试只会浪费配额，直接给出可诊断的错误
        throw new WebError(`${providerLabel} error: 响应不是合法 JSON (HTTP ${res.status})`, 'WEB_PROVIDER_ERROR', { cause: parseError })
      }
    } catch (error) {
      if (signal?.aborted === true || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')) {
        throw new WebError(`${providerLabel} search aborted`, 'WEB_ABORTED', { cause: error })
      }
      // 业务错误直接上抛；仅网络层失败（TypeError: fetch failed 等）参与退避重试
      if (error instanceof WebError) throw error
      lastDetail = String(error)
      if (attempt >= retries) {
        throw new WebError(`${providerLabel} request failed: ${lastDetail}`, 'WEB_PROVIDER_ERROR', { cause: error })
      }
    }
  }
  throw new WebError(`${providerLabel} request failed: ${lastDetail}`, 'WEB_PROVIDER_ERROR')
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
// ─────────────────────────────────────────────────────────────────────────────
// 六个引擎实现
// ─────────────────────────────────────────────────────────────────────────────

export async function searchSearxng(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { cfg } = r
  const base = cfg.searxngBaseURL.length > 0 ? cfg.searxngBaseURL : DEFAULT_SEARXNG_BASE_URL
  const url = new URL('/search', base)
  url.searchParams.set('q', req.query)
  url.searchParams.set('format', 'json')
  if (cfg.searxngLanguage.length > 0) url.searchParams.set('language', cfg.searxngLanguage)
  if (cfg.searxngCategories.length > 0) url.searchParams.set('categories', cfg.searxngCategories)
  url.searchParams.set('safesearch', String(cfg.searxngSafesearch))
  let data: any
  try {
    data = await fetchJson('SearXNG', r, url.toString(), { headers: { accept: 'application/json' } }, signal)
  } catch (error) {
    // 公共实例普遍禁用 format=json 或有 bot 检测：403 时给出可操作的提示而不是裸状态码
    if (error instanceof WebError && /\b403\b/.test(error.message)) {
      throw new WebError(
        'SearXNG error: HTTP 403 — 该实例可能未启用 JSON 输出（自建实例需在 settings.yml 的 search.formats 中加入 json），或触发了 bot 检测。建议自建 SearXNG 并配置 searxngBaseURL',
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }
    throw error
  }
  const raw = Array.isArray(data?.results) ? data.results : []
  return {
    sources: dedupe(raw.map((item: any): SearchSource =>
      toSource(item?.url, item?.title, item?.content, item?.publishedDate))),
  }
}

export async function searchTavily(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { cfg } = r
  const [apiKey] = await resolveEngineKeys(r, 'tavily')
  const body: Record<string, unknown> = {
    query: req.query,
    search_depth: cfg.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic',
    include_answer: true,
    max_results: req.maxResults ?? 8,
  }
  const data = await fetchJson('Tavily', r, r.cfg.tavilyEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }, signal)
  const raw = Array.isArray(data?.results) ? data.results : []
  const answer = typeof data?.answer === 'string' && data.answer.length > 0 ? data.answer : undefined
  return {
    sources: dedupe(raw.map((item: any): SearchSource =>
      toSource(item?.url, item?.title, item?.content, item?.published_date))),
    ...(answer !== undefined ? { content: answer } : {}),
  }
}

export async function searchSerper(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { cfg } = r
  const [apiKey] = await resolveEngineKeys(r, 'serper')
  const body: Record<string, unknown> = { q: req.query, num: req.maxResults ?? 8 }
  if (cfg.serperLanguage.length > 0) body.gl = cfg.serperLanguage
  const data = await fetchJson('Serper', r, r.cfg.serperEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
  }, signal)
  const raw = Array.isArray(data?.organic) ? data.organic : []
  const answer = data?.answerBox?.answer ?? data?.knowledgeGraph?.description
  return {
    sources: dedupe(raw.map((item: any): SearchSource =>
      toSource(item?.link, item?.title, item?.snippet, item?.date))),
    ...(typeof answer === 'string' && answer.length > 0 ? { content: answer } : {}),
  }
}

export async function searchBrave(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { cfg } = r
  const [apiKey] = await resolveEngineKeys(r, 'brave')
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
    // page_age 通常已是 ISO，但仍走 normalizePublishedAt 统一校验：
    // 解析不了的值（相对时间/异常格式）按契约丢弃，而不是把非 ISO 值透传给 seam。
    sources: dedupe(raw.map((item: any): SearchSource =>
      toSource(item?.url, item?.title, item?.description, item?.page_age))),
  }
}

export async function searchBing(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { cfg } = r
  const [apiKey] = await resolveEngineKeys(r, 'bing')
  const url = new URL(cfg.bingEndpoint)
  url.searchParams.set('q', req.query)
  url.searchParams.set('mkt', cfg.bingMarket)
  url.searchParams.set('count', String(req.maxResults ?? 8))
  const data = await fetchJson('Bing', r, url.toString(), {
    headers: { accept: 'application/json', 'ocp-apim-subscription-key': apiKey },
  }, signal)
  const raw = Array.isArray(data?.webPages?.value) ? data.webPages.value : []
  return {
    sources: dedupe(raw.map((item: any): SearchSource =>
      toSource(item?.url, item?.name, item?.snippet, item?.datePublished))),
  }
}

export async function searchGoogleCse(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
  const { cfg } = r
  const [apiKey, cx] = await resolveEngineKeys(r, 'google-cse')
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
      const pub = normalizePublishedAt(meta['article:published_time'] ?? item?.pagemap?.newsarticle?.[0]?.datepublished)
      return {
        url: String(item?.link ?? '').trim(),
        ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
        ...(item?.snippet != null && String(item.snippet).length > 0 ? { snippet: String(item.snippet) } : {}),
        ...(pub !== undefined ? { publishedAt: pub } : {}),
      }
    })),
  }
}
// ─────────────────────────────────────────────────────────────────────────────
// 门面 provider：available() + 内部路由
// ─────────────────────────────────────────────────────────────────────────────

/** 内置引擎实现表（id 与 ENGINE_SPECS 一一对应；完整性由 tests/engine-spec.test.ts 校验）。 */
export const ENGINES: Record<string, (r: Resolved, req: SearchRequest, signal?: AbortSignal) => Promise<SearchResult>> = {
  searxng: searchSearxng,
  tavily: searchTavily,
  serper: searchSerper,
  brave: searchBrave,
  bing: searchBing,
  'google-cse': searchGoogleCse,
}

/** 异步判断某内置源是否“可用”：字面量 → credentials 服务 → 启动环境，与真实搜索同一解析链。
 *  由 ENGINE_SPECS 的凭据输入行驱动（不带凭据的引擎如 searxng 恒可用）；
 *  未知的自定义源 id 默认视为可用。 */
export async function builtinKeyAvailable(ctx: AppContext, cfg: Config, id: string): Promise<boolean> {
  const spec = getEngineSpec(id)
  if (spec === undefined) return true
  const bag = cfg as unknown as Record<string, string | undefined>
  for (const input of engineInputs(spec)) {
    if (input.envRefKey === undefined || input.envVar === undefined) continue // 非凭据输入
    const key = await resolveApiKey(ctx, {
      literal: bag[input.configKey],
      envRef: bag[input.envRefKey] || input.envVar,
      envVar: input.envVar,
    })
    if (key === undefined || key.length === 0) return false
  }
  return true
}

/** 内置引擎的展示名（由 ENGINE_SPECS 派生，对外暴露给第三方作者参考）。 */
export const BUILTIN_LABELS: Record<string, string> =
  Object.fromEntries(ENGINE_SPECS.map((s) => [s.id, s.label]))

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

  register(adapter: SearchSourceAdapter, internal = false): () => void {
    // 内置引擎 id 属于本插件保留命名空间：第三方源不得静默覆盖内置实现
    if (!internal && getEngineSpec(adapter.id) !== undefined) {
      this.ctx.logger?.warn?.('[web-search-thirdparty] "' + adapter.id + '" 是内置引擎 id，第三方注册被忽略（请换一个 id）')
      return () => {}
    }
    if (this.sources.has(adapter.id)) {
      // 热重载场景下第三方插件会重复注册同一 id：警告并替换，不再抛错炸掉对方插件
      this.ctx.logger?.warn?.('[web-search-thirdparty] search source "' + adapter.id + '" 已注册，将被替换（热重载）')
    }
    return this.ctx.effect(() => {
      this.sources.set(adapter.id, adapter)
      return () => { this.sources.delete(adapter.id) }
    }, 'web-search-thirdparty: register ' + adapter.id)
  }

  list(): string[] { return [...this.sources.keys()] }
}

/** 把内置引擎包装成统一 adapter（内部用；可用性由 buildProviderChain 走 credentials-aware 探测）。 */
export function builtinAdapter(ctx: AppContext, spec: EngineSpec): SearchSourceAdapter {
  const fn = ENGINES[spec.id]
  return {
    id: spec.id,
    label: spec.label,
    search: async ({ query, maxResults, config }, signal) =>
      fn({ ctx, cfg: config as unknown as Config }, { query, maxResults }, signal),
  }
}

/** 构造要尝试的 provider 链：[主源, 显式 fallback, 其余可用源]，按注册表顺序，去重。
 *  内置源的可用性与真实搜索走同一套凭据解析（credentials 服务里的 key 也算已配置）；
 *  ctx 省略时退化为 adapter.available / 默认可用。 */
export async function buildProviderChain(cfg: Config, registry: ProviderRegistry, ctx?: AppContext): Promise<string[]> {
  const chain: string[] = []
  const pushUnique = (id: string) => { if (!chain.includes(id)) chain.push(id) }
  pushUnique(cfg.provider)
  for (const id of cfg.fallbackProviders ?? []) pushUnique(id)
  for (const [id, adapter] of [...registry.sources.entries()].sort()) {
    if (chain.includes(id)) continue
    if (adapter.available !== undefined) {
      if (!adapter.available(cfg as unknown as Record<string, unknown>)) continue
    } else if (ctx !== undefined && !(await builtinKeyAvailable(ctx, cfg, id))) {
      continue
    }
    pushUnique(id)
  }
  return chain
}

/** 把 controller 的中止原因包装成 WEB_ABORTED（超时 / 用户取消共用）。 */
function abortErrorOf(controller: AbortController): WebError {
  const reason: unknown = controller.signal.reason
  const detail = reason instanceof Error
    ? reason.message
    : (typeof reason === 'string' && reason.length > 0 ? reason : 'search aborted')
  return new WebError('web-search-thirdparty: ' + detail, 'WEB_ABORTED')
}

/**
 * 同步可判定性：字面量 → 启动环境变量。credentials 服务里的 key 只能异步解析，
 * 同步没看到时保持乐观（true），由 refreshAvailability() 的探测结果修正。
 */
export function syncKeyAvailable(ctx: AppContext, cfg: Config, id: string): boolean {
  const spec = getEngineSpec(id)
  if (spec === undefined) return true // 自定义源：交给 adapter.available
  const bag = cfg as unknown as Record<string, string | undefined>
  let hasCredentialsService = false
  try { hasCredentialsService = ctx.get('credentials') !== undefined } catch { hasCredentialsService = false }
  for (const input of engineInputs(spec)) {
    if (input.envRefKey === undefined || input.envVar === undefined) continue // 非凭据输入
    if ((bag[input.configKey] ?? '').length > 0) continue // 字面量已配置
    let ambient = ''
    try { ambient = launchEnvironmentOf(ctx).get(bag[input.envRefKey] || input.envVar)?.value ?? '' } catch { ambient = '' }
    if (ambient.length > 0) continue
    // credentials 服务在场时异步凭据可能提供该 key：保持乐观，交给探测修正
    if (hasCredentialsService) continue
    return false
  }
  return true
}

export class ThirdPartySearchProvider implements SearchProvider {
  readonly id = PROVIDER_ID
  /** 异步探测得到的每源可用性（apply 时与每次配置变更后刷新）。 */
  private readonly probed = new Map<string, boolean>()
  constructor(private readonly resolveOptions: () => Resolved) {}

  /** 用与真实搜索同一套凭据解析链刷新各内置源的可用性（供 available() 同步读取）。 */
  async refreshAvailability(): Promise<void> {
    const r = this.resolveOptions()
    for (const spec of ENGINE_SPECS) {
      try {
        this.probed.set(spec.id, await builtinKeyAvailable(r.ctx, r.cfg, spec.id))
      } catch {
        this.probed.delete(spec.id) // 探测失败不算结论，交回同步判断
      }
    }
  }

  available(): boolean {
    try {
      const r = this.resolveOptions()
      const registry = r.ctx.get(PROVIDER_SERVICE_ID) as ProviderRegistry | undefined
      if (registry === undefined || !registry.sources.has(r.cfg.provider)) return false
      const probed = this.probed.get(r.cfg.provider)
      if (probed !== undefined) return probed
      return syncKeyAvailable(r.ctx, r.cfg, r.cfg.provider)
    } catch {
      return true // 可用性探测本身绝不能成为失败源
    }
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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('search timeout after ' + r.cfg.timeoutMs + 'ms')), r.cfg.timeoutMs)
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      const compute = async (): Promise<SearchResult> => {
        const chain = await buildProviderChain(r.cfg, registry as ProviderRegistry, r.ctx)
        // 查询预算（含主源）对合并与降级两种模式统一生效，防止主源失败后无限烧各引擎配额
        const targets = chain.slice(0, Math.max(1, r.cfg.maxProviderQueries))
        // 熔断：跳过处于冷却期且非主源的 provider（主源仍尝试，以便冷却恢复后自愈）
        const primary = r.cfg.provider
        const planned = targets.filter((id) => id === primary || !circuitOpen(r.cfg, id))

        const failures: Array<{ id: string; msg: string }> = []
        const sources: SearchSource[] = []
        const seen = new Set<string>()
        let content: string | undefined

        const runOne = async (id: string): Promise<{ sources: SearchSourceItem[]; content?: string }> => {
          const adapter = registry.sources.get(id)
          if (adapter === undefined) return { sources: [] }
          if (controller.signal.aborted) throw abortErrorOf(controller)
          const started = Date.now()
          try {
            const result = await adapter.search(
              { query: request.query, maxResults, config: r.cfg as unknown as Record<string, unknown> },
              controller.signal,
            )
            circuitMarkSuccess(id)
            if (r.cfg.statsEnabled) recordStat(id, true, Date.now() - started)
            return { sources: result.sources ?? [], content: result.content }
          } catch (error) {
            // 取消/超时不计入源失败（不污染熔断与统计）：终止整条链并原样上抛 WEB_ABORTED
            if (controller.signal.aborted || (error instanceof WebError && error.code === 'WEB_ABORTED')) {
              throw error instanceof WebError && error.code === 'WEB_ABORTED' ? error : abortErrorOf(controller)
            }
            const msg = error instanceof Error ? error.message : String(error)
            circuitMarkFailure(r.cfg, id)
            if (r.cfg.statsEnabled) recordStat(id, false, Date.now() - started, msg)
            failures.push({ id, msg })
            return { sources: [] }
          }
        }

        if (r.cfg.mergeResults) {
          const collected = await runWithConcurrency(planned, r.cfg.maxProviderConcurrency, runOne)
          for (const c of collected) {
            for (const src of c.sources) {
              if (!src.url || seen.has(src.url)) continue
              seen.add(src.url)
              sources.push({ ...src })
            }
            if (content === undefined && c.content !== undefined) content = c.content
          }
        } else {
          for (const id of planned) {
            const c = await runOne(id)
            for (const src of c.sources) {
              if (!src.url || seen.has(src.url)) continue
              seen.add(src.url)
              sources.push({ ...src })
            }
            if (content === undefined && c.content !== undefined) content = c.content
            if (sources.length > 0) break
          }
        }

        if (sources.length === 0 && failures.length > 0) {
          throw new WebError('web-search-thirdparty: 所有可用搜索源均失败 — ' + failures[0].id + ':' + failures[0].msg, 'WEB_PROVIDER_ERROR')
        }

        // 处理顺序：域名限额 → 相关度排序 → 截断到 maxResults。
        // 先截断会让域名限额把结果砍穿、相关度排序也只在残集里做。
        let processed = dedupeByDomain(sources, r.cfg.maxPerDomain)
        if (r.cfg.relevanceSort) processed = sortByRelevance(processed, request.query)
        const beforeSlice = processed.length
        processed = processed.slice(0, maxResults)

        return {
          sources: processed.map((src) => ({
            ...src,
            ...(src.snippet !== undefined ? { snippet: cleanSnippet(src.snippet, r.cfg.snippetMaxLength) } : {}),
          })),
          ...(content !== undefined ? { content } : {}),
          // 诚实上报：门面自己按 maxResults 砍掉过结果时置 true（seam 仍会按 request.maxResults 复核）
          truncated: beforeSlice > processed.length,
        } as SearchResult
      }

      return await cacheGetOrCompute(cacheKey, r.cfg, compute)
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

/** 用当前配置 + 表单传入值，组装一次测试搜索用 config（取值映射由 ENGINE_SPECS 驱动）。 */
export function cfgFromTestBody(cfg: Config, body: any): Config {
  const next: Config = { ...cfg }
  const provider = typeof body?.provider === 'string' ? body.provider : ''
  const spec = getEngineSpec(provider)
  if (spec === undefined) return next
  next.provider = spec.id
  const max = Number(body?.maxResults)
  if (Number.isInteger(max) && max > 0) next.maxResults = Math.min(max, 20)
  const bag = next as unknown as Record<string, string>
  for (const input of engineInputs(spec)) {
    const raw = body?.[input.testBodyField]
    if (typeof raw === 'string' && raw.length > 0) bag[input.configKey] = raw
  }
  return next
}

/** REST 路由：POST /api/web-search-thirdparty/test（试搜）+ GET /api/web-search-thirdparty/stats（用量统计）。 */
function registerRoutes(ctx: AppContext, current: () => Config): void {
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
        const started = Date.now()
        const r: Resolved = { ctx, cfg: cfgFromTestBody(current(), body) }
        // 测试表单里的 url 是浏览器侧可控输入：必须过 SSRF 校验，防止宿主被当跳板探测内网
        if (provider === 'searxng' && r.cfg.searxngBaseURL.length > 0) {
          try {
            await assertPublicUrl(new URL(r.cfg.searxngBaseURL), r.cfg)
          } catch (error) {
            sendJson(res, 200, {
              ok: false,
              provider,
              latencyMs: Date.now() - started,
              message: error instanceof Error ? error.message : String(error),
            })
            return
          }
        }
        try {
          // 多取几条（上限 3）：既验证连通性，也覆盖引擎的 num/max_results/count 参数路径
          const probeMax = Math.max(1, Math.min(3, r.cfg.maxResults))
          const result = await engine(r, { query: 'test', maxResults: probeMax }, undefined)
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
      const statsHandler = (req: any, res: any): void => {
        const method = req.method ?? ''
        if (method !== 'GET' && method !== 'HEAD') {
          sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'GET only' } })
          return
        }
        sendJson(res, 200, { ok: true, stats: getSearchStats(), circuit: getCircuitStates(), cache: getCacheStats() })
      }
      const disposeTest = webCtx.webServer.register({ kind: 'exact', path: '/api/web-search-thirdparty/test', handler })
      const disposeStats = webCtx.webServer.register({ kind: 'exact', path: '/api/web-search-thirdparty/stats', handler: statsHandler })
      return () => { disposeTest?.(); disposeStats?.() }
    }, 'web-search-thirdparty: test + stats routes')
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
      // 逐跳跟随重定向，每一跳都过 SSRF 校验（公网 URL 302 到私网也会被拦下）
      const res = await fetchManualRedirects(url, {
        'user-agent': r.cfg.fetchUserAgent,
        'accept': 'text/html,text/*;q=0.9,application/json;q=0.8',
      }, r.cfg, controller.signal)
      // 先粗剪原始文本再转换：htmlToMarkdown 的多趟正则不该吃整份超大页面
      const parseLimit = Math.max(r.cfg.fetchMaxBodyChars * 8, 200_000)
      let rawText = await res.text()
      if (rawText.length > parseLimit) rawText = rawText.slice(0, parseLimit)
      const isHtml = /html/i.test(String(res.headers.get('content-type') ?? '')) || /^\s*</.test(rawText)
      let content = isHtml ? htmlToMarkdown(rawText) : rawText
      const truncated = content.length > r.cfg.fetchMaxBodyChars
      if (truncated) content = content.slice(0, r.cfg.fetchMaxBodyChars) + (isHtml ? '' : '…')
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
  const searchProvider = new ThirdPartySearchProvider(() => resolveOptions(ctx, current()))
  // 卸载 / 热重载时清空缓存、熔断与统计，避免旧一代状态残留到新一代
  ctx.effect(() => () => resetRuntimeState(), 'web-search-thirdparty: runtime state')
  installSettingsSectionCompat(ctx, SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => { current = source },
    onChange: () => {
      // 配置变更后刷新每源可用性（凭据可能刚被填上）
      void searchProvider.refreshAvailability().catch(() => {})
    },
  })
  // 开放注册表服务：提供在 ctx 上，其它插件可注入注册自定义搜索源。
  const registry = new ProviderRegistry(ctx)
  for (const spec of ENGINE_SPECS) {
    registry.register(builtinAdapter(ctx, spec), true)
  }
  void searchProvider.refreshAvailability().catch(() => {})
  ctx.web.registerSearchProvider(searchProvider)
  // 自带抓取 provider：enableFetchProvider=false 可关闭（把 web_fetch 交回宿主的官方 provider）
  if (config.enableFetchProvider !== false) {
    ctx.web.registerFetchProvider(new LocalFetchProvider(() => resolveOptions(ctx, current())))
  }
  registerRoutes(ctx, current)
  ctx.logger?.info?.('[web-search-thirdparty] 第三方搜索 provider 已注册（id=' + PROVIDER_ID + '，源码数 ' + registry.list().join(',') + '）')
}

