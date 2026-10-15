'use strict';
// PARK アプリの入口。node server.js で http://localhost:4100 に立ち上がる。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const auth = require('./src/auth');
const { get, run } = require('./src/db');
const { layout } = require('./src/views');
const { html, now } = require('./src/util');
const { flushQueue } = require('./src/mail');

const routes = [];
// roles: null＝誰でも、'*'＝ログインした人、['admin', 'ses'] など＝その役割だけ
function route(method, pattern, roles, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, roles, handler });
}
const app = { get: (p, r, h) => route('GET', p, r, h), post: (p, r, h) => route('POST', p, r, h) };

require('./src/routes/public')(app);
require('./src/routes/common')(app);
require('./src/routes/admin')(app);
require('./src/routes/ses')(app);
require('./src/routes/eg')(app);

function parseForm(text) {
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) {
    if (k in out) out[k] = [].concat(out[k], v); else out[k] = v;
  }
  return out;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 2e6) { reject(new Error('送信データが大きすぎます')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const STATIC = path.join(__dirname, 'public');
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  if (p.startsWith('/public/')) {
    const f = path.normalize(path.join(STATIC, p.slice(8)));
    if (!f.startsWith(STATIC) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    return fs.createReadStream(f).pipe(res);
  }

  const { session, isNew } = auth.loadSession(req);
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };
  const ctx = {
    req, res, path: p, query: Object.fromEntries(url.searchParams), body: {}, params: {}, session,
    user: session.user_id ? get('SELECT * FROM users WHERE id = ? AND active = 1', session.user_id) : null,
    flash: null,
    setCookie: isNew ? auth.sessionCookie(session) : null,
  };
  const send = (status, body, extra = {}) => {
    const h = { ...headers, ...extra };
    if (ctx.setCookie) h['Set-Cookie'] = ctx.setCookie;
    res.writeHead(status, h); res.end(String(body));
  };
  ctx.send = send;
  ctx.page = (title, body, opt) => { ctx.flash = ctx.flash || auth.takeFlash(ctx.session); send(opt?.status || 200, layout(ctx, title, body, opt)); };
  ctx.redirect = (to, msg, type) => { if (msg) auth.setFlash(ctx.session, msg, type); send(303, '', { Location: to }); };
  ctx.relogin = (s) => { ctx.session = s; ctx.setCookie = auth.sessionCookie(s); };
  ctx.notFound = () => ctx.page('見つかりません', html`<p>ページが見つかりません。</p><p><a href="/">トップへ</a></p>`, { status: 404 });
  ctx.forbid = () => ctx.page('見られません', html`<p>このページを見る権限がありません。</p>`, { status: 403 });

  const method = req.method === 'HEAD' ? 'GET' : req.method;
  let matched = null; let pathMatched = false;
  for (const r of routes) {
    const m = p.match(r.re);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    matched = r; r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
    break;
  }
  if (!matched) return pathMatched ? send(405, 'Method Not Allowed') : ctx.notFound();

  if (method === 'POST') {
    ctx.body = parseForm(await readBody(req));
    if (ctx.body._csrf !== session.csrf) return ctx.page('もう一度お試しください', html`<p>画面の有効期限が切れました。前の画面に戻り、読み込み直してから操作してください。</p>`, { status: 400 });
  }
  if (matched.roles) {
    if (!ctx.user) return ctx.redirect('/login?next=' + encodeURIComponent(p + url.search));
    if (matched.roles !== '*' && !matched.roles.includes(ctx.user.role)) return ctx.forbid();
  }
  await matched.handler(ctx);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(now(), e);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' }); }
    res.end(`<p>エラーが起きました：${String(e.message).replace(/</g, '&lt;')}</p><p><a href="javascript:history.back()">戻る</a></p>`);
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 4100;
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`PARK: http://localhost:${port}/ で動いています（止めるには Ctrl+C）`));
  // 古いセッションの掃除と、送れなかったメールの再送（5分ごと）
  setInterval(() => { run('DELETE FROM sessions WHERE expires < ?', now()); flushQueue().catch(() => {}); }, 5 * 60 * 1000);
}

module.exports = { server };
