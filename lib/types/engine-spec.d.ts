/**
 * engine-spec.ts —— 引擎描述单表（纯数据，无任何 import）。
 *
 * 宿主端（index.ts）与浏览器端（client/index.ts）共同消费这一张表：
 * provider 列表、展示标签、凭据输入框、endpoint、高级参数表单、
 * 测试路由取值映射、重置字段全部由它驱动。
 *
 * 新增一个引擎只需要两步：
 *   ① 在 index.ts 写实现函数并挂进 ENGINES；
 *   ② 在这里加一条 spec。
 * tests/engine-spec.test.ts 会校验两端不漂移。
 */
/** 设置页高级参数的一行。 */
export interface EngineFieldSpec {
    /** settings 字段名 */
    key: string;
    label: string;
    type: 'text' | 'number' | 'select';
    /** select 可选项 */
    options?: string[];
    /** 表单默认显示值 */
    def: string;
    placeholder?: string;
}
/**
 * 设置页的一个输入行。
 * - 只有携带 envRefKey/envVar 的行才算“凭据”：全部可解析该引擎才可用；
 * - 不带的（如 SearXNG 的实例 URL）只是普通配置输入，不影响可用性。
 */
export interface EngineInputSpec {
    /** 输入写入的 settings 字段 */
    configKey: string;
    /** 表单标签（同时用作占位符） */
    label: string;
    /** 是否敏感值：决定保存后是否回显到表单 */
    secret: boolean;
    /** 测试连接时从请求体哪个字段取值 */
    testBodyField: 'key' | 'url' | 'cx';
    /** credentials 引用字段（缺省 = 非凭据输入） */
    envRefKey?: string;
    /** 环境变量默认名 */
    envVar?: string;
}
export interface EngineSpec {
    id: string;
    label: string;
    /** 该引擎的 endpoint/baseURL settings 字段（缓存 key 与重置用） */
    endpointKey: string;
    /** 设置页主输入行（key 输入框；SearXNG 为实例 URL） */
    input: EngineInputSpec;
    /** 可选第二输入行（google-cse 的 cx） */
    secondInput?: EngineInputSpec;
    /** 高级参数（设置页按引擎动态渲染） */
    fields: EngineFieldSpec[];
}
export declare const ENGINE_SPECS: EngineSpec[];
export declare function getEngineSpec(id: string): EngineSpec | undefined;
/** 引擎的全部输入行（主输入 + 可选第二输入）。 */
export declare function engineInputs(spec: EngineSpec): EngineInputSpec[];
