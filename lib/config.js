/**
 * config.ts —— 插件配置的形状与 schemastery 模式（设置页分区 schema）。
 *
 * ⚠ 每个字段都必须挂 `.volatile()`：DSH ≥ 0.1.7 的设置服务（`dsh-settings` 的
 * `SettingsForms`）只把「schema 上声明为 volatile」的字段投影成设置页表单并送往浏览器，
 * 一个 volatile 字段都没有的条目光是 `describe()` 就会直接跳过（`volatileForm()` 返回
 * undefined），于是分区永远不可见、`ctx.remote.settings.mutate()` 一律被拒 —— 设置页
 * “填入 Tavily key → 保存 → key 被清空”正是这条路走到黑的结果。
 * `.volatile()` 同时让插件在设置页写入后**无需重新挂载**就能读到新值（引用内容原地更新），
 * 读值统一由 `unwrapConfig()` 解包。
 *
 * ⚠ 反过来，≤ 0.1.6 的旧设置服务（`SettingsProvider`）不认 volatile：它的 `describe()`
 * 直接把解析结果丢到线上，引用对象会被 JSON 序列化成 `{}`。所以这里按运行期代际二选一，
 * 用 `buildConfigSchema(z, volatile)` 参数化，便于测试对两种形态分别加哨兵。
 */
import z from '@deepseek-ai/schemastery';
import { settingsGeneration } from './settings-compat.js';
/** 默认 SearXNG 公共实例 —— 无任何 key 也能开箱即用。 */
export const DEFAULT_SEARXNG_BASE_URL = 'https://searx.be';
/**
 * 构造插件 Config 模式。
 * @param z - schemastery 模块（参数化以便测试注入真实实现）
 * @param volatile - 是否把可编辑字段声明为 volatile（DSH ≥ 0.1.7 必须，≤ 0.1.6 必须不）
 */
