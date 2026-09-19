/**
 * types.ts —— 内部词汇表：`ctx.web` 搜索/抓取 seam 的形状，以及宿主插件的运行期上下文。
 *
 * 形状与官方 `@deepseek-ai/dsh-web` 的 `WebSearch*` / `WebFetch*` 一一对应，
 * 这里只做本地声明，避免编译期硬依赖（垫片见 src/shims.d.ts）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './config.js';
/** 一条可引用的搜索结果（对齐官方 WebSearchSource）。 */
export interface SearchSource {
    url: string;
    title?: string;
    snippet?: string;
    publishedAt?: string;
}
/** 归一化搜索结果（对齐官方 WebSearchResult）。 */
export interface SearchResult {
    sources: SearchSource[];
    content?: string;
    truncated?: boolean;
}
/** 一次搜索请求（对齐官方 WebSearchRequest）。 */
export interface SearchRequest {
    query: string;
    maxResults?: number;
}
/** 搜索 provider（对齐官方 WebSearchProvider）。 */
export interface SearchProvider {
    id: string;
    available(): boolean;
    search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
}
/** 抓取请求（对齐官方 WebFetchRequest）。 */
export interface WebFetchRequest {
    url: string;
}
/** 抓取正文（对齐官方 WebFetchBody）。 */
export interface WebFetchBody {
    kind: 'text' | 'html';
    content: string;
}
/** 抓取结果（对齐官方 WebFetchResult）。 */
export interface WebFetchResult {
    url: string;
    statusCode: number;
    body: WebFetchBody;
    truncated: boolean;
}
/** 抓取 provider（对齐官方 WebFetchProvider）。 */
export interface WebFetchProvider {
    id: string;
    available(): boolean;
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
}
/** 本插件运行期用到的宿主上下文切片（`ctx.web` 的注册入口）。 */
export type AppContext = Context & {
    web: {
        registerSearchProvider(provider: SearchProvider): () => void;
        registerFetchProvider(provider: WebFetchProvider): () => void;
    };
};
/** 每个引擎一次操作所需的已解析配置快照。 */
export interface Resolved {
    ctx: AppContext;
    cfg: Config;
}
/** 一个凭据输入行的解析来源三元组。 */
export interface KeySpec {
    literal: string | undefined;
    envRef: string;
    envVar: string;
}
