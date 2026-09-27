import type { Context } from '@deepseek-ai/cordis';
/**
 * 判断运行期处于哪一代设置服务。
 * - `'forms'`：DSH ≥ 0.1.7-alpha.1（`dsh-settings` 导出 `SettingsForms`）—— 分区由条目 schema
 *   自动服务，插件**不能也不该**再注册；同时 Config 必须声明 volatile。
 * - `'section'`：≤ 0.1.6-alpha.2（`dsh-settings` 导出 `SettingsProvider`）—— 走 installSection /
 *   register，且 Config **不能**声明 volatile（旧 describe 不拆引用，会把引用 JSON 成 `{}`）。
 */
export declare function settingsGeneration(): 'forms' | 'section';
/** 与上游 `SettingsSectionHooks<T>` 同形（两个版本都一致）。 */
export interface SettingsSectionHooksLike<T> {
    /** 收到“当前权威配置源”的取值闭包：settings 服务在时为解析后的 scope，否则为组合 entry。 */
    setSource(current: () => T): void;
    /** 挂载 / 卸载 / committed change 之后重新判定派生事实。 */
    onChange(): void;
    /** 拒绝 schema 表达不了的约束（可选）。 */
    validate?(value: T): void;
}
/**
 * 注册一个设置分区，兼容 A/B 两代 API。
 * @param ctx - 插件上下文（owner：注册随该 fiber 释放）
 * @param ns - 设置分区名（字面量；A/B 两代都接受普通字符串）
 * @param schema - schemastery 模式
 * @param entry - 组合层配置（作为 base）
 * @param hooks - 见 {@link SettingsSectionHooksLike}
 */
export declare function installSettingsSectionCompat<T>(ctx: Context, ns: string, schema: unknown, entry: T, hooks: SettingsSectionHooksLike<T>): void;
