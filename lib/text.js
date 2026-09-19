/**
 * text.ts —— 结果归一化与后处理（纯函数）。
 *
 * 覆盖：时间戳归一化、原始字段→SearchSource、去重、snippet 清洗、
 * 域名限额、查询分词与相关度排序。
 */
import { decodeEntities } from './html.js';
/** 按 url 去重，丢掉空 url。 */
export function dedupe(sources) {
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
/** 归一化时间戳：可解析的转 ISO；解析不了的（如 Brave 的 “2 hours ago”、Serper 的相对日期）直接丢弃。 */
export function normalizePublishedAt(value) {
    if (value == null)
        return undefined;
    const s = String(value).trim();
    if (s.length === 0)
        return undefined;
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        const d = new Date(s.length >= 13 ? n : n * 1000); // 秒/毫秒时间戳自适应
        return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}
/** 引擎原始字段 → 归一化 SearchSource（空值字段一律省略）。 */
export function toSource(url, title, snippet, published) {
    const out = { url: String(url ?? '').trim() };
    const t = String(title ?? '');
    if (t.length > 0)
        out.title = t;
    const sn = String(snippet ?? '');
    if (sn.length > 0)
        out.snippet = sn;
    const pub = normalizePublishedAt(published);
    if (pub !== undefined)
        out.publishedAt = pub;
    return out;
}
/** 清洗并截断 snippet：去 HTML 标签、解码实体、折叠空白、限制长度。 */
export function cleanSnippet(text, max) {
    if (text === undefined)
        return undefined;
    let sn = String(text);
    sn = sn.replace(/<[^>]+>/g, ' ');
    sn = decodeEntities(sn);
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
/** 查询分词（小写、按非字母数字切分、保留 CJK）。 */
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
//# sourceMappingURL=text.js.map