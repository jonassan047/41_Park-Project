'use strict';
// 案件：登録（メール本文の取り込み）・詳細・マッチングと配信・応募
const { all, get, run } = require('../db');
const { html, raw, str, man, fmtDate, fmtDateTime, parseList, now } = require('../util');
const { L, badge, form, field, card, table, dl, nl2br, chips, scoreBar, postButton } = require('../views');
const { parseCaseText } = require('../parse-case');
const { matchCase, scoreEngineer, threshold } = require('../match');
const { canCase, canEditCase } = require('../perms');
const svc = require('../services');
const { audit } = require('../mail');

function caseForm(ctx, c, action, submitLabel) {
  const sesList = ctx.user.role === 'admin' ? all("SELECT id, name FROM ses_companies WHERE status = 'active' ORDER BY name") : [];
  return form(ctx, action, html`
<div class="grid2">
${field('案件名', 'title', c.title, { required: true, cls: 'span2' })}
${field('元請け（伏せ字でよい）', 'client_label', c.client_label, { placeholder: '例：SH-A 社', hint: '元請けの名前は外に出しません。伏せ字で構いません。' })}
${ctx.user.role === 'admin' ? field('案件を持ち込んだ SES', 'source_ses_id', c.source_ses_id, { type: 'select', options: sesList.map((s) => [s.id, s.name]), blank: '（運営が直接）' }) : html`<div></div>`}
${field('金額（万円／月）', 'price', c.price, { type: 'number', step: '0.5', hint: 'SES が元請けから受け取る月額。成功報酬の基準になります。' })}
${field('金額のメモ', 'price_note', c.price_note, { placeholder: '例：スキル見合い、精算 140-180h' })}
${field('必須スキル', 'required_skills', c.required_skills, { type: 'textarea', rows: 2, placeholder: 'Java、Spring Boot、SQL（「、」区切り）' })}
${field('尚可スキル', 'preferred_skills', c.preferred_skills, { type: 'textarea', rows: 2, placeholder: 'AWS、Docker' })}
${field('経験年数（以上）', 'min_years', c.min_years, { type: 'number', step: '0.5' })}
${field('働き方', 'work_style', c.work_style || 'any', { type: 'select', options: L.workStyle })}
${field('場所', 'location', c.location, { placeholder: '例：東京都港区（最寄り：品川）' })}
${field('開始', 'start_date', c.start_date, { type: 'date' })}
${field('期間', 'period', c.period, { placeholder: '例：3か月〜長期' })}
${field('稼働（週◯日）', 'days_per_week', c.days_per_week ?? 5, { type: 'number', min: 1 })}
${field('面談回数', 'interviews_count', c.interviews_count ?? 1, { type: 'number', min: 0 })}
${field('募集人数', 'headcount', c.headcount ?? 1, { type: 'number', min: 1 })}
${field('応募の締め切り', 'deadline', c.deadline, { type: 'date' })}
${field('状態', 'status', c.status || 'open', { type: 'select', options: L.caseStatus })}
</div>
${field('作業内容', 'description', c.description, { type: 'textarea', rows: 5 })}
${field('その他の条件・備考', 'conditions', c.conditions, { type: 'textarea', rows: 3 })}
<details><summary>元の案件メール（記録用）</summary>${field('', 'raw_text', c.raw_text, { type: 'textarea', rows: 6 })}</details>
<button class="btn">${submitLabel}</button>`);
}

function importBox(ctx) {
  return card('案件メールから取り込む', form(ctx, '/cases/import', html`
<p class="muted">届いた案件メールの本文を貼り付けると、案件名・金額・必須スキルなどを抜き出して下の欄に入れます（このPCの中で処理し、外部には送りません）。</p>
${field('', 'raw_text', '', { type: 'textarea', rows: 6, placeholder: '【案件名】…\n【単価】〜70万円\n【必須】Java、Spring\n…' })}
<button class="btn ghost">取り込む</button>`));
}

