/**
 * 客户端插件的**激活**测试（真实 cordis，跑打包产物）。
 *
 * 为什么必须有这个文件：0.4.1 / 0.4.2 两次「修好了」都是假的 ——
 *   - `tests/client-contract.test.ts` 只执行 factory（materialize），**从不调用 `apply()`**；
 *   - 端到端验证只覆盖宿主半边。
 * 于是 `apply()` 里的抛错（访问未 inject 的服务属性）无人拦截，浏览器看到的仍是
 * 启动页 “Failed to load plugin dsh-web-search-thirdparty”。
 *
 * 本例用**真实的 `@deepseek-ai/cordis`** 把 `lib/client.js` 当插件加载（和 DSH 客户端
 * 运行期同一条路），断言 fiber 进入 ACTIVE —— 只要 apply 抛错，fiber 就会是 FAILED。
 */
import { readFileSync } from 'node:fs'
import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'

// tests/platform-mocks.ts 把 @deepseek-ai/cordis 换成了只有 Service 的垫片；
// 本文件必须用**真实** cordis（激活语义就是这个文件要验证的东西）。
const { Context, Service } = await vi.importActual<any>('@deepseek-ai/cordis')
const { createScopeAdapter } = await import('../src/client/scope.js')

/** cordis FiberState：ACTIVE=2、FAILED=3（与 dsh-client-modules 里的镜像常量一致）。 */
const ACTIVE = 2
const FAILED = 3

const browserRequire = (id: string): any => {
  if (id === 'react') return React
  throw new Error('bundle 请求了未声明的外部依赖: ' + id)
}

/** 取打包产物里注册的模块（等价于浏览器加载该 script 后 materialize 的结果）。 */
function loadClientModule(): any {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  let def: any
  const fakeWindow = { __ModuleLoader__: { load: (definition: any) => { def = definition } } }
  // eslint-disable-next-line no-new-func -- 就是要按浏览器的方式执行产物
  new Function('window', 'require', source)(fakeWindow, browserRequire)
  if (def === undefined) throw new Error('bundle 没有调用 __ModuleLoader__.load 注册模块')
  return def.factory(browserRequire)
}

/** 最近一次构造的 slots 替身，供断言读取。 */
let lastSlots: SlotsStub | undefined

/** `ctx.slots` 的最小可用替身：记录注册、并立即执行注入回调。 */
class SlotsStub extends Service {
  readonly sections: string[] = []
  readonly registrations: any[] = []
  constructor(ctx: any) { super(ctx, 'slots'); lastSlots = this }
  inject(name: string, callback: (ctx: any) => any): () => void {
    this.sections.push(name)
    const dispose = callback(this.ctx)
    return typeof dispose === 'function' ? dispose : () => {}
  }
  register(options: any, component: any): () => void {
    this.registrations.push({ options, component })
    return () => {}
  }
}

/**
 * `configForms` 的替身：必须和真实实现一样「describe 报告被服务的分区 + get(id) 返回表单」，
 * 否则适配器会因为拿不到表单而停在 unavailable（这正是第一次测试替身写错时踩到的坑）。
 */
class ConfigFormsStub extends Service {
  constructor(ctx: any) { super(ctx, 'configForms') }
  describe(): any {
    return {
      getSnapshot: () => ({
        view: {
          writable: true,
          namespaces: [{ ns: 'web-search-thirdparty', revision: 0, value: { provider: 'tavily' }, secrets: [] }],
        },
      }),
      subscribe: () => () => {},
    }
  }
  get(_entryId: string): any {
    return {
      getSnapshot: () => ({ status: 'ready', value: { provider: 'tavily' }, writable: true, revision: 0 }),
      subscribe: () => () => {},
      mutate: async () => true,
    }
  }
}

class SettingsScopeStub extends Service {
  constructor(ctx: any) { super(ctx, 'settingsScope') }
  bind(_spec: any): any {
    return {
      getSnapshot: () => ({ status: 'unavailable', writable: false }),
      subscribe: () => () => {},
      set: async () => {},
      unset: async () => {},
    }
  }
}

/** 用给定服务集加载本插件的客户端半边，返回 fiber 状态与 slots 替身。 */
async function activate(withServices: Array<'slots' | 'configForms' | 'settingsScope'>) {
  const app = new Context()
  lastSlots = undefined
  // 服务像真实 DSH 客户端那样由插件 fiber 提供（这样才复现 cordis 的 inject 语义）
  if (withServices.includes('slots')) app.plugin(SlotsStub)
  if (withServices.includes('configForms')) app.plugin(ConfigFormsStub)
  if (withServices.includes('settingsScope')) app.plugin(SettingsScopeStub)
  await new Promise((resolve) => setTimeout(resolve, 40))
  const fiber: any = app.plugin(loadClientModule())
  await new Promise((resolve) => setTimeout(resolve, 80))
  const state = fiber?.state
  await app.stop?.()
  return { state, slots: lastSlots }
}

