# Changelog

## [0.2.0] - 2026-08-23

安全与正确性修复为主，含少量行为调整。

### Security
- web_fetch SSRF 加固补漏：IPv6 字面量方括号剥离（`http://[::1]/` 此前可绕过）、IPv4-mapped IPv6 十六进制压缩形态（`[::ffff:127.0.0.1]` → `[::ffff:7f00:1]`）识别、DNS 解析失败改为保守拒绝、重定向改手动逐跳并每跳复查（默认 follow 不校验 Location）、新增 `0.0.0.0/8` 与非法 IPv4 段拦截
- 测试连接路由：表单传入的 SearXNG baseURL 过 `assertPublicUrl` 校验（此前可被当内网探测跳板）

### Fixed
- 结果处理顺序修正：域名去重 → 相关度排序 → 截断到 maxResults（此前先截断会丢结果、排序只在残集内做）
- 取消/超时不再伪装成"所有搜索源失败"：abort 后立即终止降级链、原样上抛 `WEB_ABORTED`，且不污染熔断计数与用量统计
- 降级链可用性探测与真实搜索共用同一凭据解析链：只存在 credentials 服务里的 key 此前会被误判为未配置而被排除
- 缓存 key 并入全部引擎 endpoint：切换实例 / 镜像后不再命中旧结果
- `decodeEntities` 十六进制实体判断位置错误导致 `&#x27;` 类不解码

### Changed / Robustness
- 网络重试升级为状态码感知：429 / 5xx 参与退避重试（尊重 Retry-After，上限 10s），退避加随机抖动；其余 4xx 仍立即失败
- `maxProviderQueries` 预算对非合并模式同样生效（含主源），防止主源失败后无限消耗其它引擎配额
- web_fetch 先粗剪原始文本（cap×8，下限 200k）再做 HTML→Markdown 转换，避免超大页面全量正则清洗
- `publishedAt` 归一化：可解析日期统一转 ISO；"2 hours ago" 类相对时间直接丢弃；支持秒级 Unix 时间戳
- SearXNG 403 时给出可操作提示（公共实例普遍禁用 JSON 输出）
- Serper 增加 `num` 参数按需控制条数；Tavily 认证迁移到 `Authorization: Bearer` 头（key 不再进请求体）
- HTML 实体解码通用化（命名 + 十进制 + 十六进制），snippet 与全文抓取共用

### Breaking
- `buildProviderChain` 改为 async 并接受可选 `ctx` 参数
- Tavily 请求体不再携带 `api_key` 字段

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

## [0.1.1] - README: add npm install method
