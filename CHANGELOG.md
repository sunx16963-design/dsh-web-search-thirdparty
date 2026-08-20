# Changelog

## [0.1.0] - 2026-08-20

First release.

### Features
- 6 built-in engines behind one facade: SearXNG / Tavily / Serper / Brave / Bing / Google CSE
- Open provider-registration API (`web-search-thirdparty` Cordis service)
- Settings UI with per-provider advanced params + global enhancements
- Per-provider custom endpoint / baseURL
- Custom request headers + network retry with exponential backoff
- Auto-fallback across usable sources; optional multi-source merge + de-dupe
- Domain de-dupe + relevance sorting + result-count / timeout control
- TTL result cache
- Test connection (latency / count / first title)
- web_fetch page-retrieval provider (with body-size cap)