describe('客户端插件在真实 cordis 下能激活', () => {
  it('C 代（ctx.configForms 在场）→ ACTIVE，并注册了 settings.section', async () => {
    const { state, slots } = await activate(['slots', 'configForms'])
    expect(state).toBe(ACTIVE)
    expect(slots?.sections).toContain('settings.section')
    expect(slots?.registrations[0]?.options?.id).toBe('web-search-thirdparty')
  })

  it('A/B 代（只有 ctx.settingsScope）→ ACTIVE', async () => {
    const { state, slots } = await activate(['slots', 'settingsScope'])
    expect(state).toBe(ACTIVE)
    expect(slots?.sections).toContain('settings.section')
  })

  it('两代设置服务都不在（如安全模式/精简客户端）→ 仍然 ACTIVE，只是不可保存', async () => {
    const { state, slots } = await activate(['slots'])
    expect(state).toBe(ACTIVE)
    expect(slots?.sections).toContain('settings.section')
  })

  it('inject 里没有任何设置服务（跨代兼容的前提）', () => {
    const mod = loadClientModule()
    expect(mod.inject).toEqual(['slots'])
  })
})

describe('根因锚点：cordis 的属性访问会强制 inject', () => {
  it('未 inject 就 ctx.configForms → apply 抛错 → fiber FAILED（0.4.1/0.4.2 的病因）', async () => {
    const app = new Context()
    app.plugin(SlotsStub)
    app.plugin(ConfigFormsStub) // 服务存在，但下面的插件只 inject slots
    await new Promise((resolve) => setTimeout(resolve, 40))
    const fiber: any = app.plugin({
      name: 'property-access-probe',
      inject: ['slots'],
      apply(ctx: any) {
        // 这里就是当年的写法：const forms = ctx.configForms
        void ctx.configForms
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(fiber.state).toBe(FAILED)
    await app.stop?.()
  })

  it('ctx.get() 是可选服务的正确写法：存在则拿到，不存在则 undefined，都不抛错', async () => {
    const app = new Context()
    app.plugin(SlotsStub)
    app.plugin(ConfigFormsStub)
    await new Promise((resolve) => setTimeout(resolve, 40))
    const seen: string[] = []
    app.plugin({
      name: 'get-probe',
      inject: ['slots'],
      apply(ctx: any) {
        try { seen.push('present=' + String(ctx.get('configForms') !== undefined)) } catch { seen.push('present=throw') }
        try { seen.push('absent=' + String(ctx.get('settingsScope') === undefined)) } catch { seen.push('absent=throw') }
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(seen).toEqual(['present=true', 'absent=true'])
    await app.stop?.()
  })
})

describe('真实 cordis：设置服务晚到时必须自愈（本次线上故障）', () => {
  it('本插件先激活、configForms 后到 → 适配器自动从 unavailable 变为 ready', async () => {
    const app = new Context()
    app.plugin(SlotsStub) // 本插件只依赖 slots，所以会先激活
    let pluginCtx: any
    app.plugin({ name: 'ctx-capture', inject: ['slots'], apply(ctx: any) { pluginCtx = ctx } })
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(pluginCtx).toBeDefined()

    // 此刻设置服务还没注册（真实 boot 里 configForms 还要等 remote，而 remote 与本插件同批）
    const adapter = createScopeAdapter(pluginCtx)
    expect(adapter.getSnapshot().status).toBe('unavailable')
    const notified: number[] = []
    adapter.subscribe(() => notified.push(1))

    // 设置服务晚到
    app.plugin(ConfigFormsStub)
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(adapter.getSnapshot().status).not.toBe('unavailable')
    expect(notified.length).toBeGreaterThan(0) // UI 必须被通知去重渲染
    await app.stop?.()
  })

  it('控制组：服务先就绪时，apply 后立刻可用（不需要等待）', async () => {
    const app = new Context()
    app.plugin(SlotsStub)
    app.plugin(ConfigFormsStub)
    await new Promise((resolve) => setTimeout(resolve, 40))
    let pluginCtx: any
    app.plugin({ name: 'ctx-capture-2', inject: ['slots'], apply(ctx: any) { pluginCtx = ctx } })
    await new Promise((resolve) => setTimeout(resolve, 40))
    const adapter = createScopeAdapter(pluginCtx)
    expect(adapter.getSnapshot().status).not.toBe('unavailable')
    await app.stop?.()
  })
})
