/**
 * 设置分区代际回归测试。
 *
 * 复现并锁死本次修复的根因：DSH ≥ 0.1.7-alpha.1 的设置服务（`dsh-settings` 的
 * `SettingsForms`）只把 **schema 上声明为 volatile** 的字段投影成设置页表单；
 * 一个 volatile 字段都没有的条目，`describe()` 会直接跳过它（`volatileForm()` 返回
 * undefined），于是设置分区在浏览器里根本不存在 —— 用户看到的就是“填入 Tavily key →
 * 点保存 → key 被清空（其实是从未被写入）”。
 *
 * 这里用真实 schemastery / cosmokit（`vi.importActual`）复刻上游的投影规则，
 * 而不是依赖本项目自己的实现，避免“自己测自己”。
 */
import { describe, expect, it, vi } from 'vitest'
import { buildConfigSchema, DEFAULT_SEARXNG_BASE_URL } from '../src/config.js'
import { unwrapConfig, unwrapVolatile, isVolatileRef } from '../src/volatile.js'
import { credentialFingerprint, PROVIDER_SERVICE_ID, ThirdPartySearchProvider } from '../src/index.js'

const realZ = (await vi.importActual<any>('@deepseek-ai/schemastery')).default
const realCosmokit = await vi.importActual<any>('@deepseek-ai/cosmokit')

/**
 * 上游 `@deepseek-ai/dsh-settings` 的 `volatileForm()` + `plainSchema()` 等价实现
 * （0.1.7-alpha.2 版）。规则：节点自己带 `meta.volatile` 就整棵收下；否则只有 object
 * 能递归挑出 volatile 子节点，一个都没挑到就返回 undefined —— 该条目对设置页不存在。
 */
function plainSchema(schema: any): any {
  const result = new realZ(schema.toJSON())
  const walk = (node: any): void => {
    if (node?.meta !== undefined) delete node.meta.volatile
    // secret 字段的 default/required 必须剥掉：默认值不下发到浏览器
    if (node?.meta?.role === 'secret') {
      delete node.meta.default
      delete node.meta.required
    }
    for (const child of Object.values(node?.dict ?? {})) walk(child)
    if (node?.inner !== undefined) walk(node.inner)
    for (const child of node?.list ?? []) walk(child)
  }
  walk(result)
  return result
}

function volatileForm(schema: any): any {
  if (schema.meta?.volatile === true) return plainSchema(schema)
  if (schema.type === 'object') {
    const dict = Object.fromEntries(Object.entries(schema.dict ?? {}).flatMap(([key, child]: any) => {
      const field = volatileForm(child)
      return field === undefined ? [] : [[key, field]]
    }))
    return Object.keys(dict).length === 0 ? undefined : realZ.object(dict)
  }
  return undefined
}

describe('Config schema 的 volatile 契约', () => {
  it('新代际（≥0.1.7）：每个可编辑字段都挂 volatile', () => {
    const schema = buildConfigSchema(realZ, true)
    // 注意：schemastery 的 toJSON() 是带 refs 的模式信封；上游 volatileForm 读的是**活对象**的
    // .dict（每个值是 schema 实例），所以这里也读 .dict。
    const dict = schema.dict as Record<string, any>
    const missing = Object.entries(dict).filter(([, node]) => node.meta?.volatile !== true).map(([key]) => key)
    expect(missing).toEqual([])
    expect(Object.keys(dict).length).toBeGreaterThan(40)
  })

  it('旧代际（≤0.1.6）：不挂 volatile（旧 describe 不拆引用，挂了会被 JSON 成 {}）', () => {
    const schema = buildConfigSchema(realZ, false)
    const dict = schema.dict as Record<string, any>
    expect(Object.values(dict).some((node: any) => node.meta?.volatile === true)).toBe(false)
  })

  it('复现根因：没有 volatile 字段的条目会被设置服务整个跳过', () => {
    const skipped = volatileForm(buildConfigSchema(realZ, false))
    expect(skipped).toBeUndefined() // ← 分区不存在 → ctx.remote.settings.mutate() 必被拒
    const served = volatileForm(buildConfigSchema(realZ, true))
    expect(served).toBeDefined() // ← 修复后分区上线
  })

  it('修复后：Tavily 密钥字段确实进了设置表单，且仍是 secret 角色', () => {
    const served = volatileForm(buildConfigSchema(realZ, true))
    const dict = served.dict as Record<string, any>
    expect(dict.tavilyApiKey).toBeDefined()
    expect(dict.tavilyApiKey.meta.role).toBe('secret')
    // secret 字段的 default 会被上游剥掉，避免把旧密钥当默认值下发给浏览器
    expect(dict.tavilyApiKey.meta.default).toBeUndefined()
  })

  it('volatile 字段解析出的是引用，未解包时读不到字符串', () => {
    const schema = buildConfigSchema(realZ, true)
    const parsed: any = schema({ provider: 'tavily', tavilyApiKey: 'tvly-live' })
    expect(isVolatileRef(parsed.tavilyApiKey)).toBe(true)
    expect(parsed.tavilyApiKey).not.toBe('tvly-live')
    expect(unwrapConfig(parsed).tavilyApiKey).toBe('tvly-live')
  })
})

