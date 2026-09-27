/**
 * dsh-web-search-thirdparty — browser half: register the "网络搜索" settings page.
 * The settings shell mounts section components as React components, so this is a
 * React function component (built with React.createElement, no JSX). The form
 * itself stays vanilla DOM for theme-friendly native controls.
 *
 * 两代设置 API 的适配都在这里：
 *
 *   ≥ 0.1.7-alpha.1（C 代）：`ctx.configForms.get(<条目 id>)`。分区名 = profile 组合条目 id
 *     （本插件 cordis.patch.yml 里 insert 的 `id: web-search-thirdparty`），宿主只把 schema 上
 *     声明为 volatile 的字段投影成表单；敏感字段被脱敏后**不会**下发，字段是否存在要靠
 *     describe 边车里的 `secrets`（`{ path, set }`）判断。
 *   ≤ 0.1.6-alpha.2（A/B 代）：`ctx.settingsScope.bind({ namespace })`，分区名是本插件自己
 *     installSection 注册的字面量 `dsh-web-search-thirdparty`；旧版 describe 不带 `secrets`
 *     边车（0.1.6 的客户端会把它丢掉），所以敏感字段只能提示“留空表示不修改”。
 *
 * 两条路径都实现成同一个 {@link SettingsScopeAdapter}，表单逻辑只认这一个接口。
 */
import * as React from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ENGINE_SPECS } from '../engine-spec.js'
import type { EngineFieldSpec } from '../engine-spec.js'
import { buildSaveOps, createScopeAdapter } from './scope.js'
import type { SettingsScopeAdapter } from './scope.js'

function providerKeyLabel(provider: string): string {
  return specOf(provider)?.input.label ?? 'API Key'
}

function label(text: string): HTMLLabelElement {
  const el = document.createElement('label')
  el.textContent = text
  el.style.cssText = 'font-size:13px;font-weight:600;display:block;margin-bottom:4px'
  return el
}

function input(type: string): HTMLInputElement {
  const el = document.createElement('input')
  el.type = type
  el.style.cssText = 'box-sizing:border-box;width:100%;padding:6px 8px;font-size:13px;border-radius:6px;' +
    'border:1px solid currentcolor;background:transparent;color:inherit'
  return el
}

function button(text: string, kind: 'primary' | 'normal'): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = text
  el.style.cssText = 'padding:6px 14px;font-size:13px;border-radius:6px;cursor:pointer;border:1px solid currentcolor;' +
    (kind === 'primary' ? 'background:inherit;font-weight:600' : 'background:transparent')
  return el
}

function row(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = 'display:flex;flex-direction:column;gap:4px'
  return el
}

function hint(text = ''): HTMLDivElement {
  const el = document.createElement('div')
  el.textContent = text
  el.style.cssText = 'font-size:11px;opacity:.75;min-height:14px'
  return el
}

