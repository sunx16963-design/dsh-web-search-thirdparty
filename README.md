# dsh-web-search-thirdparty

English | [简体中文](./README.zh-CN.md)

A third-party web search plugin for DSH (DeepSeek Harness). It replaces the built-in DeepSeek-only search with configurable search engines, gives each engine its own settings, and can fetch full pages so the model can both search and read.

Built for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

## What it does

DSH's built-in web search only talks to the official DeepSeek API. This plugin lets you use the search provider you actually want — a self-hosted SearXNG, Tavily, Bing, Brave, Serper, or Google. You pick the engine and configure it from the browser settings page, no code needed.

## Features

- Six built-in engines behind one facade: SearXNG, Tavily, Serper, Brave, Bing, Google CSE.
- A browser settings page: choose the provider, enter the API key, and tune per-engine options (language, market, search depth, safety level).
- A custom endpoint / baseURL per provider (self-hosted SearXNG, internal proxy).
- Custom request headers and automatic retry with backoff.
- Automatic fallback when a provider fails, and optional multi-source merge with deduplication.
- Domain deduplication, relevance sorting, and result-count / timeout control.
- A TTL result cache to avoid repeated upstream calls and save quota.
- A "test connection" action that reports latency, result count, and the first title.
- A `web_fetch` provider so the model can read full pages.
- An open provider-registration API for other plugins to add their own search source.

## Supported engines

| id | service | API key | config |
| --- | --- | --- | --- |
| `searxng` (default) | SearXNG (self-hosted or public) | no | `searxngBaseURL` |
| `tavily` | Tavily | yes | `tavilyApiKey` / `TAVILY_API_KEY` |
| `serper` | Serper (Google SERP) | yes | `serperApiKey` / `SERPER_API_KEY` |
| `brave` | Brave Search | yes | `braveApiKey` / `BRAVE_API_KEY` |
| `bing` | Bing Web Search | yes | `bingApiKey` / `BING_SEARCH_API_KEY` |
| `google-cse` | Google Custom Search | yes (key + cx) | `googleApiKey` + `googleSearchEngineId` |

Keys can be set in the settings UI, stored in the DSH credentials service, or exported as environment variables.

## Install

Install through the plugin manager using the `github:` source, or build locally:

```sh
# from GitHub
dshpm install github:sunx16963-design/dsh-web-search-thirdparty --profile web
```

```sh
# local build
git clone https://github.com/sunx16963-design/dsh-web-search-thirdparty.git
cd dsh-web-search-thirdparty
npm install
npm run build
dshpm install /path/to/dsh-web-search-thirdparty --profile web
```

Restart `dsh web` after installing so the settings page appears.

## Developer

```sh
npm install
npm run build:host     # compiles the host plugin (lib/index.js)
npm run build:client   # bundles the browser UI (lib/client.js)
npm run typecheck
npm test
npm pack
```

A fresh clone builds with only public npm packages. The `@deepseek-ai/*` platform symbols are covered by ambient type shims at compile time; at runtime DSH provides the real packages.

### Provider API

Other Cordis plugins can register a search source by injecting the `web-search-thirdparty` service:

```ts
export const inject = ['web-search-thirdparty']

function apply(ctx) {
  ctx.get('web-search-thirdparty').register({
    id: 'my-source',
    label: 'My Source',
    search: async ({ query, maxResults, config }, signal) => ({
      sources: [{ url, title, snippet }],
      content: 'optional answer',
    }),
  })
}
```

## Configuration

Settings live under the `dsh-web-search-thirdparty` partition:

```yaml
dsh-web-search-thirdparty:
  provider: searxng
  searxngBaseURL: https://searx.be   # or a self-hosted instance
  maxResults: 8
  mergeResults: false
  maxPerDomain: 2
  relevanceSort: false
  cacheEnabled: true
  cacheTtlMs: 60000
  retryCount: 1
  retryBackoffMs: 250
```

## License

BSD-3-Clause. See [LICENSE](LICENSE).
