/**
 * volatile.ts —— DSH volatile 配置引用的解包工具。
 *
 * DSH ≥ 0.1.7 把“可热更新配置”的语义从 `settings.installSection(...)` 换成了 schemastery 的
 * `.volatile()` 字段：解析后的配置里每个 volatile 字段都是一个稳定引用（`{ get(): T }`），
 * 设置页把值写进 profile patch 后，引用内容原地更新，插件不需要重新挂载就能读到新值
 * （官方 `dsh-web-search-deepseek` 就是 `config.apiKey.get()` 这么读的）。
 *
 * 本模块只做一件事：把这种引用（以及被引用对象内部嵌套的引用）还原成普通数据。
 * 于是插件内部每一条读配置的代码路径都不必再关心两代 DSH 的差异 —— 老版本（≤ 0.1.6）
 * 的配置里没有 volatile 引用，解包是恒等变换，代价只有一次浅拷贝。
 *
 * 判据与 cosmokit `isVolatile` 完全一致（共用 `Symbol.for('cosmokit.volatile.write')`），
 * 因此 ESM / CJS 两份 cosmokit 互相产生的引用都能识别；不额外引入依赖。
 */
/** 一个 volatile 配置引用。 */
export interface VolatileRef<T = unknown> {
    get(): T;
}
/** 是否 volatile 配置引用（与 cosmokit `isVolatile` 同判据）。 */
export declare function isVolatileRef(value: unknown): value is VolatileRef;
/**
 * 递归解包 volatile 引用。
 * 只下钻普通对象与数组（与 DSH `dsh-settings` 的 `plainConfig` 同策略），
 * 类实例、函数、Date 等一律原样返回，不做“深拷贝一切”的危险转换。
 */
export declare function unwrapVolatile(value: unknown): unknown;
/**
 * 把插件配置对象转成纯数据（保持调用方声明的形状）。
 * 每一次读取都要调用它：volatile 引用的意义就是“每次读都是最新值”，缓存下来即失效。
 */
export declare function unwrapConfig<T>(config: T): T;
