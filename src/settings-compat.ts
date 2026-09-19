/**
 * settings-compat.ts —— DSH 设置分区注册的跨版本兼容层。
 *
 * 上游在 0.1.2 之前提供顶层 helper，之后改为 settings 服务上的方法：
 *
 *   ≤ 0.1.1-rc.2 : `import { installSettingsSection } from '@deepseek-ai/dsh-settings'`
 *                  → installSettingsSection(ctx, ns, schema, entry, hooks)   // 内部自己 ctx.inject(['settings'])
 *   ≥ 0.1.2      : `ctx.inject(['settings'], (sctx) => sctx.settings.installSection(ctx, ns, schema, entry, hooks))`
 *                  （`settingsNamespace()` 被取消，namespace 直接用字面量字符串）
 *
 * 两者语义完全一致：settings 服务在时把 namespace 注册到该服务（以插件组合配置为 base 层），
 * 服务消失时回退到组合配置并继续工作。这里按运行时探测选择路径；两条都不可用时退化为
 * “仅用组合配置”，不阻塞插件加载。
 *
 * 注意：旧符号必须用 namespace import 访问。ESM 下 `import { installSettingsSection } from …`
 * 在新版（该导出已不存在）会在模块链接期直接抛 SyntaxError，把整个插件打死。
 */
import * as dshSettings from '@deepseek-ai/dsh-settings'
import type { Context } from '@deepseek-ai/cordis'

/** 与上游 `SettingsSectionHooks<T>` 同形（两个版本都一致）。 */
export interface SettingsSectionHooksLike<T> {
  /** 收到“当前权威配置源”的取值闭包：settings 服务在时为解析后的 scope，否则为组合 entry。 */
  setSource(current: () => T): void
  /** 挂载 / 卸载 / committed change 之后重新判定派生事实。 */
  onChange(): void
  /** 拒绝 schema 表达不了的约束（可选）。 */
  validate?(value: T): void
}

/**
 * 注册一个设置分区，兼容 0.1.2 前后的两代 API。
 * @param ctx - 插件上下文（owner：注册随该 fiber 释放）
 * @param ns - 设置分区名（字面量；两代都接受普通字符串）
 * @param schema - schemastery 模式
 * @param entry - 组合层配置（作为 base）
 * @param hooks - 见 {@link SettingsSectionHooksLike}
 */
export function installSettingsSectionCompat<T>(
  ctx: Context,
  ns: string,
  schema: unknown,
  entry: T,
  hooks: SettingsSectionHooksLike<T>,
): void {
  const legacy = (dshSettings as unknown as { installSettingsSection?: (...a: any[]) => void }).installSettingsSection
  if (typeof legacy === 'function') {
    // ≤ 0.1.1-rc.2：顶层 helper 自带 ctx.inject(['settings'], …) 的可选服务接线
    legacy(ctx, ns, schema, entry, hooks)
    return
  }
  // ≥ 0.1.2：服务方法。服务缺席时插件的组合配置继续生效（不阻塞加载）。
  ctx.inject(['settings'], (sctx: any) => {
    const settings = sctx?.settings ?? sctx?.get?.('settings')
    if (settings === undefined) return
    try {
      if (typeof settings.installSection === 'function') {
        settings.installSection(ctx, ns, schema, entry, hooks)
        return
      }
      // 结构性兜底：两代服务都提供 register/watch/scope.get，语义与 installSection 一致
      const scope = settings.register(ns, schema, {
        base: entry,
        ...(hooks.validate === undefined ? {} : { validate: hooks.validate }),
      })
      hooks.setSource(() => scope.get())
      sctx.effect(() => () => { hooks.setSource(() => entry); hooks.onChange() })
      hooks.onChange()
      scope.watch(() => { hooks.onChange() })
    } catch (error) {
      ctx.logger?.warn?.('[web-search-thirdparty] 设置分区注册失败，改用组合配置：' + String(error))
    }
  })
}
