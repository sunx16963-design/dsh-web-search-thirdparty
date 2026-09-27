# Changelog

## [0.4.4] - 2026-09-27

修复“设置页一直显示**未找到设置传输服务**、无法保存”。

### 根因：只在 `apply()` 里探测一次设置服务
DSH 客户端 boot 是**并发激活条目**的（`dsh-client-modules` 的 `entries.start()` 对所有插件
`Promise.all(create)`）。本插件只依赖 `slots`，因此经常在**设置服务提供者之前**激活 ——
`configForms` 自己还要等 `remote`/`remote.settings`，而 `remote` 的提供者
（`@deepseek-ai/dsh-api-remotes`）与本插件同批。实测：

```
apply() 时刻 ctx.get('configForms') = undefined（服务还没注册）
服务晚到之后 ctx.get('configForms') = 拿到服务 ✅
```

一次性探测把「服务还没来」永久误判成「当前 DSH 版本无法保存」，页面就卡在提示上。

### Fixed
- `src/client/scope.ts`：`createScopeAdapter()` 改为**可自愈的动态适配器** —— 外层适配器恒定存在
  （设置页订阅的稳定对象），内层实现用 `ctx.inject([name], cb)` 订阅服务出现/就绪并在回调里
  用**已注入该服务的子 ctx**构建（对该 ctx 连属性访问都合法）；服务晚到时重建并通知 UI，
  页面自动从“等待服务”恢复为可保存。`ctx.inject` 不存在的老环境退化为一次性探测。
  构建失败一律吞成“不可用”，绝不让探测错误外溢成插件加载失败。
- `src/client/index.ts`：提示隐藏时把文本一并清空（隐藏的过期文案会误导读屏软件），
  并把文案改为“正在等待宿主的设置服务就绪…”，等待期间保存/重置按钮保持禁用。

### Added
- `tests/client-ui.test.ts`（jsdom，真实产物 + 真实 DOM）：**UI 级**回归 ——
  服务晚到 → 先提示等待且禁用保存 → 服务到达 → 提示消失、保存解锁、值回填；
  以及“服务一开始就绪”“旧代际 settingsScope”“两代都缺席”三种对照。
- `tests/client-activation.test.ts` + `tests/client-scope.test.ts`：用**真实 cordis**
  覆盖“本插件先激活、configForms 后到”的时序，断言适配器自愈且订阅者被通知。

### 兼容性（安卓版 DSHA 与官方 DSH 同源）
- 宿主：≥0.1.7 走 `SettingsForms`+volatile；≤0.1.6 走 `SettingsProvider`+`installSection`。
- 客户端：≥0.1.7 走 `configForms`；≤0.1.6 走 `settingsScope`。两代都按**可选服务**动态探测，
  任一服务缺席都不会让插件加载失败，晚到也能自愈。

### 验证
- 测试 112 → 122，typecheck（宿主 + 客户端）/ build 通过；
- 隔离实例上对**服务器实际下发**的客户端产物做真实 cordis 激活检查：ACTIVE 且注册
  `settings.section`。

## [0.4.3] - 2026-09-27

**真正的病根**：`apply()` 访问了没有 `inject` 声明的服务属性，cordis 直接抛错 →
客户端插件 fiber FAILED → 启动页 `Failed to load plugin dsh-web-search-thirdparty`。
0.4.1 / 0.4.2 两次“修复”都没碰到这一层。

### 根因（已用真实 cordis 复现并定位到源码行）
- cordis 的 `ReflectService.handler.get`：对未在 `inject` 里声明的服务属性**抛错**
  （`cannot get property "configForms" without inject`），**不是**返回 `undefined`。
- 本插件要同时兼容两代设置服务（C 代 `configForms`、A/B 代 `settingsScope`），
  因此 `inject` 只能声明 `['slots']`；而 `createFormsAdapter/createLegacyAdapter` 却用
  **属性访问** `ctx.configForms` / `ctx.settingsScope` 做探测 → `apply()` 抛错 → fiber FAILED。
  （0.4.0 的 `inject: ['slots','settingsScope']` 在旧代上不会抛错，所以这个坑是我 0.4.1
  把 inject 收窄后才出现的。）
