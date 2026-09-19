/**
 * state.ts —— 结果缓存、并发执行、每源熔断与用量统计。
 *
 * 全部为模块级状态：插件卸载（含热重载）时由 `resetRuntimeState()` 清空，
 * 避免旧一代的缓存 / 熔断 / 统计残留到新一代。
 */
import { ENGINE_SPECS } from './engine-spec.js'
import type { Config } from './config.js'
import type { SearchResult } from './types.js'

/** 简单 TTL 内存缓存（省 key 额度，避免重复请求）。 */
const cacheStore = new Map<string, { at: number; result: SearchResult }>()

/** 缓存硬上限：超过后按写入时间淘汰（TTL 之外的第二道兜底，保证有界）。 */
const MAX_CACHE_ENTRIES = 300

/** 缓存命中 / 未命中 / 合并计数（命中不再“隐形”）。 */
const cacheCounters = { hits: 0, misses: 0, coalesced: 0 }

/** 当前配置涉及的全部引擎 endpoint（进缓存 key：换实例/镜像后不得命中旧结果）。由 ENGINE_SPECS 驱动。 */
export function activeEndpointsOf(cfg: Config): string {
  const bag = cfg as unknown as Record<string, unknown>
  return ENGINE_SPECS.map((s) => String(bag[s.endpointKey] ?? '')).join(',')
}

export function cacheKeyOf(cfg: Config, query: string, maxResults: number): string {
  return [cfg.provider, cfg.mergeResults ? 'm' : 'f', (cfg.fallbackProviders ?? []).join(','),
    String(cfg.maxProviderQueries), query, String(maxResults),
    String(cfg.maxPerDomain ?? 0), cfg.relevanceSort ? 'r' : '', String(cfg.snippetMaxLength ?? 0),
    // 自定义请求头会改变上游结果（例如网关/代理头），必须进 key
    String(cfg.extraHeadersJson ?? ''),
    activeEndpointsOf(cfg)].join('|')
}

function cacheGet(key: string, ttlMs: number): SearchResult | undefined {
  const entry = cacheStore.get(key)
  if (entry === undefined) return undefined
  if (Date.now() - entry.at > ttlMs) { cacheStore.delete(key); return undefined }
  return entry.result
}

function cacheSet(key: string, result: SearchResult, ttlMs: number): void {
  const now = Date.now()
  if (cacheStore.size >= MAX_CACHE_ENTRIES) {
    for (const [k, v] of [...cacheStore]) { if (now - v.at > ttlMs) cacheStore.delete(k) }
  }
  // 仍然到顶：按写入时间淘汰最旧的一半
  if (cacheStore.size >= MAX_CACHE_ENTRIES) {
    const oldest = [...cacheStore.entries()].sort((a, b) => a[1].at - b[1].at)
    for (let i = 0; i < Math.ceil(oldest.length / 2); i++) cacheStore.delete(oldest[i][0])
  }
  cacheStore.set(key, { at: now, result })
}

/** 近并发请求防击穿：同 key 进行中的请求共享一个 promise。 */
const inflight = new Map<string, Promise<SearchResult>>()

export async function cacheGetOrCompute(key: string, cfg: Config, compute: () => Promise<SearchResult>): Promise<SearchResult> {
  if (cfg.cacheEnabled) {
    const hit = cacheGet(key, cfg.cacheTtlMs)
    if (hit !== undefined) { cacheCounters.hits += 1; return hit }
    const running = inflight.get(key)
    if (running !== undefined) { cacheCounters.coalesced += 1; return running }
    cacheCounters.misses += 1
  }
  const task = (async () => {
    const result = await compute()
    if (cfg.cacheEnabled) cacheSet(key, result, cfg.cacheTtlMs)
    return result
  })()
  if (cfg.cacheEnabled) {
    inflight.set(key, task)
    try { return await task } finally { inflight.delete(key) }
  }
  return task
}

/** 带并发上限的并行执行：items 按序，fn 并发数 ≤ limit，结果保持原顺序。
 *  任一 fn 抛错时停止派发新任务，等全部在途任务落定后抛出第一个错误（避免 unhandled rejection）。 */
export async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (limit <= 1) {
    const out: R[] = []
    for (const it of items) out.push(await fn(it))
    return out
  }
  const out: R[] = new Array(items.length)
  let i = 0
  let stopped = false
  let firstError: unknown
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!stopped) {
      const idx = i++
      if (idx >= items.length) break
      try {
        out[idx] = await fn(items[idx])
      } catch (error) {
        firstError = error
        stopped = true
        break
      }
    }
  })
  await Promise.allSettled(workers)
  if (firstError !== undefined) throw firstError
  return out
}

// ── 每源熔断（临时健康检查）──
const circuitState = new Map<string, { failures: number; openUntil: number }>()

/** 对外只读的熔断状态（设置页统计面板用）。 */
export function getCircuitStates(): Record<string, { open: boolean; failures: number }> {
  const out: Record<string, { open: boolean; failures: number }> = {}
  const now = Date.now()
  for (const [id, st] of circuitState) {
    out[id] = { open: st.openUntil !== undefined && now < st.openUntil, failures: st.failures }
  }
  return out
}

export function circuitOpen(cfg: Config, id: string): boolean {
  if (!cfg.circuitEnabled) return false
  const st = circuitState.get(id)
  return st !== undefined && st.openUntil !== undefined && Date.now() < st.openUntil
}

export function circuitMarkSuccess(id: string): void {
  circuitState.delete(id)
}

export function circuitMarkFailure(cfg: Config, id: string): void {
  if (!cfg.circuitEnabled) return
  const st = circuitState.get(id) ?? { failures: 0, openUntil: 0 }
  st.failures += 1
  if (st.failures >= cfg.circuitFailureLimit) {
    st.openUntil = Date.now() + cfg.circuitCooldownMs
    st.failures = 0
  }
  circuitState.set(id, st)
}

// ── 每源用量统计 ──
const searchStats = new Map<string, { requests: number; errors: number; latencyMs: number; lastError?: string }>()

export function recordStat(id: string, ok: boolean, latencyMs: number, errMessage?: string): void {
  const st = searchStats.get(id) ?? { requests: 0, errors: 0, latencyMs: 0 }
  st.requests += 1
  if (ok) st.latencyMs += latencyMs
  else { st.errors += 1; st.lastError = errMessage ?? st.lastError }
  searchStats.set(id, st)
}

export function getSearchStats(): Record<string, { requests: number; errors: number; avgLatencyMs: number; lastError?: string }> {
  const out: Record<string, { requests: number; errors: number; avgLatencyMs: number; lastError?: string }> = {}
  for (const [id, st] of searchStats) {
    const success = st.requests - st.errors
    out[id] = { requests: st.requests, errors: st.errors, avgLatencyMs: success > 0 ? Math.round(st.latencyMs / success) : 0, ...(st.lastError !== undefined ? { lastError: st.lastError } : {}) }
  }
  return out
}

export function resetSearchStats(): void {
  searchStats.clear()
}

/** 缓存计数快照（命中 / 未命中 / 合并掉的并发请求）。 */
export function getCacheStats(): { hits: number; misses: number; coalesced: number } {
  return { ...cacheCounters }
}

export function resetCacheStats(): void {
  cacheCounters.hits = 0
  cacheCounters.misses = 0
  cacheCounters.coalesced = 0
}

/** 清空全部跨调用状态：插件卸载 / 热重载时调用，防止旧一代残留。 */
export function resetRuntimeState(): void {
  cacheStore.clear()
  inflight.clear()
  circuitState.clear()
  searchStats.clear()
  resetCacheStats()
}
