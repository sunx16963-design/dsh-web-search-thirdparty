# dsh-web-search-thirdparty

English | [简体中文](./README.md)

A third-party web search plugin for DSH (DeepSeek Harness). It replaces the built-in DeepSeek-only
search with configurable search engines, gives each engine its own settings, and can fetch full pages
so the model can both search and read.

Built for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

## Version compatibility

The plugin adapts to both generations of the DSH settings API at runtime — you do not choose:

| DSH version | Status | Notes |
| --- | --- | --- |
| `0.1.0-rc.6` … `0.1.1-rc.2` | Supported | Uses the top-level `installSettingsSection` |
| `>= 0.1.2` (incl. `0.1.5-rc.2`) | Supported | Uses `ctx.settings.installSection` (migrated upstream in 0.1.2) |
| `0.1.5-rc.2` | Verified | Upstream baseline when 0.4.0 was released |

Upstream removed `installSettingsSection` / `settingsNamespace` in `0.1.2` and moved to the
`installSection()` service method. Before 0.4.0 this plugin failed to load on newer DSH because it
called the removed function; it now supports both, and degrades to "composition config only" when
neither exists, so it never blocks startup.

## Requirements

- DSH (DeepSeek Harness) `0.1.0-rc.6` or later, with a working `dsh web` profile.
- **Node.js >= 22.19** (same as DSH itself; building from source needs Node ^22.18 or >=24.11 for `build:client`).
- Network access to at least one configured search engine / API.

## What it does