- 正确写法：**`ctx.get(name)`**。实测对「存在但未 inject」返回服务本身、对「不存在」返回
  `undefined`，都不抛错；`ctx.inject([name], cb)` 只适用于“服务出现即回调”，不适合同步探测。

### Fixed
- `src/client/scope.ts`：两代适配器一律改用 `ctx.get()` 探测（新增 `optionalService()`
  再兜一层 try/catch，任何意外的抛错都退化为“服务不可用”）。
- `src/client/index.ts`：`apply()` 对设置传输层探测加 try/catch —— 探测失败只让设置页只读，
  **绝不允许**把整个客户端插件拖成 FAILED（那会让 profile 根本进不去）。

### Added（补上真正能拦住这类问题的验证）
- `tests/client-activation.test.ts`：用**真实 `@deepseek-ai/cordis`** 把 `lib/client.js`
  当插件加载，断言 fiber 进入 ACTIVE（C 代 / A/B 代 / 两代都缺席三种情形），
  并断言能注册 `settings.section`。只要 `apply()` 抛错，fiber 就会是 FAILED，测试立刻失败。
  另含两条“根因锚点”用例：未 inject 的属性访问必须 FAILED、`ctx.get()` 必须不抛错 ——
  防止以后有人把 `ctx.get()` 改回 `ctx.configForms`。
- `tests/client-scope.test.ts` 的假上下文改为只暴露 `ctx.get()`，并新增
  「只把服务挂成属性时探测不到」「`ctx.get()` 抛错时退化为不可用」两条不变量。

### 为什么前两轮没发现（复盘）
- 0.4.1 的 `tests/client-contract.test.ts` 只执行 bundle 的 **factory（materialize）**，
  **从不调用 `apply()`**；端到端验证又只覆盖宿主半边。于是“能加载”被误判为“能用”。
  本轮把「用真实 cordis 激活产物」补成常驻测试，并额外在隔离实例上对
  **服务器实际下发**的单包产物与批次脚本各做了一次激活检查。

### Verification（本次实测）
| 检查对象 | fiber.state | settings.section |
| --- | --- | --- |
| 修复后·服务端下发单包产物 | 2 ACTIVE | 已注册 |
| 修复前·服务端下发同位置产物 | 3 FAILED | 未注册 |
| 修复后·浏览器实际下载的批次脚本（8 个模块） | 2 ACTIVE | 已注册 |
- 全量测试 104 → 112，typecheck（宿主 + 客户端）/ build 通过。

## [0.4.2] - 2026-09-27

修复 0.4.1 引入的**加载期事故**：客户端 bundle 少了 `exports.inject`，DSH 启动页直接报
`Failed to load plugin dsh-web-search-thirdparty`，profile 起不来。

### Fixed（本次事故）
- **`src/client/index.ts` 的 `export const inject` 被误删**。0.4.1 重构时用脚本删除重复代码，
  把「移到 `./scope.ts` 的部分」连同**没有备份的** `inject` / `PROVIDERS` / `specOf` /
  `RESET_FIELDS` 一起删掉了。后果分两层：
  - `inject` 缺失 → DSH 客户端模块加载器拒绝该模块 → 启动页报 `Failed to load plugin`；
  - 其余三个标识符悬空 → 就算能加载，设置页一挂载就会 `ReferenceError`。
  现已全部还原（对比 0.4.0 的顶层声明逐个核对过）。
