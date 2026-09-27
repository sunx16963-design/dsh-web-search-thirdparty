// @vitest-environment jsdom
/**
 * 设置页的 **UI 级**回归测试（真实产物 + 真实 DOM）。
 *
 * 复现本次线上故障的完整用户路径：
 *   插件先激活 → 设置服务（configForms）还没就绪 → 页面显示“正在等待宿主的设置服务就绪” →
 *   设置服务晚到 → 页面**自动**变成可用（保存按钮解锁、供应商下拉可选）。
 *
 * 之前两轮之所以没拦住，是因为验证只到「模块能被加载 / fiber 能 ACTIVE」，
 * 从没验证过用户真正看到的那一页。这个文件补上这一段。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

/** React 18.3+ 把 `act` 挪到了 react 包（`react-dom/test-utils` 已弃用）。 */
const act: any = (React as any).act

/** 取打包产物里注册的模块（与浏览器加载该 script 后 materialize 的结果一致）。 */
function loadClientModule(): any {
  // jsdom 环境下 import.meta.url 是 http://，readFileSync 不认，所以按工作目录解析
  const source = readFileSync(join(process.cwd(), 'lib', 'client.js'), 'utf8')
  let def: any
  new Function('window', 'require', source)(
    { __ModuleLoader__: { load: (definition: any) => { def = definition } } },
    (id: string) => {
      if (id === 'react') return React
      throw new Error('bundle 请求了未声明的外部依赖: ' + id)
    },
  )
  if (def === undefined) throw new Error('bundle 没有调用 __ModuleLoader__.load 注册模块')
  return def.factory((id: string) => {
    if (id === 'react') return React
    throw new Error('bundle 请求了未声明的外部依赖: ' + id)
  })
}

/** configForms 服务替身：describe 报告被服务的分区，get(entryId) 返回“表单”。 */
function configFormsService() {
  return {
    describe: () => ({
      getSnapshot: () => ({
        view: {
          writable: true,
          namespaces: [{ ns: 'web-search-thirdparty', revision: 0, value: { provider: 'tavily', maxResults: 8 }, secrets: [] }],
        },
      }),
      subscribe: () => () => {},
    }),
    get: () => ({
      getSnapshot: () => ({
        status: 'ready',
        value: { provider: 'tavily', maxResults: 8, mergeResults: false, enableFetchProvider: true, maxPerDomain: 2, relevanceSort: false, cacheEnabled: true, cacheTtlMs: 60000 },
        writable: true,
        revision: 0,
      }),
      subscribe: () => () => {},
      mutate: async () => true,
    }),
  }
}

/** 只提供插件真正用到的那点 ctx 表面，并支持“服务晚到”。 */
function makeCtx() {
  const services: Record<string, any> = {}
  const watchers: Array<{ names: string[]; callback: (ctx: any) => void }> = []
  let sectionComponent: any
  const ctx: any = {
    get: (name: string) => services[name],
    inject: (names: string[], callback: (ctx: any) => void) => {
      watchers.push({ names, callback })
      for (const name of names) if (services[name] !== undefined) callback(ctx)
      return () => {}
    },
    effect: (fn: any) => { const dispose = fn(); return () => dispose?.() },
    logger: { warn: () => {}, info: () => {} },
    slots: {
      sections: [] as string[],
      inject(name: string, callback: (ctx: any) => any) {
        this.sections.push(name)
        const dispose = callback(ctx)
        return typeof dispose === 'function' ? dispose : () => {}
      },
      register(_options: any, component: any) {
        sectionComponent = component
        return () => {}
      },
    },
    /** 测试专用：让某个服务“晚到”。 */
    __arrive(name: string, service: any) {
      services[name] = service
      for (const watcher of watchers) if (watcher.names.includes(name)) watcher.callback(ctx)
    },
    get __section() { return sectionComponent },
  }
  return ctx
}

let root: Root | undefined
let container: HTMLElement | undefined

async function render(mod: any, ctx: any): Promise<HTMLElement> {
  await act(async () => { mod.apply(ctx) })
  expect(ctx.slots.sections).toContain('settings.section')
  expect(ctx.__section).toBeTypeOf('function')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root!.render(React.createElement(ctx.__section)) })
  return container
}

function buttonByText(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement | undefined
}

afterEach(async () => {
  if (root !== undefined) { await act(async () => { root!.unmount() }); root = undefined }
  container?.remove(); container = undefined
  vi.restoreAllMocks()
})

describe('设置页 UI：设置服务晚到时的自愈', () => {
  it('服务晚到 → 先提示等待，服务到达后自动变为可保存', async () => {
    const ctx = makeCtx()
    const mod = loadClientModule()
    const host = await render(mod, ctx)

    // 服务还没来：页面必须明确说“在等待”，并且保存被禁用（不能假装能存）
    expect(host.textContent).toContain('等待宿主的设置服务就绪')
    expect(buttonByText(host, '保存')?.disabled).toBe(true)

    // 设置服务晚到
    await act(async () => { ctx.__arrive('configForms', configFormsService()) })

    // 自愈：提示消失、按钮解锁、宿主里的值被回填
    expect(host.textContent).not.toContain('等待宿主的设置服务就绪')
    expect(buttonByText(host, '保存')?.disabled).toBe(false)
    const select = host.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('tavily')
    expect((host.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('8')
  })

  it('服务一开始就绪 → 页面直接可用（官方 DSH 与安卓版都应如此）', async () => {
    const ctx = makeCtx()
    ctx.__arrive('configForms', configFormsService())
    const mod = loadClientModule()
    const host = await render(mod, ctx)
    expect(host.textContent).not.toContain('等待宿主的设置服务就绪')
    expect(buttonByText(host, '保存')?.disabled).toBe(false)
  })

  it('旧代际（settingsScope）同样直接可用', async () => {
    const ctx = makeCtx()
    ctx.__arrive('settingsScope', {
      bind: () => ({
        getSnapshot: () => ({ status: 'ready', value: { provider: 'serper', maxResults: 5 }, writable: true, revision: 1 }),
        subscribe: () => () => {},
        set: async () => {},
        unset: async () => {},
      }),
    })
    const mod = loadClientModule()
    const host = await render(mod, ctx)
    expect(buttonByText(host, '保存')?.disabled).toBe(false)
    expect((host.querySelector('select') as HTMLSelectElement).value).toBe('serper')
  })

  it('两代服务都缺席时保持只读，且不会把插件搞崩（fiber 仍 ACTIVE）', async () => {
    const ctx = makeCtx()
    const mod = loadClientModule()
    const host = await render(mod, ctx)
    expect(buttonByText(host, '保存')?.disabled).toBe(true)
    expect(host.textContent).toContain('等待宿主的设置服务就绪')
  })
})
