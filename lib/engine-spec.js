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
export const ENGINE_SPECS = [
    {
        id: 'searxng',
        label: 'SearXNG',
        endpointKey: 'searxngBaseURL',
        input: { configKey: 'searxngBaseURL', label: 'SearXNG 实例 URL', secret: false, testBodyField: 'url' },
        fields: [
            { key: 'searxngLanguage', label: '语言', type: 'text', def: '', placeholder: '如 zh / en / all' },
            { key: 'searxngCategories', label: '分类', type: 'text', def: 'general', placeholder: '如 general / news / science' },
            { key: 'searxngSafesearch', label: '安全搜索 (0-2)', type: 'number', def: '0', placeholder: '0 宽松 · 2 严格' },
        ],
    },
    {
        id: 'tavily',
        label: 'Tavily',
        endpointKey: 'tavilyEndpoint',
        input: { configKey: 'tavilyApiKey', label: 'Tavily API Key', secret: true, testBodyField: 'key', envRefKey: 'tavilyApiKeyEnv', envVar: 'TAVILY_API_KEY' },
        fields: [
            { key: 'tavilySearchDepth', label: '搜索深度', type: 'select', options: ['basic', 'advanced'], def: 'basic' },
        ],
    },
    {
        id: 'serper',
        label: 'Serper',
        endpointKey: 'serperEndpoint',
        input: { configKey: 'serperApiKey', label: 'Serper API Key', secret: true, testBodyField: 'key', envRefKey: 'serperApiKeyEnv', envVar: 'SERPER_API_KEY' },
        fields: [
            { key: 'serperLanguage', label: '地区代码 (gl)', type: 'text', def: '', placeholder: 'us / jp / de' },
        ],
    },
    {
        id: 'brave',
        label: 'Brave',
        endpointKey: 'braveEndpoint',
        input: { configKey: 'braveApiKey', label: 'Brave API Key', secret: true, testBodyField: 'key', envRefKey: 'braveApiKeyEnv', envVar: 'BRAVE_API_KEY' },
        fields: [
            { key: 'braveCountry', label: '国家代码', type: 'text', def: '', placeholder: 'us / jp' },
            { key: 'braveSearchLang', label: '搜索语言', type: 'text', def: '', placeholder: 'en / ja' },
        ],
    },
    {
        id: 'bing',
        label: 'Bing',
        endpointKey: 'bingEndpoint',
        input: { configKey: 'bingApiKey', label: 'Bing API Key', secret: true, testBodyField: 'key', envRefKey: 'bingApiKeyEnv', envVar: 'BING_SEARCH_API_KEY' },
        fields: [
            { key: 'bingMarket', label: '市场 (mkt)', type: 'text', def: 'en-US', placeholder: 'en-US / ja-JP' },
        ],
    },
    {
        id: 'google-cse',
        label: 'Google CSE',
        endpointKey: 'googleEndpoint',
        input: { configKey: 'googleApiKey', label: 'Google API Key', secret: true, testBodyField: 'key', envRefKey: 'googleApiKeyEnv', envVar: 'GOOGLE_CSE_API_KEY' },
        secondInput: { configKey: 'googleSearchEngineId', label: 'Search Engine ID (cx)', secret: true, testBodyField: 'cx', envRefKey: 'googleSearchEngineIdEnv', envVar: 'GOOGLE_CSE_ID' },
        fields: [
            { key: 'googleLanguage', label: '语言 (lr)', type: 'text', def: '', placeholder: 'lang_en / lang_zh-CN' },
        ],
    },
];
export function getEngineSpec(id) {
    return ENGINE_SPECS.find((s) => s.id === id);
}
/** 引擎的全部输入行（主输入 + 可选第二输入）。 */
export function engineInputs(spec) {
    return spec.secondInput !== undefined ? [spec.input, spec.secondInput] : [spec.input];
}
//# sourceMappingURL=engine-spec.js.map