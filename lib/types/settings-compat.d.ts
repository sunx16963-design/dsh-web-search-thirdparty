import type { Context } from '@deepseek-ai/cordis';
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
 * 注册一个设置分区，兼容 0.1.2 前后的两代 API。
 * @param ctx - 插件上下文（owner：注册随该 fiber 释放）
 * @param ns - 设置分区名（字面量；两代都接受普通字符串）
 * @param schema - schemastery 模式
 * @param entry - 组合层配置（作为 base）
 * @param hooks - 见 {@link SettingsSectionHooksLike}
 */
export declare function installSettingsSectionCompat<T>(ctx: Context, ns: string, schema: unknown, entry: T, hooks: SettingsSectionHooksLike<T>): void;
