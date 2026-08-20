import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { WebError } from '@deepseek-ai/dsh-web';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { lookup as dnsLookup } from 'node:dns/promises';
/** Stable provider id registered on `ctx.web` (must match cordis.patch.yml `web.searchProvider`). */
export const PROVIDER_ID = 'web-search-thirdparty';
export const FETCH_PROVIDER_ID = 'web-search-thirdparty-fetch';
export const PROVIDER_SERVICE_ID = 'web-search-thirdparty';
/** 插件名（loader row id 用短名，与官方 web-search-deepseek 同风格）。 */
export const name = 'web-search-thirdparty';
/** 注册进哪个服务缝。 */
export const inject = ['web'];
/** Settings 分区名（在 DSH 设置页自动渲染一节 UI）。 */
const SETTINGS_NAMESPACE = settingsNamespace('dsh-web-search-thirdparty');
/** 默认 SearXNG 公共实例 —— 无任何 key 也能开箱即用。 */
const DEFAULT_SEARXNG_BASE_URL = 'https://searx.be';
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
    /** 合并模式的最大并发 provider 数。 */
    maxProviderConcurrency: z.number().step(1).min(1).max(6).default(3),
    /** 是否启用每源熔断（连续失败进入冷却，降级时跳过）。 */
    circuitEnabled: z.boolean().default(true),
    /** 连续失败多少次触发熔断。 */
    circuitFailureLimit: z.number().step(1).min(1).max(20).default(3),
    /** 熔断冷却时长（ms）。 */
    circuitCooldownMs: z.number().step(1000).min(1000).max(600000).default(15000),
    /** web_fetch 是否允许抓取私网/环回地址（默认 false=拦截，防 SSRF）。 */
    fetchAllowPrivate: z.boolean().default(false),
    /** 是否记录每源用量统计。 */
    statsEnabled: z.boolean().default(true),
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
});
async function resolveApiKey(ctx, spec) {
    const literal = spec.literal ?? '';
    if (literal.length > 0)
        return literal;
    const credentials = ctx.get('credentials');
    if (credentials !== undefined) {
        try {
            const resolved = await credentials.resolve(credentialRef(spec.envRef));
            if (resolved !== undefined && typeof resolved.value === 'string' && resolved.value.length > 0) {
                return resolved.value;
            }
        }
        catch {
            /* 回落到启动环境 */
        }
    }
    const ambient = launchEnvironmentOf(ctx).get(spec.envVar);
    if (ambient !== undefined && ambient.value.length > 0)
        return ambient.value;
    return undefined;
}
function requireKey(providerLabel, value) {
    if (value === undefined || value.length === 0) {
        throw new WebError(`${providerLabel}: 没有可用的 API key（在设置页填字面量、配置 credentials 引用，或导出对应环境变量）`, 'WEB_PROVIDER_CREDENTIAL_MISSING');
    }
    return value;
}
// ─────────────────────────────────────────────────────────────────────────────
// HTTP 小工具 + 错误归一化（WEB_PROVIDER_ERROR / WEB_ABORTED）
// ─────────────────────────────────────────────────────────────────────────────
function parseHeaders(json) {
    if (json === undefined || json === '')
        return {};
    try {
        const o = JSON.parse(json);
        return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    }
    catch {
        return {};
    }
}
function sleepMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchJson(providerLabel, r, url, init, signal) {
    const cfg = r.cfg;
    const extra = parseHeaders(cfg.extraHeadersJson);
    const retries = Math.max(0, Number(cfg.retryCount) || 0);
    const backoff = Math.max(0, Number(cfg.retryBackoffMs) || 0);
    let lastError = undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0 && backoff > 0)
            await sleepMs(backoff * Math.pow(2, attempt - 1));
        try {
            const res = await fetch(url, {
                ...init,
                headers: { ...(asHeaders(init.headers)), ...extra },
                ...(signal !== undefined ? { signal } : {}),
            });
            if (!res.ok) {
                let detail = `HTTP ${res.status}`;
                try {
                    const body = await res.json();
                    const m = body?.errors?.[0]?.message ?? body?.error?.message ?? body?.error ?? body?.message;
                    if (typeof m === 'string' && m.length > 0)
                        detail = m;
                }
                catch { /* 保留 HTTP 状态 */ }
                throw new WebError(`${providerLabel} error: ${detail}`, 'WEB_PROVIDER_ERROR');
            }
            return await res.json();
        }
        catch (error) {
            if (signal?.aborted === true || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')) {
                throw new WebError(`${providerLabel} search aborted`, 'WEB_ABORTED', { cause: error });
            }
            // HTTP / 解析类错误不可重试（4xx/5xx 业务错误）；仅重试网络层失败（TypeError: fetch failed）
            if (error instanceof WebError)
                throw error;
            lastError = error;
            if (attempt >= retries) {
                throw new WebError(`${providerLabel} request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
            }
        }
    }
    throw new WebError(`${providerLabel} request failed: ${String(lastError)}`, 'WEB_PROVIDER_ERROR', { cause: lastError });
}
function asHeaders(h) {
    if (h === undefined)
        return {};
    if (h instanceof Headers) {
        const out = {};
        h.forEach((v, k) => { out[k] = v; });
        return out;
    }
    return h;
}
/** 按 url 去重，丢掉空 url。 */
function dedupe(sources) {
    const seen = new Set();
    const out = [];
    for (const s of sources) {
        if (!s.url || s.url.length === 0)
            continue;
        if (seen.has(s.url))
            continue;
        seen.add(s.url);
        out.push(s);
    }
    return out;
}
// ─────────────────────────────────────────────────────────────────────────────
// 六个引擎实现
// ─────────────────────────────────────────────────────────────────────────────
export async function searchSearxng(r, req, signal) {
    const { ctx, cfg } = r;
    const base = cfg.searxngBaseURL.length > 0 ? cfg.searxngBaseURL : DEFAULT_SEARXNG_BASE_URL;
    const url = new URL('/search', base);
    url.searchParams.set('q', req.query);
    url.searchParams.set('format', 'json');
    if (cfg.searxngLanguage.length > 0)
        url.searchParams.set('language', cfg.searxngLanguage);
    if (cfg.searxngCategories.length > 0)
        url.searchParams.set('categories', cfg.searxngCategories);
    url.searchParams.set('safesearch', String(cfg.searxngSafesearch));
    const data = await fetchJson('SearXNG', r, url.toString(), { headers: { accept: 'application/json' } }, signal);
    const raw = Array.isArray(data?.results) ? data.results : [];
    return {
        sources: dedupe(raw.map((item) => ({
            url: String(item?.url ?? '').trim(),
            ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
            ...(item?.content != null && String(item.content).length > 0 ? { snippet: String(item.content) } : {}),
            ...(item?.publishedDate != null && String(item.publishedDate).length > 0 ? { publishedAt: String(item.publishedDate) } : {}),
        }))),
    };
}
export async function searchTavily(r, req, signal) {
    const { ctx, cfg } = r;
    const apiKey = requireKey('Tavily', await resolveApiKey(ctx, {
        literal: cfg.tavilyApiKey, envRef: cfg.tavilyApiKeyEnv, envVar: 'TAVILY_API_KEY',
    }));
    const body = {
        api_key: apiKey,
        query: req.query,
        search_depth: cfg.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic',
        include_answer: true,
        max_results: req.maxResults ?? 8,
    };
    const data = await fetchJson('Tavily', r, r.cfg.tavilyEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    }, signal);
    const raw = Array.isArray(data?.results) ? data.results : [];
    const answer = typeof data?.answer === 'string' && data.answer.length > 0 ? data.answer : undefined;
    return {
        sources: dedupe(raw.map((item) => ({
            url: String(item?.url ?? '').trim(),
            ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
            ...(item?.content != null && String(item.content).length > 0 ? { snippet: String(item.content) } : {}),
            ...(item?.published_date != null && String(item.published_date).length > 0 ? { publishedAt: String(item.published_date) } : {}),
        }))),
        ...(answer !== undefined ? { content: answer } : {}),
    };
}
export async function searchSerper(r, req, signal) {
    const { ctx, cfg } = r;
    const apiKey = requireKey('Serper', await resolveApiKey(ctx, {
        literal: cfg.serperApiKey, envRef: cfg.serperApiKeyEnv, envVar: 'SERPER_API_KEY',
    }));
    const body = { q: req.query };
    if (cfg.serperLanguage.length > 0)
        body.gl = cfg.serperLanguage;
    const data = await fetchJson('Serper', r, r.cfg.serperEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(body),
    }, signal);
    const raw = Array.isArray(data?.organic) ? data.organic : [];
    const answer = data?.answerBox?.answer ?? data?.knowledgeGraph?.description;
    return {
        sources: dedupe(raw.map((item) => ({
            url: String(item?.link ?? '').trim(),
            ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
            ...(item?.snippet != null && String(item.snippet).length > 0 ? { snippet: String(item.snippet) } : {}),
            ...(item?.date != null && String(item.date).length > 0 ? { publishedAt: String(item.date) } : {}),
        }))),
        ...(typeof answer === 'string' && answer.length > 0 ? { content: answer } : {}),
    };
}
export async function searchBrave(r, req, signal) {
    const { ctx, cfg } = r;
    const apiKey = requireKey('Brave', await resolveApiKey(ctx, {
        literal: cfg.braveApiKey, envRef: cfg.braveApiKeyEnv, envVar: 'BRAVE_API_KEY',
    }));
    const url = new URL(r.cfg.braveEndpoint);
    url.searchParams.set('q', req.query);
    url.searchParams.set('count', String(req.maxResults ?? 8));
    if (cfg.braveCountry.length > 0)
        url.searchParams.set('country', cfg.braveCountry);
    if (cfg.braveSearchLang.length > 0)
        url.searchParams.set('search_lang', cfg.braveSearchLang);
    const data = await fetchJson('Brave', r, url.toString(), {
        headers: { accept: 'application/json', 'x-subscription-token': apiKey },
    }, signal);
    const raw = Array.isArray(data?.web?.results) ? data.web.results : [];
    return {
        sources: dedupe(raw.map((item) => ({
            url: String(item?.url ?? '').trim(),
            ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
            ...(item?.description != null && String(item.description).length > 0 ? { snippet: String(item.description) } : {}),
            ...(item?.page_age != null && String(item.page_age).length > 0 ? { publishedAt: String(item.page_age) } : {}),
        }))),
    };
}
export async function searchBing(r, req, signal) {
    const { ctx, cfg } = r;
    const apiKey = requireKey('Bing', await resolveApiKey(ctx, {
        literal: cfg.bingApiKey, envRef: cfg.bingApiKeyEnv, envVar: 'BING_SEARCH_API_KEY',
    }));
    const url = new URL(cfg.bingEndpoint);
    url.searchParams.set('q', req.query);
    url.searchParams.set('mkt', cfg.bingMarket);
    url.searchParams.set('count', String(req.maxResults ?? 8));
    const data = await fetchJson('Bing', r, url.toString(), {
        headers: { accept: 'application/json', 'ocp-apim-subscription-key': apiKey },
    }, signal);
    const raw = Array.isArray(data?.webPages?.value) ? data.webPages.value : [];
    return {
        sources: dedupe(raw.map((item) => ({
            url: String(item?.url ?? '').trim(),
            ...(item?.name != null && String(item.name).length > 0 ? { title: String(item.name) } : {}),
            ...(item?.snippet != null && String(item.snippet).length > 0 ? { snippet: String(item.snippet) } : {}),
            ...(item?.datePublished != null && String(item.datePublished).length > 0 ? { publishedAt: String(item.datePublished) } : {}),
        }))),
    };
}
export async function searchGoogleCse(r, req, signal) {
    const { ctx, cfg } = r;
    const apiKey = requireKey('Google CSE', await resolveApiKey(ctx, {
        literal: cfg.googleApiKey, envRef: cfg.googleApiKeyEnv, envVar: 'GOOGLE_CSE_API_KEY',
    }));
    const cx = await resolveApiKey(ctx, {
        literal: cfg.googleSearchEngineId, envRef: cfg.googleSearchEngineIdEnv, envVar: 'GOOGLE_CSE_ID',
    });
    if (cx === undefined || cx.length === 0) {
        throw new WebError('Google CSE: 需要配置 Search Engine ID (cx)', 'WEB_PROVIDER_CREDENTIAL_MISSING');
    }
    const url = new URL(r.cfg.googleEndpoint);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', req.query);
    url.searchParams.set('alt', 'json');
    url.searchParams.set('num', String(Math.min(req.maxResults ?? 8, 10)));
    if (cfg.googleLanguage.length > 0)
        url.searchParams.set('lr', cfg.googleLanguage);
    const data = await fetchJson('Google CSE', r, url.toString(), {}, signal);
    const raw = Array.isArray(data?.items) ? data.items : [];
    return {
        sources: dedupe(raw.map((item) => {
            const meta = item?.pagemap?.metatags?.[0] ?? {};
            const pub = meta['article:published_time'] ?? item?.pagemap?.newsarticle?.[0]?.datepublished;
            return {
                url: String(item?.link ?? '').trim(),
                ...(item?.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {}),
                ...(item?.snippet != null && String(item.snippet).length > 0 ? { snippet: String(item.snippet) } : {}),
                ...(pub != null && String(pub).length > 0 ? { publishedAt: String(pub) } : {}),
            };
        })),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// 门面 provider：available() + 内部路由
// ─────────────────────────────────────────────────────────────────────────────
const ENGINES = {
    searxng: searchSearxng,
    tavily: searchTavily,
    serper: searchSerper,
    brave: searchBrave,
    bing: searchBing,
    'google-cse': searchGoogleCse,
};
const ENGINE_IDS = Object.keys(ENGINES);
/** 清洗并截断 snippet：去 HTML 标签、折叠空白、限制长度。 */
export function cleanSnippet(text, max) {
    if (text === undefined)
        return undefined;
    let sn = String(text);
    sn = sn.replace(/<[^>]+>/g, ' ');
    sn = sn.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
    sn = sn.replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    sn = sn.split(' | ').join(' ');
    sn = sn.replace(/(\s*[-=_]{2,}\s*)+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (sn.length > max)
        sn = sn.slice(0, max - 1).trimEnd() + '…';
    return sn.length > 0 ? sn : undefined;
}
/** 取 URL 的根域名（去 www.）。 */
export function domainOf(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host.startsWith('www.') ? host.slice(4) : host;
    }
    catch {
        return url.toLowerCase();
    }
}
/** 每个域名最多保留 limit 条（0=不限制）。 */
export function dedupeByDomain(sources, limit) {
    if (limit <= 0)
        return sources;
    const seen = new Map();
    const out = [];
    for (const src of sources) {
        const d = domainOf(src.url);
        const c = seen.get(d) ?? 0;
        if (c >= limit)
            continue;
        seen.set(d, c + 1);
        out.push(src);
    }
    return out;
}
export function queryTokens(query) {
    return (query || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(Boolean);
}
function relevanceScore(src, tokens) {
    const t = (src.title ?? '').toLowerCase();
    const sn = (src.snippet ?? '').toLowerCase();
    let score = 0;
    for (const tok of tokens) {
        if (t.includes(tok))
            score += 2;
        if (sn.includes(tok))
            score += 1;
    }
    return score;
}
/** 按查询词与标题/摘要的相关度降序排序（稳定：同分保持原序）。 */
export function sortByRelevance(sources, query) {
    const tokens = queryTokens(query);
    return [...sources].sort((a, b) => relevanceScore(b, tokens) - relevanceScore(a, tokens));
}
/** 简单 TTL 内存缓存（省 key 额度，避免重复请求）。 */
const cacheStore = new Map();
function cacheKeyOf(cfg, query, maxResults) {
    return [cfg.provider, cfg.mergeResults ? 'm' : 'f', (cfg.fallbackProviders ?? []).join(','),
        String(cfg.maxProviderQueries), query, String(maxResults),
        String(cfg.maxPerDomain ?? 0), cfg.relevanceSort ? 'r' : '', String(cfg.snippetMaxLength ?? 0)].join('|');
}
function cacheGet(key, ttlMs) {
    const entry = cacheStore.get(key);
    if (entry === undefined)
        return undefined;
    if (Date.now() - entry.at > ttlMs) {
        cacheStore.delete(key);
        return undefined;
    }
    return entry.result;
}
function cacheSet(key, result, ttlMs) {
    if (cacheStore.size > 500) {
        const now = Date.now();
        for (const [k, v] of [...cacheStore]) {
            if (now - v.at > ttlMs)
                cacheStore.delete(k);
        }
    }
    cacheStore.set(key, { at: Date.now(), result });
}
/** 近并发请求防击穿：同 key 进行中的请求共享一个 promise。 */
const inflight = new Map();
async function cacheGetOrCompute(key, cfg, compute) {
    if (cfg.cacheEnabled) {
        const hit = cacheGet(key, cfg.cacheTtlMs);
        if (hit !== undefined)
            return hit;
        const running = inflight.get(key);
        if (running !== undefined)
            return running;
    }
    const task = (async () => {
        const result = await compute();
        if (cfg.cacheEnabled)
            cacheSet(key, result, cfg.cacheTtlMs);
        return result;
    })();
    if (cfg.cacheEnabled) {
        inflight.set(key, task);
        try {
            return await task;
        }
        finally {
            inflight.delete(key);
        }
    }
    return task;
}
/** 带并发上限的并行执行：items 按序，fn 并发数 ≤ limit，结果保持原顺序。 */
async function runWithConcurrency(items, limit, fn) {
    if (limit <= 1) {
        const out = [];
        for (const it of items)
            out.push(await fn(it));
        return out;
    }
    const out = new Array(items.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (;;) {
            const idx = i++;
            if (idx >= items.length)
                break;
            out[idx] = await fn(items[idx]);
        }
    });
    await Promise.all(workers);
    return out;
}
// ── 每源熔断（临时健康检查）──
const circuitState = new Map();
function circuitOpen(cfg, id) {
    if (!cfg.circuitEnabled)
        return false;
    const st = circuitState.get(id);
    return st !== undefined && st.openUntil !== undefined && Date.now() < st.openUntil;
}
function circuitMarkSuccess(id) {
    circuitState.delete(id);
}
function circuitMarkFailure(cfg, id) {
    if (!cfg.circuitEnabled)
        return;
    const st = circuitState.get(id) ?? { failures: 0, openUntil: 0 };
    st.failures += 1;
    if (st.failures >= cfg.circuitFailureLimit) {
        st.openUntil = Date.now() + cfg.circuitCooldownMs;
        st.failures = 0;
    }
    circuitState.set(id, st);
}
// ── 每源用量统计 ──
const searchStats = new Map();
function recordStat(id, ok, latencyMs, errMessage) {
    const st = searchStats.get(id) ?? { requests: 0, errors: 0, latencyMs: 0 };
    st.requests += 1;
    if (ok)
        st.latencyMs += latencyMs;
    else {
        st.errors += 1;
        st.lastError = errMessage ?? st.lastError;
    }
    searchStats.set(id, st);
}
export function getSearchStats() {
    const out = {};
    for (const [id, st] of searchStats) {
        const success = st.requests - st.errors;
        out[id] = { requests: st.requests, errors: st.errors, avgLatencyMs: success > 0 ? Math.round(st.latencyMs / success) : 0, ...(st.lastError !== undefined ? { lastError: st.lastError } : {}) };
    }
    return out;
}
export function resetSearchStats() {
    searchStats.clear();
}
/** 同步判断某 provider 是否“可用”（key 是否已配）。searxng 恒可用。 */
function hasConfiguredKey(cfg, id) {
    switch (id) {
        case 'searxng': return true;
        case 'tavily': return (cfg.tavilyApiKey ?? '').length > 0 || !!process.env[cfg.tavilyApiKeyEnv || 'TAVILY_API_KEY'];
        case 'serper': return (cfg.serperApiKey ?? '').length > 0 || !!process.env[cfg.serperApiKeyEnv || 'SERPER_API_KEY'];
        case 'brave': return (cfg.braveApiKey ?? '').length > 0 || !!process.env[cfg.braveApiKeyEnv || 'BRAVE_API_KEY'];
        case 'bing': return (cfg.bingApiKey ?? '').length > 0 || !!process.env[cfg.bingApiKeyEnv || 'BING_SEARCH_API_KEY'];
        case 'google-cse': return ((cfg.googleApiKey ?? '').length > 0 && (cfg.googleSearchEngineId ?? '').length > 0)
            || (!!process.env[cfg.googleApiKeyEnv || 'GOOGLE_CSE_API_KEY'] && !!process.env[cfg.googleSearchEngineIdEnv || 'GOOGLE_CSE_ID']);
        default: return false;
    }
}
/** 内置引擎的展示名（对外暴露给第三方作者参考）。 */
export const BUILTIN_LABELS = {
    searxng: 'SearXNG', tavily: 'Tavily', serper: 'Serper', brave: 'Brave', bing: 'Bing', 'google-cse': 'Google CSE',
};
/** 本插件的开放注册表服务（其它插件 inject: [PROVIDER_SERVICE_ID]）。 */
export class ProviderRegistry extends Service {
    sources = new Map();
    constructor(ctx) { super(ctx, PROVIDER_SERVICE_ID); }
    register(adapter) {
        if (this.sources.has(adapter.id)) {
            throw new WebError('search source "' + adapter.id + '" is already registered', 'WEB_DUPLICATE_PROVIDER');
        }
        return this.ctx.effect(() => {
            this.sources.set(adapter.id, adapter);
            return () => { this.sources.delete(adapter.id); };
        }, 'web-search-thirdparty: register ' + adapter.id);
    }
    list() { return [...this.sources.keys()]; }
}
/** 把内置引擎包装成统一 adapter（内部用）。 */
function builtinAdapter(ctx, id, label) {
    const fn = ENGINES[id];
    return {
        id: String(id),
        label,
        available: (config) => hasConfiguredKey(config, String(id)),
        search: async ({ query, maxResults, config }, signal) => fn({ ctx, cfg: config }, { query, maxResults }, signal),
    };
}
/** 构造要尝试的 provider 链：[主源, 其余可用源]，按注册表顺序，去重。 */
export function buildProviderChain(cfg, registry) {
    const chain = [];
    const pushUnique = (id) => { if (!chain.includes(id))
        chain.push(id); };
    pushUnique(cfg.provider);
    for (const id of cfg.fallbackProviders ?? [])
        pushUnique(id);
    for (const [id, adapter] of [...registry.sources.entries()].sort()) {
        if (chain.includes(id))
            continue;
        if (adapter.available?.(cfg) ?? true)
            pushUnique(id);
    }
    return chain;
}
export class ThirdPartySearchProvider {
    resolveOptions;
    id = PROVIDER_ID;
    constructor(resolveOptions) {
        this.resolveOptions = resolveOptions;
    }
    available() {
        const r = this.resolveOptions();
        const registry = r.ctx.get(PROVIDER_SERVICE_ID);
        return registry !== undefined && registry.sources.has(r.cfg.provider);
    }
    async search(request, signal) {
        const r = this.resolveOptions();
        const registry = r.ctx.get(PROVIDER_SERVICE_ID);
        if (registry === undefined) {
            throw new WebError('web-search-thirdparty 注册表服务不可用', 'WEB_PLUGIN_ERROR');
        }
        const primary = r.cfg.provider;
        if (!registry.sources.has(primary)) {
            throw new WebError('web-search-thirdparty: 未注册的搜索源 "' + primary + '"（已注册: ' + registry.list().join(', ') + '）', 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE');
        }
        const maxResults = Math.min(request.maxResults ?? r.cfg.maxResults, r.cfg.maxResults);
        const cacheKey = cacheKeyOf(r.cfg, request.query, maxResults);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error('search timeout after ' + r.cfg.timeoutMs + 'ms')), r.cfg.timeoutMs);
        const onAbort = () => controller.abort(signal?.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            const compute = async () => {
                const chain = buildProviderChain(r.cfg, registry);
                let targets = r.cfg.mergeResults ? chain.slice(0, Math.max(1, r.cfg.maxProviderQueries)) : chain;
                // 熔断：跳过处于冷却期且非主源的 provider（主源仍尝试，以便冷却恢复后自愈）
                const primary = r.cfg.provider;
                targets = targets.filter((id) => id === primary || !circuitOpen(r.cfg, id));
                const failures = [];
                const sources = [];
                const seen = new Set();
                let content;
                const runOne = async (id) => {
                    const adapter = registry.sources.get(id);
                    if (adapter === undefined)
                        return { sources: [] };
                    const started = Date.now();
                    try {
                        const result = await adapter.search({ query: request.query, maxResults, config: r.cfg }, controller.signal);
                        circuitMarkSuccess(id);
                        if (r.cfg.statsEnabled)
                            recordStat(id, true, Date.now() - started);
                        return { sources: result.sources ?? [], content: result.content };
                    }
                    catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        circuitMarkFailure(r.cfg, id);
                        if (r.cfg.statsEnabled)
                            recordStat(id, false, Date.now() - started, msg);
                        failures.push({ id, msg });
                        return { sources: [] };
                    }
                };
                if (r.cfg.mergeResults) {
                    const collected = await runWithConcurrency(targets, r.cfg.maxProviderConcurrency, runOne);
                    for (const c of collected) {
                        for (const src of c.sources) {
                            if (!src.url || seen.has(src.url))
                                continue;
                            seen.add(src.url);
                            sources.push({ ...src });
                        }
                        if (content === undefined && c.content !== undefined)
                            content = c.content;
                    }
                }
                else {
                    for (const id of targets) {
                        const c = await runOne(id);
                        for (const src of c.sources) {
                            if (!src.url || seen.has(src.url))
                                continue;
                            seen.add(src.url);
                            sources.push({ ...src });
                        }
                        if (content === undefined && c.content !== undefined)
                            content = c.content;
                        if (sources.length > 0)
                            break;
                    }
                }
                if (sources.length === 0 && failures.length > 0) {
                    throw new WebError('web-search-thirdparty: 所有可用搜索源均失败 — ' + failures[0].id + ':' + failures[0].msg, 'WEB_PROVIDER_ERROR');
                }
                let cleaned = sources.slice(0, maxResults).map((src) => ({
                    ...src,
                    ...(src.snippet !== undefined ? { snippet: cleanSnippet(src.snippet, r.cfg.snippetMaxLength) } : {}),
                }));
                cleaned = dedupeByDomain(cleaned, r.cfg.maxPerDomain);
                if (r.cfg.relevanceSort)
                    cleaned = sortByRelevance(cleaned, request.query);
                return {
                    sources: cleaned,
                    ...(content !== undefined ? { content } : {}),
                    truncated: false,
                };
            };
            return await cacheGetOrCompute(cacheKey, r.cfg, compute);
        }
        finally {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', onAbort);
        }
    }
}
function resolveOptions(ctx, cfg) {
    return { ctx, cfg };
}
// ─────────────────────────────────────────────────────────────────────────────
// 测试连接 REST 路由（POST /api/web-search-thirdparty/test）
// 输入：{ provider, key?, url?, cx?, maxResults? } —— 不用先保存，按表单当前值试搜。
// ─────────────────────────────────────────────────────────────────────────────
function sendJson(res, status, value) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
}
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 1_000_000) {
                reject(new Error('request body too large'));
                req.destroy?.();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
            }
            catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    });
}
/** 用当前配置 + 表单传入值，组装一次测试搜索用 config。 */
function cfgFromTestBody(cfg, body) {
    const next = { ...cfg };
    const provider = typeof body?.provider === 'string' ? body.provider : cfg.provider;
    next.provider = provider;
    const max = Number(body?.maxResults);
    if (Number.isInteger(max) && max > 0)
        next.maxResults = Math.min(max, 20);
    const key = typeof body?.key === 'string' ? body.key : '';
    const url = typeof body?.url === 'string' ? body.url : '';
    const cx = typeof body?.cx === 'string' ? body.cx : '';
    if (provider === 'searxng' && url.length > 0)
        next.searxngBaseURL = url;
    if (provider === 'tavily' && key.length > 0)
        next.tavilyApiKey = key;
    if (provider === 'serper' && key.length > 0)
        next.serperApiKey = key;
    if (provider === 'brave' && key.length > 0)
        next.braveApiKey = key;
    if (provider === 'bing' && key.length > 0)
        next.bingApiKey = key;
    if (provider === 'google-cse') {
        if (key.length > 0)
            next.googleApiKey = key;
        if (cx.length > 0)
            next.googleSearchEngineId = cx;
    }
    return next;
}
function registerTestRoute(ctx, current) {
    ctx.inject(['webServer'], (webCtx) => {
        webCtx.effect(() => {
            const handler = async (req, res) => {
                if ((req.method ?? '') !== 'POST') {
                    sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'POST only' } });
                    return;
                }
                let body;
                try {
                    body = await readJsonBody(req);
                }
                catch {
                    sendJson(res, 400, { ok: false, error: { code: 'bad-json', message: 'invalid JSON body' } });
                    return;
                }
                const provider = String(body?.provider ?? '');
                const engine = ENGINES[provider];
                if (engine === undefined) {
                    sendJson(res, 200, { ok: false, message: '未知供应商: ' + provider });
                    return;
                }
                const r = { ctx, cfg: cfgFromTestBody(current(), body) };
                const started = Date.now();
                try {
                    const result = await engine(r, { query: 'test', maxResults: 1 }, undefined);
                    const latencyMs = Date.now() - started;
                    const first = result.sources[0];
                    sendJson(res, 200, {
                        ok: true,
                        provider,
                        latencyMs,
                        sources: result.sources.length,
                        sample: (first !== undefined
                            ? { title: first.title ?? null, url: first.url }
                            : null),
                    });
                }
                catch (error) {
                    sendJson(res, 200, {
                        ok: false,
                        provider,
                        latencyMs: Date.now() - started,
                        message: error instanceof Error ? error.message : String(error),
                    });
                }
            };
            const dispose = webCtx.webServer.register({ kind: 'exact', path: '/api/web-search-thirdparty/test', handler });
            return () => { dispose?.(); };
        }, 'web-search-thirdparty: test route');
    });
}
function isPrivateIp(addr) {
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
    if (v4 !== null) {
        const a = Number(v4[1]);
        const b = Number(v4[2]);
        const c = Number(v4[3]);
        const d = Number(v4[4]);
        if (a === 10)
            return true;
        if (a === 172 && b >= 16 && b <= 31)
            return true;
        if (a === 192 && b === 168)
            return true;
        if (a === 127)
            return true;
        if (a === 169 && b === 254)
            return true;
        if (a === 100 && b >= 64 && b <= 127)
            return true;
        return false;
    }
    const lower = addr.toLowerCase();
    if (lower === '::1' || lower === '::')
        return true;
    if (lower.startsWith('fc') || lower.startsWith('fd'))
        return true;
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb'))
        return true;
    if (lower.startsWith('::ffff:'))
        return isPrivateIp(lower.slice(7));
    return false;
}
function isPrivateName(host) {
    const h = host.toLowerCase().replace(/\.$/, '');
    if (h === 'localhost' || h.endsWith('.localhost'))
        return true;
    if (h === 'metadata.google.internal' || h === 'instance-data')
        return true;
    if (/^\d|^[0-9a-f:]+$/i.test(h))
        return isPrivateIp(h);
    return false;
}
async function assertPublicUrl(url, cfg) {
    if (cfg.fetchAllowPrivate)
        return;
    const host = url.hostname;
    if (isPrivateName(host))
        throw new WebError('blocked private / loopback address: ' + host, 'WEB_FETCH_BLOCKED_PRIVATE');
    try {
        const addrs = await dnsLookup(host, { all: true });
        for (const a of addrs)
            if (isPrivateIp(a.address))
                throw new WebError('blocked private network address: ' + a.address + ' (' + host + ')', 'WEB_FETCH_BLOCKED_PRIVATE');
    }
    catch (error) {
        if (error instanceof WebError)
            throw error;
    }
}
function stripInlineTags(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
/** 极简 HTML→Markdown 清洗：去 script/style、块级换行、标题/链接/图片转 Markdown、解码实体、折叠空白。 */
export function htmlToMarkdown(html) {
    let s = String(html);
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    s = s.replace(/<\/(?:p|div|li|tr|section|article|table|ul|ol|blockquote|nav|header|footer)>/gi, '\n');
    s = s.replace(/<(?:br|hr)\s*\/?>/gi, '\n');
    s = s.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (_m, src) => '![image](' + src + ')');
    s = s.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => '[' + stripInlineTags(txt) + '](' + href + ')');
    s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl, txt) => '#'.repeat(Number(lvl)) + ' ' + stripInlineTags(txt) + '\n');
    s = s.replace(/<[^>]+>/g, ' ');
    s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&apos;/gi, "'");
    s = s.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    return s;
}
/** 简易抓取 provider：取正文文本并截断，供官方 web_fetch 工具使用。 */
export class LocalFetchProvider {
    resolveOptions;
    id = FETCH_PROVIDER_ID;
    constructor(resolveOptions) {
        this.resolveOptions = resolveOptions;
    }
    available() {
        return true;
    }
    async fetch(request, signal) {
        let url;
        try {
            url = new URL(request.url);
        }
        catch {
            throw new WebError(`invalid URL: ${request.url}`, 'WEB_FETCH_INVALID_URL');
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new WebError(`unsupported protocol "${url.protocol}" — only http(s) allowed`, 'WEB_PROVIDER_ERROR');
        }
        const r = this.resolveOptions();
        await assertPublicUrl(url, r.cfg);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error(`web fetch timeout after ${r.cfg.fetchTimeoutMs}ms`)), r.cfg.fetchTimeoutMs);
        const onAbort = () => controller.abort(signal?.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            const res = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                headers: { 'user-agent': r.cfg.fetchUserAgent, 'accept': 'text/html,text/*;q=0.9,application/json;q=0.8' },
            });
            const rawText = await res.text();
            const isHtml = /html/i.test(String(res.headers.get('content-type') ?? '')) || /^\s*</.test(rawText);
            let content = isHtml ? htmlToMarkdown(rawText) : rawText;
            const truncated = content.length > r.cfg.fetchMaxBodyChars;
            if (truncated)
                content = content.slice(0, r.cfg.fetchMaxBodyChars) + (isHtml ? '' : '…');
            return {
                url: url.toString(),
                statusCode: res.status,
                body: { kind: 'text', content },
                truncated,
            };
        }
        catch (error) {
            if (signal?.aborted === true || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')) {
                throw new WebError('web fetch aborted', 'WEB_ABORTED', { cause: error });
            }
            if (error instanceof WebError)
                throw error;
            throw new WebError('web fetch failed: ' + String(error), 'WEB_PROVIDER_ERROR', { cause: error });
        }
        finally {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', onAbort);
        }
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// 插件入口：注册 settings 分区 + 注册 provider + 测试路由
// ─────────────────────────────────────────────────────────────────────────────
export function apply(ctx, config) {
    let current = () => config;
    installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
        setSource: (source) => { current = source; },
        onChange: () => { },
    });
    // 开放注册表服务：提供在 ctx 上，其它插件可注入注册自定义搜索源。
    const registry = new ProviderRegistry(ctx);
    for (const id of ENGINE_IDS) {
        registry.register(builtinAdapter(ctx, id, BUILTIN_LABELS[String(id)] ?? String(id)));
    }
    ctx.web.registerSearchProvider(new ThirdPartySearchProvider(() => resolveOptions(ctx, current())));
    ctx.web.registerFetchProvider(new LocalFetchProvider(() => resolveOptions(ctx, current())));
    registerTestRoute(ctx, current);
    ctx.logger?.info?.('[web-search-thirdparty] 第三方搜索 provider 已注册（id=' + PROVIDER_ID + '，源码数 ' + registry.list().join(',') + '）');
}
//# sourceMappingURL=index.js.map