module.exports = (app) => {
  app.get('/cases/new', ['admin', 'ses'], (ctx) => ctx.page('案件の登録', html`${importBox(ctx)}${card('案件票', caseForm(ctx, {}, '/cases', '登録する'))}`));
  app.post('/cases/import', ['admin', 'ses'], (ctx) => {
    const parsed = parseCaseText(ctx.body.raw_text);
    parsed.raw_text = ctx.body.raw_text;
    ctx.flash = { msg: '取り込みました。内容を確かめて、足りないところを直してから登録してください。', type: 'ok' };
    ctx.page('案件の登録', html`${card('案件票', caseForm(ctx, parsed, '/cases', '登録する'))}`);
  });
  app.post('/cases', ['admin', 'ses'], (ctx) => {
    if (!str(ctx.body.title)) return ctx.redirect('/cases/new', '案件名を入れてください。', 'bad');
    const id = svc.saveCase(ctx.body, ctx.user);
    ctx.redirect(`/cases/${id}`, ctx.user.role === 'admin' ? '登録しました。下のマッチングで、合うエンジニアに配信してください。' : '登録しました。運営がマッチングして配信します。');
  });
  app.get('/cases/:id/edit', ['admin', 'ses'], (ctx) => {
    const c = get('SELECT * FROM cases WHERE id = ?', ctx.params.id);
    if (!c) return ctx.notFound();
    if (!canEditCase(ctx.user, c)) return ctx.forbid();
    ctx.page(`案件の編集：${c.title}`, card(null, caseForm(ctx, c, `/cases/${c.id}`, '保存する')));
  });
  app.post('/cases/:id', ['admin', 'ses'], (ctx) => {
    const c = get('SELECT * FROM cases WHERE id = ?', ctx.params.id);
    if (!c) return ctx.notFound();
    if (!canEditCase(ctx.user, c)) return ctx.forbid();
    svc.saveCase(ctx.body, ctx.user, c.id);
    ctx.redirect(`/cases/${c.id}`, '保存しました。');
  });

  app.get('/cases/:id', '*', (ctx) => {
    const c = get('SELECT c.*, s.name AS ses_name FROM cases c LEFT JOIN ses_companies s ON s.id = c.source_ses_id WHERE c.id = ?', ctx.params.id);
    if (!c) return ctx.notFound();
    const u = ctx.user;
    if (!canCase(u, c)) return ctx.forbid();
    const req = parseList(c.required_skills); const pref = parseList(c.preferred_skills);

    const info = card('案件票', html`${dl([
      ['状態', badge('caseStatus', c.status)], ['金額', html`${man(c.price)} <span class="muted">${c.price_note || ''}</span>`],
      u.role !== 'eg' ? ['元請け', c.client_label] : null, u.role !== 'eg' ? ['持ち込み', c.ses_name || '運営'] : null,
      ['必須', chips(req)], ['尚可', chips(pref)], ['経験年数', c.min_years ? `${c.min_years}年以上` : ''],
      ['働き方', L.workStyle[c.work_style]], ['場所', c.location], ['開始', fmtDate(c.start_date)], ['期間', c.period],
      ['稼働', `週${c.days_per_week || 5}日`], ['面談', `${c.interviews_count ?? 1}回`], ['募集人数', `${c.headcount || 1}名`], ['締め切り', fmtDate(c.deadline)],
    ])}
<h3>作業内容</h3><p>${nl2br(c.description)}</p>${c.conditions ? html`<h3>その他の条件</h3><p>${nl2br(c.conditions)}</p>` : ''}`,
    canEditCase(u, c) ? html`<a class="btn ghost small" href="/cases/${c.id}/edit">編集</a>` : '');

    let side = '';
    if (u.role === 'eg') side = egPanel(ctx, c);
    else if (u.role === 'ses') side = sesPanel(ctx, c);
    else side = adminPanel(ctx, c);

    const apps = all(`SELECT a.*, e.name AS eg_name, s.name AS ses_name FROM applications a JOIN engineers e ON e.id = a.engineer_id
      JOIN ses_companies s ON s.id = a.ses_id WHERE a.case_id = ? ${u.role === 'ses' ? 'AND a.ses_id = ' + Number(u.ses_id) : u.role === 'eg' ? 'AND a.engineer_id = ' + Number(u.engineer_id) : ''} ORDER BY a.id`, c.id);
    const appsCard = u.role === 'eg' ? '' : card('この案件への応募', table(['エンジニア', 'SES', '状態', '応募日', ''], apps.map((a) => [
      a.eg_name, a.ses_name, badge('appStatus', a.status), fmtDate(a.applied_at), html`<a href="/applications/${a.id}">詳細</a>`])));
    ctx.page(c.title, html`<div class="cols ${u.role === 'eg' ? '' : 'wideside'}"><div>${info}${appsCard}</div><div>${side}</div></div>`, { wide: true });
  });

  // ---------- 運営：マッチングと配信 ----------
  function adminPanel(ctx, c) {
    const showAll = ctx.query.all === '1';
    const list = matchCase(c.id, { includeBusy: ctx.query.busy === '1' });
    const th = threshold();
    const shown = showAll ? list : list.filter((m) => m.score >= th || m.offered);
    const offers = all(`SELECT o.*, e.name FROM case_offers o JOIN engineers e ON e.id = o.engineer_id WHERE o.case_id = ? ORDER BY o.score DESC`, c.id);
    return html`
${card('マッチング（配信の候補）', c.status !== 'open' ? html`<p class="muted">募集中の案件だけ配信できます。</p>` : form(ctx, `/cases/${c.id}/distribute`, html`
<p class="muted">条件に合う順に並べています（${th}点以上。${showAll ? html`<a href="?">候補だけにする</a>` : html`<a href="?all=1">全員を表示</a>`}／<a href="?busy=1&all=1">稼働中の人も含める</a>）。最終の判断は人がします。合わない人に送らないことも、成約率を上げます。</p>
${table(['', 'エンジニア', '点数', '合う点', '足りない点', '希望'], shown.map((m) => [
    m.offered ? badge('offerStatus', m.offered) : html`<input type="checkbox" name="engineer_id" value="${m.engineer.id}" ${m.score >= th + 20 ? raw('checked') : ''}>`,
    html`<a href="/engineers/${m.engineer.id}">${m.engineer.name}</a><div class="muted">${m.engineer.ses_name}・${L.engStatus[m.engineer.status]}</div>`,
    scoreBar(m.score), html`<small>${m.reasons.join('、')}</small>`, html`<small class="bad-text">${m.missing.join('、')}</small>`,
    html`<small>${man(m.engineer.desired_price)}<br>${fmtDate(m.engineer.available_from)}〜</small>`]), '条件に合うエンジニアがいません。「全員を表示」で確かめてください。')}
${field('エンジニアへのひとこと（任意）', 'message', '', { type: 'textarea', rows: 2 })}
<button class="btn">選んだ人に配信する（メール）</button>`))}
${card('配信済み', table(['エンジニア', '点数', '状態', '配信日'], offers.map((o) => [o.name, o.score, html`${badge('offerStatus', o.status)}${o.decline_reason ? html`<div class="muted">${o.decline_reason}</div>` : ''}`, fmtDateTime(o.sent_at)])), )}
${card('状態の変更', html`${['open', 'filled', 'closed'].filter((s) => s !== c.status).map((s) => postButton(ctx, `/cases/${c.id}/status`, `${L.caseStatus[s]}にする`, { fields: { status: s }, cls: 'ghost small' }))}`)}`;
  }

  // ---------- SES：自社のエンジニアの点数・配信・応募 ----------
  function sesPanel(ctx, c) {
    const engs = all("SELECT * FROM engineers WHERE ses_id = ? AND status != 'unavailable' ORDER BY name", ctx.user.ses_id);
    const applied = new Set(all('SELECT engineer_id FROM applications WHERE case_id = ?', c.id).map((r) => r.engineer_id));
    const offered = new Map(all('SELECT engineer_id, status FROM case_offers WHERE case_id = ?', c.id).map((r) => [r.engineer_id, r.status]));
    const rows = engs.map((e) => ({ e, ...scoreEngineer(c, e) })).sort((a, b) => b.score - a.score);
    return card('貴社のエンジニアとの相性', c.status !== 'open' ? html`<p class="muted">募集を終えた案件です。</p>` : html`
<p class="muted">貴社から個別にご案内いただくこともできます。応募を出すときは、ご本人に条件を確かめてからにしてください。</p>
${table(['エンジニア', '点数', '足りない点', ''], rows.map((r) => [
    html`<a href="/engineers/${r.e.id}">${r.e.name}</a><div class="muted">${L.engStatus[r.e.status]}</div>`, scoreBar(r.score), html`<small class="bad-text">${r.missing.join('、')}</small>`,
    applied.has(r.e.id) ? html`<span class="muted">応募済み</span>` : html`
${offered.has(r.e.id) ? html`<span class="muted">配信済み</span>` : postButton(ctx, `/cases/${c.id}/distribute`, '本人に案内', { fields: { engineer_id: r.e.id }, cls: 'ghost small' })}
${postButton(ctx, `/cases/${c.id}/apply`, '応募を出す', { fields: { engineer_id: r.e.id, start_ok: 1, price_ok: 1, style_ok: 1, condition_note: '所属 SES が本人に確認のうえ応募' }, cls: 'small', confirm: `${r.e.name} さんの応募を出します。ご本人に条件を確かめましたか？` })}`]), '登録しているエンジニアがいません。')}`);
  }

  // ---------- エンジニア：条件を確かめて応募／見送り ----------
  function egPanel(ctx, c) {
    const eid = ctx.user.engineer_id;
    const offer = get('SELECT * FROM case_offers WHERE case_id = ? AND engineer_id = ?', c.id, eid);
    if (offer && offer.status === 'sent') run("UPDATE case_offers SET status = 'viewed', viewed_at = ? WHERE id = ?", now(), offer.id);
    const app = get('SELECT * FROM applications WHERE case_id = ? AND engineer_id = ?', c.id, eid);
    const e = get('SELECT * FROM engineers WHERE id = ?', eid);
    const s = scoreEngineer(c, e);
    const fit = card('あなたとの相性', html`${scoreBar(s.score)}<p><b>合う点：</b>${s.reasons.join('、') || '—'}</p>${s.missing.length ? html`<p class="bad-text"><b>足りない点：</b>${s.missing.join('、')}</p>` : ''}`);
    if (app) return html`${fit}${card('応募済み', html`<p>${badge('appStatus', app.status)}</p><p><a class="btn" href="/applications/${app.id}">選考の状況を見る</a></p>`)}`;
    if (c.status !== 'open') return html`${fit}${card('', html`<p class="muted">この案件は募集を終えました。</p>`)}`;
    if (offer && offer.status === 'declined') return html`${fit}${card('見送りました', html`<p class="muted">${offer.decline_reason || ''}</p>`)}`;
    return html`${fit}
${card('応募する', form(ctx, `/cases/${c.id}/apply`, html`
<p class="muted">面談で条件が合わずに落ちるのを防ぐため、応募の前に確かめてください。</p>
${field(`開始（${fmtDate(c.start_date)}）に間に合う`, 'start_ok', false, { type: 'checkbox' })}
${field(`金額（${man(c.price)}）で問題ない`, 'price_ok', false, { type: 'checkbox' })}
${field(`働き方・場所（${L.workStyle[c.work_style]}${c.location ? '／' + c.location : ''}）で問題ない`, 'style_ok', false, { type: 'checkbox' })}
${field('気になること・伝えたいこと', 'condition_note', '', { type: 'textarea', rows: 2 })}
<button class="btn">この案件に応募する</button>`))}
${card('見送る', form(ctx, `/cases/${c.id}/decline`, html`${field('理由（今後の案件選びに使います）', 'reason', '', { type: 'select', options: ['スキルが合わない', '金額が合わない', '時期が合わない', '場所・働き方が合わない', '内容に興味がない', 'その他'] })}
<button class="btn ghost">見送る</button>`))}`;
  }

  app.post('/cases/:id/distribute', ['admin', 'ses'], (ctx) => {
    const c = get('SELECT * FROM cases WHERE id = ?', ctx.params.id);
    if (!c || c.status !== 'open') return ctx.redirect(`/cases/${ctx.params.id}`, '募集中の案件だけ配信できます。', 'bad');
    let ids = [].concat(ctx.body.engineer_id || []).map(Number);
    if (ctx.user.role === 'ses') ids = ids.filter((id) => get('SELECT id FROM engineers WHERE id = ? AND ses_id = ?', id, ctx.user.ses_id));
    if (!ids.length) return ctx.redirect(`/cases/${c.id}`, '配信するエンジニアを選んでください。', 'bad');
    const n = svc.distribute(c.id, ids, ctx.user, str(ctx.body.message));
    ctx.redirect(`/cases/${c.id}`, `${n}名に配信しました（メールと通知）。`);
  });

  app.post('/cases/:id/apply', ['admin', 'ses', 'eg'], (ctx) => {
    const c = get('SELECT * FROM cases WHERE id = ?', ctx.params.id);
    if (!c || !canCase(ctx.user, c)) return ctx.forbid();
    let eid = Number(ctx.body.engineer_id);
    if (ctx.user.role === 'eg') eid = ctx.user.engineer_id;
    if (ctx.user.role === 'ses' && !get('SELECT id FROM engineers WHERE id = ? AND ses_id = ?', eid, ctx.user.ses_id)) return ctx.forbid();
    if (ctx.user.role === 'eg' && !(ctx.body.start_ok && ctx.body.price_ok && ctx.body.style_ok) && !str(ctx.body.condition_note)) {
      return ctx.redirect(`/cases/${c.id}`, '条件で合わない点がある場合は、「気になること」に書いてから応募してください。', 'bad');
    }
    try {
      const id = svc.apply(c.id, eid, ctx.body, ctx.user);
      ctx.redirect(`/applications/${id}`, '応募しました。運営がスキルシートを案件に合わせて整え、提出します。');
    } catch (e) { ctx.redirect(`/cases/${c.id}`, e.message, 'bad'); }
  });

  app.post('/cases/:id/decline', ['eg'], (ctx) => {
    run("UPDATE case_offers SET status = 'declined', decline_reason = ? WHERE case_id = ? AND engineer_id = ?", str(ctx.body.reason), ctx.params.id, ctx.user.engineer_id);
    audit(ctx.user.id, 'offer-decline', `案件 ${ctx.params.id}：${str(ctx.body.reason)}`);
    ctx.redirect('/eg/offers', '見送りました。');
  });

  app.post('/cases/:id/status', ['admin', 'ses'], (ctx) => {
    const c = get('SELECT * FROM cases WHERE id = ?', ctx.params.id);
    if (!c || !canEditCase(ctx.user, c)) return ctx.forbid();
    const st = str(ctx.body.status);
    if (!L.caseStatus[st]) return ctx.redirect(`/cases/${c.id}`);
    run('UPDATE cases SET status = ?, updated_at = ? WHERE id = ?', st, now(), c.id);
    audit(ctx.user.id, 'case-status', `${c.title} → ${L.caseStatus[st]}`);
    ctx.redirect(`/cases/${c.id}`, `「${L.caseStatus[st]}」にしました。`);
  });
};
