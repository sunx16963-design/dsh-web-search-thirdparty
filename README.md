# dsh-web-search-thirdparty

> 🌏 **English** · [**中文文档**](./README.zh-CN.md)

A DSH (DeepSeek Harness) web-search **provider facade**: it replaces the built-in
DeepSeek-only search with configurable third-party search engines, gives every
source its own settings UI, and adds a web-fetch (page retrieval) provider so the
model can both *search* and *read* full pages.

Works as a **bundle plugin** for DSH web profiles: one install wires up the
search seam, the `web_search` / `web_fetch` tools, and a friendly settings page.

---

## ✨ Features

- **6 built-in engines** behind one facade: SearXNG · Tavily · Serper(bing) · Brave · Bing · Google CSE
- **Open provider-registration API** — any other Cordis plugin can register its own search source
- **Per-provider advanced params** in the settings UI (language / country / market / search_depth / safesearch / …)
- **Custom endpoint / baseURL** per provider (self-hosted SearXNG, internal/proxy mirrors)
- **Custom request headers** + **network retry with exponential backoff**
- **Auto-fallback** across usable sources, and **merge mode** (multi-source, de-duplicated)
- **Domain de-dup** + **relevance sorting** + result-count/timeout control
- **TTL result cache** (no repeated upstream calls → saves key quota)
- **Test connection** with latency / result count / first title
- **web_fetch** provider (limited body size) so `web_fetch` works too
- Settings toggle UI that works from the browser, **theme-friendly** (native controls + `color-scheme`)

> Replaces the built-in search **without touching/disabling** the DeepSeek provider:
> it only points `web.searchProvider` at this facade, so no `WEB_PROVIDER_AMBIGUOUS`.

---

## 🔌 Supported engines

| id | service | key? | config |
|---|---|---|---|
| `searxng` (default) | SearXNG (self-hosted / public) | no | `searxngBaseURL` |
| `tavily` | Tavily | yes | `tavilyApiKey` / `TAVILY_API_KEY` |
| `serper` | Google SERP | yes | `serperApiKey` / `SERPER_API_KEY` |
| `brave` | Brave Search | yes | `braveApiKey` / `BRAVE_API_KEY` |
| `bing` | Bing Web Search | yes | `bingApiKey` / `BING_SEARCH_API_KEY` |
| `google-cse` | Google CSE | yes (key + cx) | `googleApiKey` + `googleSearchEngineId` |

Keys may be set as a literal in the settings UI, stored in the DSH credentials
service, or exported as an environment variable (each engine also has an `*Env`
field to name its env var).

---

## 🚀 Install

### From source clone
```bash
# via the plugin manager (runs the quality gate + rollback)
dshpm install github:your-name/dsh-web-search-thirdparty --profile web
```

### Local build & install
```bash
git clone https://github.com/your-name/dsh-web-search-thirdparty.git
cd dsh-web-search-thirdparty
npm install
npm run build          # produces lib/
# then point the plugin manager at this directory
dshpm install /path/to/dsh-web-search-thirdparty --profile web
```

After install, **restart the web profile** once so the client settings page loads.

---

## 🧰 Developer

```bash
npm install
npm run build:host     # tsc  → lib/index.js
npm run build:client   # tsdown → lib/client.js
npm run typecheck
npm pack               # release artifact
```

A fresh clone builds with only public npm packages (the `@deepseek-ai/*` platform
symbols are provided by ambient type shims for compile-time; at runtime DSH
supplies the real peer packages).

### Register a custom search source (open API)

Any other Cordis plugin may inject the `web-search-thirdparty` service and register
an adapter:

```ts
export const inject = ['web-search-thirdparty']

function apply(ctx) {
  ctx.get('web-search-thirdparty').register({
    id: 'my-source',
    label: 'My Source',
    available: () => true,
    search: async ({ query, maxResults, config }, signal) => ({
      sources: [{ url: 'https://…', title: '…', snippet: '…' }],
      content: 'optional answer',
    }),
  })
}
```

---

## ⚙️ Settings (settings partition `dsh-web-search-thirdparty`)

```yaml
dsh-web-search-thirdparty:
  provider: searxng
  searxngBaseURL: http://127.0.0.1:8666
  tavilyApiKey: ""            # or export TAVILY_API_KEY
  maxResults: 8
  mergeResults: false         # multi-source merge + dedupe
  maxPerDomain: 2             # 0 = unlimited
  relevanceSort: false
  cacheEnabled: true
  cacheTtlMs: 60000
  retryCount: 1
  retryBackoffMs: 250
  extraHeadersJson: '{}'
```

---

## 🔒 Security notes

- **SSRF**: the built-in web_fetch provider follows the URL directly. Do not
  enable it on a host that can reach sensitive internal targets without adding
  private-network guards.
- **Secrets**: keys are stored under DSH settings; never commit them. If a key was
  shared, **revoke and regenerate** it.

## ⚠️ Network / VPN

Reachability is the one thing this plugin can't fix: if a target site/API is
blocked on your network, point the engine at a reachable endpoint (self-hosted
SearXNG, internal proxy) or use a VPN — and optionally set `extraHeadersJson`
/ per-provider endpoints to route through a local proxy.

---

## 📄 License

BSD-3-Clause. See [LICENSE](LICENSE).
