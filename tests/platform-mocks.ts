/**
 * 运行期平台模块的测试垫片：让 `../src/index` 在无 DSH 宿主时也能被导入。
 * 仅服务于测试；真实运行期仍由 DSH 提供原包。
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

vi.mock('@deepseek-ai/dsh-settings', () => ({
  settingsNamespace: (v: string) => v,
  installSettingsSection: () => {},
}))

vi.mock('@deepseek-ai/dsh-credentials', () => ({
  credentialRef: (v: string) => v,
}))

vi.mock('@deepseek-ai/dsh-launch-environment', () => ({
  launchEnvironmentOf: () => ({ get: () => ({ value: '' }) }),
}))
