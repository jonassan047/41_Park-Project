'use strict';
// 画面の部品（レイアウト・表・フォーム・バッジ）と、表示用の言葉
const { html, raw, esc } = require('./util');
const { get, setting } = require('./db');

const L = {
  role: { admin: '運営', ses: 'SES', eg: 'エンジニア' },
  sesStatus: { pending: '申込中', active: '参加中', suspended: '停止' },
  engStatus: { available: '待機中', proposing: '提案中', working: '稼働中', unavailable: '休止' },
  caseStatus: { draft: '下書き', open: '募集中', filled: '充足', closed: '終了' },
  offerStatus: { sent: '配信済み', viewed: '既読', declined: '見送り', applied: '応募' },
  appStatus: { applied: '応募', submitted: '書類提出', doc_passed: '書類通過', interview: '面談調整', interviewed: '面談済み', won: '成約', rejected: '見送り', withdrawn: '辞退' },
  workStyle: { any: 'どちらでも', remote: 'リモート', hybrid: '一部リモート', onsite: '出社（常駐）' },
  ivResult: { pending: '結果待ち', pass: '通過', fail: '見送り' },
  contractStatus: { active: '稼働中', ended: '終了' },
  invoiceStatus: { draft: '下書き', issued: '発行済み', paid: '入金済み' },
  mailStatus: { queued: '送信待ち', sent: '送信済み', failed: '失敗', saved: '保存のみ' },
  skillCat: { lang: '言語', fw: 'フレームワーク', db: 'DB', infra: 'インフラ・クラウド', tool: 'ツール', other: 'その他' },
  rejectReasons: ['スキル・経験の不足', '経験年数', '単価が合わない', '開始日・稼働が合わない', '勤務地・働き方', '面談の受け答え', '他の候補者で決定', '案件の中止・延期', 'その他'],
};
const FUNNEL = ['applied', 'submitted', 'doc_passed', 'interview', 'interviewed', 'won'];
const TONE = {
  pending: 'warn', active: 'ok', suspended: 'mute', available: 'ok', proposing: 'info', working: 'strong', unavailable: 'mute',
  draft: 'mute', open: 'ok', filled: 'strong', closed: 'mute', sent: 'info', viewed: 'info', declined: 'mute',
  applied: 'info', submitted: 'info', doc_passed: 'ok', interview: 'warn', interviewed: 'warn', won: 'strong', rejected: 'mute', withdrawn: 'mute',
  pass: 'ok', fail: 'mute', ended: 'mute', issued: 'warn', paid: 'ok', queued: 'warn', failed: 'bad', saved: 'mute',
};
const badge = (map, key) => html`<span class="badge ${TONE[key] || ''}">${L[map]?.[key] ?? key}</span>`;

const NAV = {
  admin: [['/admin', 'ダッシュボード'], ['/admin/ses', 'SES'], ['/admin/engineers', 'エンジニア'], ['/admin/cases', '案件'],
    ['/admin/applications', '応募・選考'], ['/admin/contracts', '契約'], ['/admin/invoices', '請求'], ['/admin/messages', 'やり取り'],
    ['/admin/mail', 'メール'], ['/admin/reports', '分析'], ['/admin/settings', '設定']],
  ses: [['/ses', 'ダッシュボード'], ['/ses/engineers', 'エンジニア'], ['/ses/cases', '案件'], ['/ses/applications', '応募・選考'],
    ['/ses/contracts', '契約'], ['/ses/invoices', '請求'], ['/ses/company', '会社情報']],
  eg: [['/eg', 'ホーム'], ['/eg/offers', '届いた案件'], ['/eg/applications', '応募・面談'], ['/eg/profile', 'プロフィール'],
    ['/eg/projects', '経験票'], ['/eg/sheet', 'スキルシート'], ['/eg/messages', 'やり取り']],
};

