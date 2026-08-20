import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createServer, Server } from 'node:http'
import { LocalFetchProvider, WebError } from '../src/index'

let server: Server
beforeAll(async () => {
  server = createServer((_req, res) => { res.end('<html><body>hello world example</body></html>') })
  await new Promise<void>((r) => server.listen(9555, '127.0.0.1', () => r()))
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

function makeProvider(over: any = {}) {
  const cfg = { fetchMaxBodyChars: 40, fetchTimeoutMs: 5000, fetchUserAgent: 'test', fetchAllowPrivate: false, ...over }
  return new LocalFetchProvider(() => ({ ctx: {}, cfg } as any))
}

describe('LocalFetchProvider', () => {
  it('returns status, text body, and truncates when allowed to reach loopback', async () => {
    const p = makeProvider({ fetchAllowPrivate: true })
    const res = await p.fetch({ url: 'http://127.0.0.1:9555/x' })
    expect(res.statusCode).toBe(200)
    expect(res.body.kind).toBe('text')
    expect(res.body.content).toContain('hello world')
    expect(res.truncated).toBe(true)
  })
})

describe('SSRF guard', () => {
  it('blocks loopback by default', async () => {
    const p = makeProvider({ fetchAllowPrivate: false })
    await expect(p.fetch({ url: 'http://127.0.0.1:9555/x' })).rejects.toThrowError(/private|loopback/i)
  })

  it('blocks a private-range hostname', async () => {
    const p = makeProvider({ fetchAllowPrivate: false })
    await expect(p.fetch({ url: 'http://10.0.0.1/x' })).rejects.toThrowError(/private|loopback/i)
  })

  it('blocks cloud metadata', async () => {
    const p = makeProvider({ fetchAllowPrivate: false })
    await expect(p.fetch({ url: 'http://169.254.169.254/latest/meta-data/' })).rejects.toThrowError(/private|loopback/i)
  })

  it('allows when fetchAllowPrivate is true', async () => {
    const p = makeProvider({ fetchAllowPrivate: true })
    const res = await p.fetch({ url: 'http://127.0.0.1:9555/x' })
    expect(res.statusCode).toBe(200)
  })
})

// WebError 仅用于符号引用（避免未使用告警）
void WebError
