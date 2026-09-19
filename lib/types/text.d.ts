import type { SearchSource } from './types.js';
/** 按 url 去重，丢掉空 url。 */
export declare function dedupe(sources: SearchSource[]): SearchSource[];
/** 归一化时间戳：可解析的转 ISO；解析不了的（如 Brave 的 “2 hours ago”、Serper 的相对日期）直接丢弃。 */
export declare function normalizePublishedAt(value: unknown): string | undefined;
/** 引擎原始字段 → 归一化 SearchSource（空值字段一律省略）。 */
export declare function toSource(url: unknown, title: unknown, snippet: unknown, published: unknown): SearchSource;
/** 清洗并截断 snippet：去 HTML 标签、解码实体、折叠空白、限制长度。 */
export declare function cleanSnippet(text: string | undefined, max: number): string | undefined;
/** 取 URL 的根域名（去 www.）。 */
export declare function domainOf(url: string): string;
/** 每个域名最多保留 limit 条（0=不限制）。 */
export declare function dedupeByDomain<T extends SearchSource>(sources: T[], limit: number): T[];
/** 查询分词（小写、按非字母数字切分、保留 CJK）。 */
export declare function queryTokens(query: string): string[];
/** 按查询词与标题/摘要的相关度降序排序（稳定：同分保持原序）。 */
export declare function sortByRelevance(sources: SearchSource[], query: string): SearchSource[];
