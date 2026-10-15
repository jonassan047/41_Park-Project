'use strict';
// データベース（Node.js 標準の SQLite）。ファイルは data/park.db（Git に上げない）
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.PARK_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, process.env.PARK_DB || 'park.db');
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS ses_companies (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, rep_name TEXT, contact_name TEXT, email TEXT, phone TEXT,
  address TEXT, employees INTEGER, strengths TEXT, message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',           -- pending 申込中 / active 参加中 / suspended 停止
  agreed_at TEXT, joined_at TEXT, notes TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS engineers (
  id INTEGER PRIMARY KEY, ses_id INTEGER NOT NULL REFERENCES ses_companies(id),
  name TEXT NOT NULL, kana TEXT, initials TEXT, email TEXT, birth_year INTEGER, gender TEXT,
  nearest_station TEXT, years_exp REAL, summary TEXT, strengths TEXT,
  desired_price REAL, min_price REAL, available_from TEXT, work_style TEXT DEFAULT 'any', days_per_week INTEGER DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'available',        -- available 待機 / proposing 提案中 / working 稼働中 / unavailable 休止
  consent_at TEXT, is_operator INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT
);

CREATE TABLE IF NOT EXISTS engineer_skills (
  id INTEGER PRIMARY KEY, engineer_id INTEGER NOT NULL REFERENCES engineers(id) ON DELETE CASCADE,
  name TEXT NOT NULL, category TEXT DEFAULT 'other', years REAL, level INTEGER DEFAULT 3
);

CREATE TABLE IF NOT EXISTS engineer_projects (
  id INTEGER PRIMARY KEY, engineer_id INTEGER NOT NULL REFERENCES engineers(id) ON DELETE CASCADE,
  title TEXT NOT NULL, industry TEXT, period_from TEXT, period_to TEXT, role TEXT, team_size INTEGER,
  tech TEXT, phases TEXT, description TEXT, achievements TEXT, sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT, name TEXT NOT NULL,
  role TEXT NOT NULL,                                -- admin 運営 / ses SES / eg エンジニア
  ses_id INTEGER REFERENCES ses_companies(id), engineer_id INTEGER REFERENCES engineers(id),
  active INTEGER NOT NULL DEFAULT 1, token TEXT, token_expires TEXT, mail_opt_in INTEGER DEFAULT 1,
  last_login TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id INTEGER, csrf TEXT NOT NULL, flash TEXT, created_at TEXT NOT NULL, expires TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, client_label TEXT, source_ses_id INTEGER REFERENCES ses_companies(id),
  registered_by INTEGER REFERENCES users(id),
  price REAL, price_note TEXT, required_skills TEXT, preferred_skills TEXT, description TEXT,
  location TEXT, work_style TEXT DEFAULT 'any', start_date TEXT, period TEXT, days_per_week INTEGER DEFAULT 5,
  interviews_count INTEGER DEFAULT 1, headcount INTEGER DEFAULT 1, min_years REAL, conditions TEXT,
  deadline TEXT, status TEXT NOT NULL DEFAULT 'open', -- draft 下書き / open 募集中 / filled 充足 / closed 終了
  raw_text TEXT, created_at TEXT NOT NULL, updated_at TEXT
);

CREATE TABLE IF NOT EXISTS case_offers (
  id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  engineer_id INTEGER NOT NULL REFERENCES engineers(id) ON DELETE CASCADE,
  score INTEGER, reasons TEXT, missing TEXT, sent_by INTEGER, sent_at TEXT NOT NULL, viewed_at TEXT,
  status TEXT NOT NULL DEFAULT 'sent',              -- sent 配信 / viewed 既読 / declined 見送り / applied 応募
  decline_reason TEXT, UNIQUE(case_id, engineer_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  engineer_id INTEGER NOT NULL REFERENCES engineers(id) ON DELETE CASCADE, ses_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied', proposed_price REAL, start_ok INTEGER, price_ok INTEGER, style_ok INTEGER,
  condition_note TEXT, reject_reason TEXT, reject_note TEXT, applied_by INTEGER,
  applied_at TEXT NOT NULL, updated_at TEXT, UNIQUE(case_id, engineer_id)
);

CREATE TABLE IF NOT EXISTS application_events (
  id INTEGER PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL, note TEXT, user_id INTEGER, at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interviews (
  id INTEGER PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  round INTEGER DEFAULT 1, scheduled_at TEXT, place TEXT, result TEXT DEFAULT 'pending', feedback TEXT,
  qa_json TEXT, eg_memo TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY, application_id INTEGER REFERENCES applications(id), case_id INTEGER NOT NULL REFERENCES cases(id),
  engineer_id INTEGER NOT NULL REFERENCES engineers(id), ses_id INTEGER NOT NULL REFERENCES ses_companies(id),
  price REAL NOT NULL, start_date TEXT NOT NULL, end_date TEXT, extensions INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', end_reason TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id INTEGER PRIMARY KEY, contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  at TEXT NOT NULL, mood INTEGER, troubles TEXT, note TEXT, by_user INTEGER
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY, ses_id INTEGER NOT NULL REFERENCES ses_companies(id), period TEXT NOT NULL,
  items_json TEXT NOT NULL, subtotal INTEGER NOT NULL, tax INTEGER NOT NULL, total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',             -- draft 下書き / issued 発行 / paid 入金済み
  issued_at TEXT, paid_at TEXT, created_at TEXT NOT NULL, UNIQUE(ses_id, period)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, engineer_id INTEGER NOT NULL REFERENCES engineers(id) ON DELETE CASCADE,
  from_user INTEGER REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL, read_by_eg INTEGER DEFAULT 0, read_by_admin INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT, link TEXT, read_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_outbox (
  id INTEGER PRIMARY KEY, to_email TEXT NOT NULL, to_name TEXT, subject TEXT NOT NULL, body TEXT NOT NULL,
  kind TEXT, status TEXT NOT NULL DEFAULT 'queued', -- queued 送信待ち / sent 送信済み / failed 失敗 / saved 保存のみ
  error TEXT, created_at TEXT NOT NULL, sent_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, detail TEXT, at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eng_ses ON engineers(ses_id);
CREATE INDEX IF NOT EXISTS idx_app_case ON applications(case_id);
CREATE INDEX IF NOT EXISTS idx_app_eng ON applications(engineer_id);
CREATE INDEX IF NOT EXISTS idx_offer_eng ON case_offers(engineer_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
`;
db.exec(SCHEMA);

// node:sqlite は undefined・boolean を受け付けないので直す
const fix = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
const all = (sql, ...p) => db.prepare(sql).all(...fix(p));
const get = (sql, ...p) => db.prepare(sql).get(...fix(p));
const run = (sql, ...p) => db.prepare(sql).run(...fix(p));
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// 初期値（仮）。運営の「設定」画面で変えられる
const DEFAULT_SETTINGS = {
  app_name: 'PARK',
  fee_initial_rate: '7',      // 成約時の初期費用（%）
  fee_monthly_rate: '3',      // 月額費用（%）
  monthly_from: '2',          // 月額は稼働の何か月目から（1 または 2）
  tax_rate: '10',
  base_url: 'http://localhost:4100',
  match_threshold: '40',      // 配信候補に出す最低点
  operator_name: 'PARK 運営事務局',
};
function setting(key) {
  const r = get('SELECT value FROM settings WHERE key = ?', key);
  return r ? r.value : DEFAULT_SETTINGS[key];
}
function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}

module.exports = { db, all, get, run, tx, setting, setSetting, DEFAULT_SETTINGS, DB_FILE, DATA_DIR };
