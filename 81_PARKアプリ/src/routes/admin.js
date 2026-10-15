'use strict';
// 運営の画面：ダッシュボード・SES・エンジニア・案件・選考・契約・請求・やり取り・メール・分析・設定・記録
const { all, get, run, setting, setSetting, DEFAULT_SETTINGS } = require('../db');
const { html, raw, str, man, yen, pct, fmtDate, fmtDateTime, thisMonth, today, now, daysBetween, parseList } = require('../util');
const { L, FUNNEL, badge, form, field, card, table, stats, dl, nl2br, postButton, funnel } = require('../views');
const svc = require('../services');
const { buildInvoice, invoiceItems } = require('../billing');
const { queueMail, deliver, flushQueue, smtpConfig, notifySes, audit, CONFIG_FILE } = require('../mail');
const A = ['admin'];

// 応募のファネル（応募 → 成約）。where は applications a に対する条件
function funnelData(where = '1=1', params = []) {
  const apps = all(`SELECT a.status, a.id FROM applications a WHERE ${where}`, ...params);
  const reached = (st) => {
    const i = FUNNEL.indexOf(st);
    return apps.filter((a) => {
      if (a.status === 'rejected' || a.status === 'withdrawn') {
        const evs = all('SELECT status FROM application_events WHERE application_id = ?', a.id).map((e) => FUNNEL.indexOf(e.status));
        return Math.max(-1, ...evs) >= i;
      }
      return FUNNEL.indexOf(a.status) >= i;
    }).length;
  };
  const counts = FUNNEL.map((st) => [L.appStatus[st], reached(st)]);
  return counts.map(([label, n], i) => [label, n, i === 0 ? '' : pct(n, counts[i - 1][1])]);
}

