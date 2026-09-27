/**
 * 客户端插件入口的契约哨兵。
 *
 * 背景（真实事故）：一次重构用脚本删除重复代码时，误删了 `src/client/index.ts` 里的
 * `export const inject`。因为根 `tsconfig.json` 当时 exclude 了 `src/client`，打包器也不做
 * 未定义标识符检查，所以 typecheck / build / 99 个测试全绿，而产出物少了 `exports.inject`。
 * DSH 的客户端模块加载器要求客户端插件导出 `apply`/`inject`，于是启动页直接报
 * 「Failed to load plugin dsh-web-search-thirdparty」。
 *
 * 本测试从两个层面看住它：
 *  1. 直接 import 客户端入口源码，断言导出面（inject / apply）与 inject 的内容；
 *  2. 用假 `window.__ModuleLoader__` **真正执行**打包产物 `lib/client.js`，断言加载器拿到的
 *     模块确实带 apply/inject —— 也就是浏览器实际收到的那份文件。
 *
 * 注意：第 2 项读的是 `lib/client.js`，所以改动 src/client 后必须先 `npm run build`
 * 再跑测试（CI 的顺序就是 typecheck → build → test）。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import * as clientEntry from '../src/client/index.js'

describe('客户端入口（源码）', () => {
  it('导出 apply 与 inject', () => {
    expect(typeof clientEntry.apply).toBe('function')
    expect(Array.isArray(clientEntry.inject)).toBe(true)
  })

  it('inject 只含真正的硬依赖：设置服务必须按可选服务运行期探测', () => {
    // settingsScope 在 DSH ≥0.1.7 已被删除、configForms 在 ≤0.1.6 不存在：
    // 任一名字进了 inject，插件都会在另一代际上永远等不到服务而整个加载失败。
    expect(clientEntry.inject).toEqual(['slots'])
    expect(clientEntry.inject).not.toContain('settingsScope')
    expect(clientEntry.inject).not.toContain('configForms')
  })
})

describe('客户端打包产物（浏览器实际收到的那份）', () => {
  /** 用假加载器执行 bundle，返回加载器拿到的模块定义。 */
  function loadBundle(): { id: string; module: any } {
    const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
    const loaded: any[] = []
    const fakeWindow = { __ModuleLoader__: { load: (definition: any) => { loaded.push(definition) } } }
    // eslint-disable-next-line no-new-func -- 这里就是要按浏览器的方式执行产物
    const run = new Function('window', 'require', source)
    run(fakeWindow, (id: string) => {
      if (id === 'react') return React
      throw new Error('bundle 请求了未声明的外部依赖: ' + id)
    })
    expect(loaded).toHaveLength(1)
    return { id: loaded[0].id, module: loaded[0].factory((id: string) => {
      if (id === 'react') return React
      throw new Error('bundle 请求了未声明的外部依赖: ' + id)
    }) }
  }

  it('注册的插件 id 与包名一致', () => {
    expect(loadBundle().id).toBe('dsh-web-search-thirdparty')
  })

  it('产物导出 apply 与 inject（漏掉任一即复现启动页报错）', () => {
    const { module: mod } = loadBundle()
    expect(typeof mod.apply).toBe('function')
    expect(mod.inject).toEqual(['slots'])
  })

  it('产物能完整求值：没有悬空的未定义标识符', () => {
    // 顶层求值会立刻暴露 PROVIDERS/specOf 这类被误删后又没被类型检查拦住的引用
    expect(() => loadBundle()).not.toThrow()
  })
})
