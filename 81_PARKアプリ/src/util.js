'use strict';
// 共通の小さな道具（HTML のエスケープ、日付・金額の表示、スキル名の正規化）

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(String(s ?? ''));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

// html`...${値}...` は値を自動でエスケープする。HTML をそのまま入れるときは raw() で包む
function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += render(vals[i]); });
  return new Raw(out);
}

const pad = (n) => String(n).padStart(2, '0');
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function now() { const d = new Date(); return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function thisMonth() { return today().slice(0, 7); }
function fmtDate(s) { return s ? String(s).slice(0, 10) : '—'; }
function fmtDateTime(s) { return s ? String(s).slice(0, 16) : '—'; }
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1 + n, d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
// その月から n か月後の月末（例：monthEnd('2026-11-15', 2) → '2027-01-31'）
function monthEnd(dateStr, n = 0) {
  const [y, m] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m + n, 0);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function monthDiff(fromYm, toYm) {
  const [y1, m1] = fromYm.split('-').map(Number); const [y2, m2] = toYm.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}
function daysBetween(a, b) { return Math.round((new Date(b.slice(0, 10)) - new Date(a.slice(0, 10))) / 86400000); }

function yen(n) { return '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP'); }
function man(n) { return n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('ja-JP')}万円`; }
function pct(a, b) { return b ? `${Math.round((a / b) * 1000) / 10}%` : '—'; }

// 「Java、Spring Boot / AWS」のような文字列をリストにする
function parseList(s) {
  return String(s ?? '').split(/[,、，\/／\n・;；|]+/).map((x) => x.trim()).filter(Boolean);
}

const ALIASES = {
  js: 'javascript', ecmascript: 'javascript', ts: 'typescript', postgres: 'postgresql', psql: 'postgresql',
  golang: 'go', k8s: 'kubernetes', reactjs: 'react', vuejs: 'vue', vue3: 'vue', node: 'nodejs',
  amazonwebservices: 'aws', googlecloud: 'gcp', googlecloudplatform: 'gcp', azure: 'azure', microsoftazure: 'azure',
  csharp: 'c#', 'c＃': 'c#', cplusplus: 'c++', springframework: 'spring', mssql: 'sqlserver',
  oracledb: 'oracle', oracledatabase: 'oracle', nextjs: 'next', nuxtjs: 'nuxt', 'vb.net': 'vbnet', html5: 'html', css3: 'css',
  python3: 'python', php8: 'php', php7: 'php', java8: 'java', java11: 'java', java17: 'java', mysql8: 'mysql',
};
function normSkill(s) {
  let k = String(s ?? '').toLowerCase().normalize('NFKC').replace(/[\s.\-_]/g, '').replace(/[（(].*?[)）]/g, '');
  return ALIASES[k] || k;
}

function intOrNull(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
function numOrNull(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
function str(v) { return Array.isArray(v) ? v.join(',') : String(v ?? '').trim(); }
function arr(v) { return v === undefined ? [] : Array.isArray(v) ? v : [v]; }

module.exports = {
  Raw, raw, esc, html, today, now, thisMonth, fmtDate, fmtDateTime, addMonths, monthEnd, monthDiff, daysBetween,
  yen, man, pct, parseList, normSkill, intOrNull, numOrNull, str, arr,
};