/** Build the form DOM and attach handlers. Returns a cleanup. */
function mountForm(container: HTMLElement, scope: SettingsScopeAdapter | undefined): () => void {
  const root = document.createElement('div')
  root.style.cssText = 'display:flex;flex-direction:column;gap:14px;color-scheme:light dark'

  // ── 设置传输层不可用时的明确提示（绝不假装能保存）──
  const scopeNotice = document.createElement('div')
  scopeNotice.style.cssText = 'display:none;font-size:12px;padding:6px 8px;border:1px solid currentcolor;border-radius:6px;opacity:.9'
  root.appendChild(scopeNotice)

  const providerRow = row()
  providerRow.appendChild(label('搜索供应商'))
  const select = document.createElement('select')
  select.style.cssText = 'padding:6px 8px;font-size:13px;border-radius:6px;border:1px solid currentcolor;background:transparent;color:inherit'
  for (const p of PROVIDERS) {
    const opt = document.createElement('option')
    opt.value = p.id
    opt.textContent = p.label
    select.appendChild(opt)
  }
  providerRow.appendChild(select)
  root.appendChild(providerRow)

  const keyRow = row()
  const keyLabel = label(providerKeyLabel('searxng'))
  const keyInput = input('text')
  keyInput.placeholder = providerKeyLabel('searxng')
  const keyHint = hint()
  keyRow.appendChild(keyLabel)
  keyRow.appendChild(keyInput)
  keyRow.appendChild(keyHint)
  root.appendChild(keyRow)

  const cxRow = row()
  const cxInput = input('text')
  cxInput.placeholder = 'Search Engine ID (cx)'
  const cxHint = hint()
  cxRow.style.display = 'none'
  cxRow.appendChild(label('Search Engine ID (cx)'))
  cxRow.appendChild(cxInput)
  cxRow.appendChild(cxHint)
  root.appendChild(cxRow)

  const maxRow = row()
  const maxInput = input('number')
  maxInput.min = '1'
  maxInput.max = '20'
  maxInput.step = '1'
  maxInput.style.width = '120px'
  maxRow.appendChild(label('单次请求最多搜索条数'))
  maxRow.appendChild(maxInput)
  root.appendChild(maxRow)

  const mergeRow = row()
  const mergeCheck = document.createElement('input')
  mergeCheck.type = 'checkbox'
  mergeCheck.style.cssText = 'width:16px;height:16px;flex:none;accent-color:currentcolor'
  const mergeText = document.createElement('span')
  mergeText.textContent = '合并多个可用源结果（主源失败自动降级）'
  mergeText.style.cssText = 'font-size:13px'
  mergeRow.style.cssText = 'flex-direction:row;align-items:center;gap:8px'
  mergeRow.appendChild(mergeCheck)
  mergeRow.appendChild(mergeText)
  root.appendChild(mergeRow)

  // ── 高级参数（按供应商动态显示）──
  const advDetails = document.createElement('details')
  advDetails.style.cssText = 'border:1px solid currentcolor;border-radius:8px;padding:8px 10px'
  const advSummary = document.createElement('summary')
  advSummary.style.cssText = 'font-size:13px;font-weight:600;cursor:pointer'
  const advBody = document.createElement('div')
  advBody.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:8px'
  advDetails.appendChild(advSummary)
  advDetails.appendChild(advBody)
  root.appendChild(advDetails)

  // ── 全局增强 ──
  const enhDetails = document.createElement('details')
  enhDetails.style.cssText = 'border:1px solid currentcolor;border-radius:8px;padding:8px 10px'
  const enhSummary = document.createElement('summary')
  enhSummary.textContent = '增强设置'
  enhSummary.style.cssText = 'font-size:13px;font-weight:600;cursor:pointer'
  const enhBody = document.createElement('div')
  enhBody.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:8px'
  enhDetails.appendChild(enhSummary)
  enhDetails.appendChild(enhBody)
  root.appendChild(enhDetails)

  // ── 用量统计（GET /api/web-search-thirdparty/stats）──
  const statDetails = document.createElement('details')
  statDetails.style.cssText = 'border:1px solid currentcolor;border-radius:8px;padding:8px 10px'
  const statSummary = document.createElement('summary')
  statSummary.textContent = '用量统计'
  statSummary.style.cssText = 'font-size:13px;font-weight:600;cursor:pointer'
  const statBody = document.createElement('div')
  statBody.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:12px;opacity:.9'
  statBody.textContent = '展开后加载…'
  const statRefresh = button('刷新统计', 'normal')
  statRefresh.style.marginTop = '6px'
  async function loadStats(): Promise<void> {
    statBody.textContent = '加载中…'
    try {
      const res = await fetch('/api/web-search-thirdparty/stats')
      const json: any = await res.json()
      const entries = Object.entries((json?.stats ?? {}) as Record<string, { requests: number; errors: number; avgLatencyMs: number; lastError?: string }>)
      if (entries.length === 0) {
        statBody.textContent = '暂无数据：发起一次搜索或点“测试连接”后再来看。'
        return
      }
      const circuits = (json?.circuit ?? {}) as Record<string, { open?: boolean }>
      const cache = (json?.cache ?? {}) as { hits?: number; misses?: number; coalesced?: number }
      statBody.textContent = ''
      const cacheLine = document.createElement('div')
      cacheLine.textContent = '缓存：命中 ' + (cache.hits ?? 0) + ' · 未命中 ' + (cache.misses ?? 0) + ' · 合并 ' + (cache.coalesced ?? 0)
      statBody.appendChild(cacheLine)
      for (const [id, st] of entries) {
        const line = document.createElement('div')
        let text = id + ' · ' + st.requests + ' 次 · 错误 ' + st.errors + ' · 均 ' + st.avgLatencyMs + 'ms'
        if (circuits[id]?.open === true) text += ' · 熔断中'
        if (st.lastError !== undefined && st.lastError.length > 0) text += ' · ' + st.lastError.slice(0, 80)
        line.textContent = text
        statBody.appendChild(line)
      }
    } catch (error) {
      statBody.textContent = '加载失败：' + String(error)
    }
  }
  statRefresh.addEventListener('click', () => { void loadStats() })
  statDetails.addEventListener('toggle', () => { if ((statDetails as any).open) void loadStats() })
  statDetails.appendChild(statSummary)
  statDetails.appendChild(statBody)
  statDetails.appendChild(statRefresh)
  root.appendChild(statDetails)

  const fetchProviderRow = row()
  const fetchProviderCheck = document.createElement('input'); fetchProviderCheck.type = 'checkbox'
  fetchProviderCheck.style.cssText = 'width:16px;height:16px;accent-color:currentcolor'
  const fetchProviderText = document.createElement('span'); fetchProviderText.textContent = '注册自带 web_fetch 抓取 provider（关掉则交回宿主）'
  fetchProviderText.style.cssText = 'font-size:13px'
  fetchProviderRow.style.cssText = 'flex-direction:row;align-items:center;gap:8px'
  fetchProviderRow.appendChild(fetchProviderCheck); fetchProviderRow.appendChild(fetchProviderText)
  enhBody.appendChild(fetchProviderRow)

  const perDomainRow = row()
  const perDomainInput = input('number')
  perDomainInput.min = '0'; perDomainInput.max = '20'; perDomainInput.step = '1'
  perDomainInput.style.width = '120px'
  perDomainRow.appendChild(label('每域名最多结果 (0=不限制)'))
  perDomainRow.appendChild(perDomainInput)
  enhBody.appendChild(perDomainRow)

  const relevanceRow = row()
  const relevanceCheck = document.createElement('input'); relevanceCheck.type = 'checkbox'
  relevanceCheck.style.cssText = 'width:16px;height:16px;accent-color:currentcolor'
  const relevanceText = document.createElement('span'); relevanceText.textContent = '按相关度排序'
  relevanceText.style.cssText = 'font-size:13px'
  relevanceRow.style.cssText = 'flex-direction:row;align-items:center;gap:8px'
  relevanceRow.appendChild(relevanceCheck); relevanceRow.appendChild(relevanceText)
  enhBody.appendChild(relevanceRow)

  const cacheRow = row()
  const cacheCheck = document.createElement('input'); cacheCheck.type = 'checkbox'
  cacheCheck.style.cssText = 'width:16px;height:16px;accent-color:currentcolor'
  const cacheText = document.createElement('span'); cacheText.textContent = '启用结果缓存'
  cacheText.style.cssText = 'font-size:13px'
  cacheRow.style.cssText = 'flex-direction:row;align-items:center;gap:8px'
  cacheRow.appendChild(cacheCheck); cacheRow.appendChild(cacheText)
  enhBody.appendChild(cacheRow)

  const cacheSecRow = row()
  const cacheSecInput = input('number')
  cacheSecInput.min = '1'; cacheSecInput.max = '86400'; cacheSecInput.step = '1'
  cacheSecInput.style.width = '120px'
  cacheSecRow.appendChild(label('缓存秒数'))
  cacheSecRow.appendChild(cacheSecInput)
  enhBody.appendChild(cacheSecRow)

  let advInputs: Array<{ key: string; input: HTMLInputElement | HTMLSelectElement; numeric: boolean }> = []
  function renderAdv(provider: string): void {
    advBody.textContent = ''
    const specs: EngineFieldSpec[] = specOf(provider)?.fields ?? []
    advDetails.style.display = specs.length > 0 ? '' : 'none'
    advSummary.textContent = '高级参数（' + provider + '）'
    advInputs = []
    const snap = scope?.getSnapshot()
    const v = snap?.status === 'ready' ? snap.value : undefined
    for (const spec of specs) {
      const rw = row()
      rw.appendChild(label(spec.label))
      let inp: HTMLInputElement | HTMLSelectElement
      if (spec.type === 'select') {
        const sel = document.createElement('select')
        sel.style.cssText = 'padding:6px 8px;font-size:13px;border-radius:6px;border:1px solid currentcolor;background:transparent;color:inherit'
        for (const o of spec.options ?? []) { const op = document.createElement('option'); op.value = o; op.textContent = o; sel.appendChild(op) }
        inp = sel
      } else {
        inp = input(spec.type === 'number' ? 'number' : 'text')
        inp.placeholder = spec.placeholder ?? ''
      }
      const cur = v ? (v as any)[spec.key] : undefined
      inp.value = (cur !== undefined && cur !== null) ? String(cur) : spec.def
      rw.appendChild(inp)
      advBody.appendChild(rw)
      advInputs.push({ key: spec.key, input: inp, numeric: spec.type === 'number' })
    }
  }

  const status = document.createElement('div')
  status.style.cssText = 'font-size:12px;opacity:.85;min-height:16px'
  root.appendChild(status)

  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap'
  const testBtn = button('测试连接', 'normal')
  const saveBtn = button('保存', 'primary')
  const resetBtn = button('恢复默认', 'normal')
  btnRow.appendChild(testBtn)
  btnRow.appendChild(saveBtn)
  btnRow.appendChild(resetBtn)
  root.appendChild(btnRow)

  /** 当前供应商的主输入行是否敏感。 */
  function isSecretInput(provider: string): boolean {
    return specOf(provider)?.input.secret === true
  }

  /**
   * 运行期“这个引擎配好了没有”—— 问插件自己的 REST 路由。
   *
   * 不能用 describe 的 secrets 边车：上游把 set 定义成 `value !== undefined`，而 secret 字段
   * 总有默认空串，边车对每个密钥恒为 true（实测）。也不能靠回显（脱敏后不下发）。
   * 运行期走的是与真实搜索同一条凭据解析链，是唯一可信的答案。
   */
  let engineStatus: Record<string, boolean> = {}
  let statusFetched = false
  async function loadEngineStatus(): Promise<void> {
    try {
      const res = await fetch('/api/web-search-thirdparty/config')
      const json: any = await res.json()
      const engines = (json?.engines ?? {}) as Record<string, { configured?: boolean }>
      engineStatus = Object.fromEntries(Object.entries(engines).map(([id, v]) => [id, v?.configured === true]))
      statusFetched = true
    } catch {
      statusFetched = false
    }
    updateSecretHints(select.value)
  }

  function updateSecretHints(provider: string): void {
    const spec = specOf(provider)
    if (spec === undefined) { keyHint.textContent = ''; cxHint.textContent = ''; return }
    if (!statusFetched) {
      // 拿不到运行期状态时只说确定的话，不假装“已保存”
      keyHint.textContent = spec.input.secret ? '出于安全不回显已存密钥；留空表示不修改' : ''
      cxHint.textContent = spec.secondInput !== undefined ? '留空表示不修改' : ''
      return
    }
    const configured = spec.input.secret === true
      ? (engineStatus[spec.id] === true ? '运行期状态：密钥可用 ✓' : '运行期状态：未配置密钥')
      : ''
    keyHint.textContent = configured
    if (spec.secondInput !== undefined) {
      cxHint.textContent = engineStatus[spec.id] === true ? '运行期状态：可用 ✓' : '运行期状态：未配置'
    } else {
      cxHint.textContent = ''
    }
  }

  function refreshSecretPlaceholder(provider: string): void {
    const spec = specOf(provider)
    const labelText = spec?.input.label ?? 'API Key'
    keyLabel.textContent = labelText
    const secret = spec?.input.secret === true
    const configuredNow = spec !== undefined && engineStatus[spec.id] === true
    keyInput.placeholder = secret
      ? (configuredNow ? '已保存（留空表示不修改）' : labelText)
      : labelText
    const hasCx = spec?.secondInput !== undefined
    cxRow.style.display = hasCx ? 'flex' : 'none'
    cxInput.style.display = hasCx ? '' : 'none'
    if (!hasCx) cxInput.value = ''
    updateSecretHints(provider)
  }

  function syncFromScope(): void {
    if (scope === undefined) {
      scopeNotice.style.display = ''
      scopeNotice.textContent = '⚠ 未找到设置传输服务（configForms / settingsScope）：当前 DSH 版本无法保存本页设置。'
      saveBtn.disabled = true
      resetBtn.disabled = true
      return
    }
    const snap = scope.getSnapshot()
    const served = scope.served()
    if (snap.status !== 'ready' || snap.value === undefined) {
      scopeNotice.style.display = ''
      scopeNotice.textContent = served
        ? '⏳ 正在从宿主读取设置…'
        : '⚠ 宿主当前没有服务本插件的设置分区：写入会被拒绝。请确认插件已在 profile 的 bundles 中启用，并重启 DSHR Web。'
      saveBtn.disabled = !served
      resetBtn.disabled = !served
      return
    }
    scopeNotice.style.display = snap.writable ? 'none' : ''
    if (!snap.writable) scopeNotice.textContent = '⚠ 当前页面不允许持久化设置（例如非 loopback 访问）：写入不会保存到宿主。'
    saveBtn.disabled = !snap.writable
    resetBtn.disabled = !snap.writable
    const v = snap.value
    const provider = v.provider ?? 'searxng'
    select.value = provider
    maxInput.value = String(v.maxResults ?? 8)
    // 敏感值不回显；非敏感（如 SearXNG 实例 URL）从配置回填
    const spec = specOf(provider)
    if (spec !== undefined && !spec.input.secret) {
      const cur = (v as any)[spec.input.configKey]
      keyInput.value = (cur !== undefined && cur !== null && cur !== '') ? String(cur) : ''
    } else {
      keyInput.value = ''
    }
    mergeCheck.checked = v.mergeResults === true
    refreshSecretPlaceholder(provider)
    renderAdv(provider)
    fetchProviderCheck.checked = v.enableFetchProvider !== false
    perDomainInput.value = String(v.maxPerDomain ?? 2)
    relevanceCheck.checked = v.relevanceSort === true
    cacheCheck.checked = v.cacheEnabled !== false
    cacheSecInput.value = String(Math.round((v.cacheTtlMs ?? 60000) / 1000))
  }

  const unsubscribe = scope?.subscribe(syncFromScope)
  syncFromScope()
  void loadEngineStatus()
  select.addEventListener('change', () => { refreshSecretPlaceholder(select.value); renderAdv(select.value); void loadEngineStatus() })

  testBtn.addEventListener('click', async () => {
    status.textContent = '测试中…'
    try {
      const res = await fetch('/api/web-search-thirdparty/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: select.value,
          key: keyInput.value,
          url: keyInput.value,
          cx: cxInput.value,
          maxResults: Number(maxInput.value || 8),
        }),
      })
      const json = await res.json()
      if (json?.ok === true) {
        const sample = json.sample
        const title = (sample && sample.title) ? '：' + String(sample.title).slice(0, 54) : ''
        status.textContent = '✅ ' + (json.provider ?? '') + ' · ' + (json.latencyMs ?? '?') + 'ms · ' + json.sources + ' 条' + title
      } else {
        status.textContent = '❌ ' + (json.provider ?? '') + ' · ' + (json.latencyMs ?? '?') + 'ms · ' + (json?.message ?? '未知错误')
      }
    } catch (error) {
      status.textContent = '❌ 请求失败：' + String(error)
    }
  })

  saveBtn.addEventListener('click', async () => {
    if (scope === undefined) {
      status.textContent = '❌ 保存失败：未找到设置传输服务'
      return
    }
    const provider = select.value
    const spec = specOf(provider)
    const { ops, wroteSecret } = buildSaveOps({
      provider,
      // 主输入行（key 或 SearXNG 实例 URL）与可选第二输入行（cx）由 spec 驱动。
      // 敏感字段留空 = 保持宿主里已有的密钥（脱敏后本来就看不到原值，绝不能回写空串把它抹掉）。
      ...(spec === undefined ? {} : {
        main: { field: spec.input.configKey, secret: spec.input.secret, value: keyInput.value },
        ...(spec.secondInput === undefined ? {} : {
          second: { field: spec.secondInput.configKey, secret: spec.secondInput.secret, value: cxInput.value },
        }),
      }),
      maxResults: maxInput.value,
      mergeResults: mergeCheck.checked,
      advanced: advInputs.map((a) => ({ key: a.key, value: a.input.value, numeric: a.numeric })),
      enableFetchProvider: fetchProviderCheck.checked,
      maxPerDomain: perDomainInput.value,
      relevanceSort: relevanceCheck.checked,
      cacheEnabled: cacheCheck.checked,
      cacheTtlSeconds: cacheSecInput.value,
    })
    try {
      // 一次原子写入：宿主要么整体接受，要么整体拒绝（失败必须如实报错，不再假装“已保存”）
      const accepted = await scope.mutate(ops)
      if (!accepted) {
        status.textContent = '❌ 保存失败：宿主拒绝了这次写入（分区未启用或字段不可写）。设置未改动。'
        syncFromScope()
        return
      }
      // 回读一次：宿主接受 ≠ 真的生效，所以要重新问运行期状态
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (scope.getSnapshot().status !== 'ready') syncFromScope()
      await loadEngineStatus()
      refreshSecretPlaceholder(provider)
      // 保存成功后清掉输入框是刻意的（敏感值不回显），但必须同时告诉用户“已经存下来了”
      keyInput.value = ''
      if (wroteSecret && spec !== undefined && engineStatus[spec.id] !== true) {
        status.textContent = '⚠ 已写入宿主，但运行期仍判定该引擎不可用：请点“测试连接”验证密钥是否有效。'
      } else {
        status.textContent = '✅ 已保存' + (wroteSecret ? '（密钥已写入宿主的设置分区）' : '')
      }
    } catch (error) {
      status.textContent = '❌ 保存失败：' + String(error)
      syncFromScope()
    }
  })

  resetBtn.addEventListener('click', async () => {
    if (scope === undefined) {
      status.textContent = '❌ 恢复失败：未找到设置传输服务'
      return
    }
    try {
      // unset 一件件来：某个字段在旧版 DSH 上不是 volatile 时，不该拖垮其它字段的重置
      const failed: string[] = []
      for (const field of RESET_FIELDS) {
        const ok = await scope.mutate([{ op: 'unset', field }])
        if (!ok) failed.push(field)
      }
      select.value = 'searxng'
      keyInput.value = ''
      cxInput.value = ''
      maxInput.value = '8'
      mergeCheck.checked = false
      refreshSecretPlaceholder('searxng')
      renderAdv('searxng')
      fetchProviderCheck.checked = true
      perDomainInput.value = '2'
      relevanceCheck.checked = false
      cacheCheck.checked = true
      cacheSecInput.value = '60'
      syncFromScope()
      if (failed.length === 0) status.textContent = '✅ 已恢复默认'
      else status.textContent = '⚠ 已恢复默认，但 ' + failed.slice(0, 5).join('、') + (failed.length > 5 ? ' 等' : '') + ' 未能重置（宿主未接受）'
    } catch (error) {
      status.textContent = '❌ 恢复失败：' + String(error)
    }
  })

  container.appendChild(root)
  return () => {
    unsubscribe?.()
    root.remove()
  }
}

export function apply(ctx: any): void {
  const scope = createScopeAdapter(ctx)

  function SettingsSection(): React.ReactElement {
    const ref = React.useRef<HTMLDivElement | null>(null)
    React.useEffect(() => {
      const node = ref.current
      if (node === null) return
      const cleanup = mountForm(node, scope)
      return cleanup
    }, [])
    return React.createElement('div', { ref })
  }

  ctx.effect(() => {
    const dispose = ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'web-search-thirdparty',
      order: 120,
      label: () => '网络搜索',
    }, SettingsSection))
    return () => { dispose?.() }
  }, 'web-search-thirdparty: settings section')
}
