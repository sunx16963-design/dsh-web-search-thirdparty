/**
 * html.ts —— 极简 HTML 清洗与实体解码（纯函数，无平台依赖）。
 *
 * 供 snippet 清洗与 web_fetch 的 HTML→Markdown 转换共用。
 */
/** 常用命名实体（其余走数字/十六进制通用解码）。 */
export declare const NAMED_ENTITIES: Record<string, string>;
/** 通用 HTML 实体解码：命名 + &#123; 十进制 + &#x1F; 十六进制；未知实体原样保留。 */
export declare function decodeEntities(input: string): string;
/** 去标签 + 折叠空白（用于标题/锚文本等行内片段）。 */
export declare function stripInlineTags(html: string): string;
/** 极简 HTML→Markdown 清洗：去 script/style、块级换行、标题/链接/图片转 Markdown、解码实体、折叠空白。 */
export declare function htmlToMarkdown(html: string): string;
