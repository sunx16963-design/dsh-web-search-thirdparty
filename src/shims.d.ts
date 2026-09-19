/**
 * 类型垫片（Type shims）——仅供“编译期”使用。
 *
 * 本插件运行于 DSH 宿主环境，运行期依赖由 DSH 平台提供（peerDependencies）。
 * 公共 npm 上 @deepseek-ai/* 的公开版本与本插件所需 rc 级 API 不完全一致，
 * 因此仓库自带这份最小 ambient 声明，让 `npm install && npm run build` 在任何
 * 环境（含 GitHub Actions）都能独立通过类型检查。运行期仍解析宿主提供的真包。
 *
 * 注意：垫片必须与“运行期真实存在的 API”一致 —— 把已被上游删除的符号声明为
 * 存在，会让类型检查通过而运行期炸掉（0.1.1-rc.2 → 0.1.2 的 settings API 变更
 * 就是这么被掩盖的）。因此这里把跨版本差异声明为可选，交由运行期探测。
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

/**
 * 设置服务的两代面：
 * - `installSettingsSection`（≤ 0.1.1-rc.2 的顶层 helper）在新版**已删除** → 声明为可能 undefined；
 * - `settings.installSection`（≥ 0.1.2 的服务方法）由 settings-compat.ts 动态访问，无需在此声明。
 */
declare module '@deepseek-ai/dsh-settings' {
  export const installSettingsSection: ((...args: any[]) => void) | undefined
}

declare module '@deepseek-ai/dsh-credentials' {
  export function credentialRef(value: string): string
}

declare module '@deepseek-ai/dsh-launch-environment' {
  export function launchEnvironmentOf(ctx: any): {
    get(name: string): { value: string }
  }
}
