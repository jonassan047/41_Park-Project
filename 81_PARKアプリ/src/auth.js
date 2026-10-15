'use strict';
// パスワード・ログインのセッション・招待やパスワード再設定のトークン
const crypto = require('crypto');
const { get, run } = require('./db');
const { now } = require('./util');

const SESSION_DAYS = 14;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${h}`;
}
function verifyPassword(pw, stored) {
  if (!stored) return false;
  const [, salt, h] = stored.split('$');
  const a = Buffer.from(h, 'hex');
  const b = crypto.scryptSync(String(pw), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const token = (n = 24) => crypto.randomBytes(n).toString('base64url');

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function loadSession(req) {
  const sid = parseCookies(req.headers.cookie).park_sid;
  if (sid) {
    const s = get('SELECT * FROM sessions WHERE id = ? AND expires > ?', sid, now());
    if (s) return { session: s, isNew: false };
  }
  const exp = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const s = { id: token(32), user_id: null, csrf: token(16), flash: null, created_at: now(), expires: exp };
  run('INSERT INTO sessions (id, user_id, csrf, flash, created_at, expires) VALUES (?, ?, ?, ?, ?, ?)', s.id, null, s.csrf, null, s.created_at, s.expires);
  return { session: s, isNew: true };
}
function sessionCookie(s) {
  return `park_sid=${s.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
function login(session, userId) {
  // ログインのたびにセッション ID を作り直す（乗っ取り対策）
  const newId = token(32);
  run('UPDATE sessions SET id = ?, user_id = ?, csrf = ? WHERE id = ?', newId, userId, token(16), session.id);
  run('UPDATE users SET last_login = ? WHERE id = ?', now(), userId);
  return get('SELECT * FROM sessions WHERE id = ?', newId);
}
function logout(session) { run('DELETE FROM sessions WHERE id = ?', session.id); }
function setFlash(session, msg, type = 'ok') { run('UPDATE sessions SET flash = ? WHERE id = ?', JSON.stringify({ msg, type }), session.id); }
function takeFlash(session) {
  if (!session.flash) return null;
  run('UPDATE sessions SET flash = NULL WHERE id = ?', session.id);
  try { return JSON.parse(session.flash); } catch { return null; }
}

// 招待・パスワード再設定用のトークン（7日間有効）
function issueUserToken(userId, days = 7) {
  const t = token();
  const exp = new Date(Date.now() + days * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  run('UPDATE users SET token = ?, token_expires = ? WHERE id = ?', t, exp, userId);
  return t;
}
function userByToken(t) {
  if (!t) return null;
  return get('SELECT * FROM users WHERE token = ? AND token_expires > ?', t, now()) || null;
}

module.exports = { hashPassword, verifyPassword, token, loadSession, sessionCookie, login, logout, setFlash, takeFlash, issueUserToken, userByToken };
