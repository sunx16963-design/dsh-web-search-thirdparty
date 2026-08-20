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

## Stage 2 (健壮性)

- 并行合并 + 并发控制（maxProviderConcurrency）
- 缓存防击穿（同 key 并发共享一次请求）
- 每源熔断（circuitEnabled / circuitFailureLimit / circuitCooldownMs）
- web_fetch SSRF 加固（默认拦截私网 / 环回 / 云元数据）
- 每源用量统计（getSearchStats / resetSearchStats）
- 修复：缓存 key 并入后处理选项；统计平均延迟改用成功数分母
- web_fetch 增加 HTML→Markdown 清洗（htmlToMarkdown）
