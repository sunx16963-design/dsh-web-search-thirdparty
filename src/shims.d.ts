/**
 * 类型垫片（Type shims）——仅供“编译期”使用。
 *
 * 本插件运行于 DSH 宿主环境，运行期依赖由 DSH 平台提供（peerDependencies）。
 * 但公共 npm 上 @deepseek-ai/* 的公开版本与本插件所需 rc 级 API 不完全一致，
 * 因此仓库自带这份最小 ambient 声明，让 `npm install && npm run build` 在任何
 * 环境（含 GitHub Actions）都能独立通过类型检查。运行期仍解析宿主提供的真包。
 */

declare module '@deepseek-ai/schemastery' {
  const z: any
  export default z
}

declare module '@deepseek-ai/cordis' {
  export class Service {
    constructor(ctx: any, name: string)
    readonly ctx: any
    effect(fn: any, label?: string): any
  }
  type Context = any
  export { Context }
}

declare module '@deepseek-ai/dsh-web' {
  export class WebError extends Error {
    code: string
    constructor(message?: string, code?: string, opts?: { cause?: unknown })
  }
}

declare module '@deepseek-ai/dsh-settings' {
  export function settingsNamespace(value: string): string
  export function installSettingsSection(
    ctx: any,
    ns: string,
    schema: any,
    entry: any,
    hooks: { setSource: (fn: any) => void; onChange: () => void; validate?: any },
  ): void
}

declare module '@deepseek-ai/dsh-credentials' {
  export function credentialRef(value: string): string
}

declare module '@deepseek-ai/dsh-launch-environment' {
  export function launchEnvironmentOf(ctx: any): {
    get(name: string): { value: string }
  }
}
