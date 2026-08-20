import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createServer, Server } from 'node:http'
import { LocalFetchProvider, htmlToMarkdown } from '../src/index'

let server: Server
beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1:9555')
    if (u.pathname === '/plain') {
      res.setHeader('content-type', 'text/plain')
      res.end('x'.repeat(5000))
    } else {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end('<h1>Hello</h1><p>World <a href="https://example.com/x">link text</a></p><br><ul><li>item</li></ul>')
    }
  })
  await new Promise<void>((r) => server.listen(9555, '127.0.0.1', () => r()))
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

function makeProvider(over: any = {}) {
  const cfg = { fetchMaxBodyChars: 4000, fetchTimeoutMs: 5000, fetchUserAgent: 'test', fetchAllowPrivate: true, ...over }
  return new LocalFetchProvider(() => ({ ctx: {}, cfg } as any))
}

describe('htmlToMarkdown', () => {
  it('converts headings, links and strips tags', () => {
    const md = htmlToMarkdown('<h1>Title</h1><p>Text <a href="https://x">Go</a></p>')
    expect(md).toContain('# Title')
    expect(md).toContain('[Go](https://x)')
    expect(md).toContain('Text')
  })
})

describe('LocalFetchProvider', () => {
  it('returns html content converted to markdown text', async () => {
    const p = makeProvider({ fetchAllowPrivate: true })
    const res = await p.fetch({ url: 'http://127.0.0.1:9555/' })
    expect(res.statusCode).toBe(200)
    expect(res.body.kind).toBe('text')
    expect(res.body.content).toContain('Hello')
    expect(res.body.content).toContain('[link text](https://example.com/x)')
    expect(res.truncated).toBe(false)
  })

  it('truncates long plain text', async () => {
    const p = makeProvider({ fetchAllowPrivate: true, fetchMaxBodyChars: 100 })
    const res = await p.fetch({ url: 'http://127.0.0.1:9555/plain' })
    expect(res.body.content.length).toBe(101) // 100 + '…'
    expect(res.truncated).toBe(true)
  })
})

describe('SSRF guard', () => {
  it('blocks loopback by default', async () => {
    const p = makeProvider({ fetchAllowPrivate: false })
    await expect(p.fetch({ url: 'http://127.0.0.1:9555/' })).rejects.toThrowError(/private|loopback/i)
  })
  it('blocks private-range hostname', async () => {
    const p = makeProvider({ fetchAllowPrivate: false })
    await expect(p.fetch({ url: 'http://10.0.0.1/x' })).rejects.toThrowError(/private|loopback/i)
  })
  it('blocks cloud metadata', async () => {
    const p = makeProvider({ fetchAllowPrivate: false })
    await expect(p.fetch({ url: 'http://169.254.169.254/latest/meta-data/' })).rejects.toThrowError(/private|loopback/i)
  })
  it('allows when fetchAllowPrivate is true', async () => {
    const p = makeProvider({ fetchAllowPrivate: true })
    const res = await p.fetch({ url: 'http://127.0.0.1:9555/' })
    expect(res.statusCode).toBe(200)
  })
})
