import type { Config } from './config.js';
import type { SearchResult } from './types.js';
/** 当前配置涉及的全部引擎 endpoint（进缓存 key：换实例/镜像后不得命中旧结果）。由 ENGINE_SPECS 驱动。 */
export declare function activeEndpointsOf(cfg: Config): string;
export declare function cacheKeyOf(cfg: Config, query: string, maxResults: number): string;
export declare function cacheGetOrCompute(key: string, cfg: Config, compute: () => Promise<SearchResult>): Promise<SearchResult>;
/** 带并发上限的并行执行：items 按序，fn 并发数 ≤ limit，结果保持原顺序。
 *  任一 fn 抛错时停止派发新任务，等全部在途任务落定后抛出第一个错误（避免 unhandled rejection）。 */
export declare function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]>;
/** 对外只读的熔断状态（设置页统计面板用）。 */
export declare function getCircuitStates(): Record<string, {
    open: boolean;
    failures: number;
}>;
export declare function circuitOpen(cfg: Config, id: string): boolean;
export declare function circuitMarkSuccess(id: string): void;
export declare function circuitMarkFailure(cfg: Config, id: string): void;
export declare function recordStat(id: string, ok: boolean, latencyMs: number, errMessage?: string): void;
export declare function getSearchStats(): Record<string, {
    requests: number;
    errors: number;
    avgLatencyMs: number;
    lastError?: string;
}>;
export declare function resetSearchStats(): void;
/** 缓存计数快照（命中 / 未命中 / 合并掉的并发请求）。 */
export declare function getCacheStats(): {
    hits: number;
    misses: number;
    coalesced: number;
};
export declare function resetCacheStats(): void;
/** 清空全部跨调用状态：插件卸载 / 热重载时调用，防止旧一代残留。 */
export declare function resetRuntimeState(): void;
