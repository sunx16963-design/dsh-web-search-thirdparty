/**
 * net.ts —— web_fetch 的 SSRF 防护与逐跳重定向。
 *
 * 策略：默认拒绝私网 / 环回 / link-local / 云元数据 / 非公网特殊段；
 * 每一跳重定向都重新校验（默认 follow 不会复查 Location）。
 *
 * 已知残留风险（见 README「安全」一节）：校验与实际连接之间存在 DNS 重解析窗口
 * （0-TTL rebinding 的 TOCTOU）。彻底消除需要在 connect 层 pin 已校验 IP，
 * 那要引入 undici 之类的自定义 dispatcher；当前实现选择不增加运行期依赖。
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import { WebError } from '@deepseek-ai/dsh-web'
import type { Config } from './config.js'

/** 剥掉 IPv6 字面量的方括号（URL.hostname 对 IPv6 返回 “[::1]” 形式，不剥会绕过所有前缀判断）。 */
export function stripHostBrackets(host: string): string {
  const h = host.toLowerCase().trim()
  return h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h
}

/** 是否属于“不应被 web_fetch 访问”的 IPv4/IPv6 地址（私网、环回、特殊段）。 */
export function isPrivateIp(addr: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr)
  if (v4 !== null) {
    const a = Number(v4[1]); const b = Number(v4[2]); const c = Number(v4[3]); const d = Number(v4[4])
    if (a > 255 || b > 255 || c > 255 || d > 255) return true // 非法段按不可信处理
    if (a === 0 || a === 10 || a === 127) return true // this-network / 私网 / 环回
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true // link-local（云元数据）
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true // 192.0.0.0/24 + TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true // 基准测试网段 198.18.0.0/15
    if (a === 192 && b === 88 && c === 99) return true // 6to4 relay anycast
    if (a >= 240) return true // 保留段 240.0.0.0/4（含 255.255.255.255）
    return false
  }
  const lower = addr.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // ULA fc00::/7
  if (/^fe[89ab]/.test(lower)) return true // link-local fe80::/10
  if (lower.startsWith('ff')) return true // 组播 ff00::/8
  if (lower.startsWith('2002:')) return true // 6to4 2002::/16
  if (lower.startsWith('2001:0000:') || lower.startsWith('2001:0:')) return true // Teredo 2001::/32
  if (lower.startsWith('2001:db8:')) return true // 文档用 2001:db8::/32
  if (lower.startsWith('64:ff9b:')) return true // NAT64 well-known prefix 64:ff9b::/96
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped：::ffff:a.b.c.d 点分形式，或 WHATWG 压缩后的十六进制 ::ffff:7f00:1
    const tail = lower.slice(7)
    if (tail.includes('.')) return isPrivateIp(tail)
    const parts = tail.split(':')
    if (parts.length === 2) {
      const hi = Number.parseInt(parts[0], 16)
      const lo = Number.parseInt(parts[1], 16)
      if (Number.isFinite(hi) && Number.isFinite(lo) && hi >= 0 && hi <= 0xffff && lo >= 0 && lo <= 0xffff) {
        return isPrivateIp(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`)
      }
    }
    return true // 无法识别的映射形态一律按私网处理（保守拒绝）
  }
  return false
}

/** 主机名层面的拒绝：localhost / 元数据服务名 / IP 字面量（含私有段）。 */
export function isPrivateName(host: string): boolean {
  const h = stripHostBrackets(host).replace(/\.$/, '')
  if (h.length === 0) return true
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === 'metadata.google.internal' || h === 'instance-data') return true
  if (/^\d|^[0-9a-f:]+$/i.test(h)) return isPrivateIp(h)
  return false
}

/** 目标 URL 是否通过 SSRF 校验（fetchAllowPrivate=true 时整体放行）。 */
export async function assertPublicUrl(url: URL, cfg: Config): Promise<void> {
  if (cfg.fetchAllowPrivate) return
  const host = stripHostBrackets(url.hostname)
  if (host.length === 0 || isPrivateName(host)) {
    throw new WebError('blocked private / loopback address: ' + host, 'WEB_FETCH_BLOCKED_PRIVATE')
  }
  try {
    // IP 字面量在 node:dns 中原样返回，同样会被复查一遍
    const addrs = await dnsLookup(host, { all: true })
    for (const a of addrs) {
      if (isPrivateIp(a.address)) {
        throw new WebError('blocked private network address: ' + a.address + ' (' + host + ')', 'WEB_FETCH_BLOCKED_PRIVATE')
      }
    }
  } catch (error) {
    if (error instanceof WebError) throw error
    // DNS 解析失败不再放行：解析路径不一致正是 rebinding 的入口，宁可保守拒绝
    throw new WebError('blocked: DNS resolution failed for "' + host + '"', 'WEB_FETCH_BLOCKED_PRIVATE', { cause: error })
  }
}

export const MAX_REDIRECT_HOPS = 5

/** 手动逐跳跟随重定向（默认 follow 不会复查 Location），每一跳都重新过 SSRF 校验。 */
export async function fetchManualRedirects(target: URL, headers: Record<string, string>, cfg: Config, signal: AbortSignal): Promise<Response> {
  let current = target
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    await assertPublicUrl(current, cfg)
    const res = await fetch(current, { method: 'GET', signal, redirect: 'manual', headers })
    const location = res.headers.get('location')
    if (location === null || res.status < 300 || res.status >= 400) return res
    try { await res.arrayBuffer() } catch { /* 释放连接 */ }
    if (hop === MAX_REDIRECT_HOPS) {
      throw new WebError(`too many redirects (> ${MAX_REDIRECT_HOPS})`, 'WEB_PROVIDER_ERROR')
    }
    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      throw new WebError('invalid redirect location: ' + location, 'WEB_PROVIDER_ERROR')
    }
    if (next.protocol !== 'http:' && next.protocol !== 'https:') {
      throw new WebError(`redirect to unsupported protocol "${next.protocol}"`, 'WEB_PROVIDER_ERROR')
    }
    current = next
  }
  throw new WebError(`too many redirects (> ${MAX_REDIRECT_HOPS})`, 'WEB_PROVIDER_ERROR')
}
