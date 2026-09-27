window.__ModuleLoader__.load({
	id: "dsh-web-search-thirdparty",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		//#region src/engine-spec.ts
		const ENGINE_SPECS = [
			{
				id: "searxng",
				label: "SearXNG",
				endpointKey: "searxngBaseURL",
				input: {
					configKey: "searxngBaseURL",
					label: "SearXNG 实例 URL",
					secret: false,
					testBodyField: "url"
				},
				fields: [
					{
						key: "searxngLanguage",
						label: "语言",
						type: "text",
						def: "",
						placeholder: "如 zh / en / all"
					},
					{
						key: "searxngCategories",
						label: "分类",
						type: "text",
						def: "general",
						placeholder: "如 general / news / science"
					},
					{
						key: "searxngSafesearch",
						label: "安全搜索 (0-2)",
						type: "number",
						def: "0",
						placeholder: "0 宽松 · 2 严格"
					}
				]
			},
			{
				id: "tavily",
				label: "Tavily",
				endpointKey: "tavilyEndpoint",
				input: {
					configKey: "tavilyApiKey",
					label: "Tavily API Key",
					secret: true,
					testBodyField: "key",
					envRefKey: "tavilyApiKeyEnv",
					envVar: "TAVILY_API_KEY"
				},
				fields: [{
					key: "tavilySearchDepth",
					label: "搜索深度",
					type: "select",
					options: ["basic", "advanced"],
					def: "basic"
				}]
			},
			{
				id: "serper",
				label: "Serper",
				endpointKey: "serperEndpoint",
				input: {
					configKey: "serperApiKey",
					label: "Serper API Key",
					secret: true,
					testBodyField: "key",
					envRefKey: "serperApiKeyEnv",
					envVar: "SERPER_API_KEY"
				},
				fields: [{
					key: "serperLanguage",
					label: "地区代码 (gl)",
					type: "text",
					def: "",
					placeholder: "us / jp / de"
				}]
			},
			{
				id: "brave",
				label: "Brave",
				endpointKey: "braveEndpoint",
				input: {
					configKey: "braveApiKey",
					label: "Brave API Key",
					secret: true,
					testBodyField: "key",
					envRefKey: "braveApiKeyEnv",
					envVar: "BRAVE_API_KEY"
				},
				fields: [{
					key: "braveCountry",
					label: "国家代码",
					type: "text",
					def: "",
					placeholder: "us / jp"
				}, {
					key: "braveSearchLang",
					label: "搜索语言",
					type: "text",
					def: "",
					placeholder: "en / ja"
				}]
			},
			{
				id: "bing",
				label: "Bing",
				endpointKey: "bingEndpoint",
				input: {
					configKey: "bingApiKey",
					label: "Bing API Key",
					secret: true,
					testBodyField: "key",
					envRefKey: "bingApiKeyEnv",
					envVar: "BING_SEARCH_API_KEY"
				},
				fields: [{
					key: "bingMarket",
					label: "市场 (mkt)",
					type: "text",
					def: "en-US",
					placeholder: "en-US / ja-JP"
				}]
			},
			{
				id: "google-cse",
				label: "Google CSE",
				endpointKey: "googleEndpoint",
				input: {
					configKey: "googleApiKey",
					label: "Google API Key",
					secret: true,
					testBodyField: "key",
					envRefKey: "googleApiKeyEnv",
					envVar: "GOOGLE_CSE_API_KEY"
				},
				secondInput: {
					configKey: "googleSearchEngineId",
					label: "Search Engine ID (cx)",
					secret: true,
					testBodyField: "cx",
					envRefKey: "googleSearchEngineIdEnv",
					envVar: "GOOGLE_CSE_ID"
				},
				fields: [{
					key: "googleLanguage",
					label: "语言 (lr)",
					type: "text",
					def: "",
					placeholder: "lang_en / lang_zh-CN"
				}]
			}
		];
		//#endregion
		//#region src/client/scope.ts
		/**
		* scope.ts —— 两代 DSH 设置 API 的统一视图层（纯逻辑，不碰 DOM / React，便于单测）。
		*
		*   ≥ 0.1.7-alpha.1（C 代）：`ctx.configForms.get(<profile 条目 id>)`。条目 id 就是分区名，
		*     宿主只把 `Config` 上声明为 volatile 的字段投影成表单；`role('secret')` 字段在
		*     describe 时被剥掉，浏览器拿不到原值。
		*
		*     ⚠ 别指望 describe 的 `secrets: [{ path, set }]` 边车判断“存过没有”：上游把 `set` 定义为
		*     `value !== undefined`，而解析后的配置**总是**带着 secret 字段的默认空串，于是它对每个
		*     密钥恒为 true（实测确认）。真正的“配没配好”只能问运行期 —— 见本插件
		*     `GET /api/web-search-thirdparty/config`。
		*   ≤ 0.1.6-alpha.2（A/B 代）：`ctx.settingsScope.bind({ namespace })`，分区名是本插件自己
		*     installSection 注册的字面量。旧版写入被拒时**静默**回读 —— 这就是“点了保存什么也没发生”
		*     在旧版上的表现，务必靠 mutate 的返回值/回读来判定，而不是无条件显示成功。
		*
		* 关键契约：`mutate()` 必须把宿主的拒绝如实返回 false。旧代码直接 `Promise.all(scope.set(...))`
		* 并且无条件显示“✅ 已保存”，正是 Tavily key 看起来被清空、实际从未写进去的直接原因之一。
		*/
		/** C 代分区名 = profile 组合条目 id（cordis.patch.yml 里的 insert id）。 */
		const ENTRY_ID = "web-search-thirdparty";
		/** A/B 代分区名 = 本插件 installSection 注册的 namespace。 */
		const LEGACY_NAMESPACE = "dsh-web-search-thirdparty";
		/** 先按顺序找被宿主服务的分区，找不到再按 schema 特征兜底（条目 id 被改名也不会瞎掉）。 */
		const NAMESPACE_CANDIDATES = [ENTRY_ID, LEGACY_NAMESPACE];
		/**
		* 探测一个**可选**服务。
		*
		* cordis 对 `ctx.<service>` 的属性访问会强制 inject 检查并抛错，所以跨代兼容的插件
		* 只能用 `ctx.get()`。这里再兜一层 try/catch：任何意料之外的抛错都退化为「服务不可用」，
		* 绝不让设置页探测失败波及插件加载本身。
		*
		* @param ctx - 客户端插件上下文
		* @param name - 服务名
		* @returns 服务实例；不可用时为 undefined
		*/
		function optionalService(ctx, name) {
			try {
				return ctx?.get?.(name) ?? void 0;
			} catch {
				return;
			}
		}
		function namespacesOf(mirror) {
			return mirror?.getSnapshot?.().view?.namespaces ?? [];
		}
		/** C 代（≥ 0.1.7）适配器：configForms + describe 镜像。 */
		function createFormsAdapter(ctx) {
			const forms = optionalService(ctx, "configForms");
			if (forms === void 0 || typeof forms.get !== "function") return void 0;
			const mirror = typeof forms.describe === "function" ? forms.describe() : void 0;
			const listeners = /* @__PURE__ */ new Set();
			const emit = () => {
				for (const listener of [...listeners]) listener();
			};
			let namespace;
			let form;
			let formOff;
			const servedIds = () => namespacesOf(mirror).map((v) => String(v?.ns ?? ""));
			/** 条目被改名时的兜底：找一个 schema 里带本插件特征字段的分区。 */
			const matchBySchema = () => {
				for (const view of namespacesOf(mirror)) {
					const json = JSON.stringify(view?.schema ?? {});
					if (json.includes("tavilyApiKey") && json.includes("searxngBaseURL")) return String(view?.ns ?? "") || void 0;
				}
			};
			const rebind = () => {
				const served = servedIds();
				const picked = NAMESPACE_CANDIDATES.find((id) => served.includes(id)) ?? matchBySchema() ?? (served.length === 0 ? NAMESPACE_CANDIDATES[0] : void 0);
				if (picked === namespace) return;
				namespace = picked;
				formOff?.();
				formOff = void 0;
				form = picked === void 0 ? void 0 : forms.get(picked);
				if (form !== void 0 && typeof form.subscribe === "function") formOff = form.subscribe(() => emit());
				emit();
			};
			const offMirror = typeof mirror?.subscribe === "function" ? mirror.subscribe(() => rebind()) : void 0;
			rebind();
			ctx?.effect?.(() => () => {
				offMirror?.();
				formOff?.();
			}, "web-search-thirdparty: settings scope");
			return {
				served: () => namespace !== void 0 && servedIds().includes(namespace),
				getSnapshot: () => {
					if (form === void 0) return {
						status: "unavailable",
						writable: false
					};
					const snap = form.getSnapshot();
					return {
						status: snap?.status ?? "unavailable",
						value: snap?.value,
						writable: snap?.writable !== false,
						revision: snap?.revision
					};
				},
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				mutate: async (ops) => {
					if (form === void 0) return false;
					const payload = ops.map((op) => op.op === "set" ? {
						op: "set",
						path: [op.field],
						value: op.value
					} : {
						op: "unset",
						path: [op.field]
					});
					return await form.mutate(payload) !== false;
				}
			};
		}
		/** A/B 代（≤ 0.1.6）适配器：settingsScope.bind。 */
		function createLegacyAdapter(ctx) {
			const service = optionalService(ctx, "settingsScope");
			if (service === void 0 || typeof service.bind !== "function") return void 0;
			const scope = service.bind({
				namespace: LEGACY_NAMESPACE,
				decode: (value) => typeof value === "object" && value !== null ? value : void 0
			});
			return {
				served: () => scope.getSnapshot?.().status === "ready",
				getSnapshot: () => {
					const snap = scope.getSnapshot?.() ?? {};
					return {
						status: snap.status ?? "unavailable",
						value: snap.value,
						writable: snap.writable !== false,
						revision: snap.revision
					};
				},
				subscribe: (listener) => scope.subscribe(listener),
				mutate: async (ops) => {
					for (const op of ops) if (op.op === "set") await scope.set(op.field, op.value);
					else await scope.unset(op.field);
					return true;
				}
			};
		}
		/**
		* 组合出一个**可自愈**的设置传输适配器。
		*
		* ⚠ 不能只在 `apply()` 里探测一次。DSH 客户端 boot 是**并发激活条目**的
		* （`dsh-client-modules` 的 `entries.start()` 对所有插件 `Promise.all(create)`），而本插件
		* 只依赖 `slots`，因此经常在设置服务提供者**之前**激活 —— 设置服务 `configForms` 自己还要等
		* `remote`/`remote.settings`，而 `remote` 的提供者与本插件同批。一次性探测会把「服务还没来」
		* 永久误判成「当前 DSH 版本无法保存」，页面就一直显示“未找到设置传输服务”。
		*
		* 这里用 `ctx.inject([name], cb)` 订阅：服务已可用时回调立刻执行，服务晚到时再执行；
		* 回调收到的是**已注入该服务的子 ctx**（对它连属性访问都合法）。每次回调都重建适配器并
		* 通知订阅者（设置页据此重新渲染、自动从“不可保存”恢复为可用）。
		*
		* `ctx.inject` 不存在时（非常老的环境）退化为一次性探测，行为与以前一致。
		*
		* @param ctx - 客户端插件上下文
		* @returns 始终返回一个适配器；宿主服务缺席时其快照为 `unavailable`
		*/
		function createScopeAdapter(ctx) {
			let inner;
			let innerOff;
			let innerKind;
			const listeners = /* @__PURE__ */ new Set();
			const emit = () => {
				for (const listener of [...listeners]) listener();
			};
			/** 装上一个实现；已经有更优/同代实现时不重复安装，避免多余订阅。 */
			const install = (kind, adapter) => {
				if (adapter === void 0) return;
				if (innerKind === "forms") return;
				if (inner !== void 0 && innerKind === kind) return;
				innerOff?.();
				innerOff = void 0;
				inner = adapter;
				innerKind = kind;
				innerOff = adapter.subscribe(() => emit());
				emit();
			};
			/**
			* 构建失败绝不允许外溢：设置传输层探测失败只应表现为「不可用」，不能让 apply() 抛错
			* （那会让整个客户端插件 FAILED、启动页报 Failed to load plugin）。
			*/
			const safeBuild = (build, serviceCtx) => {
				try {
					return build(serviceCtx);
				} catch {
					return;
				}
			};
			const probe = () => {
				if (inner !== void 0) return;
				install("forms", safeBuild(createFormsAdapter, ctx));
				if (inner === void 0) install("legacy", safeBuild(createLegacyAdapter, ctx));
			};
			probe();
			const watch = (name, kind, build) => {
				try {
					const dispose = ctx?.inject?.([name], (serviceCtx) => {
						install(kind, safeBuild(build, serviceCtx));
					});
					if (typeof dispose === "function") ctx?.effect?.(() => dispose);
				} catch {}
			};
			watch("configForms", "forms", createFormsAdapter);
			watch("settingsScope", "legacy", createLegacyAdapter);
			return {
				served: () => inner?.served() === true,
				getSnapshot: () => inner?.getSnapshot() ?? {
					status: "unavailable",
					writable: false
				},
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				mutate: async (ops) => {
					const adapter = inner;
					if (adapter === void 0) return false;
					return adapter.mutate(ops);
				}
			};
		}
		/** 搜索条数夹取到 1..20（非法值回落到默认 8）。 */
		function clampMaxResults(value) {
			if (!Number.isFinite(value)) return 8;
			return Math.max(1, Math.min(20, Math.round(value)));
		}
		/** 缓存秒数夹取到 0..86400。 */
		function clampInt(value) {
			if (!Number.isFinite(value)) return 0;
			const n = Math.round(value);
			if (n < 0) return 0;
			if (n > 86400) return 86400;
			return n;
		}
		/**
		* 把表单状态翻译成一次原子写入的 op 列表。
		*
		* 关键规则：**空白的敏感字段不产生任何 op**。密钥在浏览器侧本来就拿不到原值
		* （`role('secret')` 会被宿主脱敏），如果把空输入回写成 `''`，就等于把已保存的密钥抹掉
		* —— 那正是“点保存 key 被清空”的另一半原因。
		*
		* @returns ops 与本次是否写了敏感字段（UI 据此提示“已保存”并回读确认）。
		*/
		function buildSaveOps(state) {
			const ops = [{
				op: "set",
				field: "provider",
				value: state.provider
			}];
			let wroteSecret = false;
			if (state.main !== void 0) {
				const value = state.main.value.trim();
				if (value.length > 0) {
					ops.push({
						op: "set",
						field: state.main.field,
						value
					});
					if (state.main.secret) wroteSecret = true;
				}
			}
			if (state.second !== void 0) {
				const value = state.second.value.trim();
				if (value.length > 0) {
					ops.push({
						op: "set",
						field: state.second.field,
						value
					});
					if (state.second.secret) wroteSecret = true;
				}
			}
			ops.push({
				op: "set",
				field: "maxResults",
				value: clampMaxResults(Number(state.maxResults))
			});
			ops.push({
				op: "set",
				field: "mergeResults",
				value: state.mergeResults
			});
			for (const field of state.advanced) {
				const raw = field.value.trim();
				if (raw === "") continue;
				ops.push({
					op: "set",
					field: field.key,
					value: field.numeric ? Number(raw) : raw
				});
			}
			ops.push({
				op: "set",
				field: "enableFetchProvider",
				value: state.enableFetchProvider
			});
			ops.push({
				op: "set",
				field: "maxPerDomain",
				value: clampInt(Number(state.maxPerDomain))
			});
			ops.push({
				op: "set",
				field: "relevanceSort",
				value: state.relevanceSort
			});
			ops.push({
				op: "set",
				field: "cacheEnabled",
				value: state.cacheEnabled
			});
			const cacheSeconds = clampInt(Number(state.cacheTtlSeconds));
			ops.push({
				op: "set",
				field: "cacheTtlMs",
				value: cacheSeconds > 0 ? Math.max(1e3, cacheSeconds * 1e3) : 6e4
			});
			return {
				ops,
				wroteSecret
			};
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-web-search-thirdparty — browser half: register the "网络搜索" settings page.
		* The settings shell mounts section components as React components, so this is a
		* React function component (built with React.createElement, no JSX). The form
		* itself stays vanilla DOM for theme-friendly native controls.
		*
		* 两代设置 API 的适配都在 `./scope.ts`，表单逻辑只认那一个 {@link SettingsScopeAdapter} 接口。
		* 本文件只负责 DOM 表单与宿主路由交互。
		*/
		const PROVIDERS = ENGINE_SPECS.map((s) => ({
			id: s.id,
			label: s.label
		}));
		function specOf(provider) {
			return ENGINE_SPECS.find((s) => s.id === provider);
		}
		const GLOBAL_RESET_FIELDS = [
			"provider",
			"timeoutMs",
			"maxResults",
			"snippetMaxLength",
			"mergeResults",
			"fallbackProviders",
			"maxProviderQueries",
			"maxPerDomain",
			"relevanceSort",
			"cacheEnabled",
			"cacheTtlMs",
			"maxProviderConcurrency",
			"circuitEnabled",
			"circuitFailureLimit",
			"circuitCooldownMs",
			"enableFetchProvider",
			"fetchAllowPrivate",
			"statsEnabled",
			"fetchMaxBodyChars",
			"fetchTimeoutMs",
			"fetchUserAgent",
			"retryCount",
			"retryBackoffMs",
			"extraHeadersJson"
		];
		const ENGINE_RESET_FIELDS = [...new Set(ENGINE_SPECS.flatMap((s) => [
			s.endpointKey,
			...[s.input, ...s.secondInput !== void 0 ? [s.secondInput] : []].map((i) => i.configKey),
			...[s.input.envRefKey, s.secondInput?.envRefKey].filter((k) => typeof k === "string"),
			...s.fields.map((f) => f.key)
		]))];
		const RESET_FIELDS = [...GLOBAL_RESET_FIELDS, ...ENGINE_RESET_FIELDS];
		/**
		* 只声明真正必需的服务（cordis 的 `inject` 是硬依赖）。
		*
		* ⚠ 本插件的设置服务在两代里名字不同：C 代（≥0.1.7）是 `configForms`，A/B 代是 `settingsScope`。
		* 把任一名字写进 `inject` 都会让客户端插件在新/旧 DSH 上永远等不到服务而**整个加载失败**，
		* 所以两个都按可选服务在运行期探测（见 `scope.ts`）。
		*
		* ⚠ 这个导出必须留在客户端入口里：DSH 的客户端模块加载器要求客户端插件导出 `apply`（以及
		* `inject`）。它曾经被一次重构误删，而 `tsconfig.json` 排除了 `src/client`、打包器又不会做
		* 未定义标识符检查，于是产出的 bundle 少了 `exports.inject`，表现就是启动页报
		* “Failed to load plugin dsh-web-search-thirdparty”。现在由 `tests/client-contract.test.ts`
		* 和 `tsconfig.client.json` 双重看住。
		*/
		const inject = ["slots"];
		function providerKeyLabel(provider) {
			return specOf(provider)?.input.label ?? "API Key";
		}
		function label(text) {
			const el = document.createElement("label");
			el.textContent = text;
			el.style.cssText = "font-size:13px;font-weight:600;display:block;margin-bottom:4px";
			return el;
		}
		function input(type) {
			const el = document.createElement("input");
			el.type = type;
			el.style.cssText = "box-sizing:border-box;width:100%;padding:6px 8px;font-size:13px;border-radius:6px;border:1px solid currentcolor;background:transparent;color:inherit";
			return el;
		}
		function button(text, kind) {
			const el = document.createElement("button");
			el.type = "button";
			el.textContent = text;
			el.style.cssText = "padding:6px 14px;font-size:13px;border-radius:6px;cursor:pointer;border:1px solid currentcolor;" + (kind === "primary" ? "background:inherit;font-weight:600" : "background:transparent");
			return el;
		}
		function row() {
			const el = document.createElement("div");
			el.style.cssText = "display:flex;flex-direction:column;gap:4px";
			return el;
		}
		function hint(text = "") {
			const el = document.createElement("div");
			el.textContent = text;
			el.style.cssText = "font-size:11px;opacity:.75;min-height:14px";
			return el;
		}
		/** Build the form DOM and attach handlers. Returns a cleanup. */
		function mountForm(container, scope) {
			const root = document.createElement("div");
			root.style.cssText = "display:flex;flex-direction:column;gap:14px;color-scheme:light dark";
			const scopeNotice = document.createElement("div");
			scopeNotice.style.cssText = "display:none;font-size:12px;padding:6px 8px;border:1px solid currentcolor;border-radius:6px;opacity:.9";
			root.appendChild(scopeNotice);
			const providerRow = row();
			providerRow.appendChild(label("搜索供应商"));
			const select = document.createElement("select");
			select.style.cssText = "padding:6px 8px;font-size:13px;border-radius:6px;border:1px solid currentcolor;background:transparent;color:inherit";
			for (const p of PROVIDERS) {
				const opt = document.createElement("option");
				opt.value = p.id;
				opt.textContent = p.label;
				select.appendChild(opt);
			}
			providerRow.appendChild(select);
			root.appendChild(providerRow);
			const keyRow = row();
			const keyLabel = label(providerKeyLabel("searxng"));
			const keyInput = input("text");
			keyInput.placeholder = providerKeyLabel("searxng");
			const keyHint = hint();
			keyRow.appendChild(keyLabel);
			keyRow.appendChild(keyInput);
			keyRow.appendChild(keyHint);
			root.appendChild(keyRow);
			const cxRow = row();
			const cxInput = input("text");
			cxInput.placeholder = "Search Engine ID (cx)";
			const cxHint = hint();
			cxRow.style.display = "none";
			cxRow.appendChild(label("Search Engine ID (cx)"));
			cxRow.appendChild(cxInput);
			cxRow.appendChild(cxHint);
			root.appendChild(cxRow);
			const maxRow = row();
			const maxInput = input("number");
			maxInput.min = "1";
			maxInput.max = "20";
			maxInput.step = "1";
			maxInput.style.width = "120px";
			maxRow.appendChild(label("单次请求最多搜索条数"));
			maxRow.appendChild(maxInput);
			root.appendChild(maxRow);
			const mergeRow = row();
			const mergeCheck = document.createElement("input");
			mergeCheck.type = "checkbox";
			mergeCheck.style.cssText = "width:16px;height:16px;flex:none;accent-color:currentcolor";
			const mergeText = document.createElement("span");
			mergeText.textContent = "合并多个可用源结果（主源失败自动降级）";
			mergeText.style.cssText = "font-size:13px";
			mergeRow.style.cssText = "flex-direction:row;align-items:center;gap:8px";
			mergeRow.appendChild(mergeCheck);
			mergeRow.appendChild(mergeText);
			root.appendChild(mergeRow);
			const advDetails = document.createElement("details");
			advDetails.style.cssText = "border:1px solid currentcolor;border-radius:8px;padding:8px 10px";
			const advSummary = document.createElement("summary");
			advSummary.style.cssText = "font-size:13px;font-weight:600;cursor:pointer";
			const advBody = document.createElement("div");
			advBody.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:8px";
			advDetails.appendChild(advSummary);
			advDetails.appendChild(advBody);
			root.appendChild(advDetails);
			const enhDetails = document.createElement("details");
			enhDetails.style.cssText = "border:1px solid currentcolor;border-radius:8px;padding:8px 10px";
			const enhSummary = document.createElement("summary");
			enhSummary.textContent = "增强设置";
			enhSummary.style.cssText = "font-size:13px;font-weight:600;cursor:pointer";
			const enhBody = document.createElement("div");
			enhBody.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:8px";
			enhDetails.appendChild(enhSummary);
			enhDetails.appendChild(enhBody);
			root.appendChild(enhDetails);
			const statDetails = document.createElement("details");
			statDetails.style.cssText = "border:1px solid currentcolor;border-radius:8px;padding:8px 10px";
			const statSummary = document.createElement("summary");
			statSummary.textContent = "用量统计";
			statSummary.style.cssText = "font-size:13px;font-weight:600;cursor:pointer";
			const statBody = document.createElement("div");
			statBody.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:12px;opacity:.9";
			statBody.textContent = "展开后加载…";
			const statRefresh = button("刷新统计", "normal");
			statRefresh.style.marginTop = "6px";
			async function loadStats() {
				statBody.textContent = "加载中…";
				try {
					const json = await (await fetch("/api/web-search-thirdparty/stats")).json();
					const entries = Object.entries(json?.stats ?? {});
					if (entries.length === 0) {
						statBody.textContent = "暂无数据：发起一次搜索或点“测试连接”后再来看。";
						return;
					}
					const circuits = json?.circuit ?? {};
					const cache = json?.cache ?? {};
					statBody.textContent = "";
					const cacheLine = document.createElement("div");
					cacheLine.textContent = "缓存：命中 " + (cache.hits ?? 0) + " · 未命中 " + (cache.misses ?? 0) + " · 合并 " + (cache.coalesced ?? 0);
					statBody.appendChild(cacheLine);
					for (const [id, st] of entries) {
						const line = document.createElement("div");
						let text = id + " · " + st.requests + " 次 · 错误 " + st.errors + " · 均 " + st.avgLatencyMs + "ms";
						if (circuits[id]?.open === true) text += " · 熔断中";
						if (st.lastError !== void 0 && st.lastError.length > 0) text += " · " + st.lastError.slice(0, 80);
						line.textContent = text;
						statBody.appendChild(line);
					}
				} catch (error) {
					statBody.textContent = "加载失败：" + String(error);
				}
			}
			statRefresh.addEventListener("click", () => {
				loadStats();
			});
			statDetails.addEventListener("toggle", () => {
				if (statDetails.open) loadStats();
			});
			statDetails.appendChild(statSummary);
			statDetails.appendChild(statBody);
			statDetails.appendChild(statRefresh);
			root.appendChild(statDetails);
			const fetchProviderRow = row();
			const fetchProviderCheck = document.createElement("input");
			fetchProviderCheck.type = "checkbox";
			fetchProviderCheck.style.cssText = "width:16px;height:16px;accent-color:currentcolor";
			const fetchProviderText = document.createElement("span");
			fetchProviderText.textContent = "注册自带 web_fetch 抓取 provider（关掉则交回宿主）";
			fetchProviderText.style.cssText = "font-size:13px";
			fetchProviderRow.style.cssText = "flex-direction:row;align-items:center;gap:8px";
			fetchProviderRow.appendChild(fetchProviderCheck);
			fetchProviderRow.appendChild(fetchProviderText);
			enhBody.appendChild(fetchProviderRow);
			const perDomainRow = row();
			const perDomainInput = input("number");
			perDomainInput.min = "0";
			perDomainInput.max = "20";
			perDomainInput.step = "1";
			perDomainInput.style.width = "120px";
			perDomainRow.appendChild(label("每域名最多结果 (0=不限制)"));
			perDomainRow.appendChild(perDomainInput);
			enhBody.appendChild(perDomainRow);
			const relevanceRow = row();
			const relevanceCheck = document.createElement("input");
			relevanceCheck.type = "checkbox";
			relevanceCheck.style.cssText = "width:16px;height:16px;accent-color:currentcolor";
			const relevanceText = document.createElement("span");
			relevanceText.textContent = "按相关度排序";
			relevanceText.style.cssText = "font-size:13px";
			relevanceRow.style.cssText = "flex-direction:row;align-items:center;gap:8px";
			relevanceRow.appendChild(relevanceCheck);
			relevanceRow.appendChild(relevanceText);
			enhBody.appendChild(relevanceRow);
			const cacheRow = row();
			const cacheCheck = document.createElement("input");
			cacheCheck.type = "checkbox";
			cacheCheck.style.cssText = "width:16px;height:16px;accent-color:currentcolor";
			const cacheText = document.createElement("span");
			cacheText.textContent = "启用结果缓存";
			cacheText.style.cssText = "font-size:13px";
			cacheRow.style.cssText = "flex-direction:row;align-items:center;gap:8px";
			cacheRow.appendChild(cacheCheck);
			cacheRow.appendChild(cacheText);
			enhBody.appendChild(cacheRow);
			const cacheSecRow = row();
			const cacheSecInput = input("number");
			cacheSecInput.min = "1";
			cacheSecInput.max = "86400";
			cacheSecInput.step = "1";
			cacheSecInput.style.width = "120px";
			cacheSecRow.appendChild(label("缓存秒数"));
			cacheSecRow.appendChild(cacheSecInput);
			enhBody.appendChild(cacheSecRow);
			let advInputs = [];
			function renderAdv(provider) {
				advBody.textContent = "";
				const specs = specOf(provider)?.fields ?? [];
				advDetails.style.display = specs.length > 0 ? "" : "none";
				advSummary.textContent = "高级参数（" + provider + "）";
				advInputs = [];
				const snap = scope?.getSnapshot();
				const v = snap?.status === "ready" ? snap.value : void 0;
				for (const spec of specs) {
					const rw = row();
					rw.appendChild(label(spec.label));
					let inp;
					if (spec.type === "select") {
						const sel = document.createElement("select");
						sel.style.cssText = "padding:6px 8px;font-size:13px;border-radius:6px;border:1px solid currentcolor;background:transparent;color:inherit";
						for (const o of spec.options ?? []) {
							const op = document.createElement("option");
							op.value = o;
							op.textContent = o;
							sel.appendChild(op);
						}
						inp = sel;
					} else {
						inp = input(spec.type === "number" ? "number" : "text");
						inp.placeholder = spec.placeholder ?? "";
					}
					const cur = v ? v[spec.key] : void 0;
					inp.value = cur !== void 0 && cur !== null ? String(cur) : spec.def;
					rw.appendChild(inp);
					advBody.appendChild(rw);
					advInputs.push({
						key: spec.key,
						input: inp,
						numeric: spec.type === "number"
					});
				}
			}
			const status = document.createElement("div");
			status.style.cssText = "font-size:12px;opacity:.85;min-height:16px";
			root.appendChild(status);
			const btnRow = document.createElement("div");
			btnRow.style.cssText = "display:flex;gap:10px;flex-wrap:wrap";
			const testBtn = button("测试连接", "normal");
			const saveBtn = button("保存", "primary");
			const resetBtn = button("恢复默认", "normal");
			btnRow.appendChild(testBtn);
			btnRow.appendChild(saveBtn);
			btnRow.appendChild(resetBtn);
			root.appendChild(btnRow);
			/**
			* 运行期“这个引擎配好了没有”—— 问插件自己的 REST 路由。
			*
			* 不能用 describe 的 secrets 边车：上游把 set 定义成 `value !== undefined`，而 secret 字段
			* 总有默认空串，边车对每个密钥恒为 true（实测）。也不能靠回显（脱敏后不下发）。
			* 运行期走的是与真实搜索同一条凭据解析链，是唯一可信的答案。
			*/
			let engineStatus = {};
			let statusFetched = false;
			async function loadEngineStatus() {
				try {
					const engines = (await (await fetch("/api/web-search-thirdparty/config")).json())?.engines ?? {};
					engineStatus = Object.fromEntries(Object.entries(engines).map(([id, v]) => [id, v?.configured === true]));
					statusFetched = true;
				} catch {
					statusFetched = false;
				}
				updateSecretHints(select.value);
			}
			function updateSecretHints(provider) {
				const spec = specOf(provider);
				if (spec === void 0) {
					keyHint.textContent = "";
					cxHint.textContent = "";
					return;
				}
				if (!statusFetched) {
					keyHint.textContent = spec.input.secret ? "出于安全不回显已存密钥；留空表示不修改" : "";
					cxHint.textContent = spec.secondInput !== void 0 ? "留空表示不修改" : "";
					return;
				}
				const configured = spec.input.secret === true ? engineStatus[spec.id] === true ? "运行期状态：密钥可用 ✓" : "运行期状态：未配置密钥" : "";
				keyHint.textContent = configured;
				if (spec.secondInput !== void 0) cxHint.textContent = engineStatus[spec.id] === true ? "运行期状态：可用 ✓" : "运行期状态：未配置";
				else cxHint.textContent = "";
			}
			function refreshSecretPlaceholder(provider) {
				const spec = specOf(provider);
				const labelText = spec?.input.label ?? "API Key";
				keyLabel.textContent = labelText;
				const secret = spec?.input.secret === true;
				const configuredNow = spec !== void 0 && engineStatus[spec.id] === true;
				keyInput.placeholder = secret ? configuredNow ? "已保存（留空表示不修改）" : labelText : labelText;
				const hasCx = spec?.secondInput !== void 0;
				cxRow.style.display = hasCx ? "flex" : "none";
				cxInput.style.display = hasCx ? "" : "none";
				if (!hasCx) cxInput.value = "";
				updateSecretHints(provider);
			}
			function syncFromScope() {
				if (scope === void 0) {
					scopeNotice.style.display = "";
					scopeNotice.textContent = "⏳ 正在等待宿主的设置服务就绪（configForms / settingsScope）… 就绪后本页会自动恢复为可保存。";
					saveBtn.disabled = true;
					resetBtn.disabled = true;
					return;
				}
				const snap = scope.getSnapshot();
				const served = scope.served();
				if (snap.status !== "ready" || snap.value === void 0) {
					scopeNotice.style.display = "";
					scopeNotice.textContent = served ? "⏳ 正在从宿主读取设置…" : "⏳ 正在等待宿主的设置服务就绪… 若长时间停留在此，请确认插件已在 profile 的 bundles 中启用，并重启一次 DSHR Web。";
					saveBtn.disabled = !served;
					resetBtn.disabled = !served;
					return;
				}
				if (snap.writable) {
					scopeNotice.style.display = "none";
					scopeNotice.textContent = "";
				} else {
					scopeNotice.style.display = "";
					scopeNotice.textContent = "⚠ 当前页面不允许持久化设置（例如非 loopback 访问）：写入不会保存到宿主。";
				}
				saveBtn.disabled = !snap.writable;
				resetBtn.disabled = !snap.writable;
				const v = snap.value;
				const provider = v.provider ?? "searxng";
				select.value = provider;
				maxInput.value = String(v.maxResults ?? 8);
				const spec = specOf(provider);
				if (spec !== void 0 && !spec.input.secret) {
					const cur = v[spec.input.configKey];
					keyInput.value = cur !== void 0 && cur !== null && cur !== "" ? String(cur) : "";
				} else keyInput.value = "";
				mergeCheck.checked = v.mergeResults === true;
				refreshSecretPlaceholder(provider);
				renderAdv(provider);
				fetchProviderCheck.checked = v.enableFetchProvider !== false;
				perDomainInput.value = String(v.maxPerDomain ?? 2);
				relevanceCheck.checked = v.relevanceSort === true;
				cacheCheck.checked = v.cacheEnabled !== false;
				cacheSecInput.value = String(Math.round((v.cacheTtlMs ?? 6e4) / 1e3));
			}
			const unsubscribe = scope?.subscribe(syncFromScope);
			syncFromScope();
			loadEngineStatus();
			select.addEventListener("change", () => {
				refreshSecretPlaceholder(select.value);
				renderAdv(select.value);
				loadEngineStatus();
			});
			testBtn.addEventListener("click", async () => {
				status.textContent = "测试中…";
				try {
					const json = await (await fetch("/api/web-search-thirdparty/test", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							provider: select.value,
							key: keyInput.value,
							url: keyInput.value,
							cx: cxInput.value,
							maxResults: Number(maxInput.value || 8)
						})
					})).json();
					if (json?.ok === true) {
						const sample = json.sample;
						const title = sample && sample.title ? "：" + String(sample.title).slice(0, 54) : "";
						status.textContent = "✅ " + (json.provider ?? "") + " · " + (json.latencyMs ?? "?") + "ms · " + json.sources + " 条" + title;
					} else status.textContent = "❌ " + (json.provider ?? "") + " · " + (json.latencyMs ?? "?") + "ms · " + (json?.message ?? "未知错误");
				} catch (error) {
					status.textContent = "❌ 请求失败：" + String(error);
				}
			});
			saveBtn.addEventListener("click", async () => {
				if (scope === void 0) {
					status.textContent = "❌ 保存失败：未找到设置传输服务";
					return;
				}
				const provider = select.value;
				const spec = specOf(provider);
				const { ops, wroteSecret } = buildSaveOps({
					provider,
					...spec === void 0 ? {} : {
						main: {
							field: spec.input.configKey,
							secret: spec.input.secret,
							value: keyInput.value
						},
						...spec.secondInput === void 0 ? {} : { second: {
							field: spec.secondInput.configKey,
							secret: spec.secondInput.secret,
							value: cxInput.value
						} }
					},
					maxResults: maxInput.value,
					mergeResults: mergeCheck.checked,
					advanced: advInputs.map((a) => ({
						key: a.key,
						value: a.input.value,
						numeric: a.numeric
					})),
					enableFetchProvider: fetchProviderCheck.checked,
					maxPerDomain: perDomainInput.value,
					relevanceSort: relevanceCheck.checked,
					cacheEnabled: cacheCheck.checked,
					cacheTtlSeconds: cacheSecInput.value
				});
				try {
					if (!await scope.mutate(ops)) {
						status.textContent = "❌ 保存失败：宿主拒绝了这次写入（分区未启用或字段不可写）。设置未改动。";
						syncFromScope();
						return;
					}
					await new Promise((resolve) => setTimeout(resolve, 0));
					if (scope.getSnapshot().status !== "ready") syncFromScope();
					await loadEngineStatus();
					refreshSecretPlaceholder(provider);
					keyInput.value = "";
					if (wroteSecret && spec !== void 0 && engineStatus[spec.id] !== true) status.textContent = "⚠ 已写入宿主，但运行期仍判定该引擎不可用：请点“测试连接”验证密钥是否有效。";
					else status.textContent = "✅ 已保存" + (wroteSecret ? "（密钥已写入宿主的设置分区）" : "");
				} catch (error) {
					status.textContent = "❌ 保存失败：" + String(error);
					syncFromScope();
				}
			});
			resetBtn.addEventListener("click", async () => {
				if (scope === void 0) {
					status.textContent = "❌ 恢复失败：未找到设置传输服务";
					return;
				}
				try {
					const failed = [];
					for (const field of RESET_FIELDS) if (!await scope.mutate([{
						op: "unset",
						field
					}])) failed.push(field);
					select.value = "searxng";
					keyInput.value = "";
					cxInput.value = "";
					maxInput.value = "8";
					mergeCheck.checked = false;
					refreshSecretPlaceholder("searxng");
					renderAdv("searxng");
					fetchProviderCheck.checked = true;
					perDomainInput.value = "2";
					relevanceCheck.checked = false;
					cacheCheck.checked = true;
					cacheSecInput.value = "60";
					syncFromScope();
					if (failed.length === 0) status.textContent = "✅ 已恢复默认";
					else status.textContent = "⚠ 已恢复默认，但 " + failed.slice(0, 5).join("、") + (failed.length > 5 ? " 等" : "") + " 未能重置（宿主未接受）";
				} catch (error) {
					status.textContent = "❌ 恢复失败：" + String(error);
				}
			});
			container.appendChild(root);
			return () => {
				unsubscribe?.();
				root.remove();
			};
		}
		function apply(ctx) {
			let scope;
			try {
				scope = createScopeAdapter(ctx);
			} catch (error) {
				ctx?.logger?.warn?.("[web-search-thirdparty] 设置传输层探测失败，设置页将只读：" + String(error));
				scope = void 0;
			}
			function SettingsSection() {
				const ref = react.useRef(null);
				react.useEffect(() => {
					const node = ref.current;
					if (node === null) return;
					return mountForm(node, scope);
				}, []);
				return react.createElement("div", { ref });
			}
			ctx.effect(() => {
				const dispose = ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: "web-search-thirdparty",
					order: 120,
					label: () => "网络搜索"
				}, SettingsSection));
				return () => {
					dispose?.();
				};
			}, "web-search-thirdparty: settings section");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map