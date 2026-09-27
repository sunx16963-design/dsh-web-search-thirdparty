/**
 * 客户端设置 scope 适配层的行为回归（纯 Node，不起浏览器）。
 *
 * 锁死两条真实故障链：
 *  1. 旧代码无条件 `Promise.all(scope.set(...))` 后显示“✅ 已保存”，而宿主其实拒绝了写入
 *     —— 适配层必须把拒绝如实返回 false。
 *  2. `role('secret')` 字段不会下发到浏览器，describe 的 `secrets` 边车又对每个密钥恒为
 *     set=true（实测），所以“配好没有”只能问插件的运行期路由；表单层则必须保证空输入
 *     不产生写入（否则会把已存密钥抹成空串）。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  buildSaveOps, createScopeAdapter, createFormsAdapter, createLegacyAdapter,
  ENTRY_ID, LEGACY_NAMESPACE,
} from '../src/client/scope.js'

/** 造一个 C 代 `configForms` 假件。 */
function fakeForms(opts: {
  served?: string[]
  secrets?: Array<{ path: string[]; set: boolean }>
  writable?: boolean
  accept?: boolean
  schema?: unknown
} = {}) {
  const served = opts.served ?? [ENTRY_ID]
  const view = {
    writable: opts.writable !== false,
    namespaces: served.map((ns) => ({
      ns,
      revision: 3,
      value: { provider: 'tavily', maxResults: 8 },
      schema: opts.schema ?? { dict: { tavilyApiKey: { meta: { role: 'secret' } }, searxngBaseURL: {} } },
      secrets: opts.secrets ?? [],
    })),
  }
  const listeners = new Set<() => void>()
  let formSubs: Array<() => void> = []
  const mutations: any[] = []
  const form = {
    getSnapshot: () => ({ status: 'ready', value: view.namespaces[0]?.value, writable: view.writable, revision: 3 }),
    subscribe: (fn: () => void) => { formSubs.push(fn); return () => { formSubs = formSubs.filter((f) => f !== fn) } },
    mutate: async (ops: any[]) => { mutations.push(ops); return opts.accept !== false },
  }
  const mirror = {
    getSnapshot: () => ({ view }),
    subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) },
  }
  return {
    mutations,
    ctx: { configForms: { describe: () => mirror, get: (id: string) => (served.includes(id) ? form : undefined) } },
  }
}

describe('createScopeAdapter', () => {
  it('C 代优先于 A/B 代', () => {
    const { ctx } = fakeForms()
    const fakeSettingsScope = { bind: () => { throw new Error('不该走旧路径') } }
    const adapter = createScopeAdapter({ ...ctx, settingsScope: fakeSettingsScope })
    expect(adapter).toBeDefined()
    expect(adapter!.served()).toBe(true)
  })

  it('两代服务都不在时返回 undefined（UI 据此禁用保存并说明原因）', () => {
    expect(createScopeAdapter({})).toBeUndefined()
    expect(createFormsAdapter({ configForms: {} })).toBeUndefined()
    expect(createLegacyAdapter({ settingsScope: {} })).toBeUndefined()
  })
})

describe('C 代（≥ 0.1.7）适配器', () => {
  it('分区名取 profile 条目 id', () => {
    const { ctx } = fakeForms()
    const adapter = createFormsAdapter(ctx)!
    expect(adapter.served()).toBe(true)
    expect(adapter.getSnapshot().status).toBe('ready')
  })

  it('secrets 边车不可作数：适配层不再对外暴露“已保存”判断', () => {
    const { ctx } = fakeForms({ secrets: [{ path: ['tavilyApiKey'], set: true }] })
    const adapter: any = createFormsAdapter(ctx)!
    expect(adapter.configuredSecrets).toBeUndefined()
  })

  it('宿主没服务该分区时 served()=false（不能假装能保存）', () => {
    const { ctx } = fakeForms({ served: ['some-other-plugin'], schema: { dict: { enabled: {} } } })
    const adapter = createFormsAdapter(ctx)!
    expect(adapter.served()).toBe(false)
  })

  it('条目 id 被改名时按 schema 特征兜底找到分区', () => {
    const { ctx } = fakeForms({ served: ['renamed-search-plugin'] })
    const adapter = createFormsAdapter(ctx)!
    expect(adapter.served()).toBe(true)
  })

  it('把宿主的拒绝如实返回 false（旧代码在这里假装成功）', async () => {
    const denied = createFormsAdapter(fakeForms({ accept: false }).ctx)!
    await expect(denied.mutate([{ op: 'set', field: 'tavilyApiKey', value: 'tvly-x' }])).resolves.toBe(false)
    const accepted = createFormsAdapter(fakeForms({ accept: true }).ctx)!
    await expect(accepted.mutate([{ op: 'set', field: 'tavilyApiKey', value: 'tvly-x' }])).resolves.toBe(true)
  })

  it('写入载荷是 {op,path,value}，unset 不带 value', async () => {
    const fake = fakeForms()
    const adapter = createFormsAdapter(fake.ctx)!
    await adapter.mutate([
      { op: 'set', field: 'provider', value: 'tavily' },
      { op: 'unset', field: 'tavilySearchDepth' },
    ])
    expect(fake.mutations[0]).toEqual([
      { op: 'set', path: ['provider'], value: 'tavily' },
      { op: 'unset', path: ['tavilySearchDepth'] },
    ])
  })

  it('镜像未加载完时先绑定默认条目 id，分区上线后自动纠正', () => {
    const { ctx } = fakeForms({ served: [] })
    const adapter = createFormsAdapter(ctx)!
    expect(adapter.served()).toBe(false) // 还没上线：UI 显示“正在读取/未服务”
  })

  it('非 loopback 页面（writable=false）会被如实透出', () => {
    const { ctx } = fakeForms({ writable: false })
    expect(createFormsAdapter(ctx)!.getSnapshot().writable).toBe(false)
  })
})

