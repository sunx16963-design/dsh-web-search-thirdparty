/**
 * 真实宿主端到端自检（不在 `npm test` 里跑：需要真实 @deepseek-ai/* 包与网络）。
 *
 * 为什么需要它：单测用的是仓库自写的平台垫片，无法发现“上游删了某个 API”这类断代
 * （0.1.1-rc.2 → 0.1.2 的 settings API 变更正是这样被掩盖的）。这个脚本把构建产物装进
 * 真实 cordis + dsh-web + dsh-settings(-file) 栈里，验证插件真的能被加载并工作。
 *
 * 用法：先在一个临时目录里装真实包，再把该目录作为参数交给本脚本
 * （脚本从那个目录解析真实包，因此不需要它自己住在里面）：
 *
 *   mkdir -p /tmp/dsh-e2e && cd /tmp/dsh-e2e
 *   npm init -y >/dev/null && npm pkg set type=module
 *   npm i --legacy-peer-deps --no-audit --no-fund \
 *     @deepseek-ai/cordis@4 @deepseek-ai/dsh-web@0.1.5-rc.2 @deepseek-ai/dsh-settings@0.1.5-rc.2 \
 *     @deepseek-ai/dsh-settings-file@0.1.5-rc.2 @deepseek-ai/dsh-credentials@0.1.5-rc.2 \
 *     @deepseek-ai/dsh-launch-environment@0.1.5-rc.2 @deepseek-ai/dsh-llm@0.1.5-rc.2 @deepseek-ai/schemastery@3
 *   # peer 不随依赖安装：按报错把缺的 @deepseek-ai/* 再装一次
 *   node /path/to/dsh-web-search-thirdparty/scripts/e2e-real-host.mjs /tmp/dsh-e2e
 *
 * 退出码 0 = 全部通过。
 */
import { createServer } from 'node:http'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const pkgName = pkg.name
// 真实包从目标目录解析（脚本本身可以待在仓库里）
const scratch = resolve(process.argv[2] ?? process.cwd())
const scratchRequire = createRequire(join(scratch, 'package.json'))
const load = async (name) => import(pathToFileURL(scratchRequire.resolve(name)).href)

const { Context } = await load('@deepseek-ai/cordis')
const WebRuntime = (await load('@deepseek-ai/dsh-web')).default
const FileSettingsProvider = (await load('@deepseek-ai/dsh-settings-file')).default

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' :: ' + detail : ''))
}

// 把构建产物“安装”到当前目录的 node_modules 下（等价于 profile 里的链接）
const target = join(scratch, 'node_modules', pkgName)
rmSync(target, { recursive: true, force: true })
cpSync(join(repoRoot, 'lib'), join(target, 'lib'), { recursive: true })
cpSync(join(repoRoot, 'package.json'), join(target, 'package.json'))

const server = createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://127.0.0.1')
  if (u.pathname === '/search') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ results: [
      { url: 'https://example.com/a', title: 'Alpha result', content: 'alpha snippet' },
      { url: 'https://example.com/b', title: 'Beta result', content: 'beta snippet' },
      { url: 'https://example.com/c', title: 'Gamma result', content: 'gamma snippet' },
    ] }))
    return
  }
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end('<h1>Fetched</h1><p>Body <a href="https://example.com/x">link</a></p>')
})
await new Promise((r) => server.listen(0, '127.0.0.1', () => r()))
const base = 'http://127.0.0.1:' + server.address().port

const app = new Context()
const settingsPath = join(mkdtempSync(join(tmpdir(), 'dsh-e2e-')), 'settings.yaml')
app.plugin(WebRuntime, { searchProvider: 'web-search-thirdparty', fetchProvider: 'web-search-thirdparty-fetch' })
app.plugin(FileSettingsProvider, { path: settingsPath, watch: false })
await new Promise((r) => setTimeout(r, 50))

check('真实 dsh-web 提供了 ctx.web', app.get('web') !== undefined)
check('真实 dsh-settings-file 提供了 ctx.settings', app.get('settings') !== undefined)

const dshSettings = await load('@deepseek-ai/dsh-settings')
const hasLegacy = typeof dshSettings.installSettingsSection === 'function'
console.log('        （本栈 dsh-settings：' + (hasLegacy ? '旧版顶层 helper' : '新版服务方法') + '）')

const mod = await load(pkgName)
let applied = true
let applyError = ''
try {
  app.plugin({ name: mod.name, inject: mod.inject, apply: mod.apply }, {
    provider: 'searxng', searxngBaseURL: base, maxResults: 8, fetchAllowPrivate: true, retryCount: 0, cacheEnabled: true,
  })
  await new Promise((r) => setTimeout(r, 100))
} catch (error) {
  applied = false
  applyError = String((error && error.message) || error)
}
check('apply() 不抛错（版本断代不会打死插件）', applied, applyError)

let nsOk = false
let nsDetail = ''
try {
  nsDetail = app.settings.describe().map((d) => String(d.ns)).join(',')
  nsOk = nsDetail.includes('dsh-web-search-thirdparty')
} catch (error) {
  nsDetail = 'describe threw: ' + String(error)
}
check('设置分区注册进真实 settings 服务', nsOk, nsDetail)

let searchOk = false
let searchDetail = ''
try {
  const out = await app.web.search({ query: 'e2e', maxResults: 2 })
  searchOk = out.sources.length === 2 && out.sources[0].url === 'https://example.com/a'
  searchDetail = JSON.stringify({ n: out.sources.length, truncated: out.truncated, first: out.sources[0] })
} catch (error) {
  searchDetail = String((error && error.message) || error)
}
check('ctx.web.search() 经真实 seam 命中本插件 provider', searchOk, searchDetail)

let fetchOk = false
let fetchDetail = ''
try {
  const out = await app.web.fetch({ url: base + '/page' })
  fetchOk = out.statusCode === 200 && String(out.body?.content || '').includes('# Fetched')
  fetchDetail = JSON.stringify({ status: out.statusCode, kind: out.body?.kind, head: String(out.body?.content).slice(0, 50) })
} catch (error) {
  fetchDetail = String((error && error.message) || error)
}
check('ctx.web.fetch() 经真实 seam 走本插件抓取 provider', fetchOk, fetchDetail)

server.close()
const failed = results.filter((r) => !r.ok)
console.log('\nE2E SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' passed')
if (failed.length > 0) console.log('缺包提示：若报 ERR_MODULE_NOT_FOUND，把提示里的 @deepseek-ai/* 包再装一次即可（peer 不随依赖安装）。')
process.exit(failed.length === 0 ? 0 : 1)