- 根 `tsconfig.json` 一直 `exclude: ["src/client"]`，打包器也不做未定义标识符检查，所以
  typecheck / build / 99 个测试**全绿**却产出了坏包。本次补上两道闸：
  - **`tsconfig.client.json`**：给 `src/client` 单独做类型检查（DOM lib + React types），
    并接进 `npm run typecheck`（CI 会跑）。它当场又抓出 5 处此前无人看管的问题；
  - **`tests/client-contract.test.ts`**：既断言源码导出面，也**用假 `window.__ModuleLoader__`
    真正执行 `lib/client.js`**，断言加载器拿到的模块带 `apply`/`inject`。
    已做变异验证：删掉 `exports.inject` 后该测试立刻失败。
- 顺带修掉类型检查暴露的既有问题：
  - `SettingsShape` 缺 `mergeResults` / `maxPerDomain` / `relevanceSort` / `cacheEnabled` /
    `cacheTtlMs`（只是类型缺项，运行时无碍）；
  - `ENGINE_RESET_FIELDS` 里 `.concat([可选 key])` 触发 `concat` 重载不匹配 ——
    改为先对可选 key 单独 `filter` 再展开（语义不变，类型干净）。

### 事故复盘（为什么之前没发现）
0.4.1 的验证只覆盖了**宿主半边**（设置分区是否被服务、写入是否落盘、搜索是否可用），
从未验证**客户端半边能否被加载器接受**。本次补上浏览器同款验证：从隔离实例把服务器真正
下发的客户端 bundle 取回来执行，确认导出 `apply`/`inject`。

## [0.4.1] - 2026-09-27

修复「设置页填入 Tavily key → 点保存 → key 被清空」：根因是 DSH 0.1.7 换了设置服务，
而本插件仍按旧一代 API 写配置，于是写入**从未落盘**，界面还无条件显示“✅ 已保存”。

### Fixed（本次报障）
- **保存 API key 无效 / 保存后 key “消失”**。DSH ≥ 0.1.7-alpha.1 的设置服务换成
  `dsh-settings` 的 `SettingsForms`：它按 profile 组合条目的 **id** 自动服务该条目导出的
  `Config` 模式，并且**只把 schema 上声明为 `.volatile()` 的字段**投影成表单
  （`volatileForm()` 对一个 volatile 字段都没有的条目直接返回 `undefined`，该条目对设置页
  等于不存在）。本插件此前没有任何字段是 volatile，因此：
  - 分区从不进入 `settings.describe()`，`ctx.remote.settings.mutate()` 一律被拒；
  - 客户端 `inject = ['slots', 'settingsScope']` 里的 `settingsScope` 在新版已被删除，
    设置分区连注册都轮不到。
  现在 `Config` 的每个可编辑字段都声明 `.volatile()`（旧代际自动降级为普通字段，见下），
  读写统一走 `unwrapConfig()` 解包 volatile 引用。
- **保存失败不再假装成功**。旧代码 `await Promise.all(writes)` 后无条件打印“✅ 已保存”并清空
  输入框；旧代际的设置客户端在被拒时是**静默回读**，因此用户看到的就是“点保存 → key 被清空”。
  现在改为一次原子 `mutate`，并如实检查返回值：拒绝就报“❌ 保存失败……设置未改动”。
- **敏感字段不再被空串回写抹掉**。key 被宿主脱敏后浏览器拿不到原值，`buildSaveOps()` 保证
  空白输入**不产生任何写入 op**（此前是“留空跳过”，但没有测试锁住；现在有）。
- **保存后不再需要重启才生效**。新版设置写入只更新 volatile 引用，不会再触发旧版的
  `onChange`，可用性探测缓存因此一直停留在“没有 key”。`ThirdPartySearchProvider` 现在按
  凭据指纹自检，配置一变立刻作废旧探测结果。

### Added
- **`GET /api/web-search-thirdparty/config`**：设置页用的“运行期真相”，逐引擎回报是否可用
  （走与真实搜索完全相同的凭据解析链：字面量 → credentials 服务 → 启动环境变量）。
  之所以必须新增它：`describe()` 的 `secrets` 边车对每个密钥**恒为** `set: true`
  （上游定义为 `value !== undefined`，而 secret 字段总有默认空串），浏览器侧根本无法自证
  “密钥存下来了没有”。设置页现在用它显示“运行期状态：密钥可用 ✓ / 未配置”，并在保存后
  回读；宿主接受但运行期仍不可用时给出明确告警。
