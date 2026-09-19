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
import type { Context } from '@deepseek-ai/cordis';
import { Service } from '@deepseek-ai/cordis';
import type { EngineSpec } from './engine-spec.js';
import { Config } from './config.js';
import type { AppContext, Resolved, SearchProvider, SearchRequest, SearchResult, WebFetchProvider, WebFetchRequest, WebFetchResult } from './types.js';
export { Config, DEFAULT_SEARXNG_BASE_URL } from './config.js';
export { cleanSnippet, dedupe, dedupeByDomain, domainOf, normalizePublishedAt, queryTokens, sortByRelevance, toSource, } from './text.js';
export { decodeEntities, htmlToMarkdown, stripInlineTags, NAMED_ENTITIES } from './html.js';
export { assertPublicUrl, fetchManualRedirects, isPrivateIp, isPrivateName, MAX_REDIRECT_HOPS, stripHostBrackets } from './net.js';
export { activeEndpointsOf, cacheKeyOf, getCacheStats, getCircuitStates, getSearchStats, resetCacheStats, resetRuntimeState, resetSearchStats, } from './state.js';
export type { AppContext, Resolved, SearchRequest, SearchResult, SearchSource, WebFetchRequest, WebFetchResult } from './types.js';
/** Stable provider id registered on `ctx.web` (must match cordis.patch.yml `web.searchProvider`). */
export declare const PROVIDER_ID = "web-search-thirdparty";
export declare const FETCH_PROVIDER_ID = "web-search-thirdparty-fetch";
export declare const PROVIDER_SERVICE_ID = "web-search-thirdparty";
/** 插件名（loader row id 用短名，与官方 web-search-deepseek 同风格）。 */
export declare const name = "web-search-thirdparty";
/** 注册进哪个服务缝。 */
export declare const inject: string[];
export declare function searchSearxng(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchTavily(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchSerper(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchBrave(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchBing(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
export declare function searchGoogleCse(r: Resolved, req: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
/** 内置引擎实现表（id 与 ENGINE_SPECS 一一对应；完整性由 tests/engine-spec.test.ts 校验）。 */
export declare const ENGINES: Record<string, (r: Resolved, req: SearchRequest, signal?: AbortSignal) => Promise<SearchResult>>;
/** 异步判断某内置源是否“可用”：字面量 → credentials 服务 → 启动环境，与真实搜索同一解析链。
 *  由 ENGINE_SPECS 的凭据输入行驱动（不带凭据的引擎如 searxng 恒可用）；
 *  未知的自定义源 id 默认视为可用。 */
export declare function builtinKeyAvailable(ctx: AppContext, cfg: Config, id: string): Promise<boolean>;
/** 内置引擎的展示名（由 ENGINE_SPECS 派生，对外暴露给第三方作者参考）。 */
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
    register(adapter: SearchSourceAdapter, internal?: boolean): () => void;
    list(): string[];
}
/** 把内置引擎包装成统一 adapter（内部用；可用性由 buildProviderChain 走 credentials-aware 探测）。 */
export declare function builtinAdapter(ctx: AppContext, spec: EngineSpec): SearchSourceAdapter;
/** 构造要尝试的 provider 链：[主源, 显式 fallback, 其余可用源]，按注册表顺序，去重。
 *  内置源的可用性与真实搜索走同一套凭据解析（credentials 服务里的 key 也算已配置）；
 *  ctx 省略时退化为 adapter.available / 默认可用。 */
export declare function buildProviderChain(cfg: Config, registry: ProviderRegistry, ctx?: AppContext): Promise<string[]>;
/**
 * 同步可判定性：字面量 → 启动环境变量。credentials 服务里的 key 只能异步解析，
 * 同步没看到时保持乐观（true），由 refreshAvailability() 的探测结果修正。
 */
export declare function syncKeyAvailable(ctx: AppContext, cfg: Config, id: string): boolean;
export declare class ThirdPartySearchProvider implements SearchProvider {
    private readonly resolveOptions;
    readonly id = "web-search-thirdparty";
    /** 异步探测得到的每源可用性（apply 时与每次配置变更后刷新）。 */
    private readonly probed;
    constructor(resolveOptions: () => Resolved);
    /** 用与真实搜索同一套凭据解析链刷新各内置源的可用性（供 available() 同步读取）。 */
    refreshAvailability(): Promise<void>;
    available(): boolean;
    search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
}
/** 用当前配置 + 表单传入值，组装一次测试搜索用 config（取值映射由 ENGINE_SPECS 驱动）。 */
export declare function cfgFromTestBody(cfg: Config, body: any): Config;
/** 简易抓取 provider：取正文文本并截断，供官方 web_fetch 工具使用。 */
export declare class LocalFetchProvider implements WebFetchProvider {
    private readonly resolveOptions;
    readonly id = "web-search-thirdparty-fetch";
    constructor(resolveOptions: () => Resolved);
    available(): boolean;
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
}
export declare function apply(ctx: AppContext, config: Config): void;
