'use strict';
// メール配信。すべて mail_outbox に記録し、SMTP の設定（config.local.json）があれば実際に送る。
// 設定が無いときは「保存のみ」になり、運営の「メール」画面で中身を確認できる。
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { all, get, run, setting } = require('./db');
const { now } = require('./util');

const CONFIG_FILE = path.join(__dirname, '..', 'config.local.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function smtpConfig() {
  const c = loadConfig().smtp;
  return c && c.host && c.from ? c : null;
}

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

class SmtpClient {
  constructor(cfg) { this.cfg = cfg; this.buf = ''; this.waiter = null; }
  attach(sock) {
    this.sock = sock;
    sock.setEncoding('utf8');
    sock.on('data', (d) => { this.buf += d; this.check(); });
    sock.on('error', (e) => { if (this.waiter) { const w = this.waiter; this.waiter = null; w.reject(e); } });
  }
  check() {
    if (!this.waiter) return;
    const m = this.buf.match(/(?:^|\r?\n)(\d{3}) [^\n]*\r?\n$/);
    if (m) { const text = this.buf; this.buf = ''; const w = this.waiter; this.waiter = null; w.resolve({ code: Number(m[1]), text }); }
  }
  read() { return new Promise((resolve, reject) => { this.waiter = { resolve, reject }; this.check(); }); }
  async cmd(line, expect) {
    if (line !== null) this.sock.write(line + '\r\n');
    const r = await this.read();
    if (expect && !expect.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.text.trim()}`);
    return r;
  }
  connect() {
    const { host, port = 587 } = this.cfg;
    return new Promise((resolve, reject) => {
      const sock = Number(port) === 465
        ? tls.connect({ host, port: 465, servername: host }, () => resolve())
        : net.connect({ host, port: Number(port) }, () => resolve());
      sock.setTimeout(20000, () => sock.destroy(new Error('SMTP timeout')));
      sock.once('error', reject);
      this.attach(sock);
    });
  }
  async starttls() {
    await this.cmd('STARTTLS', [220]);
    const plain = this.sock;
    plain.removeAllListeners('data');
    await new Promise((resolve, reject) => {
      const s = tls.connect({ socket: plain, servername: this.cfg.host }, () => resolve());
      s.once('error', reject);
      this.attach(s);
    });
  }
  async send({ to, subject, body }) {
    const c = this.cfg;
    await this.connect();
    await this.cmd(null, [220]);
    const ehlo = await this.cmd('EHLO park.local', [250]);
    if (Number(c.port) !== 465 && /STARTTLS/i.test(ehlo.text)) { await this.starttls(); await this.cmd('EHLO park.local', [250]); }
    if (c.user) {
      await this.cmd('AUTH LOGIN', [334]);
      await this.cmd(b64(c.user), [334]);
      await this.cmd(b64(c.pass || ''), [235]);
    }
    const fromAddr = c.from.match(/<(.+)>/)?.[1] || c.from;
    await this.cmd(`MAIL FROM:<${fromAddr}>`, [250]);
    await this.cmd(`RCPT TO:<${to}>`, [250, 251]);
    await this.cmd('DATA', [354]);
    const fromName = c.fromName || setting('operator_name');
    const msg = [
      `From: ${encHeader(fromName)} <${fromAddr}>`, `To: <${to}>`, `Subject: ${encHeader(subject)}`,
      `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', b64(body).replace(/.{76}/g, '$&\r\n'),
    ].join('\r\n');
    await this.cmd(msg + '\r\n.', [250]);
    try { this.sock.write('QUIT\r\n'); } catch {}
    this.sock.end();
  }
}

// メールを1通、送信箱に入れる（SMTP があれば裏で送る）
function queueMail(toEmail, toName, subject, body, kind = 'general') {
  if (!toEmail) return null;
  const footer = `\n\n――――――――――\n${setting('operator_name')}\n${setting('base_url')}\n※このメールは PARK から自動で送っています。`;
  const r = run('INSERT INTO mail_outbox (to_email, to_name, subject, body, kind, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    toEmail, toName || '', `[${setting('app_name')}] ${subject}`, body + footer, kind, smtpConfig() ? 'queued' : 'saved', now());
  const id = Number(r.lastInsertRowid);
  if (smtpConfig()) setImmediate(() => deliver(id).catch(() => {}));
  return id;
}

async function deliver(id) {
  const cfg = smtpConfig();
  const m = get('SELECT * FROM mail_outbox WHERE id = ?', id);
  if (!cfg || !m) return false;
  try {
    await new SmtpClient(cfg).send({ to: m.to_email, subject: m.subject, body: m.body });
    run('UPDATE mail_outbox SET status = ?, sent_at = ?, error = NULL WHERE id = ?', 'sent', now(), id);
    return true;
  } catch (e) {
    run('UPDATE mail_outbox SET status = ?, error = ? WHERE id = ?', 'failed', String(e.message || e), id);
    return false;
  }
}
async function flushQueue() {
  for (const m of all("SELECT id FROM mail_outbox WHERE status = 'queued' ORDER BY id LIMIT 50")) await deliver(m.id);
}

// アプリ内の通知（ベル）とメールを一度に出す
function notify(userId, title, body, link, { mail = true, kind = 'notice' } = {}) {
  const u = get('SELECT * FROM users WHERE id = ?', userId);
  if (!u || !u.active) return;
  run('INSERT INTO notifications (user_id, title, body, link, created_at) VALUES (?, ?, ?, ?, ?)', userId, title, body || '', link || '', now());
  if (mail && u.mail_opt_in) {
    const url = link ? `\n\n▼詳しくはこちら\n${setting('base_url')}${link}` : '';
    queueMail(u.email, u.name, title, `${u.name} 様\n\n${body || title}${url}`, kind);
  }
}
const usersOf = {
  admins: () => all("SELECT * FROM users WHERE role = 'admin' AND active = 1"),
  ses: (sesId) => all("SELECT * FROM users WHERE role = 'ses' AND ses_id = ? AND active = 1", sesId),
  eg: (engineerId) => all("SELECT * FROM users WHERE role = 'eg' AND engineer_id = ? AND active = 1", engineerId),
};
function notifyAdmins(title, body, link, opt) { usersOf.admins().forEach((u) => notify(u.id, title, body, link, opt)); }
function notifySes(sesId, title, body, link, opt) { usersOf.ses(sesId).forEach((u) => notify(u.id, title, body, link, opt)); }
function notifyEg(engineerId, title, body, link, opt) { usersOf.eg(engineerId).forEach((u) => notify(u.id, title, body, link, opt)); }

function audit(userId, action, detail) {
  run('INSERT INTO audit_log (user_id, action, detail, at) VALUES (?, ?, ?, ?)', userId || null, action, detail || '', now());
}

module.exports = { queueMail, deliver, flushQueue, smtpConfig, notify, notifyAdmins, notifySes, notifyEg, usersOf, audit, loadConfig, CONFIG_FILE };
