'use strict';
// SES の画面：ダッシュボード・自社のエンジニア・案件・応募状況・契約・請求・会社情報
const { all, get, run } = require('../db');
const { html, str, man, yen, pct, fmtDate, fmtDateTime, thisMonth, parseList } = require('../util');
const { L, FUNNEL, badge, form, field, card, table, stats, dl, funnel } = require('../views');
const { invoiceItems } = require('../billing');
const { scoreEngineer } = require('../match');
const S = ['ses'];

module.exports = (app) => {
  app.get('/ses', S, (ctx) => {
    const sid = ctx.user.ses_id;
    const s = get('SELECT * FROM ses_companies WHERE id = ?', sid);
    const engs = all('SELECT * FROM engineers WHERE ses_id = ?', sid);
    const apps = all(`SELECT a.*, c.title, e.name AS eg_name FROM applications a JOIN cases c ON c.id = a.case_id JOIN engineers e ON e.id = a.engineer_id
      WHERE a.ses_id = ? AND a.status NOT IN ('won','rejected','withdrawn') ORDER BY a.updated_at DESC`, sid);
    const offers = all(`SELECT o.*, c.title, e.name AS eg_name FROM case_offers o JOIN cases c ON c.id = o.case_id JOIN engineers e ON e.id = o.engineer_id
      WHERE e.ses_id = ? AND o.status IN ('sent','viewed') AND c.status = 'open' ORDER BY o.sent_at DESC`, sid);
    const newCases = all("SELECT * FROM cases WHERE status = 'open' ORDER BY id DESC LIMIT 5");
    const est = invoiceItems(sid, thisMonth());
    const all_ = all('SELECT status FROM applications WHERE ses_id = ?', sid);
    const won = all_.filter((a) => a.status === 'won').length;
    const noSheet = engs.filter((e) => !get('SELECT id FROM engineer_projects WHERE engineer_id = ?', e.id));
    ctx.page(`${s.name} さま`, html`
${stats([['所属エンジニア', engs.length, `待機 ${engs.filter((e) => e.status === 'available').length}名`], ['稼働中', engs.filter((e) => e.status === 'working').length, ''],
    ['選考中', apps.length, ''], ['成約（これまで）', won, `成約率 ${pct(won, all_.length)}`], ['今月の成功報酬（税別・見込み）', yen(est.subtotal), thisMonth()]])}
<div class="cols"><div>
${card('選考中の応募', table(['エンジニア', '案件', '状態', '更新', ''], apps.map((a) => [a.eg_name, a.title, badge('appStatus', a.status), fmtDate(a.updated_at), html`<a href="/applications/${a.id}">開く</a>`]), 'ありません。'))}
${card('配信済みで、まだ応募していない案件', html`<p class="muted">ご本人の返事を待っています。貴社から一声かけていただくと、応募が早くなります。</p>
${table(['エンジニア', '案件', '点数', '配信日', ''], offers.map((o) => [o.eg_name, o.title, o.score, fmtDate(o.sent_at), html`<a href="/cases/${o.case_id}">開く</a>`]), 'ありません。')}`)}
</div><div>
${card('新しい案件（グループ全体）', table(['案件', '金額', '開始', ''], newCases.map((c) => [c.title, man(c.price), fmtDate(c.start_date), html`<a href="/cases/${c.id}">開く</a>`])), html`<a class="btn small" href="/cases/new">案件を登録</a>`)}
${noSheet.length ? card('経験票がまだのエンジニア', html`<p class="muted">経験票が入っていないと、合う案件が届きません。ご本人に声をかけてください。</p><ul>${noSheet.map((e) => html`<li><a href="/engineers/${e.id}">${e.name}</a></li>`)}</ul>`) : ''}
</div></div>`, { wide: true });
  });

  app.get('/ses/engineers', S, (ctx) => {
    const list = all(`SELECT e.*, (SELECT COUNT(*) FROM engineer_projects p WHERE p.engineer_id = e.id) AS projs,
      (SELECT GROUP_CONCAT(name, '、') FROM engineer_skills k WHERE k.engineer_id = e.id) AS skills,
      (SELECT password_hash IS NOT NULL FROM users u WHERE u.engineer_id = e.id) AS active_user FROM engineers e WHERE e.ses_id = ? ORDER BY e.name`, ctx.user.ses_id);
    ctx.page('エンジニア', html`<p><a class="btn small" href="/engineers/new">エンジニアを登録</a></p>
${table(['名前', '状態', 'スキル', '経験票', '希望', '稼働できる日', 'アカウント', ''], list.map((e) => [e.name, badge('engStatus', e.status), html`<small>${(e.skills || '').slice(0, 50)}</small>`,
    `${e.projs}件`, man(e.desired_price), fmtDate(e.available_from), e.active_user ? '利用中' : e.email ? '招待中' : 'なし', html`<a href="/engineers/${e.id}">詳細</a>`]))}`, { wide: true });
  });

  app.get('/ses/cases', S, (ctx) => {
    const mine = ctx.query.mine === '1';
    const list = all(`SELECT c.* FROM cases c WHERE ${mine ? 'c.source_ses_id = ?' : "c.status = 'open'"} ORDER BY c.id DESC`, ...(mine ? [ctx.user.ses_id] : []));
    const engs = all("SELECT * FROM engineers WHERE ses_id = ? AND status IN ('available','proposing')", ctx.user.ses_id);
    ctx.page('案件', html`<p class="tabs"><a href="?" class="${mine ? '' : 'on'}">募集中（グループ全体）</a><a href="?mine=1" class="${mine ? 'on' : ''}">自社が登録した案件</a>
<a class="btn small" href="/cases/new">案件を登録</a></p>
<p class="muted">元請けから届いた案件を登録すると、グループ全体のエンジニアから合う人を選べます。自社だけでは埋められない案件も、仲間のエンジニアで埋められます。</p>
${table(['案件', '金額', '必須', '開始', '貴社で一番合う人', '状態', ''], list.map((c) => {
    const best = engs.map((e) => ({ e, s: scoreEngineer(c, e).score })).sort((a, b) => b.s - a.s)[0];
    return [c.title, man(c.price), html`<small>${parseList(c.required_skills).join('、')}</small>`, fmtDate(c.start_date), best ? `${best.e.name}（${best.s}点）` : '—', badge('caseStatus', c.status), html`<a href="/cases/${c.id}">開く</a>`];
  }))}`, { wide: true });
  });

  app.get('/ses/applications', S, (ctx) => {
    const list = all(`SELECT a.*, c.title, e.name AS eg_name FROM applications a JOIN cases c ON c.id = a.case_id JOIN engineers e ON e.id = a.engineer_id
      WHERE a.ses_id = ? ORDER BY a.updated_at DESC`, ctx.user.ses_id);
    const counts = FUNNEL.map((st) => [L.appStatus[st], list.filter((a) => FUNNEL.indexOf(a.status) >= FUNNEL.indexOf(st)).length]);
    ctx.page('応募・選考', html`${card('貴社の応募 → 成約（いまの状態で数えた目安）', funnel(counts))}
${table(['エンジニア', '案件', '状態', '応募日', '更新', ''], list.map((a) => [a.eg_name, a.title, badge('appStatus', a.status), fmtDate(a.applied_at), fmtDate(a.updated_at), html`<a href="/applications/${a.id}">開く</a>`]))}`, { wide: true });
  });

  app.get('/ses/contracts', S, (ctx) => {
    const list = all(`SELECT k.*, c.title, e.name AS eg_name FROM contracts k JOIN cases c ON c.id = k.case_id JOIN engineers e ON e.id = k.engineer_id
      WHERE k.ses_id = ? ORDER BY k.status, k.end_date`, ctx.user.ses_id);
    ctx.page('契約', table(['案件', 'エンジニア', '金額', '期間', '延長', '状態', ''], list.map((k) => [k.title, k.eg_name, man(k.price), `${fmtDate(k.start_date)}〜${fmtDate(k.end_date)}`,
      `${k.extensions}回`, badge('contractStatus', k.status), html`<a href="/contracts/${k.id}">開く</a>`])), { wide: true });
  });

  app.get('/ses/invoices', S, (ctx) => {
    const list = all("SELECT * FROM invoices WHERE ses_id = ? AND status != 'draft' ORDER BY period DESC", ctx.user.ses_id);
    const est = invoiceItems(ctx.user.ses_id, thisMonth());
    ctx.page('請求', html`${card(`今月（${thisMonth()}）の見込み`, html`${table(['内容', '基準額', '率', '金額'], est.items.map((it) => [it.label, yen(it.base), `${Math.round(it.rate * 1000) / 10}%`, yen(it.amount)]), '今月の成功報酬はありません。')}
<p>小計 ${yen(est.subtotal)}／税込 ${yen(est.total)}（確定は請求書で）</p>`)}
${card('請求書', table(['月', '合計（税込）', '状態', ''], list.map((i) => [i.period, yen(i.total), badge('invoiceStatus', i.status), html`<a href="/invoices/${i.id}">開く</a>`])))}`);
  });

  app.get('/ses/company', S, (ctx) => {
    const s = get('SELECT * FROM ses_companies WHERE id = ?', ctx.user.ses_id);
    const users = all("SELECT * FROM users WHERE ses_id = ? AND role = 'ses'", s.id);
    ctx.page('会社情報', html`<div class="cols"><div>${card(null, form(ctx, '/ses/company', html`<div class="grid2">
${field('会社名', 'name', s.name, { required: true })}${field('代表者名', 'rep_name', s.rep_name)}${field('ご担当者名', 'contact_name', s.contact_name)}
${field('電話番号', 'phone', s.phone)}${field('所在地', 'address', s.address)}${field('所属エンジニアの人数', 'employees', s.employees, { type: 'number' })}</div>
${field('得意な分野', 'strengths', s.strengths)}<button class="btn">保存する</button>`))}</div>
<div>${card('参加の状況', dl([['状態', badge('sesStatus', s.status)], ['参加日', fmtDate(s.joined_at)], ['守秘義務への同意', fmtDateTime(s.agreed_at)]]))}
${card('担当者', table(['名前', 'メール', '最終ログイン'], users.map((u) => [u.name, u.email, fmtDateTime(u.last_login)])))}</div></div>`, { wide: true });
  });
  app.post('/ses/company', S, (ctx) => {
    const b = ctx.body;
    run('UPDATE ses_companies SET name = ?, rep_name = ?, contact_name = ?, phone = ?, address = ?, employees = ?, strengths = ? WHERE id = ?',
      str(b.name), str(b.rep_name), str(b.contact_name), str(b.phone), str(b.address), parseInt(b.employees, 10) || null, str(b.strengths), ctx.user.ses_id);
    ctx.redirect('/ses/company', '保存しました。');
  });
};
