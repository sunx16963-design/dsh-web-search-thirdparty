# dsh-web-search-thirdparty

[English](./README.en.md) | 简体中文

为 DSH（DeepSeek Harness）开发的第三方网页搜索插件。它用可配置的搜索引擎替换 dsh 自带的“仅官方 DeepSeek”搜索，为每个引擎提供独立设置，并能抓取网页全文，让模型既能搜索也能阅读。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 开发，目标版本 **rc.7 / rc.8**。

## 系统要求

- DSH（DeepSeek Harness）**rc.7** 或 **rc.8**，且 `dsh web` 可正常启动。其他版本请先验证兼容性。
- **Node.js >= 20** —— 仅从源码构建时需要；通过插件管理器安装无需构建。
- 能访问至少一个已配置的搜索引擎 / API。

## 插件做什么

DSH 自带的网页搜索只能对接官方 DeepSeek 接口。这个插件让你改用自己想要的搜索源——自建 SearXNG、Tavily、Bing、Brave、Serper 或 Google。在设置页里选引擎、填 key、调参数即可，不需要改代码。

## 主要功能

- 六个内置引擎，统一入口：SearXNG、Tavily、Serper、Brave、Bing、Google CSE。
- 浏览器设置页：选择供应商、填写 API key、按引擎配置参数（语言、地区、市场、搜索深度、安全级别）。
- 每个提供商可配置自定义 endpoint / baseURL（自建 SearXNG、内网代理）。
- 自定义请求头，以及带退避的网络重试。
- 提供商失败时自动降级；可选多源合并并去重。
- 域名去重、相关度排序、结果条数与超时控制。
- TTL 结果缓存，避免重复请求、节省配额。
- “测试连接”功能，反馈延迟、结果条数与首条标题。
- `web_fetch` 抓取 provider，HTML 清洗为 Markdown，便于模型阅读全文。
- 开放 provider 注册 API，其它插件可挂载自己的搜索源。
- 每源熔断与用量统计。

## 支持的引擎

| id | 服务 | 需要 key | 配置 |
| --- | --- | --- | --- |
| `searxng`（默认） | SearXNG（自托管 / 公共） | 否 | `searxngBaseURL` |
| `tavily` | Tavily | 是 | `tavilyApiKey` / `TAVILY_API_KEY` |
| `serper` | Serper（Google SERP） | 是 | `serperApiKey` / `SERPER_API_KEY` |
| `brave` | Brave Search | 是 | `braveApiKey` / `BRAVE_API_KEY` |
| `bing` | Bing Web Search | 是 | `bingApiKey` / `BING_SEARCH_API_KEY` |
| `google-cse` | Google 自定义搜索 | 是（key + cx） | `googleApiKey` + `googleSearchEngineId` |

key 可以在设置页直接填写、写入 DSH credentials 服务，或通过环境变量导出。

## 安装

本插件已发布到 **npm**，推荐直接用插件管理器按包名安装，也可以从 GitHub 安装或本地构建。

```sh
# 方式一（推荐）：从 npm 安装
dshpm install dsh-web-search-thirdparty --profile web
# 等价于：npm install dsh-web-search-thirdparty
```

```sh
# 方式二：从 GitHub 安装
dshpm install github:sunx16963-design/dsh-web-search-thirdparty --profile web
```

```sh
# 方式三：本地构建
git clone https://github.com/sunx16963-design/dsh-web-search-thirdparty.git
cd dsh-web-search-thirdparty
npm install
npm run build
dshpm install /本地路径/dsh-web-search-thirdparty --profile web
```

安装后重启 `dsh web`，设置页才会出现。

## 开发者

```sh
npm install
npm run build:host     # 编译宿主插件（lib/index.js）
npm run build:client   # 打包浏览器 UI（lib/client.js）
npm run typecheck
npm test
npm pack
```

全新 clone 只用公共 npm 包即可构建。`@deepseek-ai/*` 的编译期类型由仓库自带的 ambient 垫片提供；运行期仍由 DSH 提供真实包。

### Provider API

其它 Cordis 插件注入 `web-search-thirdparty` 服务即可注册自己的搜索源：

```ts
export const inject = ['web-search-thirdparty']

function apply(ctx) {
  ctx.get('web-search-thirdparty').register({
    id: 'my-source',
    label: 'My Source',
    search: async ({ query, maxResults, config }, signal) => ({
      sources: [{ url, title, snippet }],
      content: '可选 answer',
    }),
  })
}
```

## 配置

设置存放在 `dsh-web-search-thirdparty` 分区下：

```yaml
dsh-web-search-thirdparty:
  provider: searxng
  searxngBaseURL: https://searx.be   # 或自建实例
  maxResults: 8
  mergeResults: false
  maxPerDomain: 2
  relevanceSort: false
  cacheEnabled: true
  cacheTtlMs: 60000
  retryCount: 1
  retryBackoffMs: 250
```

## 许可证

BSD-3-Clause。见 [LICENSE](LICENSE)。
