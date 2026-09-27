/**
 * settings-compat.ts —— DSH 设置分区注册的跨版本兼容层。
 *
 * 上游共有三代形态，本模块把它们压成一条判断：
 *
 *   A) ≤ 0.1.1-rc.2 : 顶层 helper
 *      `import { installSettingsSection } from '@deepseek-ai/dsh-settings'`
 *      → installSettingsSection(ctx, ns, schema, entry, hooks)   // 内部自己 ctx.inject(['settings'])
 *   B) 0.1.2 ~ 0.1.6 : 服务方法 `ctx.inject(['settings'], (sctx) =>
 *      sctx.settings.installSection(ctx, ns, schema, entry, hooks))`
 *      （`settingsNamespace()` 被取消，namespace 直接用字面量字符串）
 *   C) ≥ 0.1.7-alpha.1 : **没有注册 API**。设置服务换成 `SettingsForms`，它按 profile 条目的
 *      **id** 自动服务该条目自己的 `Config` 模式，且只投影 `.volatile()` 字段。
 *      插件什么都不用做 —— 也不需要传 namespace，分区名就是组合条目 id。
 *
 * A/B 两代语义一致：settings 服务在时把 namespace 注册到该服务（以插件组合配置为 base 层），
 * 服务消失时回退到组合配置并继续工作。C 代直接由 loader 组合 → 设置文档驱动，插件只要把
 * 可编辑字段声明成 volatile（见 config.ts）即可。
 *
 * 注意：旧符号必须用 namespace import 访问。ESM 下 `import { installSettingsSection } from …`
 * 在新版（该导出已不存在）会在模块链接期直接抛 SyntaxError，把整个插件打死。
 */
import * as dshSettings from '@deepseek-ai/dsh-settings';
/**
 * 判断运行期处于哪一代设置服务。
 * - `'forms'`：DSH ≥ 0.1.7-alpha.1（`dsh-settings` 导出 `SettingsForms`）—— 分区由条目 schema
 *   自动服务，插件**不能也不该**再注册；同时 Config 必须声明 volatile。
 * - `'section'`：≤ 0.1.6-alpha.2（`dsh-settings` 导出 `SettingsProvider`）—— 走 installSection /
 *   register，且 Config **不能**声明 volatile（旧 describe 不拆引用，会把引用 JSON 成 `{}`）。
 */
export function settingsGeneration() {
    return typeof dshSettings.SettingsForms === 'function'
        ? 'forms'
        : 'section';
}
/**
 * 注册一个设置分区，兼容 A/B 两代 API。
 * @param ctx - 插件上下文（owner：注册随该 fiber 释放）
 * @param ns - 设置分区名（字面量；A/B 两代都接受普通字符串）
 * @param schema - schemastery 模式
 * @param entry - 组合层配置（作为 base）
 * @param hooks - 见 {@link SettingsSectionHooksLike}
 */
export function installSettingsSectionCompat(ctx, ns, schema, entry, hooks) {
    // C 代（≥ 0.1.7）：设置文档直接读本条目导出的 Config 模式，注册是多余的。
    // 这里必须提前返回：新服务没有 register/installSection，硬走下面的兜底只会白记一条
    // “设置分区注册失败”的告警，误导排查方向。
    if (settingsGeneration() === 'forms')
        return;
    const legacy = dshSettings.installSettingsSection;
    if (typeof legacy === 'function') {
        // A 代（≤ 0.1.1-rc.2）：顶层 helper 自带 ctx.inject(['settings'], …) 的可选服务接线
        legacy(ctx, ns, schema, entry, hooks);
        return;
    }
    // B 代（0.1.2 ~ 0.1.6）：服务方法。服务缺席时插件的组合配置继续生效（不阻塞加载）。
    ctx.inject(['settings'], (sctx) => {
        const settings = sctx?.settings ?? sctx?.get?.('settings');
        if (settings === undefined)
            return;
        try {
            if (typeof settings.installSection === 'function') {
                settings.installSection(ctx, ns, schema, entry, hooks);
                return;
            }
            // 结构性兜底：B 代服务同时提供 register/watch/scope.get，语义与 installSection 一致
            const scope = settings.register(ns, schema, {
                base: entry,
                ...(hooks.validate === undefined ? {} : { validate: hooks.validate }),
            });
            hooks.setSource(() => scope.get());
            sctx.effect(() => () => { hooks.setSource(() => entry); hooks.onChange(); });
            hooks.onChange();
            scope.watch(() => { hooks.onChange(); });
        }
        catch (error) {
            ctx.logger?.warn?.('[web-search-thirdparty] 设置分区注册失败，改用组合配置：' + String(error));
        }
    });
}
//# sourceMappingURL=settings-compat.js.map