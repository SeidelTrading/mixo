// Tek sayfalık statik sunucu: yalnız index.html'i verir.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PAGE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.html'))
const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-cache',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
}

http
  .createServer((req, res) => {
    const p = (req.url || '/').split('?')[0]
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      return res.end()
    }
    if (p === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      return res.end('User-agent: *\nDisallow: /\n')
    }
    if (p !== '/' && p !== '/index.html') {
      res.writeHead(404, { 'content-type': 'text/plain' })
      return res.end('Not found')
    }
    res.writeHead(200, HEADERS)
    res.end(req.method === 'HEAD' ? undefined : PAGE)
  })
  .listen(Number(process.env.PORT || 8080), () => console.log('talep sayfası hazır'))