describe('unwrapVolatile / unwrapConfig', () => {
  it('递归解包引用，并保持普通数据形状', () => {
    const inner = realCosmokit.createVolatile({ a: 'x', b: [1, 2] })
    const outer = realCosmokit.createVolatile('plain')
    const value = {
      provider: outer,
      searxngBaseURL: DEFAULT_SEARXNG_BASE_URL,
      nested: inner,
      untouched: new Date(0),
    }
    const plain: any = unwrapConfig(value)
    expect(plain.provider).toBe('plain')
    expect(plain.nested).toEqual({ a: 'x', b: [1, 2] })
    expect(plain.searxngBaseURL).toBe(DEFAULT_SEARXNG_BASE_URL)
    expect(plain.untouched).toBeInstanceOf(Date) // 类实例不深挖
  })

  it('没有引用时是恒等变换（旧代际路径零成本）', () => {
    const value = { provider: 'searxng', maxResults: 8 }
    expect(unwrapConfig(value)).toEqual(value)
    expect(isVolatileRef(realCosmokit.createVolatile(1))).toBe(true)
    expect(isVolatileRef(1)).toBe(false)
    expect(unwrapVolatile('x')).toBe('x')
  })

  it('引用内容被宿主更新后，重新解包能读到新值（设置页写入即时生效）', () => {
    const ref = realCosmokit.createVolatile('before')
    const cfg: any = { tavilyApiKey: ref }
    expect(unwrapConfig(cfg).tavilyApiKey).toBe('before')
    // 宿主侧的做法：用新解析出的引用整体替换目标引用的内容（cosmokit.updateVolatile）
    realCosmokit.updateVolatile(ref, realCosmokit.createVolatile('after'))
    expect(unwrapConfig(cfg).tavilyApiKey).toBe('after')
  })
})

describe('可用性探测缓存随凭据变化失效', () => {
  function makeCtx(): any {
    const registry = { sources: new Map<string, unknown>([['tavily', {}]]) }
    return { get: (name: string) => (name === PROVIDER_SERVICE_ID ? registry : undefined) }
  }

  function makeCfg(overrides: Record<string, unknown> = {}): any {
    return {
      provider: 'tavily',
      tavilyApiKey: '',
      tavilyApiKeyEnv: 'TAVILY_API_KEY',
      ...overrides,
    }
  }

  it('保存 key 后旧探测结果立刻作废（否则要重启 DSH 才生效）', async () => {
    let cfg = makeCfg()
    const provider: any = new ThirdPartySearchProvider(() => ({ ctx: makeCtx(), cfg }))
    await provider.refreshAvailability()
    expect(provider.available()).toBe(false) // 探测到没有 key

    // 模拟用户在设置页保存了密钥：volatile 引用内容变了，配置对象本身没换
    cfg = makeCfg({ tavilyApiKey: 'tvly-live' })
    expect(credentialFingerprint(cfg)).not.toBe(credentialFingerprint(makeCfg()))
    expect(provider.available()).toBe(true)
  })

  it('指纹只吃凭据相关字段，顺序确定', () => {
    const a = makeCfg({ maxResults: 1 })
    const b = makeCfg({ maxResults: 20 })
    expect(credentialFingerprint(a)).toBe(credentialFingerprint(b))
    expect(credentialFingerprint(makeCfg({ tavilyApiKeyEnv: 'OTHER' })))
      .not.toBe(credentialFingerprint(a))
  })
})
