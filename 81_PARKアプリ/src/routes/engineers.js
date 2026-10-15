'use strict';
// エンジニア：登録・プロフィール・スキル・経験票・スキルシート・運営とのやり取り
const { all, get, run, setting } = require('../db');
const { html, raw, str, man, fmtDate, fmtDateTime, parseList, normSkill, now, today } = require('../util');
const { L, badge, form, field, card, table, dl, nl2br, chips, postButton, layout } = require('../views');
const { canEngineer } = require('../perms');
const { sheetCheck } = require('../qa');
const { hasSkill, skillIndex, looseMatch } = require('../match');
const svc = require('../services');
const { notifyAdmins, notifyEg, audit } = require('../mail');

const PHASES = ['要件定義', '基本設計', '詳細設計', '実装', '単体テスト', '結合テスト', '総合テスト', '運用・保守', 'マネジメント'];
const age = (y) => (y ? `${new Date().getFullYear() - y}歳前後` : '');

function loadEng(ctx) {
  const e = get('SELECT e.*, s.name AS ses_name FROM engineers e JOIN ses_companies s ON s.id = e.ses_id WHERE e.id = ?', ctx.params.id);
  if (!e) { ctx.notFound(); return null; }
  if (!canEngineer(ctx.user, e)) { ctx.forbid(); return null; }
  return e;
}

function engForm(ctx, e, action, opt = {}) {
  const sesList = ctx.user.role === 'admin' && opt.isNew ? all("SELECT id, name FROM ses_companies WHERE status = 'active' ORDER BY name") : [];
  const isEg = ctx.user.role === 'eg';
  return form(ctx, action, html`<div class="grid2">
${sesList.length ? field('所属 SES', 'ses_id', ctx.query.ses || '', { type: 'select', options: sesList.map((s) => [s.id, s.name]), required: true }) : ''}
${field('氏名', 'name', e.name, { required: true })}${field('ふりがな', 'kana', e.kana, { placeholder: 'やまだ たろう', hint: 'スキルシートのイニシャル（T.Y）に使います' })}
${field('メールアドレス', 'email', e.email, { type: 'email', hint: opt.isNew ? '入れると、ご本人に招待メールが届きます' : '', required: false })}
${field('生まれた年', 'birth_year', e.birth_year, { type: 'number', placeholder: '1985' })}
${field('最寄り駅', 'nearest_station', e.nearest_station)}${field('IT の経験年数', 'years_exp', e.years_exp, { type: 'number', step: '0.5' })}
${field('希望単価（万円／月）', 'desired_price', e.desired_price, { type: 'number', step: '0.5' })}${field('下限の単価（万円／月）', 'min_price', e.min_price, { type: 'number', step: '0.5', hint: 'マッチングにだけ使い、外には出しません' })}
${field('稼働できる日', 'available_from', e.available_from, { type: 'date' })}${field('希望の働き方', 'work_style', e.work_style || 'any', { type: 'select', options: L.workStyle })}
${field('週の稼働日数', 'days_per_week', e.days_per_week ?? 5, { type: 'number', min: 1 })}
${isEg ? field('今の状態', 'status', e.status === 'working' || e.status === 'proposing' ? e.status : e.status || 'available', { type: 'select', options: { available: '案件を探している', unavailable: '今は休止', ...(e.status === 'working' ? { working: '稼働中' } : {}), ...(e.status === 'proposing' ? { proposing: '提案中' } : {}) } })
    : field('状態', 'status', e.status || 'available', { type: 'select', options: L.engStatus })}
</div>
${field('強み（ひとこと）', 'strengths', e.strengths, { placeholder: '例：業務系 Java の設計〜テストを1人で回せる' })}
${field('自己PR', 'summary', e.summary, { type: 'textarea', rows: 5, hint: '得意分野と、どんな現場で力を出せるか。事実だけを書きます。' })}
<button class="btn">${opt.isNew ? '登録する' : '保存する'}</button>`);
}

