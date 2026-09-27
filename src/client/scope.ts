/**
 * scope.ts —— 两代 DSH 设置 API 的统一视图层（纯逻辑，不碰 DOM / React，便于单测）。
 *
 *   ≥ 0.1.7-alpha.1（C 代）：`ctx.configForms.get(<profile 条目 id>)`。条目 id 就是分区名，
 *     宿主只把 `Config` 上声明为 volatile 的字段投影成表单；`role('secret')` 字段在
 *     describe 时被剥掉，浏览器拿不到原值。
 *
 *     ⚠ 别指望 describe 的 `secrets: [{ path, set }]` 边车判断“存过没有”：上游把 `set` 定义为
 *     `value !== undefined`，而解析后的配置**总是**带着 secret 字段的默认空串，于是它对每个
 *     密钥恒为 true（实测确认）。真正的“配没配好”只能问运行期 —— 见本插件
 *     `GET /api/web-search-thirdparty/config`。
 *   ≤ 0.1.6-alpha.2（A/B 代）：`ctx.settingsScope.bind({ namespace })`，分区名是本插件自己
 *     installSection 注册的字面量。旧版写入被拒时**静默**回读 —— 这就是“点了保存什么也没发生”
 *     在旧版上的表现，务必靠 mutate 的返回值/回读来判定，而不是无条件显示成功。
 *
 * 关键契约：`mutate()` 必须把宿主的拒绝如实返回 false。旧代码直接 `Promise.all(scope.set(...))`
 * 并且无条件显示“✅ 已保存”，正是 Tavily key 看起来被清空、实际从未写进去的直接原因之一。
 */

/** C 代分区名 = profile 组合条目 id（cordis.patch.yml 里的 insert id）。 */
export const ENTRY_ID = 'web-search-thirdparty'
/** A/B 代分区名 = 本插件 installSection 注册的 namespace。 */
export const LEGACY_NAMESPACE = 'dsh-web-search-thirdparty'
/** 先按顺序找被宿主服务的分区，找不到再按 schema 特征兜底（条目 id 被改名也不会瞎掉）。 */
export const NAMESPACE_CANDIDATES = [ENTRY_ID, LEGACY_NAMESPACE]

/**
 * 本页会用到的设置字段（只用于类型提示，实际值来自宿主）。
 * 覆盖 `src/client/index.ts` 里直接读写的每一项；缺项会在 `npm run typecheck` 的
 * 客户端配置（tsconfig.client.json）里报错 —— 这正是当年漏掉的那道闸。
 */
export interface SettingsShape {
  provider?: string
  enableFetchProvider?: boolean
  searxngBaseURL?: string
  maxResults?: number
  mergeResults?: boolean
  maxPerDomain?: number
  relevanceSort?: boolean
  cacheEnabled?: boolean
  cacheTtlMs?: number
  tavilyApiKey?: string
  serperApiKey?: string
  braveApiKey?: string
  bingApiKey?: string
  googleApiKey?: string
  googleSearchEngineId?: string
}

/** 一次字段编辑（与宿主 mutate 的 op 同形）。 */
export interface ConfigOp {
  op: 'set' | 'unset'
  field: string
  value?: unknown
}

export interface ScopeSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value?: SettingsShape
  writable: boolean
  revision?: number
}

export interface SettingsScopeAdapter {
  /** 宿主是否真的在服务这个分区（false = 写了也会被拒，UI 必须明说）。 */
  served(): boolean
  getSnapshot(): ScopeSnapshot
  subscribe(listener: () => void): () => void
  /** 一次原子写入，返回宿主是否接受（false = 被拒绝，调用方必须如实报错）。 */
  mutate(ops: ConfigOp[]): Promise<boolean>
}

/**
 * 探测一个**可选**服务。
 *
 * cordis 对 `ctx.<service>` 的属性访问会强制 inject 检查并抛错，所以跨代兼容的插件
 * 只能用 `ctx.get()`。这里再兜一层 try/catch：任何意料之外的抛错都退化为「服务不可用」，
 * 绝不让设置页探测失败波及插件加载本身。
 *
 * @param ctx - 客户端插件上下文
 * @param name - 服务名
 * @returns 服务实例；不可用时为 undefined
 */
function optionalService(ctx: any, name: string): any {
  try {
    return ctx?.get?.(name) ?? undefined
  } catch {
    return undefined
  }
}

