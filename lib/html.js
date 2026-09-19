/**
 * html.ts —— 极简 HTML 清洗与实体解码（纯函数，无平台依赖）。
 *
 * 供 snippet 清洗与 web_fetch 的 HTML→Markdown 转换共用。
 */
/** 常用命名实体（其余走数字/十六进制通用解码）。 */
export const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
    middot: '·', bull: '•', deg: '°', plusmn: '±', times: '×', divide: '÷',
    euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', eacute: 'é',
};
/** 通用 HTML 实体解码：命名 + &#123; 十进制 + &#x1F; 十六进制；未知实体原样保留。 */
export function decodeEntities(input) {
    return input.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body) => {
        if (body.startsWith('#')) {
            // body 形如 "#x4e2d" / "#39"：十六进制标记在 # 之后
            const code = /^#[xX]/.test(body)
                ? Number.parseInt(body.slice(2), 16)
                : Number.parseInt(body.slice(1), 10);
            if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
                try {
                    return String.fromCodePoint(code);
                }
                catch {
                    return m;
                }
            }
            return m;
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? m;
    });
}
/** 去标签 + 折叠空白（用于标题/锚文本等行内片段）。 */
export function stripInlineTags(html) {
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
    s = decodeEntities(s);
    s = s.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    return s;
}
//# sourceMappingURL=html.js.map