By default DSH mounts only the official DeepSeek search provider, mounts no fetch provider, and keeps
`web_fetch` disabled (upstream's rationale: the model picks the request target, and SSRF protection is
the fetch provider's job). This plugin lets you use the search source you actually want — a self-hosted
SearXNG, Tavily, Bing, Brave, Serper, or Google — and ships an SSRF-guarded fetch provider, so
`web_search` and `web_fetch` are both enabled. Everything is configured from the browser settings page.

> Upstream also ships optional official providers: `@deepseek-ai/dsh-web-search-exa`,
> `@deepseek-ai/dsh-web-search-perplexity`, and `@deepseek-ai/dsh-web-fetch-http`. If Exa/Perplexity is
> all you need, use those. This plugin's difference is "several engines (including keyless SearXNG) +
> per-engine settings + self-hosted instance / internal proxy support + circuit breaker and usage stats".

## Features

- Six built-in engines behind one facade: SearXNG, Tavily, Serper, Brave, Bing, Google CSE.
- A browser settings page: choose the provider, enter the API key, and tune per-engine options.
- A custom endpoint / baseURL per provider (self-hosted SearXNG, internal proxy).
- Custom request headers and retry with backoff (429 / 5xx only, honouring `Retry-After`).
- Automatic fallback when a provider fails, plus optional multi-source merge with deduplication.
- Domain deduplication, relevance sorting, result-count control, and an honest `truncated` flag.
- A TTL result cache (stampede guard, bounded size, hit-rate counters).
- A "test connection" action that reports latency, result count, and the first title.
- A `web_fetch` provider (HTML cleaned to Markdown, every redirect hop re-checked against SSRF).
- An open provider-registration API so other plugins can add their own search source.
- Per-source circuit breaker and usage statistics (settings page panel and
  `GET /api/web-search-thirdparty/stats`, including cache counters and circuit state).

## Supported engines

| id | service | API key | config |
| --- | --- | --- | --- |
| `searxng` (default) | SearXNG (self-hosted or public) | no | `searxngBaseURL` |
| `tavily` | Tavily | yes | `tavilyApiKey` / `TAVILY_API_KEY` |
| `serper` | Serper (Google SERP) | yes | `serperApiKey` / `SERPER_API_KEY` |
| `brave` | Brave Search | yes | `braveApiKey` / `BRAVE_API_KEY` |
| `bing` | Bing Web Search | yes | `bingApiKey` / `BING_SEARCH_API_KEY` |
| `google-cse` | Google Custom Search | yes (key + cx) | `googleApiKey` + `googleSearchEngineId` |

> Note 1: Microsoft retired the Bing Web Search API in 2025. The `bing` engine is kept for endpoints
> that stay protocol-compatible (Azure Grounding gateways or self-hosted mirrors) via `bingEndpoint`.
>
> Note 2: the default `https://searx.be` is only a public-instance example. Public instances commonly
> disable JSON output or run bot detection — **a self-hosted SearXNG is recommended** (add `json` to
> `search.formats` in its `settings.yml`) with `searxngBaseURL` pointed at it.

Keys can be set in the settings UI, stored in the DSH credentials service, or exported as environment
variables; resolution order is literal → credentials service → launch environment.

## Install

Installing through the plugin-manager CLI (`dshpm`) is recommended: it runs a quality gate and health
checks (full dependency scan, bundle patch validation, rollback on failure). `dshpm` comes from
[dsh-web-plugin-manager](https://www.npmjs.com/package/dsh-web-plugin-manager) — install the manager
first if you have not.

```sh
# Option 1: from npm
dshpm install dsh-web-search-thirdparty --profile web
```

```sh
# Option 2: from GitHub (lib/ is committed, no local build needed)
dshpm install github:sunx16963-design/dsh-web-search-thirdparty --profile web
```

```sh
# Option 3: build locally, then install
git clone https://github.com/sunx16963-design/dsh-web-search-thirdparty.git
cd dsh-web-search-thirdparty
npm install
npm run build
dshpm install /path/to/dsh-web-search-thirdparty --profile web
```

Restart `dsh web` after installing so the settings page appears. Upgrade / uninstall:

```sh
dshpm update dsh-web-search-thirdparty --profile web
dshpm remove dsh-web-search-thirdparty --profile web
```

## Configuration

Settings live under the `dsh-web-search-thirdparty` namespace:

```yaml
dsh-web-search-thirdparty:
  provider: searxng
  searxngBaseURL: https://searx.be   # or your own instance
  maxResults: 8
  mergeResults: false
  maxPerDomain: 2
  relevanceSort: false
  cacheEnabled: true
  cacheTtlMs: 60000
  retryCount: 1
  retryBackoffMs: 250
  # default true: register the bundled web_fetch provider.
  # Set false to hand web_fetch back to the host's provider
  # (also remove the `fetchProvider` line from this plugin's bundle patch).
  enableFetchProvider: true
```

## Security

- `web_fetch` refuses private / loopback / link-local / cloud-metadata (`169.254.169.254`) targets and
  special-purpose ranges: IPv4 `0.0.0.0/8`, `100.64.0.0/10` (CGNAT), `192.0.0.0/24`, `192.88.99.0/24`,
  `198.18.0.0/15`, `240.0.0.0/4`; IPv6 `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `2002::/16` (6to4),
  `2001::/32` (Teredo), `2001:db8::/32`, `64:ff9b::/96` (NAT64), and every IPv4-mapped form.
- Redirects are followed manually hop by hop, and **every hop is re-validated** (plain `follow` does
  not re-check `Location`).
- A failed DNS resolution is treated as a refusal (inconsistent resolution is the rebinding entry point).
- Set `fetchAllowPrivate: true` explicitly if you need to fetch from an internal network.
- The "test connection" route also runs the SSRF check on a form-supplied SearXNG instance URL.
- **Known residual risk**: a DNS re-resolution window remains between validation and the actual
  connection (the 0-TTL rebinding TOCTOU). Closing it requires pinning the validated IP at the connect
  layer (i.e. a custom undici dispatcher); this implementation deliberately adds no runtime dependency,
  so the window stays. Do not enable `fetchAllowPrivate` with untrusted input.

## Developer

```sh
npm install
npm run build:host     # compiles the host plugin (lib/index.js)
npm run build:client   # bundles the browser UI (lib/client.js)
npm run typecheck
npm test
npm pack
```

Sources are split by responsibility (`src/index.ts` keeps engines, facade, fetch provider, routes, apply):

| file | role |
| --- | --- |
| `src/engine-spec.ts` | single engine table (providers, labels, credential inputs, endpoints, advanced params, test-route mapping, reset fields) |
| `src/config.ts` | config shape and schemastery schema |
| `src/text.ts`, `src/html.ts` | result normalization, snippet cleaning, entity decoding, HTML→Markdown (pure functions) |
| `src/net.ts` | SSRF validation and hop-by-hop redirects |
| `src/state.ts` | result cache, concurrency, circuit breaker, usage stats |
| `src/settings-compat.ts` | two-generation settings-registration compatibility layer |

A fresh clone builds with public npm packages only: `@deepseek-ai/*` compile-time types come from the
repo's ambient shims, while the runtime packages are provided by DSH (linked through the profile, so no
second copy appears).

### Adding an engine

Engine metadata lives in a single shared table, `src/engine-spec.ts` (it drives the provider list,
labels, credential inputs, endpoints, advanced-params form, test-route mapping and reset fields on both
host and browser sides). Adding an engine takes two steps:

1. write the implementation in `src/index.ts` and add it to `ENGINES`;
2. add a spec row in `src/engine-spec.ts`.

`tests/engine-spec.test.ts` cross-checks both directions to prevent drift.

### Provider API

Other Cordis plugins can inject the `web-search-thirdparty` service to register their own search source
(built-in engine ids are a reserved namespace — third parties should use their own id):

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

## License

BSD-3-Clause. See [LICENSE](LICENSE).