function namespacesOf(mirror: any): any[] {
  return (mirror?.getSnapshot?.().view?.namespaces ?? []) as any[]
}

/** C 代（≥ 0.1.7）适配器：configForms + describe 镜像。 */
export function createFormsAdapter(ctx: any): SettingsScopeAdapter | undefined {
  // ⚠ 必须用 ctx.get('configForms')，**不能**写 ctx.configForms。
  // cordis 的 Context 代理会对未在 inject 里声明的服务属性直接抛错
  // （`cannot get property "configForms" without inject`），而不是返回 undefined；
  // 本插件要同时兼容两代设置服务，不能把任一代写进 inject（写死任一个都会在另一代上
  // 永远等不到服务而整个插件加载失败）。ctx.get() 对「存在但未 inject」返回服务本身、
  // 对「不存在」返回 undefined，都不抛错 —— 这正是可选服务探测需要的语义。
  const forms = optionalService(ctx, 'configForms')
  if (forms === undefined || typeof forms.get !== 'function') return undefined
  const mirror = typeof forms.describe === 'function' ? forms.describe() : undefined
  const listeners = new Set<() => void>()
  const emit = (): void => { for (const listener of [...listeners]) listener() }
  let namespace: string | undefined
  let form: any
  let formOff: (() => void) | undefined

  const servedIds = (): string[] => namespacesOf(mirror).map((v) => String(v?.ns ?? ''))
  /** 条目被改名时的兜底：找一个 schema 里带本插件特征字段的分区。 */
  const matchBySchema = (): string | undefined => {
    for (const view of namespacesOf(mirror)) {
      const json = JSON.stringify(view?.schema ?? {})
      if (json.includes('tavilyApiKey') && json.includes('searxngBaseURL')) return String(view?.ns ?? '') || undefined
    }
    return undefined
  }

  const rebind = (): void => {
    const served = servedIds()
    const picked = NAMESPACE_CANDIDATES.find((id) => served.includes(id))
      ?? matchBySchema()
      // 镜像还没加载完（served 为空）时先按默认 id 绑定，分区上线后会再纠一次
      ?? (served.length === 0 ? NAMESPACE_CANDIDATES[0] : undefined)
    if (picked === namespace) return
    namespace = picked
    formOff?.()
    formOff = undefined
    form = picked === undefined ? undefined : forms.get(picked)
    if (form !== undefined && typeof form.subscribe === 'function') formOff = form.subscribe(() => emit())
    emit()
  }

  const offMirror = typeof mirror?.subscribe === 'function' ? mirror.subscribe(() => rebind()) : undefined
  rebind()
  ctx?.effect?.(() => () => { offMirror?.(); formOff?.() }, 'web-search-thirdparty: settings scope')

  return {
    served: () => namespace !== undefined && servedIds().includes(namespace),
    getSnapshot: () => {
      if (form === undefined) return { status: 'unavailable', writable: false }
      const snap = form.getSnapshot()
      return {
        status: snap?.status ?? 'unavailable',
        value: snap?.value,
        writable: snap?.writable !== false,
        revision: snap?.revision,
      }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    mutate: async (ops) => {
      if (form === undefined) return false
      const payload = ops.map((op) => (op.op === 'set'
        ? { op: 'set', path: [op.field], value: op.value }
        : { op: 'unset', path: [op.field] }))
      const accepted = await form.mutate(payload)
      return accepted !== false
    },
  }
}

/** A/B 代（≤ 0.1.6）适配器：settingsScope.bind。 */
export function createLegacyAdapter(ctx: any): SettingsScopeAdapter | undefined {
  // 同 createFormsAdapter：可选服务必须走 ctx.get()
  const service = optionalService(ctx, 'settingsScope')
  if (service === undefined || typeof service.bind !== 'function') return undefined
  const scope = service.bind({
    namespace: LEGACY_NAMESPACE,
    decode: (value: unknown) => (typeof value === 'object' && value !== null ? value as SettingsShape : undefined),
  })
  return {
    served: () => scope.getSnapshot?.().status === 'ready',
    getSnapshot: () => {
      const snap = scope.getSnapshot?.() ?? {}
      return {
        status: snap.status ?? 'unavailable',
        value: snap.value,
        writable: snap.writable !== false,
        revision: snap.revision,
      }
    },
    subscribe: (listener) => scope.subscribe(listener),
    mutate: async (ops) => {
      // 旧代 mutate 不回报成败（被拒时静默回读），只能顺序写入后由调用方回读校验
      for (const op of ops) {
        if (op.op === 'set') await scope.set(op.field, op.value)
        else await scope.unset(op.field)
      }
      return true
    },
  }
}

/** 优先 C 代，其次 A/B 代；两代服务都不在时返回 undefined（UI 明示无法保存）。 */
export function createScopeAdapter(ctx: any): SettingsScopeAdapter | undefined {
  return createFormsAdapter(ctx) ?? createLegacyAdapter(ctx)
}

// ─────────────────────────────────────────────────────────────────────────────
// 保存表单 → 写入 op 列表（纯函数，便于把“密钥不能被空串抹掉”这类规则锁进测试）
// ─────────────────────────────────────────────────────────────────────────────

/** 用户在设置页上填的一整屏值（都是原始字符串，转换规则集中在这里）。 */
export interface SaveFormState {
  provider: string
  /** 主输入行（key 或 SearXNG 实例 URL）；无对应 spec 时省略。 */
  main?: { field: string; secret: boolean; value: string }
  /** 可选第二输入行（google-cse 的 cx）。 */
  second?: { field: string; secret: boolean; value: string }
  maxResults: string
  mergeResults: boolean
  advanced: Array<{ key: string; value: string; numeric: boolean }>
  enableFetchProvider: boolean
  maxPerDomain: string
  relevanceSort: boolean
  cacheEnabled: boolean
  cacheTtlSeconds: string
}

/** 搜索条数夹取到 1..20（非法值回落到默认 8）。 */
export function clampMaxResults(value: number): number {
  if (!Number.isFinite(value)) return 8
  return Math.max(1, Math.min(20, Math.round(value)))
}

/** 缓存秒数夹取到 0..86400。 */
export function clampInt(value: number): number {
  if (!Number.isFinite(value)) return 0
  const n = Math.round(value)
  if (n < 0) return 0
  if (n > 86400) return 86400
  return n
}

/**
 * 把表单状态翻译成一次原子写入的 op 列表。
 *
 * 关键规则：**空白的敏感字段不产生任何 op**。密钥在浏览器侧本来就拿不到原值
 * （`role('secret')` 会被宿主脱敏），如果把空输入回写成 `''`，就等于把已保存的密钥抹掉
 * —— 那正是“点保存 key 被清空”的另一半原因。
 *
 * @returns ops 与本次是否写了敏感字段（UI 据此提示“已保存”并回读确认）。
 */
export function buildSaveOps(state: SaveFormState): { ops: ConfigOp[]; wroteSecret: boolean } {
  const ops: ConfigOp[] = [{ op: 'set', field: 'provider', value: state.provider }]
  let wroteSecret = false
  if (state.main !== undefined) {
    const value = state.main.value.trim()
    if (value.length > 0) {
      ops.push({ op: 'set', field: state.main.field, value })
      if (state.main.secret) wroteSecret = true
    }
  }
  if (state.second !== undefined) {
    const value = state.second.value.trim()
    if (value.length > 0) {
      ops.push({ op: 'set', field: state.second.field, value })
      if (state.second.secret) wroteSecret = true
    }
  }
  ops.push({ op: 'set', field: 'maxResults', value: clampMaxResults(Number(state.maxResults)) })
  ops.push({ op: 'set', field: 'mergeResults', value: state.mergeResults })
  for (const field of state.advanced) {
    const raw = field.value.trim()
    if (raw === '') continue
    ops.push({ op: 'set', field: field.key, value: field.numeric ? Number(raw) : raw })
  }
  ops.push({ op: 'set', field: 'enableFetchProvider', value: state.enableFetchProvider })
  ops.push({ op: 'set', field: 'maxPerDomain', value: clampInt(Number(state.maxPerDomain)) })
  ops.push({ op: 'set', field: 'relevanceSort', value: state.relevanceSort })
  ops.push({ op: 'set', field: 'cacheEnabled', value: state.cacheEnabled })
  const cacheSeconds = clampInt(Number(state.cacheTtlSeconds))
  ops.push({ op: 'set', field: 'cacheTtlMs', value: cacheSeconds > 0 ? Math.max(1000, cacheSeconds * 1000) : 60000 })
  return { ops, wroteSecret }
}
