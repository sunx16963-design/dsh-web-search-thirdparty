import type { Config } from './config.js';
/** 剥掉 IPv6 字面量的方括号（URL.hostname 对 IPv6 返回 “[::1]” 形式，不剥会绕过所有前缀判断）。 */
export declare function stripHostBrackets(host: string): string;
/** 是否属于“不应被 web_fetch 访问”的 IPv4/IPv6 地址（私网、环回、特殊段）。 */
export declare function isPrivateIp(addr: string): boolean;
/** 主机名层面的拒绝：localhost / 元数据服务名 / IP 字面量（含私有段）。 */
export declare function isPrivateName(host: string): boolean;
/** 目标 URL 是否通过 SSRF 校验（fetchAllowPrivate=true 时整体放行）。 */
export declare function assertPublicUrl(url: URL, cfg: Config): Promise<void>;
export declare const MAX_REDIRECT_HOPS = 5;
/** 手动逐跳跟随重定向（默认 follow 不会复查 Location），每一跳都重新过 SSRF 校验。 */
export declare function fetchManualRedirects(target: URL, headers: Record<string, string>, cfg: Config, signal: AbortSignal): Promise<Response>;
