# dsh-web-search-thirdparty

> 🇨🇳 **中文** · [**English README**](./README.md)

DSH（DeepSeek Harness）网络搜索的门面插件：替换 dsh 自带的“仅官方 DeepSeek”搜索，
支持在设置里配置第三方搜索引擎，并自带抓取（web_fetch）provider，让模型既能“搜”
又能“读”全文。以 **bundle 插件**安装后，自动接好 `web_search` / `web_fetch` 工具并带独立设置页。

## ✨ 功能
- 6 个内置引擎：SearXNG · Tavily · Serper · Brave · Bing · Google CSE
- **开放 provider 注册 API**：其它插件可挂自己的搜索源
- 设置页内置**每源高级参数**（语言/地区/市场/搜索深度/safesearch…）
- 每源**自定义 endpoint/baseURL**（自建 SearXNG / 内网代理）
- **自定义请求头** + **网络级重试·指数退避**
- 可用源**自动降级**、可开**多源合并去重**
- **域名去重** + **相关度排序** + 条数/超时控制
- **TTL 结果缓存**（省 key 额度）
- **测试连接**：耗时 + 条数 + 首条标题
- **web_fetch 抓取**（限长）
- 浏览器设置 UI，**适配深浅主题**（原生控件 + color-scheme）

> 替代内置搜索时**不动、不禁用** DeepSeek provider，只把 `web.searchProvider`
> 指向本门面，因此不会触发 `WEB_PROVIDER_AMBIGUOUS`。

## 🔌 引擎
| id | 服务 | 需要 key | 配置 |
|---|---|---|---|
| `searxng`（默认） | SearXNG 自托管/公共 | 否 | `searxngBaseURL` |
| `tavily` | Tavily | 是 | `tavilyApiKey` / `TAVILY_API_KEY` |
| `serper` | Google SERP | 是 | `serperApiKey` / `SERPER_API_KEY` |
| `brave` | Brave Search | 是 | `braveApiKey` / `BRAVE_API_KEY` |
| `bing` | Bing Web Search | 是 | `bingApiKey` / `BING_SEARCH_API_KEY` |
| `google-cse` | Google CSE | 是（key + cx） | `googleApiKey` + `googleSearchEngineId` |

key 三选一：设置页直接填 / 写进 dsh credentials 服务 / 导出环境变量。

## 🚀 安装
```bash
# 走插件管理器（含质量门禁 + 回滚）
dshpm install github:你的用户名/dsh-web-search-thirdparty --profile web
```
本地构建则：`npm install && npm run build`，再 `dshpm install /本地路径 --profile web`。
装完**重启 web 一次**让设置页 UI 生效。

## 🧰 开发
```bash
npm install
npm run build:host     # tsc
npm run build:client   # tsdown
npm pack
```
全新 clone 只用公共 npm 包即可构建（`@deepseek-ai/*` 的编译期类型由仓库自带
ambient 垫片提供；运行期由 DSH 提供真 peer 包）。

### 开放 API：注册自定义搜索源
```ts
export const inject = ['web-search-thirdparty']
function apply(ctx) {
  ctx.get('web-search-thirdparty').register({
    id: 'my-source', label: 'My Source',
    search: async ({ query, maxResults, config }, signal) => ({
      sources: [{ url: 'https://…', title: '…', snippet: '…' }],
      content: '可选 answer',
    }),
  })
}
```

## ⚙️ 配置（settings 分区 `dsh-web-search-thirdparty`）
```yaml
dsh-web-search-thirdparty:
  provider: searxng
  searxngBaseURL: http://127.0.0.1:8666
  tavilyApiKey: ""
  maxResults: 8
  mergeResults: false
  maxPerDomain: 2
  relevanceSort: false
  cacheEnabled: true
  cacheTtlMs: 60000
  retryCount: 1
  retryBackoffMs: 250
  extraHeadersJson: '{}'
```

## 🔒 安全
- web_fetch 直接请求 URL，存在 **SSRF** 风险：能触达内网敏感目标的机器请先加私网拦截。
- key 存在 DSH settings 里，**不要提交到仓库**；泄露过的 key 立即重置。

## ⚠️ 网络 / VPN
可达性插件解决不了：目标站点/API 被墙时，把引擎指向可达的 endpoint（自建 SearXNG、
内网代理），或挂 VPN；也可用 `extraHeadersJson`/每源 endpoint 走本地代理。

## 📄 许可证
BSD-3-Clause。见 [LICENSE](LICENSE)。