function layout(ctx, title, body, opt = {}) {
  const u = ctx.user;
  const appName = setting('app_name');
  const unread = u ? get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', u.id).n : 0;
  const nav = u ? NAV[u.role] || [] : [];
  const flash = ctx.flash;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | ${esc(appName)}</title><link rel="stylesheet" href="/public/style.css"></head>
<body class="${opt.print ? 'print' : ''}">
${opt.print ? '' : html`<header class="top"><div class="wrap">
  <a class="logo" href="/">${appName}<small>SES とエンジニアが集う庭</small></a>
  ${u ? html`<nav>${nav.map(([href, label]) => html`<a href="${href}" class="${ctx.path === href || (href.length > 4 && ctx.path.startsWith(href + '/')) ? 'on' : ''}">${label}</a>`)}</nav>
  <div class="me"><a href="/notifications" class="bell" title="通知">🔔${unread ? html`<b>${unread}</b>` : ''}</a>
  <a href="/account">${u.name}<small>${L.role[u.role]}</small></a>
  <form method="post" action="/logout" class="inline">${csrf(ctx)}<button class="link">ログアウト</button></form></div>`
  : html`<nav></nav><div class="me"><a href="/apply">参加のお申し込み</a><a class="btn small" href="/login">ログイン</a></div>`}
</div></header>`}
<main class="wrap ${opt.wide ? 'wide' : ''}">
${flash ? html`<div class="flash ${flash.type}">${flash.msg}</div>` : ''}
${opt.noTitle ? '' : html`<h1>${title}</h1>`}
${body}
</main>
${opt.print ? '' : html`<footer class="wrap foot">${appName} — 成約したときだけ、成功報酬をいただく仕組みです。</footer>`}
</body></html>`;
}

const csrf = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.session.csrf}">`;
const form = (ctx, action, body, opt = {}) => html`<form method="post" action="${action}" class="${opt.cls || ''}" ${opt.confirm ? raw(`onsubmit="return confirm('${esc(opt.confirm)}')"`) : ''}>${csrf(ctx)}${body}</form>`;
const postButton = (ctx, action, label, opt = {}) => form(ctx, action, html`${Object.entries(opt.fields || {}).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}<button class="btn ${opt.cls || ''}">${label}</button>`, { cls: 'inline', confirm: opt.confirm });

function field(label, name, value, opt = {}) {
  const type = opt.type || 'text';
  const req = opt.required ? raw(' required') : '';
  let input;
  if (type === 'textarea') input = html`<textarea name="${name}" rows="${opt.rows || 4}" placeholder="${opt.placeholder || ''}"${req}>${value ?? ''}</textarea>`;
  else if (type === 'select') {
    const opts = Array.isArray(opt.options) ? opt.options.map((o) => (Array.isArray(o) ? o : [o, o])) : Object.entries(opt.options);
    input = html`<select name="${name}"${req}>${opt.blank !== undefined ? html`<option value="">${opt.blank}</option>` : ''}${opts.map(([v, t]) => html`<option value="${v}" ${String(v) === String(value ?? '') ? raw('selected') : ''}>${t}</option>`)}</select>`;
  } else if (type === 'checkbox') return html`<label class="check"><input type="checkbox" name="${name}" value="1" ${value ? raw('checked') : ''}${req}> ${label}</label>`;
  else input = html`<input type="${type}" name="${name}" value="${value ?? ''}" placeholder="${opt.placeholder || ''}"${opt.step ? raw(` step="${opt.step}"`) : ''}${opt.min !== undefined ? raw(` min="${opt.min}"`) : ''}${req}${opt.autocomplete ? raw(` autocomplete="${opt.autocomplete}"`) : ''}>`;
  return html`<label class="field ${opt.cls || ''}"><span>${label}${opt.required ? html`<i>必須</i>` : ''}</span>${input}${opt.hint ? html`<small>${opt.hint}</small>` : ''}</label>`;
}

function table(headers, rows, empty = 'まだありません。') {
  if (!rows.length) return html`<p class="empty">${empty}</p>`;
  return html`<div class="tablewrap"><table><thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
<tbody>${rows.map((r) => html`<tr>${r.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody></table></div>`;
}
const card = (title, body, actions) => html`<section class="card">${title ? html`<header><h2>${title}</h2>${actions ? html`<div class="actions">${actions}</div>` : ''}</header>` : ''}<div class="body">${body}</div></section>`;
const stats = (items) => html`<div class="stats">${items.map(([label, value, sub]) => html`<div class="stat"><span>${label}</span><b>${value}</b>${sub ? html`<small>${sub}</small>` : ''}</div>`)}</div>`;
const dl = (pairs) => html`<dl class="dl">${pairs.filter(Boolean).map(([k, v]) => html`<dt>${k}</dt><dd>${v === null || v === undefined || v === '' ? '—' : v}</dd>`)}</dl>`;
const nl2br = (s) => raw(esc(s || '').replace(/\n/g, '<br>'));
const chips = (list, hits) => html`<span class="chips">${list.map((x) => html`<span class="chip ${hits && hits.has(x) ? 'hit' : ''}">${x}</span>`)}</span>`;
const scoreBar = (n) => html`<span class="score"><span style="width:${Math.max(0, Math.min(100, n))}%"></span><b>${n}</b></span>`;

// ファネル（応募→成約）の横棒
function funnel(counts) {
  const max = Math.max(1, counts[0]?.[1] || 1);
  return html`<div class="funnel">${counts.map(([label, n, rate]) => html`<div class="frow"><span>${label}</span><div class="fbar"><i style="width:${(n / max) * 100}%"></i></div><b>${n}</b><small>${rate || ''}</small></div>`)}</div>`;
}

module.exports = { L, FUNNEL, badge, layout, csrf, form, postButton, field, table, card, stats, dl, nl2br, chips, scoreBar, funnel, html, raw };