- 设置页在宿主动拒绝写入或未服务该分区时，直接禁用按钮并说明原因，不再给出可点击的假象。

### Compatibility
- **支持 DSH ≥ 0.1.7-alpha.1 的新设置 API**，同时保留 ≤ 0.1.6-alpha.2 的旧路径：
  - 新代际（`dsh-settings` 导出 `SettingsForms`）：Config 声明 volatile；客户端走
    `ctx.configForms.get(<条目 id>)`（分区即组合条目 id `web-search-thirdparty`）。
  - 旧代际（导出 `SettingsProvider`）：Config **不**声明 volatile（旧 describe 不拆引用，
    声明了会被 JSON 成 `{}`）；客户端走 `ctx.settingsScope.bind({ namespace })`。
  - 代际探测放在 `settingsGeneration()`，`buildConfigSchema(z, volatile)` 参数化以便双向加哨兵。
- 客户端 `inject` 收窄为 `['slots']`：`settingsScope` 在新版不存在，写成硬依赖会让整个
  客户端插件永远等不到服务。
- 依赖 `@deepseek-ai/schemastery` 提升到 `^3.18.3`（`.volatile()` 从 3.18.3 才提供；
  3.18.1/3.18.2 上会静默退化，届时 `apply()` 会打出可操作的告警而不是让用户面对“保存没反应”）。

### Tests
- 测试 69 → 99：新增 `tests/settings-volatile.test.ts`（用真实 schemastery/cosmokit 复刻上游
  `volatileForm()` 投影规则，锁死“无 volatile 字段 ⇒ 分区被跳过”这一根因）与
  `tests/client-scope.test.ts`（两代适配器、拒绝必须为 false、`buildSaveOps` 空白不回写）。

### Verification（本次修复的实测证据）
- 隔离 profile 上跑了真实 DSH 0.1.7-alpha.2 + 真实 `SettingsForms`：
  - 修复前：`describe()` 里**没有** `web-search-thirdparty` → 写入必被拒（bug 形态复现）。
  - 修复后：分区上线（51 个字段，含 `tavilyApiKey`）；`mutate` 被接受并落盘到
    profile patch；重启后 key 仍在且真实 Tavily 搜索可用；`/config` 如实回报
    `tavily.configured=true`、其余 keyed 引擎 false。

### 相关同类问题（调研结论）
同一代 API 变更还打断了生态里其它第三方插件，说明这不是本插件独有的坑：
- `@gausszhou/dsh-web-search-local@0.2.1` 直接 `import { installSettingsSection } from
  '@deepseek-ai/dsh-settings'` —— 该导出在 0.1.7 已删除，ESM 在**链接期**就抛
  `SyntaxError: does not provide an export named 'installSettingsSection'`，插件完全加载不了
  （本插件 0.4.0 用 namespace import + 运行期探测避开了这一枪，但没跟上 volatile 约定）。
- `@dsh-plugin/dsh-auxiliary@0.6.4` 调 `loader.settings.installSection(...)` —— 0.1.7 没有该方法。
- `dsh-graph@0.16.1` 仍只认 `ctx.settingsScope`（0 处 `configForms`），其自带文案就是
  “settingsScope 缺失时整页降级”。
- `dsh-context@0.57.0` 已经同时挂 `settingsScope` 与 `configForms` 两条路 —— 与本次修复同思路。
- 上游包本身可作为代际判据：`dsh-settings` 0.1.3-alpha.2 / 0.1.5-rc.3 / 0.1.6-alpha.2 导出
  `SettingsProvider`；0.1.7-alpha.1 起改为导出 `SettingsForms`。

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
