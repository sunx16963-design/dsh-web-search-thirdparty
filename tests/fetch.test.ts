import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createServer, Server } from 'node:http'
import { LocalFetchProvider } from '../src/index'

let server: Server
beforeAll(async () => {
  server = createServer((_req, res) => {
    res.end('<html><body>hello world example</body></html>')
  })
  await new Promise<void>((r) => server.listen(9555, '127.0.0.1', () => r()))
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

describe('LocalFetchProvider', () => {
  it('returns status, text body, and truncates', async () => {
    const p = new LocalFetchProvider(() => ({ ctx: {}, cfg: { fetchMaxBodyChars: 40, fetchTimeoutMs: 5000, fetchUserAgent: 'test' } } as any))
    const res = await p.fetch({ url: 'http://127.0.0.1:9555/x' })
    expect(res.statusCode).toBe(200)
    expect(res.body.kind).toBe('text')
    expect(res.truncated).toBe(true)
    expect(res.body.content).toContain('hello world')
  })
})
