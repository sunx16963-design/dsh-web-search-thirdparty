/** 默认 SearXNG 公共实例 —— 无任何 key 也能开箱即用。 */
export declare const DEFAULT_SEARXNG_BASE_URL = "https://searx.be";
/** 插件配置（设置页 `dsh-web-search-thirdparty` 分区的解析结果）。 */
export interface Config {
    provider: string;
    timeoutMs: number;
    /** 单次请求最多返回的搜索结果条数。 */
    maxResults: number;
    /** 清洗后 snippet 的最大长度。 */
    snippetMaxLength: number;
    /** 是否合并多个可用源的结果（false=仅主源，失败自动降级到下一个可用源）。 */
    mergeResults: boolean;
    /** 附加降级源 id 列表（空=自动使用其它全部可用源）。 */
    fallbackProviders: string[];
    /** 合并/降级时最多查询的源数。 */
    maxProviderQueries: number;
    /** 每个域名最多保留的结果数（0=不限制）。 */
    maxPerDomain: number;
    /** 是否按查询词与标题/摘要的相关度排序。 */
    relevanceSort: boolean;
    /** 是否启用结果缓存（省 key 额度）。 */
    cacheEnabled: boolean;
    /** 缓存有效期（ms）。 */
    cacheTtlMs: number;
    /** 合并模式的最大并发 provider 数。 */
    maxProviderConcurrency: number;
    /** 是否启用每源熔断（连续失败进入冷却，降级时跳过）。 */
    circuitEnabled: boolean;
    /** 连续失败多少次触发熔断。 */
    circuitFailureLimit: number;
    /** 熔断冷却时长（ms）。 */
    circuitCooldownMs: number;
    /** 是否注册自带的 web_fetch 抓取 provider（默认 true）。 */
    enableFetchProvider: boolean;
    /** web_fetch 是否允许抓取私网/环回地址（默认 false=拦截，防 SSRF）。 */
    fetchAllowPrivate: boolean;
    /** 是否记录每源用量统计。 */
    statsEnabled: boolean;
    /** 抓取最大字符数。 */
    fetchMaxBodyChars: number;
    /** 抓取超时（ms）。 */
    fetchTimeoutMs: number;
    /** 抓取 User-Agent。 */
    fetchUserAgent: string;
    /** 网络层失败重试次数。 */
    retryCount: number;
    /** 重试指数退避基数（ms）。 */
    retryBackoffMs: number;
    /** 额外请求头（JSON 字符串，如 {"X-Foo":"bar"}），应用到所有源。 */
    extraHeadersJson: string;
    searxngBaseURL: string;
    /** 各 keyed 引擎 endpoint（可自建/内网代理/镜像）。 */
    tavilyEndpoint: string;
    serperEndpoint: string;
    braveEndpoint: string;
    googleEndpoint: string;
    searxngLanguage: string;
    searxngCategories: string;
    searxngSafesearch: number;
    tavilyApiKey: string;
    tavilyApiKeyEnv: string;
    tavilySearchDepth: string;
    serperApiKey: string;
    serperApiKeyEnv: string;
    serperLanguage: string;
    braveApiKey: string;
    braveApiKeyEnv: string;
    braveCountry: string;
    braveSearchLang: string;
    bingApiKey: string;
    bingApiKeyEnv: string;
    bingEndpoint: string;
    bingMarket: string;
    googleApiKey: string;
    googleApiKeyEnv: string;
    googleSearchEngineId: string;
    googleSearchEngineIdEnv: string;
    googleLanguage: string;
}
/**
 * 构造插件 Config 模式。
 * @param z - schemastery 模块（参数化以便测试注入真实实现）
 * @param volatile - 是否把可编辑字段声明为 volatile（DSH ≥ 0.1.7 必须，≤ 0.1.6 必须不）
 */
export declare function buildConfigSchema(z: any, volatile: boolean): any;
/** 运行中的 DSH 代际对应的 Config 模式。 */
export declare const Config: any;
/** 是否处于「设置分区由 volatile 字段驱动」的新代际（DSH ≥ 0.1.7-alpha.1）。 */
export declare const CONFIG_VOLATILE_REQUIRED: boolean;
/** 解析结果是否已由 volatile 引用驱动（设置页可保存的必要条件）。 */
export declare const CONFIG_FIELDS_VOLATILE: boolean;
