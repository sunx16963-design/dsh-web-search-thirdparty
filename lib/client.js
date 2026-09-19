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
		//#region src/client/index.ts
		/**
		* dsh-web-search-thirdparty — browser half: register the "网络搜索" settings page.
		* The settings shell mounts section components as React components, so this is a
		* React function component (built with React.createElement, no JSX). The form
		* itself stays vanilla DOM for theme-friendly native controls.
		*/
		const NAMESPACE = "dsh-web-search-thirdparty";
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
			...[s.input, ...s.secondInput !== void 0 ? [s.secondInput] : []].map((i) => i.configKey).concat([s.input.envRefKey, s.secondInput?.envRefKey]).filter((k) => typeof k === "string"),
			...s.fields.map((f) => f.key)
		]))];
		const RESET_FIELDS = [...GLOBAL_RESET_FIELDS, ...ENGINE_RESET_FIELDS];
		const inject = ["slots", "settingsScope"];
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
		/** Build the form DOM and attach handlers. Returns a cleanup. */
		function mountForm(container, scope) {
			const root = document.createElement("div");
			root.style.cssText = "display:flex;flex-direction:column;gap:14px;color-scheme:light dark";
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
			keyRow.appendChild(keyLabel);
			keyRow.appendChild(keyInput);
			root.appendChild(keyRow);
			const cxRow = row();
			const cxInput = input("text");
			cxInput.placeholder = "Search Engine ID (cx)";
			cxRow.style.display = "none";
			cxRow.appendChild(label("Search Engine ID (cx)"));
			cxRow.appendChild(cxInput);
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
				const snap = scope.getSnapshot();
				const v = snap.status === "ready" ? snap.value : void 0;
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
			function refreshSecretPlaceholder(provider) {
				const spec = specOf(provider);
				const labelText = spec?.input.label ?? "API Key";
				keyLabel.textContent = labelText;
				keyInput.placeholder = labelText;
				const hasCx = spec?.secondInput !== void 0;
				cxRow.style.display = hasCx ? "flex" : "none";
				cxInput.style.display = hasCx ? "" : "none";
				if (!hasCx) cxInput.value = "";
			}
			function syncFromScope() {
				const snap = scope.getSnapshot();
				if (snap.status !== "ready" || snap.value === void 0) return;
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
			const unsubscribe = scope.subscribe(syncFromScope);
			syncFromScope();
			select.addEventListener("change", () => {
				refreshSecretPlaceholder(select.value);
				renderAdv(select.value);
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
				const provider = select.value;
				const spec = specOf(provider);
				const writes = [];
				writes.push(scope.set("provider", provider));
				if (spec !== void 0) {
					const mainVal = keyInput.value.trim();
					if (mainVal.length > 0) writes.push(scope.set(spec.input.configKey, mainVal));
					if (spec.secondInput !== void 0) {
						const cxVal = cxInput.value.trim();
						if (cxVal.length > 0) writes.push(scope.set(spec.secondInput.configKey, cxVal));
					}
				}
				writes.push(scope.set("maxResults", clampMax(Number(maxInput.value))));
				writes.push(scope.set("mergeResults", mergeCheck.checked));
				for (const a of advInputs) {
					const raw = a.input.value.trim();
					if (raw === "") continue;
					writes.push(scope.set(a.key, a.numeric ? Number(raw) : raw));
				}
				writes.push(scope.set("enableFetchProvider", fetchProviderCheck.checked));
				writes.push(scope.set("maxPerDomain", clampInt(Number(perDomainInput.value))));
				writes.push(scope.set("relevanceSort", relevanceCheck.checked));
				writes.push(scope.set("cacheEnabled", cacheCheck.checked));
				const cacheSec = clampInt(Number(cacheSecInput.value));
				writes.push(scope.set("cacheTtlMs", cacheSec > 0 ? Math.max(1e3, cacheSec * 1e3) : 6e4));
				try {
					await Promise.all(writes);
					status.textContent = "✅ 已保存";
					keyInput.value = "";
				} catch (error) {
					status.textContent = "❌ 保存失败：" + String(error);
				}
			});
			resetBtn.addEventListener("click", async () => {
				try {
					await Promise.all(RESET_FIELDS.map((field) => scope.unset(field)));
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
					status.textContent = "✅ 已恢复默认";
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
		function clampMax(value) {
			if (!Number.isFinite(value)) return 8;
			return Math.max(1, Math.min(20, Math.round(value)));
		}
		function clampInt(value) {
			if (!Number.isFinite(value)) return 0;
			const n = Math.round(value);
			if (n < 0) return 0;
			if (n > 86400) return 86400;
			return n;
		}
		function apply(ctx) {
			const scope = ctx.settingsScope.bind({
				namespace: NAMESPACE,
				decode: (value) => typeof value === "object" && value !== null ? value : void 0
			});
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