/**
 * config.ts —— 插件配置的形状与 schemastery 模式（设置页分区 schema）。
 */
import z from '@deepseek-ai/schemastery';
/** 默认 SearXNG 公共实例 —— 无任何 key 也能开箱即用。 */
export const DEFAULT_SEARXNG_BASE_URL = 'https://searx.be';
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
    /** 合并/降级模式下单次搜索最多查询的源数（含主源，两种模式都生效）。 */
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
    /** 是否注册自带的 web_fetch 抓取 provider（关掉后由宿主的其它 fetch provider 服务）。 */
    enableFetchProvider: z.boolean().default(true),
    /** web_fetch 是否允许抓取私网/环回地址（默认 false=拦截，防 SSRF）。 */
    fetchAllowPrivate: z.boolean().default(false),
    /** 是否记录每源用量统计。 */
    statsEnabled: z.boolean().default(true),
    /** 抓取最大字符数。 */
    fetchMaxBodyChars: z.number().step(500).min(500).max(500000).default(60000),
    /** 抓取超时（ms）。 */
    fetchTimeoutMs: z.number().step(1000).min(1000).max(120000).default(15000),
    /** 抓取 User-Agent。 */
    fetchUserAgent: z.string().default('deepseek-harness-web-search-thirdparty/0.4.0'),
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
//# sourceMappingURL=config.js.map