describe('A/B 代（≤ 0.1.6）适配器', () => {
  it('按插件注册的 namespace 绑定，并把 set/unset 顺序发出去', async () => {
    const calls: any[] = []
    const bound: any[] = []
    const ctx = {
      settingsScope: {
        bind: (spec: any) => {
          bound.push(spec)
          return {
            getSnapshot: () => ({ status: 'ready', value: { provider: 'tavily' }, writable: true, revision: 1 }),
            subscribe: () => () => {},
            set: async (field: string, value: unknown) => { calls.push(['set', field, value]) },
            unset: async (field: string) => { calls.push(['unset', field]) },
          }
        },
      },
    }
    const adapter = createLegacyAdapter(ctx)!
    expect(bound[0].namespace).toBe(LEGACY_NAMESPACE)
    await adapter.mutate([
      { op: 'set', field: 'tavilyApiKey', value: 'tvly-x' },
      { op: 'unset', field: 'tavilySearchDepth' },
    ])
    expect(calls).toEqual([['set', 'tavilyApiKey', 'tvly-x'], ['unset', 'tavilySearchDepth']])
    expect(adapter.served()).toBe(true)
  })
})

describe('buildSaveOps：一次保存的 op 列表', () => {
  const base = {
    provider: 'tavily',
    main: { field: 'tavilyApiKey', secret: true, value: '' },
    maxResults: '8',
    mergeResults: false,
    advanced: [] as Array<{ key: string; value: string; numeric: boolean }>,
    enableFetchProvider: true,
    maxPerDomain: '2',
    relevanceSort: false,
    cacheEnabled: true,
    cacheTtlSeconds: '60',
  }

  it('敏感字段留空不产生 op（否则会把已保存的 key 抹成空串）', () => {
    const { ops, wroteSecret } = buildSaveOps({ ...base })
    expect(ops.some((op) => op.field === 'tavilyApiKey')).toBe(false)
    expect(wroteSecret).toBe(false)
  })

  it('敏感字段有值时写入并 trim，且标记 wroteSecret', () => {
    const { ops, wroteSecret } = buildSaveOps({ ...base, main: { field: 'tavilyApiKey', secret: true, value: '  tvly-live  ' } })
    expect(ops.find((op) => op.field === 'tavilyApiKey')).toEqual({ op: 'set', field: 'tavilyApiKey', value: 'tvly-live' })
    expect(wroteSecret).toBe(true)
  })

  it('非敏感主输入（SearXNG 实例 URL）也走同一条路径', () => {
    const { ops, wroteSecret } = buildSaveOps({ ...base, provider: 'searxng', main: { field: 'searxngBaseURL', secret: false, value: 'https://s.example' } })
    expect(ops.find((op) => op.field === 'searxngBaseURL')?.value).toBe('https://s.example')
    expect(wroteSecret).toBe(false)
  })

  it('第二输入行（google-cse 的 cx）同样留空即跳过', () => {
    const withCx = buildSaveOps({ ...base, second: { field: 'googleSearchEngineId', secret: true, value: 'cx-1' } })
    expect(withCx.ops.find((op) => op.field === 'googleSearchEngineId')).toBeDefined()
    const blankCx = buildSaveOps({ ...base, second: { field: 'googleSearchEngineId', secret: true, value: '   ' } })
    expect(blankCx.ops.some((op) => op.field === 'googleSearchEngineId')).toBe(false)
  })

  it('条数/秒数夹取，空的高级参数不写入', () => {
    const { ops } = buildSaveOps({
      ...base,
      maxResults: '999',
      maxPerDomain: '-3',
      cacheTtlSeconds: '0',
      advanced: [{ key: 'tavilySearchDepth', value: '' , numeric: false }, { key: 'searxngSafesearch', value: '2', numeric: true }],
    })
    const get = (field: string) => ops.find((op) => op.field === field)?.value
    expect(get('maxResults')).toBe(20)
    expect(get('maxPerDomain')).toBe(0)
    expect(get('cacheTtlMs')).toBe(60000)
    expect(get('searxngSafesearch')).toBe(2)
    expect(get('tavilySearchDepth')).toBeUndefined()
  })

  it('provider 永远被写入（换源不需要重填 key）', () => {
    const { ops } = buildSaveOps({ ...base, provider: 'serper' })
    expect(ops[0]).toEqual({ op: 'set', field: 'provider', value: 'serper' })
  })
})