module.exports = (app) => {
  app.get('/engineers/new', ['admin', 'ses'], (ctx) => ctx.page('エンジニアの登録', html`
<p class="muted">基本情報を登録します。メールアドレスを入れると、ご本人に招待が届き、経験票（これまでの案件）をご本人が入れられます。</p>
${card(null, engForm(ctx, {}, '/engineers', { isNew: true }))}`));
  app.post('/engineers', ['admin', 'ses'], (ctx) => {
    const sesId = ctx.user.role === 'ses' ? ctx.user.ses_id : Number(ctx.body.ses_id);
    if (!sesId || !str(ctx.body.name)) return ctx.redirect('/engineers/new', '所属と氏名を入れてください。', 'bad');
    if (str(ctx.body.email) && get('SELECT id FROM users WHERE email = ?', str(ctx.body.email).toLowerCase())) return ctx.redirect('/engineers/new', 'このメールアドレスはすでに使われています。', 'bad');
    const id = svc.createEngineer(sesId, ctx.body, ctx.user);
    ctx.redirect(`/engineers/${id}`, str(ctx.body.email) ? '登録し、ご本人に招待メールを送りました。' : '登録しました。');
  });

  app.get('/engineers/:id', '*', (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    const u = ctx.user;
    const skills = all('SELECT * FROM engineer_skills WHERE engineer_id = ? ORDER BY category, years DESC', e.id);
    const projects = all('SELECT * FROM engineer_projects WHERE engineer_id = ? ORDER BY period_from DESC', e.id);
    const check = sheetCheck(e.id);
    const apps = all('SELECT a.*, c.title FROM applications a JOIN cases c ON c.id = a.case_id WHERE a.engineer_id = ? ORDER BY a.id DESC', e.id);
    const eu = get("SELECT * FROM users WHERE engineer_id = ? AND role = 'eg'", e.id);
    const mine = u.role === 'eg';
    ctx.page(mine ? 'プロフィール・経験票' : e.name, html`<div class="cols"><div>
${card('基本情報', html`${dl([
    ['氏名', html`${e.name} <span class="muted">${e.kana || ''}（${e.initials || '—'}）</span>`], ['所属 SES', e.ses_name], ['状態', badge('engStatus', e.status)],
    ['年齢', age(e.birth_year)], ['最寄り駅', e.nearest_station], ['経験年数', e.years_exp ? `${e.years_exp}年` : ''],
    ['希望単価', man(e.desired_price)], !mine || true ? ['下限', man(e.min_price)] : null, ['稼働できる日', fmtDate(e.available_from)],
    ['働き方', `${L.workStyle[e.work_style] || ''}・週${e.days_per_week || 5}日`], ['強み', e.strengths], ['自己PR', nl2br(e.summary)],
    u.role !== 'eg' ? ['アカウント', eu ? (eu.password_hash ? `利用中（最終ログイン ${fmtDateTime(eu.last_login)}）` : '招待中（未設定）') : 'なし'] : null,
    ['個人情報の同意', e.consent_at ? fmtDate(e.consent_at) : html`<span class="bad-text">未</span>`],
  ])}`, html`<a class="btn ghost small" href="/engineers/${e.id}/edit">編集</a>
${u.role !== 'eg' && e.email && !(eu && eu.password_hash) ? postButton(ctx, `/engineers/${e.id}/invite`, '招待を送る', { cls: 'ghost small' }) : ''}`)}
${card('スキル', skills.length ? html`<div class="skillgrid">${skills.map((s) => html`<div class="sk"><b>${s.name}</b><span>${L.skillCat[s.category]}</span><span>${s.years ? s.years + '年' : ''}</span><span class="lv">${'★'.repeat(s.level || 0)}${'☆'.repeat(5 - (s.level || 0))}</span></div>`)}</div>` : html`<p class="empty">まだ登録がありません。</p>`,
    html`<a class="btn ghost small" href="/engineers/${e.id}/skills">スキルを編集</a>`)}
${card('経験票（これまでの案件）', projects.length ? projects.map((p) => html`<div class="proj">
<div class="projhead"><b>${p.title}</b><span class="muted">${p.period_from || '?'}〜${p.period_to || '現在'}・${p.industry || ''}・${p.role || ''}${p.team_size ? `・${p.team_size}名` : ''}</span>
<a class="small" href="/engineers/${e.id}/projects/${p.id}/edit">編集</a></div>
${chips(parseList(p.tech))} <span class="muted small">${p.phases || ''}</span><p>${nl2br(p.description)}</p>${p.achievements ? html`<p class="ach">成果：${p.achievements}</p>` : ''}</div>`) : html`<p class="empty">まだ登録がありません。直近の案件から入れていきましょう。</p>`,
    html`<a class="btn small" href="/engineers/${e.id}/projects/new">案件を追加</a>`)}
</div><div>
${card('スキルシートの完成度', html`<div class="meter"><i style="width:${check.score}%"></i><b>${check.score}%</b></div><ul class="tips">${check.tips.map((t) => html`<li>${t}</li>`)}</ul>
<p><a class="btn" href="/engineers/${e.id}/sheet">スキルシートを見る</a> <a class="btn ghost" href="/engineers/${e.id}/sheet?anon=1">名前を伏せた版</a></p>
${u.role !== 'ses' ? html`<p><a href="/engineers/${e.id}/messages">運営とのやり取り（スキルシートの相談）</a></p>` : ''}`)}
${card('応募・選考', table(['案件', '状態', ''], apps.map((a) => [a.title, badge('appStatus', a.status), html`<a href="/applications/${a.id}">詳細</a>`])))}
</div></div>`, { wide: true });
  });

  app.get('/engineers/:id/edit', '*', (ctx) => { const e = loadEng(ctx); if (!e) return; ctx.page(`プロフィールの編集`, card(null, engForm(ctx, e, `/engineers/${e.id}`))); });
  app.post('/engineers/:id', '*', (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    const body = { ...ctx.body };
    if (ctx.user.role === 'eg') { delete body.email; if (!['available', 'unavailable'].includes(body.status)) delete body.status; }
    if (ctx.user.role !== 'eg' && str(body.email) && str(body.email).toLowerCase() !== (e.email || '') && get('SELECT id FROM users WHERE email = ?', str(body.email).toLowerCase())) return ctx.redirect(`/engineers/${e.id}/edit`, 'このメールアドレスはすでに使われています。', 'bad');
    svc.updateEngineer(e.id, body, ctx.user);
    ctx.redirect(`/engineers/${e.id}`, '保存しました。');
  });
  app.post('/engineers/:id/invite', ['admin', 'ses'], (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    if (!e.email) return ctx.redirect(`/engineers/${e.id}`, 'メールアドレスが登録されていません。', 'bad');
    svc.inviteUser({ email: e.email, name: e.name, role: 'eg', ses_id: e.ses_id, engineer_id: e.id }, ctx.user);
    ctx.redirect(`/engineers/${e.id}`, '招待メールを送りました。');
  });

  // ---------- スキル ----------
  app.get('/engineers/:id/skills', '*', (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    const skills = all('SELECT * FROM engineer_skills WHERE engineer_id = ? ORDER BY category, years DESC', e.id);
    const row = (s = {}) => html`<tr><td><input name="skill_name" value="${s.name || ''}" placeholder="Java"></td>
<td><select name="skill_cat">${Object.entries(L.skillCat).map(([k, v]) => html`<option value="${k}" ${s.category === k ? raw('selected') : ''}>${v}</option>`)}</select></td>
<td><input name="skill_years" type="number" step="0.5" min="0" value="${s.years ?? ''}"></td>
<td><select name="skill_level">${[1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${(s.level || 3) === n ? raw('selected') : ''}>${n}</option>`)}</select></td>
<td><button type="button" class="link" onclick="this.closest('tr').remove()">削除</button></td></tr>`;
    ctx.page(`スキルの編集（${e.name}）`, html`${card(null, form(ctx, `/engineers/${e.id}/skills`, html`
<p class="muted">レベルの目安：1 触ったことがある／2 指示があればできる／3 1人でできる／4 人に教えられる／5 設計・判断をリードできる</p>
<table class="edit" id="skills"><thead><tr><th>スキル</th><th>分類</th><th>年数</th><th>レベル</th><th></th></tr></thead>
<tbody>${skills.map(row)}${[0, 1, 2].map(() => row())}</tbody></table>
<template id="skillrow">${row()}</template>
<p><button type="button" class="btn ghost small" onclick="addRow('skills','skillrow')">行を足す</button></p>
<button class="btn">保存する</button>`))}${raw('<script src="/public/app.js"></script>')}`);
  });
  app.post('/engineers/:id/skills', '*', (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    svc.saveSkills(e.id, ctx.body);
    run('UPDATE engineers SET updated_at = ? WHERE id = ?', now(), e.id);
    ctx.redirect(`/engineers/${e.id}`, 'スキルを保存しました。');
  });

  // ---------- 経験票（プロジェクト） ----------
  const projForm = (ctx, e, p, action) => form(ctx, action, html`<div class="grid2">
${field('案件名（内容がわかる名前）', 'title', p.title, { required: true, cls: 'span2', placeholder: '例：保険会社向け 契約管理システムの刷新' })}
${field('業種', 'industry', p.industry, { placeholder: '保険、物流、EC…' })}${field('役割', 'role', p.role, { placeholder: 'PG、SE、リーダー…' })}
${field('開始（年月）', 'period_from', p.period_from, { type: 'month' })}${field('終了（年月、空なら現在）', 'period_to', p.period_to, { type: 'month' })}
${field('チームの人数', 'team_size', p.team_size, { type: 'number', min: 1 })}${field('使った技術', 'tech', p.tech, { placeholder: 'Java、Spring Boot、Oracle、AWS（「、」区切り）' })}
</div>
<div class="field"><span>担当した工程</span><div class="checks">${PHASES.map((ph) => html`<label><input type="checkbox" name="phases" value="${ph}" ${parseList(p.phases).includes(ph) ? raw('checked') : ''}> ${ph}</label>`)}</div></div>
${field('作業内容', 'description', p.description, { type: 'textarea', rows: 4, hint: '何を・どこまで担当したか。40字以上で具体的に。' })}
${field('成果（できれば数字で）', 'achievements', p.achievements, { type: 'textarea', rows: 2, placeholder: '例：バッチの処理時間を 4時間→40分に短縮' })}
<p class="muted">事実だけを書いてください。盛った内容は、面談や配属後のトラブルの元になります。</p>
<button class="btn">保存する</button>`);
  app.get('/engineers/:id/projects/new', '*', (ctx) => { const e = loadEng(ctx); if (!e) return; ctx.page('案件の追加（経験票）', card(null, projForm(ctx, e, {}, `/engineers/${e.id}/projects`))); });
  app.post('/engineers/:id/projects', '*', (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    if (!str(ctx.body.title)) return ctx.redirect(`/engineers/${e.id}/projects/new`, '案件名を入れてください。', 'bad');
    svc.saveProject(e.id, ctx.body);
    ctx.redirect(`/engineers/${e.id}`, '経験票に追加しました。');
  });
  app.get('/engineers/:id/projects/:pid/edit', '*', (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    const p = get('SELECT * FROM engineer_projects WHERE id = ? AND engineer_id = ?', ctx.params.pid, e.id);
    if (!p) return ctx.notFound();
    ctx.page('案件の編集（経験票）', html`${card(null, projForm(ctx, e, p, `/engineers/${e.id}/projects/${p.id}`))}
${postButton(ctx, `/engineers/${e.id}/projects/${p.id}/delete`, 'この案件を削除', { cls: 'danger small', confirm: '削除しますか？' })}`);
  });
  app.post('/engineers/:id/projects/:pid', '*', (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    svc.saveProject(e.id, ctx.body, Number(ctx.params.pid));
    ctx.redirect(`/engineers/${e.id}`, '保存しました。');
  });
  app.post('/engineers/:id/projects/:pid/delete', '*', (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    run('DELETE FROM engineer_projects WHERE id = ? AND engineer_id = ?', ctx.params.pid, e.id);
    ctx.redirect(`/engineers/${e.id}`, '削除しました。');
  });

  // ---------- スキルシート（印刷・PDF 用。?case= で案件に合わせて並べ替え、?anon=1 で名前を伏せる） ----------
  app.get('/engineers/:id/sheet', '*', (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    const c = ctx.query.case ? get('SELECT * FROM cases WHERE id = ?', ctx.query.case) : null;
    const anon = ctx.query.anon === '1';
    const skills = all('SELECT * FROM engineer_skills WHERE engineer_id = ? ORDER BY category, years DESC', e.id);
    let projects = all('SELECT * FROM engineer_projects WHERE engineer_id = ? ORDER BY period_from DESC', e.id);
    const want = c ? [...parseList(c.required_skills), ...parseList(c.preferred_skills)] : [];
    const wantN = new Set(want.map(normSkill));
    const isHit = (t) => { const n = normSkill(t); if (wantN.has(n)) return true; for (const w of wantN) if (w.length >= 3 && n.length >= 3 && looseMatch(n, w)) return true; return false; };
    if (c) {
      // 案件に関係する技術を多く使った案件を上に（同じなら新しい順）
      projects = projects.map((p) => ({ p, hits: parseList(p.tech).filter(isHit).length })).sort((a, b) => b.hits - a.hits || String(b.p.period_from).localeCompare(String(a.p.period_from))).map((x) => x.p);
    }
    const hitSet = new Set(skills.map((s) => s.name).concat(projects.flatMap((p) => parseList(p.tech))).filter(isHit));
    const byCat = {};
    for (const s of skills) (byCat[s.category] = byCat[s.category] || []).push(s);
    const idx = skillIndex(e.id);
    const reqRows = c ? parseList(c.required_skills).map((r) => { const s = hasSkill(idx, r); return [r, s ? `○ ${s.years ? s.years + '年' : '経験あり'}` : '—']; }) : [];
    const display = anon ? (e.initials || 'イニシャル未設定') : e.name;
    const body = html`
<div class="noprint toolbar"><a href="/engineers/${e.id}">← 戻る</a>
<form method="get" class="inline">${c ? html`<input type="hidden" name="case" value="${c.id}">` : ''}<label><input type="checkbox" name="anon" value="1" ${anon ? raw('checked') : ''} onchange="this.form.submit()"> 名前を伏せる</label></form>
<button class="btn small" onclick="print()">印刷・PDF に保存</button></div>
<article class="sheet">
<header><h1>スキルシート</h1><div class="muted">作成日 ${today()}${c ? html`　／　ご提案：${c.title}` : ''}</div></header>
<table class="sheetinfo"><tr><th>氏名</th><td>${display}</td><th>年齢</th><td>${age(e.birth_year)}</td><th>最寄り駅</th><td>${e.nearest_station || ''}</td></tr>
<tr><th>経験年数</th><td>${e.years_exp ? e.years_exp + '年' : ''}</td><th>稼働開始</th><td>${fmtDate(e.available_from)}</td><th>働き方</th><td>${L.workStyle[e.work_style] || ''}</td></tr></table>
${e.strengths ? html`<p class="lead">${e.strengths}</p>` : ''}
<h2>自己PR</h2><p>${nl2br(e.summary)}</p>
${c ? html`<h2>案件の必須要件との対応</h2><table class="grid">${reqRows.map(([k, v]) => html`<tr><th>${k}</th><td>${v}</td></tr>`)}</table>` : ''}
<h2>スキル</h2><table class="grid">${Object.entries(byCat).map(([cat, list]) => html`<tr><th>${L.skillCat[cat]}</th><td>${list.map((s) => html`<span class="sk2 ${hitSet.has(s.name) ? 'hit' : ''}">${s.name}${s.years ? `（${s.years}年）` : ''}</span>`)}</td></tr>`)}</table>
<h2>経歴</h2>
${projects.map((p, i) => html`<section class="sp"><div class="sph"><b>${i + 1}. ${p.title}</b><span>${p.period_from || '?'}〜${p.period_to || '現在'}</span></div>
<div class="spm">${[p.industry, p.role, p.team_size ? `${p.team_size}名体制` : ''].filter(Boolean).join('／')}　${p.phases ? html`<span class="muted">工程：${p.phases}</span>` : ''}</div>
<div>${parseList(p.tech).map((t) => html`<span class="chip ${isHit(t) ? 'hit' : ''}">${t}</span>`)}</div>
<p>${nl2br(p.description)}</p>${p.achievements ? html`<p class="ach">成果：${p.achievements}</p>` : ''}</section>`)}
<footer class="muted">${setting('app_name')}　本シートの内容は本人が事実であることを確認しています。</footer>
</article>`;
    ctx.send(200, layout(ctx, `スキルシート ${display}`, body, { print: true, noTitle: true }));
  });

  // ---------- 運営とのやり取り（スキルシートの相談） ----------
  app.get('/engineers/:id/messages', ['admin', 'eg'], (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    const msgs = all('SELECT m.*, u.name, u.role FROM messages m LEFT JOIN users u ON u.id = m.from_user WHERE m.engineer_id = ? ORDER BY m.id', e.id);
    run(`UPDATE messages SET ${ctx.user.role === 'eg' ? 'read_by_eg' : 'read_by_admin'} = 1 WHERE engineer_id = ?`, e.id);
    ctx.page(ctx.user.role === 'eg' ? '運営とのやり取り' : `やり取り：${e.name}`, html`
<p class="muted">スキルシート・面談の準備について、運営と相談できます。${ctx.user.role === 'eg' ? '「見てほしい」と送れば、運営がスキルシートを確認して返事をします。' : ''}</p>
<div class="thread">${msgs.length ? msgs.map((m) => html`<div class="msg ${m.role === ctx.user.role ? 'me' : ''}"><div class="who">${m.name || '—'}<small>${fmtDateTime(m.created_at)}</small></div><div>${nl2br(m.body)}</div></div>`) : html`<p class="empty">まだやり取りはありません。</p>`}</div>
${card(null, form(ctx, `/engineers/${e.id}/messages`, html`${field('メッセージ', 'body', '', { type: 'textarea', rows: 3, required: true })}
${ctx.user.role === 'eg' ? field('スキルシートを見てほしい（レビューの依頼）', 'review', false, { type: 'checkbox' }) : ''}<button class="btn">送る</button>`))}`);
  });
  app.post('/engineers/:id/messages', ['admin', 'eg'], (ctx) => {
    const e = loadEng(ctx); if (!e) return;
    const body = (ctx.body.review ? '【スキルシートのレビュー依頼】\n' : '') + str(ctx.body.body);
    if (!body.trim()) return ctx.redirect(`/engineers/${e.id}/messages`);
    run('INSERT INTO messages (engineer_id, from_user, body, created_at, read_by_eg, read_by_admin) VALUES (?, ?, ?, ?, ?, ?)', e.id, ctx.user.id, body, now(), ctx.user.role === 'eg' ? 1 : 0, ctx.user.role === 'admin' ? 1 : 0);
    if (ctx.user.role === 'eg') notifyAdmins(`${e.name} さんからメッセージ`, body.slice(0, 200), `/engineers/${e.id}/messages`, { kind: 'message' });
    else notifyEg(e.id, '運営からメッセージが届きました', body.slice(0, 400), `/engineers/${e.id}/messages`, { kind: 'message' });
    ctx.redirect(`/engineers/${e.id}/messages`);
  });
};
