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
import type { Context } from '@deepseek-ai/cordis';
import { Service } from '@deepseek-ai/cordis';
/** Stable provider id registered on `ctx.web` (must match cordis.patch.yml `web.searchProvider`). */
export declare const PROVIDER_ID = "web-search-thirdparty";
export declare const FETCH_PROVIDER_ID = "web-search-thirdparty-fetch";
export declare const PROVIDER_SERVICE_ID = "web-search-thirdparty";
/** 插件名（loader row id 用短名，与官方 web-search-deepseek 同风格）。 */
export declare const name = "web-search-thirdparty";
/** 注册进哪个服务缝。 */
export declare const inject: string[];
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
export declare const Config: any;
interface SearchSource {
    url: string;
    title?: string;
    snippet?: string;
    publishedAt?: string;
}
interface SearchResult {
    sources: SearchSource[];
    content?: string;
    truncated?: boolean;
}
interface SearchRequest {
    query: string;
    maxResults?: number;
}
interface SearchProvider {
    id: string;
    available(): boolean;
    search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
}
interface WebFetchRequest {
    url: string;
}
interface WebFetchBody {
    kind: 'text' | 'html';
    content: string;
}
interface WebFetchResult {
    url: string;
    statusCode: number;
    body: WebFetchBody;
    truncated: boolean;
}
interface WebFetchProvider {
    id: string;
    available(): boolean;
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
}
type AppContext = Context & {
    web: {
        registerSearchProvider(provider: SearchProvider): () => void;
        registerFetchProvider(provider: WebFetchProvider): () => void;
    };
};
/** 每个引擎一次操作所需的已解析配置快照。 */
interface Resolved {
    ctx: AppContext;
    cfg: Config;
}
export declare function searchSearxng(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchTavily(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchSerper(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchBrave(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchBing(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchGoogleCse(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
/** 清洗并截断 snippet：去 HTML 标签、折叠空白、限制长度。 */
export declare function cleanSnippet(text: string | undefined, max: number): string | undefined;
/** 取 URL 的根域名（去 www.）。 */
export declare function domainOf(url: string): string;
/** 每个域名最多保留 limit 条（0=不限制）。 */
export declare function dedupeByDomain<T extends SearchSource>(sources: T[], limit: number): T[];
export declare function queryTokens(query: string): string[];
/** 按查询词与标题/摘要的相关度降序排序（稳定：同分保持原序）。 */
export declare function sortByRelevance(sources: SearchSource[], query: string): SearchSource[];
/** 内置引擎的展示名（对外暴露给第三方作者参考）。 */
export declare const BUILTIN_LABELS: Record<string, string>;
/** 归一化的一条搜索结果（供自定义源返回）。 */
export interface SearchSourceItem {
    url: string;
    title?: string;
    snippet?: string;
    publishedAt?: string;
}
/**
* 开放注册用的搜索源适配器。任何 Cordis 插件都可把它 register 进
* `web-search-thirdparty` 服务，从而给本插件添加自定义搜索源。
*/
export interface SearchSourceAdapter {
    /** 唯一 id（不能与已有源重复）。 */
    id: string;
    /** 展示名。 */
    label: string;
    /** 可选：当前 config 下是否可用（缺省视为可用）。 */
    available?(config: Record<string, unknown>): boolean;
    /** 执行一次搜索，返回归一化结果。 */
    search(input: {
        query: string;
        maxResults?: number;
        config: Record<string, unknown>;
    }, signal?: AbortSignal): Promise<{
        sources: SearchSourceItem[];
        content?: string;
    }>;
}
/** 本插件的开放注册表服务（其它插件 inject: [PROVIDER_SERVICE_ID]）。 */
export declare class ProviderRegistry extends Service {
    readonly sources: Map<string, SearchSourceAdapter>;
    constructor(ctx: Context);
    register(adapter: SearchSourceAdapter): () => void;
    list(): string[];
}
/** 构造要尝试的 provider 链：[主源, 其余可用源]，按注册表顺序，去重。 */
export declare function buildProviderChain(cfg: Config, registry: ProviderRegistry): string[];
export declare class ThirdPartySearchProvider implements SearchProvider {
    private readonly resolveOptions;
    readonly id = "web-search-thirdparty";
    constructor(resolveOptions: () => Resolved);
    available(): boolean;
    search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
}
/** 简易抓取 provider：取正文文本并截断，供官方 web_fetch 工具使用。 */
export declare class LocalFetchProvider implements WebFetchProvider {
    private readonly resolveOptions;
    readonly id = "web-search-thirdparty-fetch";
    constructor(resolveOptions: () => Resolved);
    available(): boolean;
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
}
export declare function apply(ctx: AppContext, config: Config): void;
export {};
