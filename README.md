# dsh-web-search-thirdparty

[English](./README.en.md) | 简体中文

为 DSH（DeepSeek Harness）开发的第三方网页搜索插件。它用可配置的搜索引擎替换 dsh 自带的
“仅官方 DeepSeek”搜索，为每个引擎提供独立设置，并可抓取网页全文，让模型既能搜索也能阅读。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 开发。

[![ci](https://github.com/sunx16963-design/dsh-web-search-thirdparty/actions/workflows/ci.yml/badge.svg)](https://github.com/sunx16963-design/dsh-web-search-thirdparty/actions/workflows/ci.yml)

## 版本与兼容

插件同时适配 DSH 两代设置 API（运行时探测，无需你选择）：

| DSH 版本 | 状态 | 说明 |
| --- | --- | --- |
| `0.1.0-rc.6` … `0.1.1-rc.2` | 支持 | 使用顶层 `installSettingsSection`；`0.1.1-rc.2` 已实测 |
| `>= 0.1.2`（含 `0.1.5-rc.2`） | 支持 | 使用 `ctx.settings.installSection`（上游在 0.1.2 迁移）；`0.1.5-rc.2` 已实测 |
| `0.1.5-rc.2` | 已实测 | 0.4.0 发布时的上游基线 |

上游从 `0.1.2` 起删除了 `installSettingsSection` / `settingsNamespace`，改为 settings 服务上的
`installSection()`。0.4.0 之前本插件在新版 DSH 上会因调用已删除的函数而加载失败；现在两代都兼容，
且在两者都不存在时退化为“仅使用组合配置”，不会阻塞启动。

## 系统要求

- DSH（DeepSeek Harness）`0.1.0-rc.6` 或更高，且 `dsh web` 可正常启动。
- **Node.js >= 22.19**（与 DSH 自身要求一致；从源码构建时 `build:client` 需要 Node ^22.18 或 >=24.11）。
- 能访问至少一个已配置的搜索引擎 / API。

## 插件做什么

DSH 默认只挂官方 DeepSeek 搜索 provider，并且默认不挂 fetch provider、`web_fetch` 处于关闭状态
（官方理由：抓取目标由模型选择，SSRF 防护属于 fetch provider 的责任）。这个插件让你改用自己想要的
搜索源——自建 SearXNG、Tavily、Bing、Brave、Serper 或 Google——并自带一个带 SSRF 防护的抓取
provider，从而把 `web_search` 与 `web_fetch` 一起打开。全部在设置页里配置，不需要改代码。

> 上游另有官方可选 provider：`@deepseek-ai/dsh-web-search-exa`、`@deepseek-ai/dsh-web-search-perplexity`、
> `@deepseek-ai/dsh-web-fetch-http`。如果只需要 Exa/Perplexity，可以直接用官方插件；本插件的差异点是
> “多引擎（含免 key 的 SearXNG）+ 每引擎独立设置 + 可自建实例/内网代理 + 熔断与用量统计”。

## 主要功能

- 六个内置引擎，统一入口：SearXNG、Tavily、Serper、Brave、Bing、Google CSE。
- 浏览器设置页：选择供应商、填写 API key、按引擎配置参数（语言、地区、市场、搜索深度、安全级别）。
- 每个提供商可配置自定义 endpoint / baseURL（自建 SearXNG、内网代理）。
- 自定义请求头，以及带退避的网络重试（仅 429 / 5xx 重试，尊重 `Retry-After`）。
- 提供商失败时自动降级；可选多源合并并去重（带并发上限）。
- 域名去重、相关度排序、结果条数与超时控制，并如实上报 `truncated`。
- TTL 结果缓存（防击穿 + 有界容量 + 命中率统计），避免重复请求、节省配额。
- “测试连接”功能，反馈延迟、结果条数与首条标题。
- `web_fetch` 抓取 provider：HTML 清洗为 Markdown，逐跳重定向都过 SSRF 校验。
- 开放 provider 注册 API，其它插件可挂载自己的搜索源。
- 每源熔断与用量统计（设置页“用量统计”面板可查看各源请求/错误/延迟、缓存命中与熔断状态，
  也有 `GET /api/web-search-thirdparty/stats` 接口）。

## 支持的引擎

| id | 服务 | 需要 key | 配置 |
| --- | --- | --- | --- |
| `searxng`（默认） | SearXNG（自托管 / 公共） | 否 | `searxngBaseURL` |
| `tavily` | Tavily | 是 | `tavilyApiKey` / `TAVILY_API_KEY` |
| `serper` | Serper（Google SERP） | 是 | `serperApiKey` / `SERPER_API_KEY` |
| `brave` | Brave Search | 是 | `braveApiKey` / `BRAVE_API_KEY` |
| `bing` | Bing Web Search | 是 | `bingApiKey` / `BING_SEARCH_API_KEY` |
| `google-cse` | Google 自定义搜索 | 是（key + cx） | `googleApiKey` + `googleSearchEngineId` |

> 注 1：微软 Bing Web Search API 已于 2025 年退役。`bing` 引擎保留用于对接兼容其协议的替代
> endpoint（如 Azure Grounding 网关或自建镜像），可通过 `bingEndpoint` 指向。
>
> 注 2：默认值 `https://searx.be` 只是公共实例示例。公共实例普遍禁用 JSON 输出或带 bot 检测，
> **推荐自建 SearXNG**（需在 `settings.yml` 的 `search.formats` 中加入 `json`），并把
> `searxngBaseURL` 指向自建实例。

key 可以在设置页直接填写、写入 DSH credentials 服务，或通过环境变量导出；解析顺序为
字面量 → credentials 服务 → 启动环境变量。

## 安装

推荐用插件管理器 CLI（`dshpm`）安装：它会在安装时做质量门与健康检查（依赖全链扫描、bundle patch
行校验、安装即回滚）。`dshpm` 来自 [dsh-web-plugin-manager](https://www.npmjs.com/package/dsh-web-plugin-manager)；
如果还没装，先装管理器再装本插件。

```sh
# 方式一：从 npm 安装
dshpm install dsh-web-search-thirdparty --profile web
```

```sh
# 方式二：从 GitHub 安装（lib/ 已提交，无需本地构建）
dshpm install github:sunx16963-design/dsh-web-search-thirdparty --profile web
```

```sh
# 方式三：本地构建后安装
git clone https://github.com/sunx16963-design/dsh-web-search-thirdparty.git
cd dsh-web-search-thirdparty
npm install
npm run build
dshpm install /本地路径/dsh-web-search-thirdparty --profile web
```

安装后重启 `dsh web`，设置页才会出现。卸载 / 升级：

```sh
dshpm update dsh-web-search-thirdparty --profile web
dshpm remove dsh-web-search-thirdparty --profile web
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
  # 默认 true：注册自带 web_fetch 抓取 provider。
  # 设为 false 可把 web_fetch 交回宿主的官方 provider
  # （同时需要删掉本插件 bundle patch 里的 `fetchProvider` 行）。
  enableFetchProvider: true
```

## 安全

- `web_fetch` 默认拒绝私网 / 环回 / link-local / 云元数据（`169.254.169.254`）以及一批特殊段：
  IPv4 `0.0.0.0/8`、`100.64.0.0/10`(CGNAT)、`192.0.0.0/24`、`192.88.99.0/24`、`198.18.0.0/15`、
  `240.0.0.0/4`；IPv6 `::1`、`fc00::/7`、`fe80::/10`、`ff00::/8`、`2002::/16`(6to4)、
  `2001::/32`(Teredo)、`2001:db8::/32`、`64:ff9b::/96`(NAT64)，以及 IPv4-mapped 的各种写法。
- 重定向手动逐跳跟随，**每一跳都重新做 SSRF 校验**（默认 follow 不会复查 `Location`）。
- DNS 解析失败按拒绝处理（解析路径不一致正是 rebinding 的入口）。
- 需要抓取内网时显式设置 `fetchAllowPrivate: true`。
- “测试连接”路由会把表单传入的 SearXNG 实例 URL 也过一遍 SSRF 校验。
- **已知残留风险**：校验通过到实际连接之间仍存在一次 DNS 重解析窗口（0-TTL rebinding 的 TOCTOU）。
  彻底消除需要在 connect 层 pin 已校验 IP（要引入 undici 之类的自定义 dispatcher），当前实现选择
  不增加运行期依赖，因此该窗口仍在。请勿在不可信输入下打开 `fetchAllowPrivate`。

## 开发者

```sh
npm install
npm run build:host     # 编译宿主插件（lib/index.js）
npm run build:client   # 打包浏览器 UI（lib/client.js）
npm run typecheck
```sh
npm install
npm run build:host     # 编译宿主插件（lib/index.js）
npm run build:client   # 打包浏览器 UI（lib/client.js）
npm run typecheck
npm test
npm pack
```

### 真实宿主自检（推荐，防上游断代）

单元测试用的是仓库自写的平台垫片，**发现不了"上游删掉某个 API"这类断代**。这个脚本把构建产物装进
真实的 cordis + `dsh-web` + `dsh-settings-file` 栈里跑一遍（apply 不抛错 / 设置分区注册 /
`ctx.web.search` 归一化 / `ctx.web.fetch` 抓取）：

```sh
mkdir -p /tmp/dsh-e2e && cd /tmp/dsh-e2e
npm init -y >/dev/null && npm pkg set type=module
npm i --legacy-peer-deps @deepseek-ai/cordis@4 @deepseek-ai/dsh-web@0.1.5-rc.2 \
  @deepseek-ai/dsh-settings@0.1.5-rc.2 @deepseek-ai/dsh-settings-file@0.1.5-rc.2 \
  @deepseek-ai/dsh-credentials@0.1.5-rc.2 @deepseek-ai/dsh-launch-environment@0.1.5-rc.2 \
  @deepseek-ai/dsh-llm@0.1.5-rc.2 @deepseek-ai/schemastery@3
# peer 不随依赖安装：按报错把缺的 @deepseek-ai/* 再装一次
node ./scripts/e2e-real-host.mjs /tmp/dsh-e2e
```

换 `0.1.1-rc.2` 之类的版本即可验证旧一代 settings API 路径（脚本会打印当前栈走的是哪一代）。

源码按职责拆分（`src/index.ts` 只保留引擎实现、门面、抓取 provider、路由与 apply）：

| 文件 | 职责 |
| --- | --- |
| `src/engine-spec.ts` | 引擎单表（provider 列表 / 标签 / 凭据输入 / endpoint / 高级参数 / 测试路由映射 / 重置字段） |
| `src/config.ts` | 配置形状与 schemastery 模式 |
| `src/text.ts`、`src/html.ts` | 结果归一化、片段清洗、实体解码、HTML→Markdown（纯函数） |
| `src/net.ts` | SSRF 校验与逐跳重定向 |
| `src/state.ts` | 结果缓存、并发执行、熔断、用量统计 |
| `src/settings-compat.ts` | 设置分区注册的两代 API 兼容层 |

全新 clone 只用公共 npm 包即可构建。`@deepseek-ai/*` 的编译期类型由仓库自带的 ambient 垫片提供；
运行期仍由 DSH 提供真实包（宿主按 profile 链接解析，不会产生第二份副本）。

### 新增一个搜索引擎

引擎信息集中在 `src/engine-spec.ts` 一张表里（provider 列表、标签、凭据输入行、endpoint、
高级参数表单、测试路由映射、重置字段全部由它驱动），新增引擎只需两步：

1. 在 `src/index.ts` 写实现函数并挂进 `ENGINES`；
2. 在 `src/engine-spec.ts` 加一条 spec。

宿主端与浏览器端共用这张表，`tests/engine-spec.test.ts` 会双向校验防止漂移。

### Provider API

其它 Cordis 插件注入 `web-search-thirdparty` 服务即可注册自己的搜索源
（内置引擎 id 属于保留命名空间，第三方请使用自己的 id）：

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

## 许可证

BSD-3-Clause。见 [LICENSE](LICENSE)。