module.exports = (app) => {
  // ---------- ダッシュボード ----------
  app.get('/admin', A, (ctx) => {
    const n = (sql, ...p) => get(sql, ...p).n;
    const pendingSes = all("SELECT * FROM ses_companies WHERE status = 'pending' ORDER BY id");
    const unread = all('SELECT m.engineer_id, e.name, COUNT(*) AS n FROM messages m JOIN engineers e ON e.id = m.engineer_id WHERE read_by_admin = 0 GROUP BY m.engineer_id');
    const todo = all(`SELECT a.*, c.title, e.name AS eg_name FROM applications a JOIN cases c ON c.id = a.case_id JOIN engineers e ON e.id = a.engineer_id
      WHERE a.status IN ('applied','doc_passed','interviewed') ORDER BY a.updated_at`);
    const openCases = all(`SELECT c.*, (SELECT COUNT(*) FROM case_offers o WHERE o.case_id = c.id) AS offers, (SELECT COUNT(*) FROM applications a WHERE a.case_id = c.id) AS apps
      FROM cases c WHERE c.status = 'open' ORDER BY c.id DESC LIMIT 10`);
    const upcoming = all(`SELECT iv.*, c.title, e.name AS eg_name FROM interviews iv JOIN applications a ON a.id = iv.application_id JOIN cases c ON c.id = a.case_id
      JOIN engineers e ON e.id = a.engineer_id WHERE iv.result = 'pending' ORDER BY iv.scheduled_at LIMIT 10`);
    const ending = all(`SELECT k.*, c.title, e.name AS eg_name FROM contracts k JOIN cases c ON c.id = k.case_id JOIN engineers e ON e.id = k.engineer_id
      WHERE k.status = 'active' AND k.end_date <= date('now', '+31 days') ORDER BY k.end_date`);
    const month = thisMonth();
    const revenue = all("SELECT id FROM ses_companies WHERE status = 'active'").reduce((s, x) => s + invoiceItems(x.id, month).subtotal, 0);
    const nextStep = { applied: 'スキルシートを提出', doc_passed: '面談を設定', interviewed: '成約 or 次の面談' };
    ctx.page('ダッシュボード', html`
${stats([['参加中の SES', n("SELECT COUNT(*) AS n FROM ses_companies WHERE status = 'active'"), pendingSes.length ? `申込 ${pendingSes.length}件` : ''],
    ['エンジニア', n('SELECT COUNT(*) AS n FROM engineers'), `待機 ${n("SELECT COUNT(*) AS n FROM engineers WHERE status = 'available'")}名`],
    ['募集中の案件', n("SELECT COUNT(*) AS n FROM cases WHERE status = 'open'"), ''],
    ['選考中', n("SELECT COUNT(*) AS n FROM applications WHERE status IN ('applied','submitted','doc_passed','interview','interviewed')"), ''],
    ['稼働中の契約', n("SELECT COUNT(*) AS n FROM contracts WHERE status = 'active'"), ''],
    [`今月の成功報酬（税別）`, yen(revenue), month]])}
<div class="cols"><div>
${pendingSes.length ? card('参加の申し込み（承認待ち）', table(['会社', '担当', '申込日', ''], pendingSes.map((s) => [s.name, s.contact_name, fmtDate(s.created_at), html`<a href="/admin/ses/${s.id}">確認する</a>`]))) : ''}
${card('いま運営がやること', table(['案件', 'エンジニア', '状態', '次の手順', ''], todo.map((a) => [a.title, a.eg_name, badge('appStatus', a.status), nextStep[a.status], html`<a href="/applications/${a.id}">開く</a>`]), 'ありません。'))}
${card('募集中の案件', table(['案件', '金額', '配信', '応募', ''], openCases.map((c) => [c.title, man(c.price), c.offers, c.apps, html`<a href="/cases/${c.id}">${c.offers ? '開く' : 'マッチング'}</a>`])), html`<a class="btn small" href="/cases/new">案件を登録</a>`)}
</div><div>
${card('応募 → 成約（全体）', funnel(funnelData()))}
${card('面談の予定', table(['日時', '案件', 'エンジニア', ''], upcoming.map((iv) => [fmtDateTime(iv.scheduled_at), iv.title, iv.eg_name, html`<a href="/interviews/${iv.id}">Q&A</a>`]), 'ありません。'))}
${ending.length ? card('1か月以内に終わる契約（延長の確認）', table(['終わり', '案件', 'エンジニア', ''], ending.map((k) => [fmtDate(k.end_date), k.title, k.eg_name, html`<a href="/contracts/${k.id}">開く</a>`]))) : ''}
${unread.length ? card('未読のメッセージ', table(['エンジニア', '件数', ''], unread.map((m) => [m.name, m.n, html`<a href="/engineers/${m.engineer_id}/messages">開く</a>`]))) : ''}
</div></div>`, { wide: true });
  });

  // ---------- SES ----------
  app.get('/admin/ses', A, (ctx) => {
    const list = all(`SELECT s.*, (SELECT COUNT(*) FROM engineers e WHERE e.ses_id = s.id) AS engs,
      (SELECT COUNT(*) FROM contracts k WHERE k.ses_id = s.id AND k.status = 'active') AS working FROM ses_companies s ORDER BY s.status, s.name`);
    ctx.page('SES', html`<p><a class="btn small" href="/admin/ses/new">SES を登録</a></p>
${table(['会社', '担当', '状態', 'エンジニア', '稼働中', '参加日', ''], list.map((s) => [s.name, s.contact_name, badge('sesStatus', s.status), s.engs, s.working, fmtDate(s.joined_at), html`<a href="/admin/ses/${s.id}">詳細</a>`]))}`);
  });
  const sesForm = (ctx, s, action) => form(ctx, action, html`<div class="grid2">
${field('会社名', 'name', s.name, { required: true })}${field('代表者名', 'rep_name', s.rep_name)}${field('ご担当者名', 'contact_name', s.contact_name)}
${field('メールアドレス', 'email', s.email, { type: 'email' })}${field('電話番号', 'phone', s.phone)}${field('所在地', 'address', s.address)}
${field('所属エンジニアの人数', 'employees', s.employees, { type: 'number' })}${field('得意な分野', 'strengths', s.strengths)}</div>
${field('運営のメモ（SES には見えません）', 'notes', s.notes, { type: 'textarea', rows: 3 })}<button class="btn">保存する</button>`);
  app.get('/admin/ses/new', A, (ctx) => ctx.page('SES の登録', html`<p class="muted">登録すると「申込中」になります。詳細の画面で承認すると、担当の方に招待メールが届きます。</p>${card(null, sesForm(ctx, {}, '/admin/ses'))}`));
  app.post('/admin/ses', A, (ctx) => {
    const id = svc.applySes({ ...ctx.body, agree: 1 });
    run('UPDATE ses_companies SET notes = ? WHERE id = ?', str(ctx.body.notes), id);
    ctx.redirect(`/admin/ses/${id}`, '登録しました。');
  });
  app.get('/admin/ses/:id', A, (ctx) => {
    const s = get('SELECT * FROM ses_companies WHERE id = ?', ctx.params.id);
    if (!s) return ctx.notFound();
    const engs = all('SELECT * FROM engineers WHERE ses_id = ? ORDER BY name', s.id);
    const users = all("SELECT * FROM users WHERE ses_id = ? AND role = 'ses'", s.id);
    const invs = all('SELECT * FROM invoices WHERE ses_id = ? ORDER BY period DESC', s.id);
    ctx.page(s.name, html`<div class="cols"><div>
${card('会社', html`${dl([['状態', badge('sesStatus', s.status)], ['代表者', s.rep_name], ['担当', s.contact_name], ['メール', s.email], ['電話', s.phone], ['所在地', s.address],
    ['人数', s.employees], ['得意な分野', s.strengths], ['ひとこと', nl2br(s.message)], ['守秘義務への同意', fmtDateTime(s.agreed_at)], ['参加日', fmtDate(s.joined_at)], ['メモ', nl2br(s.notes)]])}
<p>${s.status !== 'active' ? postButton(ctx, `/admin/ses/${s.id}/approve`, '承認して招待を送る', { confirm: '参加を承認し、担当の方に招待メールを送ります。' }) : ''}
${s.status === 'active' ? postButton(ctx, `/admin/ses/${s.id}/suspend`, '停止する', { cls: 'ghost', confirm: '停止すると、この SES の担当者はログインできなくなります。' }) : ''}</p>`)}
${card('会社情報の編集', sesForm(ctx, s, `/admin/ses/${s.id}`))}
</div><div>
${card('担当者のアカウント', html`${table(['名前', 'メール', '状態', '最終ログイン'], users.map((u) => [u.name, u.email, u.password_hash ? '利用中' : '招待中', fmtDateTime(u.last_login)]))}
${form(ctx, `/admin/ses/${s.id}/users`, html`<div class="grid2">${field('名前', 'name', '', { required: true })}${field('メール', 'email', '', { type: 'email', required: true })}</div><button class="btn ghost small">担当者を追加して招待</button>`)}`)}
${card('エンジニア', table(['名前', '状態', '希望', ''], engs.map((e) => [e.name, badge('engStatus', e.status), man(e.desired_price), html`<a href="/engineers/${e.id}">詳細</a>`])), html`<a class="btn small" href="/engineers/new?ses=${s.id}">エンジニアを登録</a>`)}
${card('請求', table(['月', '合計', '状態', ''], invs.map((i) => [i.period, yen(i.total), badge('invoiceStatus', i.status), html`<a href="/invoices/${i.id}">開く</a>`])))}
</div></div>`, { wide: true });
  });
  app.post('/admin/ses/:id', A, (ctx) => {
    const b = ctx.body;
    run('UPDATE ses_companies SET name = ?, rep_name = ?, contact_name = ?, email = ?, phone = ?, address = ?, employees = ?, strengths = ?, notes = ? WHERE id = ?',
      str(b.name), str(b.rep_name), str(b.contact_name), str(b.email).toLowerCase(), str(b.phone), str(b.address), parseInt(b.employees, 10) || null, str(b.strengths), str(b.notes), ctx.params.id);
    ctx.redirect(`/admin/ses/${ctx.params.id}`, '保存しました。');
  });
  app.post('/admin/ses/:id/approve', A, (ctx) => { svc.approveSes(Number(ctx.params.id), ctx.user); ctx.redirect(`/admin/ses/${ctx.params.id}`, '承認し、招待メールを送りました。'); });
  app.post('/admin/ses/:id/suspend', A, (ctx) => {
    run("UPDATE ses_companies SET status = 'suspended' WHERE id = ?", ctx.params.id);
    audit(ctx.user.id, 'ses-suspend', ctx.params.id);
    ctx.redirect(`/admin/ses/${ctx.params.id}`, '停止しました。');
  });
  app.post('/admin/ses/:id/users', A, (ctx) => {
    if (get('SELECT id FROM users WHERE email = ? AND password_hash IS NOT NULL', str(ctx.body.email).toLowerCase())) return ctx.redirect(`/admin/ses/${ctx.params.id}`, 'このメールアドレスはすでに使われています。', 'bad');
    svc.inviteUser({ email: ctx.body.email, name: str(ctx.body.name), role: 'ses', ses_id: Number(ctx.params.id) }, ctx.user);
    ctx.redirect(`/admin/ses/${ctx.params.id}`, '招待メールを送りました。');
  });

  // ---------- エンジニア ----------
  app.get('/admin/engineers', A, (ctx) => {
    const q = str(ctx.query.q); const st = str(ctx.query.status);
    let list = all(`SELECT e.*, s.name AS ses_name, (SELECT COUNT(*) FROM engineer_projects p WHERE p.engineer_id = e.id) AS projs,
      (SELECT GROUP_CONCAT(name, '、') FROM engineer_skills k WHERE k.engineer_id = e.id) AS skills FROM engineers e JOIN ses_companies s ON s.id = e.ses_id ORDER BY e.updated_at DESC`);
    if (st) list = list.filter((e) => e.status === st);
    if (q) list = list.filter((e) => [e.name, e.kana, e.skills, e.ses_name, e.strengths].join(' ').toLowerCase().includes(q.toLowerCase()));
    ctx.page('エンジニア', html`<form method="get" class="filters">${field('', 'q', q, { placeholder: '名前・スキル・SES で探す' })}${field('', 'status', st, { type: 'select', options: L.engStatus, blank: 'すべての状態' })}<button class="btn ghost small">絞り込む</button>
<a class="btn small" href="/engineers/new">エンジニアを登録</a></form>
${table(['名前', 'SES', '状態', 'スキル', '経験票', '希望', '稼働できる日', ''], list.map((e) => [html`${e.name}${e.is_operator ? html` <span class="badge warn">運営者</span>` : ''}`, e.ses_name, badge('engStatus', e.status),
    html`<small>${(e.skills || '').slice(0, 60)}</small>`, `${e.projs}件`, man(e.desired_price), fmtDate(e.available_from), html`<a href="/engineers/${e.id}">詳細</a>`]))}
<p class="muted">「運営者」：運営をしながらエンジニアとしても入る人。配信・選考は記録に残し、公平に扱います（誓約書は別に用意）。
${form(ctx, '/admin/engineers/operator', html`${field('', 'engineer_id', '', { type: 'select', options: list.map((e) => [e.id, e.name]), blank: '運営者の印を付け外しする人' })}<button class="btn ghost small">切り替え</button>`, { cls: 'inline' })}</p>`, { wide: true });
  });
  app.post('/admin/engineers/operator', A, (ctx) => {
    run('UPDATE engineers SET is_operator = 1 - is_operator WHERE id = ?', ctx.body.engineer_id);
    audit(ctx.user.id, 'operator-flag', `engineer ${ctx.body.engineer_id}`);
    ctx.redirect('/admin/engineers', '切り替えました。');
  });

  // ---------- 案件 ----------
  app.get('/admin/cases', A, (ctx) => {
    const st = str(ctx.query.status) || 'open';
    const list = all(`SELECT c.*, s.name AS ses_name, (SELECT COUNT(*) FROM case_offers o WHERE o.case_id = c.id) AS offers,
      (SELECT COUNT(*) FROM applications a WHERE a.case_id = c.id) AS apps FROM cases c LEFT JOIN ses_companies s ON s.id = c.source_ses_id
      ${st === 'all' ? '' : 'WHERE c.status = ?'} ORDER BY c.id DESC`, ...(st === 'all' ? [] : [st]));
    ctx.page('案件', html`<p class="tabs">${[...Object.entries(L.caseStatus), ['all', 'すべて']].map(([k, v]) => html`<a href="?status=${k}" class="${k === st ? 'on' : ''}">${v}</a>`)}
<a class="btn small" href="/cases/new">案件を登録</a></p>
${table(['案件', '持ち込み', '金額', '必須', '開始', '配信', '応募', '状態', ''], list.map((c) => [c.title, c.ses_name || '運営', man(c.price), html`<small>${parseList(c.required_skills).join('、')}</small>`,
    fmtDate(c.start_date), c.offers, c.apps, badge('caseStatus', c.status), html`<a href="/cases/${c.id}">開く</a>`]))}`, { wide: true });
  });

  // ---------- 応募・選考（段階ごとのボード） ----------
  app.get('/admin/applications', A, (ctx) => {
    const list = all(`SELECT a.*, c.title, e.name AS eg_name, s.name AS ses_name FROM applications a JOIN cases c ON c.id = a.case_id
      JOIN engineers e ON e.id = a.engineer_id JOIN ses_companies s ON s.id = a.ses_id ORDER BY a.updated_at DESC`);
    const cols = ['applied', 'submitted', 'doc_passed', 'interview', 'interviewed'];
    ctx.page('応募・選考', html`<div class="board">${cols.map((st) => html`<div class="lane"><h3>${L.appStatus[st]} <span>${list.filter((a) => a.status === st).length}</span></h3>
${list.filter((a) => a.status === st).map((a) => html`<a class="ticket" href="/applications/${a.id}"><b>${a.eg_name}</b><span>${a.title}</span><small>${a.ses_name}・${fmtDate(a.updated_at)}</small></a>`)}</div>`)}</div>
${card('終わったもの', table(['エンジニア', '案件', '状態', '理由', '更新', ''], list.filter((a) => !cols.includes(a.status)).map((a) => [a.eg_name, a.title, badge('appStatus', a.status), a.reject_reason, fmtDate(a.updated_at), html`<a href="/applications/${a.id}">開く</a>`])))}`, { wide: true });
  });

  // ---------- 契約 ----------
  app.get('/admin/contracts', A, (ctx) => {
    const list = all(`SELECT k.*, c.title, e.name AS eg_name, s.name AS ses_name FROM contracts k JOIN cases c ON c.id = k.case_id
      JOIN engineers e ON e.id = k.engineer_id JOIN ses_companies s ON s.id = k.ses_id ORDER BY k.status, k.end_date`);
    ctx.page('契約', table(['案件', 'エンジニア', 'SES', '金額', '期間', '延長', '状態', ''], list.map((k) => [k.title, k.eg_name, k.ses_name, man(k.price),
      `${fmtDate(k.start_date)}〜${fmtDate(k.end_date)}`, `${k.extensions}回`, badge('contractStatus', k.status), html`<a href="/contracts/${k.id}">開く</a>`])), { wide: true });
  });

  // ---------- 請求 ----------
  app.get('/admin/invoices', A, (ctx) => {
    const period = str(ctx.query.period) || thisMonth();
    const list = all('SELECT i.*, s.name AS ses_name FROM invoices i JOIN ses_companies s ON s.id = i.ses_id ORDER BY i.period DESC, s.name');
    ctx.page('請求', html`${card('請求書を作る', form(ctx, '/admin/invoices/build', html`<div class="grid2">${field('対象の月', 'period', period, { type: 'month', required: true })}
<div><button class="btn">この月の請求書（下書き）を作る</button></div></div>
<p class="muted">稼働中・その月に始まった契約から、初期費用 ${setting('fee_initial_rate')}%（稼働開始の月）と月額 ${setting('fee_monthly_rate')}%（${setting('monthly_from')}か月目から）を計算します。発行済みのものは変えません。</p>`))}
${table(['月', 'SES', '小計', '合計（税込）', '状態', ''], list.map((i) => [i.period, i.ses_name, yen(i.subtotal), yen(i.total), badge('invoiceStatus', i.status), html`<a href="/invoices/${i.id}">開く</a>`]))}`);
  });
  app.post('/admin/invoices/build', A, (ctx) => {
    const period = str(ctx.body.period);
    let n = 0;
    for (const s of all("SELECT id FROM ses_companies WHERE status != 'pending'")) if (buildInvoice(s.id, period)) n++;
    audit(ctx.user.id, 'invoice-build', period);
    ctx.redirect(`/admin/invoices?period=${period}`, n ? `${period} の請求書を ${n} 件作りました（下書き）。` : `${period} に請求するものはありません。`);
  });
  app.post('/admin/invoices/:id/issue', A, (ctx) => {
    const inv = get('SELECT * FROM invoices WHERE id = ?', ctx.params.id);
    run("UPDATE invoices SET status = 'issued', issued_at = ? WHERE id = ?", now(), inv.id);
    notifySes(inv.ses_id, `${inv.period} 分のご請求書`, `${inv.period} 分の成功報酬のご請求書を発行しました。\nご請求金額：${yen(inv.total)}（税込）`, `/invoices/${inv.id}`, { kind: 'invoice' });
    audit(ctx.user.id, 'invoice-issue', `${inv.period} SES ${inv.ses_id}`);
    ctx.redirect(`/invoices/${inv.id}`, '発行し、SES に知らせました。');
  });
  app.post('/admin/invoices/:id/paid', A, (ctx) => {
    run("UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?", now(), ctx.params.id);
    audit(ctx.user.id, 'invoice-paid', ctx.params.id);
    ctx.redirect(`/invoices/${ctx.params.id}`, '入金を記録しました。');
  });

  // ---------- やり取り ----------
  app.get('/admin/messages', A, (ctx) => {
    const list = all(`SELECT e.id, e.name, MAX(m.created_at) AS last, SUM(CASE WHEN m.read_by_admin = 0 THEN 1 ELSE 0 END) AS unread, COUNT(*) AS n
      FROM messages m JOIN engineers e ON e.id = m.engineer_id GROUP BY e.id ORDER BY last DESC`);
    ctx.page('やり取り（スキルシートの相談）', table(['エンジニア', '件数', '未読', '最後', ''], list.map((r) => [r.name, r.n, r.unread ? html`<b class="bad-text">${r.unread}</b>` : '', fmtDateTime(r.last), html`<a href="/engineers/${r.id}/messages">開く</a>`])));
  });

  // ---------- メール（送信箱・一斉配信） ----------
  app.get('/admin/mail', A, (ctx) => {
    const list = all('SELECT * FROM mail_outbox ORDER BY id DESC LIMIT 300');
    const smtp = smtpConfig();
    ctx.page('メール', html`
<p class="${smtp ? '' : 'flash warn'}">${smtp ? html`SMTP：${smtp.host}:${smtp.port || 587} から送っています。` : html`SMTP が設定されていないため、メールは<b>送らずに保存だけ</b>しています（中身はここで確認できます）。送るには <code>config.local.json</code> を設定します（README）。`}</p>
<div class="cols"><div>
${card('送信箱', html`${smtp ? postButton(ctx, '/admin/mail/flush', '送信待ちを今すぐ送る', { cls: 'ghost small' }) : ''}
${table(['日時', '宛先', '件名', '種類', '状態', ''], list.map((m) => [fmtDateTime(m.created_at), html`${m.to_name}<div class="muted">${m.to_email}</div>`, m.subject, m.kind, html`${badge('mailStatus', m.status)}${m.error ? html`<div class="bad-text small">${m.error}</div>` : ''}`, html`<a href="/admin/mail/${m.id}">中身</a>`]))}`)}
</div><div>
${card('一斉配信', form(ctx, '/admin/mail/broadcast', html`
${field('宛先', 'target', 'ses', { type: 'select', options: { ses: '参加中の SES の担当者すべて', eg: 'エンジニアすべて', eg_available: '待機中のエンジニア', all: 'SES とエンジニアすべて' } })}
${field('件名', 'subject', '', { required: true })}${field('本文', 'body', '', { type: 'textarea', rows: 8, required: true, hint: '宛名（◯◯ 様）は自動で入ります。' })}
<button class="btn">配信する</button>`, { confirm: '一斉にメールを配信します。よろしいですか？' }))}
</div></div>`, { wide: true });
  });
  app.get('/admin/mail/:id', A, (ctx) => {
    const m = get('SELECT * FROM mail_outbox WHERE id = ?', ctx.params.id);
    if (!m) return ctx.notFound();
    ctx.page('メールの中身', html`${dl([['宛先', `${m.to_name} <${m.to_email}>`], ['件名', m.subject], ['状態', badge('mailStatus', m.status)], ['作成', fmtDateTime(m.created_at)], ['送信', fmtDateTime(m.sent_at)], ['エラー', m.error]])}
<pre class="mailbody">${m.body}</pre>${smtpConfig() && m.status !== 'sent' ? postButton(ctx, `/admin/mail/${m.id}/resend`, '送り直す') : ''} <a href="/admin/mail">← 送信箱へ</a>`);
  });
  app.post('/admin/mail/:id/resend', A, async (ctx) => { const ok = await deliver(Number(ctx.params.id)); ctx.redirect(`/admin/mail/${ctx.params.id}`, ok ? '送りました。' : '送れませんでした。', ok ? 'ok' : 'bad'); });
  app.post('/admin/mail/flush', A, async (ctx) => { await flushQueue(); ctx.redirect('/admin/mail', '送信待ちを送りました。'); });
  app.post('/admin/mail/broadcast', A, (ctx) => {
    const t = str(ctx.body.target);
    const where = { ses: "role = 'ses'", eg: "role = 'eg'", eg_available: "role = 'eg' AND engineer_id IN (SELECT id FROM engineers WHERE status = 'available')", all: "role IN ('ses','eg')" }[t];
    if (!where) return ctx.redirect('/admin/mail');
    const users = all(`SELECT * FROM users WHERE active = 1 AND ${where} AND (ses_id IS NULL OR ses_id IN (SELECT id FROM ses_companies WHERE status = 'active'))`);
    for (const u of users) queueMail(u.email, u.name, str(ctx.body.subject), `${u.name} 様\n\n${str(ctx.body.body)}`, 'broadcast');
    audit(ctx.user.id, 'broadcast', `${t}：${str(ctx.body.subject)}（${users.length}通）`);
    ctx.redirect('/admin/mail', `${users.length}通を配信しました。`);
  });

  // ---------- 分析（成約率） ----------
  app.get('/admin/reports', A, (ctx) => {
    const reasons = all("SELECT reject_reason AS r, COUNT(*) AS n FROM applications WHERE status = 'rejected' GROUP BY reject_reason ORDER BY n DESC");
    const declines = all("SELECT decline_reason AS r, COUNT(*) AS n FROM case_offers WHERE status = 'declined' GROUP BY decline_reason ORDER BY n DESC");
    const sesRows = all("SELECT * FROM ses_companies WHERE status = 'active' ORDER BY name").map((s) => {
      const f = funnelData('a.ses_id = ?', [s.id]);
      return [s.name, f[0][1], f[1][1], f[3][1], f[5][1], pct(f[5][1], f[0][1])];
    });
    const won = all(`SELECT a.applied_at, k.created_at FROM contracts k JOIN applications a ON a.id = k.application_id`);
    const avgDays = won.length ? Math.round(won.reduce((s, w) => s + daysBetween(w.applied_at, w.created_at), 0) / won.length) : null;
    const offers = get("SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) AS applied FROM case_offers");
    const ended = get("SELECT COUNT(*) AS n, SUM(CASE WHEN extensions > 0 THEN 1 ELSE 0 END) AS ext FROM contracts");
    const months = all("SELECT DISTINCT substr(start_date, 1, 7) AS m FROM contracts ORDER BY m DESC LIMIT 12").map((r) => r.m);
    const revenue = months.map((m) => [m, all('SELECT id FROM ses_companies').reduce((s, x) => s + invoiceItems(x.id, m).subtotal, 0)]);
    ctx.page('分析（成約率）', html`
<p class="muted">件数が少ないうちは率が大きくぶれます。1件の結果で判断しないでください。</p>
${stats([['配信 → 応募', pct(offers.applied || 0, offers.n), `${offers.applied || 0} / ${offers.n}`], ['応募 → 成約', pct(funnelData()[5][1], funnelData()[0][1]), ''],
    ['応募から成約までの日数', avgDays === null ? '—' : `${avgDays}日`, '平均'], ['延長した契約', pct(ended.ext || 0, ended.n), `${ended.ext || 0} / ${ended.n}`]])}
<div class="cols"><div>
${card('応募 → 成約（全体）', funnel(funnelData()))}
${card('SES ごと', table(['SES', '応募', '書類提出', '面談', '成約', '成約率'], sesRows))}
</div><div>
${card('見送りの理由（選考）', table(['理由', '件数'], reasons.map((r) => [r.r || '未記入', r.n]), 'まだありません。'))}
${card('エンジニアが案件を見送った理由', table(['理由', '件数'], declines.map((r) => [r.r || '未記入', r.n]), 'まだありません。'))}
${card('月ごとの成功報酬（税別・計算上）', table(['月', '金額'], revenue.map(([m, v]) => [m, yen(v)])))}
</div></div>`, { wide: true });
  });

  // ---------- 設定 ----------
  app.get('/admin/settings', A, (ctx) => {
    const admins = all("SELECT * FROM users WHERE role = 'admin' ORDER BY id");
    const v = (k) => setting(k);
    ctx.page('設定', html`<div class="cols"><div>
${card('基本と報酬の率（仮）', form(ctx, '/admin/settings', html`<div class="grid2">
${field('サービス名', 'app_name', v('app_name'))}${field('運営の名前（メールの署名）', 'operator_name', v('operator_name'))}
${field('この画面の URL（メールのリンクに使う）', 'base_url', v('base_url'), { cls: 'span2' })}
${field('初期費用（%）', 'fee_initial_rate', v('fee_initial_rate'), { type: 'number', step: '0.1' })}${field('月額費用（%）', 'fee_monthly_rate', v('fee_monthly_rate'), { type: 'number', step: '0.1' })}
${field('月額は稼働の何か月目から', 'monthly_from', v('monthly_from'), { type: 'select', options: [['1', '1か月目から'], ['2', '2か月目から']] })}${field('消費税（%）', 'tax_rate', v('tax_rate'), { type: 'number' })}
${field('配信候補に出す最低点', 'match_threshold', v('match_threshold'), { type: 'number', min: 0 })}</div><button class="btn">保存する</button>`))}
${card('メールの送信（SMTP）', html`<p>${smtpConfig() ? `設定済み：${smtpConfig().host}` : '未設定（メールは保存だけ）'}</p>
<p class="muted">パスワードを画面や Git に残さないため、SMTP の設定は <code>${CONFIG_FILE}</code> に書きます（Git には上げません）。書き方は README にあります。</p>
${form(ctx, '/admin/settings/testmail', html`${field('テストメールの宛先', 'to', ctx.user.email, { type: 'email' })}<button class="btn ghost small">テストメールを送る</button>`)}`)}
</div><div>
${card('運営メンバー', html`${table(['名前', 'メール', '最終ログイン'], admins.map((u) => [u.name, u.email, fmtDateTime(u.last_login)]))}
${form(ctx, '/admin/settings/admins', html`<div class="grid2">${field('名前', 'name', '', { required: true })}${field('メール', 'email', '', { type: 'email', required: true })}</div><button class="btn ghost small">運営メンバーを招待</button>`)}`)}
${card('操作の記録', html`<p>配信・選考・請求などの操作は、すべて記録しています（公平性のため）。</p><a class="btn ghost small" href="/admin/audit">記録を見る</a>`)}
</div></div>`, { wide: true });
  });
  app.post('/admin/settings', A, (ctx) => {
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in ctx.body) setSetting(k, str(ctx.body[k]).replace(/\/$/, ''));
    audit(ctx.user.id, 'settings', JSON.stringify(ctx.body).slice(0, 300));
    ctx.redirect('/admin/settings', '保存しました。');
  });
  app.post('/admin/settings/testmail', A, async (ctx) => {
    const id = queueMail(str(ctx.body.to), ctx.user.name, 'テストメール', 'PARK からのテストメールです。届いていれば、メールの設定は正しく動いています。', 'test');
    if (smtpConfig()) { const ok = await deliver(id); return ctx.redirect('/admin/settings', ok ? '送りました。届いたか確認してください。' : '送れませんでした。メールの画面でエラーを確認してください。', ok ? 'ok' : 'bad'); }
    ctx.redirect('/admin/mail', 'SMTP が未設定のため、保存だけしました。');
  });
  app.post('/admin/settings/admins', A, (ctx) => {
    if (get('SELECT id FROM users WHERE email = ?', str(ctx.body.email).toLowerCase())) return ctx.redirect('/admin/settings', 'このメールアドレスはすでに使われています。', 'bad');
    svc.inviteUser({ email: ctx.body.email, name: str(ctx.body.name), role: 'admin' }, ctx.user);
    ctx.redirect('/admin/settings', '招待メールを送りました。');
  });
  app.get('/admin/audit', A, (ctx) => {
    const list = all('SELECT l.*, u.name FROM audit_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 500');
    ctx.page('操作の記録', table(['日時', '人', '操作', '内容'], list.map((l) => [fmtDateTime(l.at), l.name || '—', l.action, l.detail])), { wide: true });
  });
};