export function buildConfigSchema(z, volatile) {
    /**
     * 可编辑字段声明糖：新版挂 volatile，旧版保持普通配置。
     *
     * `.volatile()` 是 schemastery 3.18.3 才有的方法（DSH 运行期用的是 3.18.4）。
     * 依赖被降级到 3.18.1/3.18.2 时这里必须退化成不挂 volatile 而不是当场抛错把插件打死；
     * 代价（设置页不可保存）由 {@link CONFIG_FIELDS_VOLATILE} 在上层明确告警，不静默。
     */
    const V = (schema) => (volatile && typeof schema.volatile === 'function' ? schema.volatile() : schema);
    return z.object({
        /** 当前路由到的第三方引擎 id：searxng | tavily | serper | brave | bing | google-cse */
        provider: V(z.string().default('searxng')),
        /** 单次搜索超时（ms）。 */
        timeoutMs: V(z.number().step(100).min(1000).max(120000).default(30000)),
        /** 单次请求最多返回的搜索结果条数。 */
        maxResults: V(z.number().step(1).min(1).max(20).default(8)),
        /** 清洗后 snippet 的最大长度。 */
        snippetMaxLength: V(z.number().step(10).min(40).max(2000).default(260)),
        /** 是否合并多个可用源的结果。 */
        mergeResults: V(z.boolean().default(false)),
        /** 附加降级源 id 列表（空=自动使用其它全部可用源）。 */
        fallbackProviders: V(z.array(z.string()).default([])),
        /** 合并/降级模式下单次搜索最多查询的源数（含主源，两种模式都生效）。 */
        maxProviderQueries: V(z.number().step(1).min(1).max(6).default(2)),
        /** 每个域名最多保留的结果数（0=不限制）。 */
        maxPerDomain: V(z.number().step(1).min(0).max(20).default(2)),
        /** 是否按查询词与标题/摘要的相关度排序。 */
        relevanceSort: V(z.boolean().default(false)),
        /** 是否启用结果缓存（省 key 额度）。 */
        cacheEnabled: V(z.boolean().default(true)),
        /** 缓存有效期（ms）。 */
        cacheTtlMs: V(z.number().step(1000).min(1000).max(86400000).default(60000)),
        /** 合并模式的最大并发 provider 数。 */
        maxProviderConcurrency: V(z.number().step(1).min(1).max(6).default(3)),
        /** 是否启用每源熔断（连续失败进入冷却，降级时跳过）。 */
        circuitEnabled: V(z.boolean().default(true)),
        /** 连续失败多少次触发熔断。 */
        circuitFailureLimit: V(z.number().step(1).min(1).max(20).default(3)),
        /** 熔断冷却时长（ms）。 */
        circuitCooldownMs: V(z.number().step(1000).min(1000).max(600000).default(15000)),
        /** 是否注册自带的 web_fetch 抓取 provider（关掉后由宿主的其它 fetch provider 服务）。 */
        enableFetchProvider: V(z.boolean().default(true)),
        /** web_fetch 是否允许抓取私网/环回地址（默认 false=拦截，防 SSRF）。 */
        fetchAllowPrivate: V(z.boolean().default(false)),
        /** 是否记录每源用量统计。 */
        statsEnabled: V(z.boolean().default(true)),
        /** 抓取最大字符数。 */
        fetchMaxBodyChars: V(z.number().step(500).min(500).max(500000).default(60000)),
        /** 抓取超时（ms）。 */
        fetchTimeoutMs: V(z.number().step(1000).min(1000).max(120000).default(15000)),
        /** 抓取 User-Agent。 */
        fetchUserAgent: V(z.string().default('deepseek-harness-web-search-thirdparty/0.4.1')),
        /** 网络层失败重试次数。 */
        retryCount: V(z.number().step(1).min(0).max(5).default(1)),
        /** 重试指数退避基数（ms）。 */
        retryBackoffMs: V(z.number().step(50).min(0).max(10000).default(250)),
        /** 额外请求头（JSON 字符串，如 {"X-Foo":"bar"}）。 */
        extraHeadersJson: V(z.string().default('')),
        /** 各 keyed 引擎 endpoint（可自建/内网代理/镜像）。 */
        tavilyEndpoint: V(z.string().default('https://api.tavily.com/search')),
        serperEndpoint: V(z.string().default('https://google.serper.dev/search')),
        braveEndpoint: V(z.string().default('https://api.search.brave.com/res/v1/web/search')),
        googleEndpoint: V(z.string().default('https://www.googleapis.com/customsearch/v1')),
        // ── SearXNG（无 key，默认）──
        searxngBaseURL: V(z.string().default(DEFAULT_SEARXNG_BASE_URL)),
        searxngLanguage: V(z.string().default('')),
        searxngCategories: V(z.string().default('general')),
        searxngSafesearch: V(z.number().min(0).max(2).default(0)),
        // ── Tavily ──
        tavilyApiKey: V(z.string().role('secret').default('')),
        tavilyApiKeyEnv: V(z.string().role('credential-ref').default('TAVILY_API_KEY')),
        tavilySearchDepth: V(z.string().default('basic')),
        // ── Serper（Google SERP）──
        serperApiKey: V(z.string().role('secret').default('')),
        serperApiKeyEnv: V(z.string().role('credential-ref').default('SERPER_API_KEY')),
        serperLanguage: V(z.string().default('')),
        // ── Brave Search ──
        braveApiKey: V(z.string().role('secret').default('')),
        braveApiKeyEnv: V(z.string().role('credential-ref').default('BRAVE_API_KEY')),
        braveCountry: V(z.string().default('')),
        braveSearchLang: V(z.string().default('')),
        // ── Bing Web Search ──
        bingApiKey: V(z.string().role('secret').default('')),
        bingApiKeyEnv: V(z.string().role('credential-ref').default('BING_SEARCH_API_KEY')),
        bingEndpoint: V(z.string().default('https://api.bing.microsoft.com/v7.0/search')),
        bingMarket: V(z.string().default('en-US')),
        // ── Google Custom Search ──
        googleApiKey: V(z.string().role('secret').default('')),
        googleApiKeyEnv: V(z.string().role('credential-ref').default('GOOGLE_CSE_API_KEY')),
        googleSearchEngineId: V(z.string().default('')),
        googleSearchEngineIdEnv: V(z.string().role('credential-ref').default('GOOGLE_CSE_ID')),
        googleLanguage: V(z.string().default('')),
    });
}
/** 运行中的 DSH 代际对应的 Config 模式。 */
export const Config = buildConfigSchema(z, settingsGeneration() === 'forms');
/** 是否处于「设置分区由 volatile 字段驱动」的新代际（DSH ≥ 0.1.7-alpha.1）。 */
export const CONFIG_VOLATILE_REQUIRED = settingsGeneration() === 'forms';
/**
 * 是否每个可编辑字段都真的带上了 volatile 元数据。
 * 只有当 DSH 是新代际、schemastery 又支持 volatile 时才会是 true；否则解析出来的配置只是
 * 普通数据，设置页会看不见本分区 —— 上层据此打出可操作的告警，而不是让用户面对“保存没反应”。
 */
function everyFieldVolatile(schema) {
    const dict = schema?.toJSON?.()?.dict;
    if (dict === undefined || dict === null || typeof dict !== 'object')
        return false;
    const nodes = Object.values(dict);
    return nodes.length > 0 && nodes.every((node) => node?.meta?.volatile === true);
}
/** 解析结果是否已由 volatile 引用驱动（设置页可保存的必要条件）。 */
export const CONFIG_FIELDS_VOLATILE = everyFieldVolatile(Config);
//# sourceMappingURL=config.js.map