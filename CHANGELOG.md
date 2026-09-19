# Changelog

## [0.4.0] - 2026-09-19

支持最新 DSH（0.1.5-rc.2）并修复一批长期问题。

### Compatibility（重要）
- **支持 DSH ≥ 0.1.2 的设置 API 变更**：上游在 0.1.2 之后删除了顶层 `installSettingsSection` /
  `settingsNamespace`，改为 `ctx.settings.installSection(...)` + 字面量 namespace。插件现在运行时探测
  两代 API（旧 helper → 新服务方法 → 结构性兜底），并在都没有时退化为“仅用组合配置”。
  此前在新版 DSH 上 `apply()` 会因调用已删除的函数而抛错、插件加载失败。
- `src/shims.d.ts` 不再把已删除的符号声明为存在（这正是此前“typecheck 通过但运行期炸掉”的原因）。
- 移除已停止发布的 `@deepseek-ai/dsh-client-runtime` peer（上游 0.1.2 起被
  `dsh-client-ui-cordis` / `dsh-cordis-client-runner` 取代），并清理 `dsh.client.inject`
  中未使用的 connection / locale。
- peerDependencies 区间由 `^0.1.0-rc.6`（实测不匹配 0.1.1-rc.2 / 0.1.5-rc.2 等预发布版本）
  放宽为 `>=0.1.0-rc.6`；`engines.node` 声明为 `>=22.19`。

### Fixed
- **CI 修复**：`npm run build` 在 Node 20 上必失败 —— tsdown 0.22 的配置加载器在缺少原生 TS 支持时
  回退到可选 peer `unrun`（未安装）。CI 改为 Node 24（与 tsdown engines `^22.18 || >=24.11` 对齐）。
- `truncated` 诚实上报：门面按 `maxResults` 截断过结果时不再恒返回 `false`（seam 会原样透传该字段）。
- Brave `publishedAt` 归一化：`page_age` 不再未经校验直接透传，改为与其它引擎一致走
  `normalizePublishedAt()`（解析不了的相对时间/异常值按契约丢弃）。
- 响应体非合法 JSON 不再参与重试（它不是瞬态故障，重试只会浪费配额），直接报可诊断错误。
- 缓存 key 并入 `extraHeadersJson`（自定义请求头会改变上游结果，此前会命中旧缓存）。

### Changed
- `available()` 语义对齐 seam：新增同步确定性判断（字面量 → 启动环境）+ 异步探测缓存
  （`refreshAvailability()`，配置变更后自动刷新）。凭据只存在于 credentials 服务时仍保持乐观，
  不会把可用源误判为不可用。
- 缓存加上限（300 条，TTL 之外按写入时间淘汰）并统计命中/未命中/合并数（`GET /api/web-search-thirdparty/stats`
  返回 `cache` 字段，设置页用量面板显示）。
- `ProviderRegistry.register()` 保护内置引擎 id：第三方源不得静默覆盖内置实现（新增 internal 标记）。
- 插件卸载 / 热重载时清空缓存、熔断与统计（`resetRuntimeState()`），避免旧一代状态残留。
- 新增配置 `enableFetchProvider`（默认 true）：关掉可把 `web_fetch` 交回宿主的官方 provider
  （上游默认 `fetch: false` 且不挂 fetch provider，本插件属主动偏离，补丁注释已写明）。
- SSRF 防护补强：新增 IPv6 `2002::/16`(6to4)、`2001::/32`(Teredo)、`ff00::/8`(组播)、
  `2001:db8::/32`(文档段)、`64:ff9b::/96`(NAT64)，以及 IPv4 `192.0.0.0/24`、`198.18.0.0/15`、
  `192.88.99.0/24`、`240.0.0.0/4`。README 明确记录 DNS 重解析（rebinding）窗口这一残留风险。
- 测试连接路由改用 `min(3, maxResults)` 探测（此前恒为 1，无法覆盖引擎的条数参数路径）。
- 源码按职责拆分为 `config` / `types` / `text` / `html` / `net` / `state` / `settings-compat`，
  `src/index.ts` 从 1387 行降到约 800 行；对外导出面保持不变（测试与第三方引用不受影响）。
- 测试从 54 增至 69（新增两代 settings API、可用性探测、truncated、缓存 key/计数、
  SSRF 特殊段、非 JSON 不重试等回归用例）。

## [0.3.0] - 2026-08-23

可维护性与 DX：引擎描述收敛为单表驱动，用量统计闭环。

### Added
- `GET /api/web-search-thirdparty/stats`：返回每源请求/错误/平均延迟与熔断状态
- 设置页新增“用量统计”面板（展开即加载，可手动刷新）
- `getCircuitStates()` 导出，供第三方读取熔断状态
- `tests/engine-spec.test.ts` 完整性哨兵：spec 与实现、配置字段双向校验，防两端漂移

### Changed
- **引擎描述单表化**：新增共享模块 `src/engine-spec.ts`（纯数据），provider 列表、标签、凭据输入行、endpoint、高级参数表单、测试路由取值映射、重置字段全部由它驱动——新增引擎从改六处降为两处（写实现 + 加一条 spec）
- 引擎凭据解析统一走 `resolveEngineKeys()`（由 spec 输入行派生），删除各引擎内硬编码的 key 三元组
- `registry.register()` 重复 id 从抛错改为警告并替换（热重载第三方插件不再被炸掉）
- “恢复默认”字段清单改由 spec 派生，并补齐此前遗漏的 endpoint / 重试 / 自定义头等全局项；修复 bingEndpoint 在列表里而其它引擎 endpoint 不在的不一致
- 设置页保存后非敏感输入（SearXNG 实例 URL）正确回填；client `inject` 清理未使用的 locale/connection/remote

## [0.2.0] - 2026-08-23（未发布到 npm：npm 上只有 0.1.0 / 0.1.1 / 0.3.0 / 0.4.0）

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
