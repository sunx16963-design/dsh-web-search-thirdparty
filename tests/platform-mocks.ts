/**
 * 运行期平台模块的测试垫片：让 `../src/index` 在无 DSH 宿主时也能被导入。
 * 仅服务于测试；真实运行期仍由 DSH 提供原包。
 *
 * 设置服务与启动环境两个垫片暴露可控开关（globalThis.__dshSettingsMock / __dshEnvMock），
 * 以便测试两代 settings API 与“凭据来自启动环境变量”等路径。
 */
import { vi } from 'vitest'

vi.mock('@deepseek-ai/schemastery', () => {
  const chain = () => {
    const o: any = { __t: true }
    o.default = () => o
    o.min = () => o
    o.max = () => o
    o.step = () => o
    o.role = () => o
    // schemastery ≥ 3.18.3 才有这个方法；DSH ≥ 0.1.7 的设置页靠它标记可编辑字段
    o.volatile = () => o
    return o
  }
  return { default: { object: () => ({}), string: () => chain(), number: () => chain(), boolean: () => chain(), array: () => ({ default: () => chain() }) } }
})

vi.mock('@deepseek-ai/cordis', () => {
  class Service {
    readonly ctx: any
    constructor(ctx: any, name: string) {
      this.ctx = ctx
      this.name = name
    }
    effect(fn: any, _label?: string) {
      const dispose: any = fn()
      return () => { if (typeof dispose === 'function') dispose() }
    }
  }
  return { Service }
})

vi.mock('@deepseek-ai/dsh-web', () => {
  class WebError extends Error {
    code: string
    constructor(message?: string, code?: string, opts?: { cause?: unknown }) {
      super(message || 'WebError')
      this.code = code || 'WEB_ERROR'
      if (opts?.cause) this.cause = opts.cause
    }
  }
  return { WebError }
})

/**
 * settings API 代际开关：
 * - `SettingsForms` 存在 = DSH ≥ 0.1.7-alpha.1（分区由条目 Config 的 volatile 字段自动服务）；
 * - 否则看 `installSettingsSection`（≤ 0.1.1-rc.2 的顶层 helper）或服务方法
 *   `settings.installSection`（0.1.2 ~ 0.1.6）。
 * 默认两代标记都不设 = 模拟 0.1.2 ~ 0.1.6 的服务方法路径。
 */
vi.mock('@deepseek-ai/dsh-settings', () => {
  const state: { installSettingsSection?: (...args: any[]) => void; SettingsForms?: unknown } = {}
  ;(globalThis as any).__dshSettingsMock = state
  return {
    // getter：让 `import * as ns` 的每次访问都读到最新开关
    get installSettingsSection() { return state.installSettingsSection },
    get SettingsForms() { return state.SettingsForms },
  }
})

vi.mock('@deepseek-ai/dsh-credentials', () => ({
  credentialRef: (v: string) => v,
}))

vi.mock('@deepseek-ai/dsh-launch-environment', () => {
  const state: { values: Record<string, string> } = { values: {} }
  ;(globalThis as any).__dshEnvMock = state
  return {
    launchEnvironmentOf: () => ({ get: (name: string) => ({ value: state.values[name] ?? '' }) }),
  }
})
