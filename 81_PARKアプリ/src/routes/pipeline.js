'use strict';
// 選考の流れ：応募 → 書類 → 面談（Q&A） → 成約（契約） → 延長・フォロー、と請求書
const { all, get, run, setting } = require('../db');
const { html, str, man, yen, fmtDate, fmtDateTime, today, now, intOrNull } = require('../util');
const { L, badge, form, field, card, table, dl, nl2br, postButton, layout } = require('../views');
const { canApp } = require('../perms');
const { generateQA } = require('../qa');
const svc = require('../services');
const { audit, notifySes } = require('../mail');

const OPEN = ['applied', 'submitted', 'doc_passed', 'interview', 'interviewed'];

function loadApp(ctx, id = ctx.params.id) {
  const a = get(`SELECT a.*, c.title, c.price AS case_price, c.start_date AS case_start, c.interviews_count, e.name AS eg_name, s.name AS ses_name
    FROM applications a JOIN cases c ON c.id = a.case_id JOIN engineers e ON e.id = a.engineer_id JOIN ses_companies s ON s.id = a.ses_id WHERE a.id = ?`, id);
  if (!a) { ctx.notFound(); return null; }
  if (!canApp(ctx.user, a)) { ctx.forbid(); return null; }
  return a;
}
const yesno = (v) => (v ? '○' : html`<span class="bad-text">要確認</span>`);

module.exports = (app) => {
  app.get('/applications/:id', '*', (ctx) => {
    const a = loadApp(ctx); if (!a) return;
    const u = ctx.user;
    const events = all('SELECT ev.*, u.name FROM application_events ev LEFT JOIN users u ON u.id = ev.user_id WHERE application_id = ? ORDER BY ev.id', a.id);
    const ivs = all('SELECT * FROM interviews WHERE application_id = ? ORDER BY round', a.id);
    const contract = get('SELECT * FROM contracts WHERE application_id = ?', a.id);
    const sheetUrl = `/engineers/${a.engineer_id}/sheet?case=${a.case_id}&anon=1`;

    let actions = '';
    if (u.role === 'admin' && OPEN.includes(a.status)) {
      const rejectForm = form(ctx, `/applications/${a.id}/status`, html`<input type="hidden" name="status" value="rejected">
${field('見送りの理由', 'reason', '', { type: 'select', options: L.rejectReasons })}${field('くわしく（次に活かすため1行で）', 'note', '', {})}
<button class="btn ghost">見送りにする</button>`);
      const step = {
        applied: html`<p>1. 案件に合わせたスキルシート（<a href="${sheetUrl}" target="_blank">名前を伏せた版</a>）を確かめて、元請けに提出します。</p>
${postButton(ctx, `/applications/${a.id}/status`, 'スキルシートを提出した', { fields: { status: 'submitted' } })}`,
        submitted: html`<p>書類の結果が出たら記録します。</p>${postButton(ctx, `/applications/${a.id}/status`, '書類が通過した', { fields: { status: 'doc_passed' } })}`,
        doc_passed: '', interview: html`<p>面談の結果は、下の面談の画面で記録します。</p>`,
        interviewed: html`<p>面談を通過しました。次の面談を設定するか、成約を記録します。</p>`,
      }[a.status];
      const ivForm = ['doc_passed', 'interviewed', 'interview'].includes(a.status) ? form(ctx, `/applications/${a.id}/interview`, html`<h3>面談を設定（${ivs.length + 1}回目）</h3>
<div class="grid2">${field('日時', 'scheduled_at', '', { type: 'datetime-local' })}${field('場所・URL', 'place', '', { placeholder: 'オンライン（URL は追って）' })}</div>
<p class="muted">設定すると、この案件に合わせた面談対策の Q&A を作り、本人と SES にメールで知らせます。</p><button class="btn">面談を設定する</button>`) : '';
      const wonForm = ['interviewed', 'interview'].includes(a.status) ? form(ctx, `/applications/${a.id}/contract`, html`<h3>成約を記録</h3>
<div class="grid3">${field('契約の金額（万円／月）', 'price', a.proposed_price || a.case_price, { type: 'number', step: '0.5', required: true })}
${field('開始日', 'start_date', a.case_start || today(), { type: 'date', required: true })}${field('契約の終わり（空なら3か月）', 'end_date', '', { type: 'date' })}</div>
<button class="btn">成約にする</button>`, { confirm: '成約として記録し、本人と SES に知らせます。よろしいですか？' }) : '';
      actions = card('次の手順（運営）', html`${step}${ivForm}${wonForm}<hr>${rejectForm}`);
    }
    if (u.role !== 'admin' && OPEN.includes(a.status)) {
      actions = card('応募の取り下げ', form(ctx, `/applications/${a.id}/withdraw`, html`${field('理由', 'note', '', { required: true })}<button class="btn ghost">取り下げる</button>`, { confirm: '応募を取り下げますか？' }));
    }

    ctx.page(`選考：${a.title}`, html`<div class="cols"><div>
${card('応募の内容', dl([
    ['案件', html`<a href="/cases/${a.case_id}">${a.title}</a>`], ['エンジニア', html`<a href="/engineers/${a.engineer_id}">${a.eg_name}</a>`], ['SES', a.ses_name],
    ['状態', badge('appStatus', a.status)], ['提示の金額', man(a.proposed_price)], ['応募日', fmtDateTime(a.applied_at)],
    ['開始に間に合う', yesno(a.start_ok)], ['金額', yesno(a.price_ok)], ['働き方・場所', yesno(a.style_ok)], ['気になること', nl2br(a.condition_note)],
    a.status === 'rejected' ? ['見送りの理由', `${a.reject_reason || ''} ${a.reject_note || ''}`] : null,
    ['スキルシート', html`<a href="${sheetUrl}" target="_blank">この案件に合わせたスキルシート</a>`],
    contract ? ['契約', html`<a href="/contracts/${contract.id}">${fmtDate(contract.start_date)}〜${fmtDate(contract.end_date)}（${man(contract.price)}）</a>`] : null,
  ]))}
${card('面談', table(['回', '日時', '場所', '結果', ''], ivs.map((iv) => [`${iv.round}回目`, fmtDateTime(iv.scheduled_at), iv.place, badge('ivResult', iv.result), html`<a href="/interviews/${iv.id}">Q&A・結果</a>`]), 'まだ面談はありません。'))}
${actions}
</div><div>
${card('経過', html`<ol class="timeline">${events.map((ev) => html`<li><b>${L.appStatus[ev.status] || ev.status}</b> <small>${fmtDateTime(ev.at)}・${ev.name || ''}</small>${ev.note ? html`<div>${ev.note}</div>` : ''}</li>`)}</ol>`)}
${u.role === 'admin' ? card('メモ・フィードバックを残す', form(ctx, `/applications/${a.id}/note`, html`${field('', 'note', '', { type: 'textarea', rows: 2, placeholder: '元請けからの印象、落ちた理由など（次の応募・面談に活かす）' })}<button class="btn ghost small">残す</button>`)) : ''}
</div></div>`, { wide: true });
  });

  app.post('/applications/:id/status', ['admin'], (ctx) => {
    const a = loadApp(ctx); if (!a) return;
    const st = str(ctx.body.status);
    if (!['submitted', 'doc_passed', 'rejected'].includes(st)) return ctx.redirect(`/applications/${a.id}`);
    svc.setStatus(a.id, st, ctx.user, { reason: str(ctx.body.reason), note: str(ctx.body.note) });
    ctx.redirect(`/applications/${a.id}`, `「${L.appStatus[st]}」にしました。`);
  });
  app.post('/applications/:id/withdraw', ['ses', 'eg'], (ctx) => {
    const a = loadApp(ctx); if (!a) return;
    if (!OPEN.includes(a.status)) return ctx.redirect(`/applications/${a.id}`);
    svc.setStatus(a.id, 'withdrawn', ctx.user, { note: str(ctx.body.note) });
    ctx.redirect(`/applications/${a.id}`, '取り下げました。');
  });
  app.post('/applications/:id/note', ['admin'], (ctx) => {
    const a = loadApp(ctx); if (!a) return;
    if (str(ctx.body.note)) svc.addEvent(a.id, 'note', str(ctx.body.note), ctx.user);
    ctx.redirect(`/applications/${a.id}`, '残しました。');
  });
  app.post('/applications/:id/interview', ['admin'], (ctx) => {
    const a = loadApp(ctx); if (!a) return;
    const id = svc.scheduleInterview(a.id, ctx.body, ctx.user);
    ctx.redirect(`/interviews/${id}`, '面談を設定し、Q&A を作りました。中身を確かめて、必要なら直してください。');
  });
  app.post('/applications/:id/contract', ['admin'], (ctx) => {
    const a = loadApp(ctx); if (!a) return;
    try { const id = svc.makeContract(a.id, ctx.body, ctx.user); ctx.redirect(`/contracts/${id}`, '成約を記録しました。おめでとうございます。'); } catch (e) { ctx.redirect(`/applications/${a.id}`, e.message, 'bad'); }
  });

  // ---------- 面談（Q&A） ----------
  app.get('/interviews/:id', '*', (ctx) => {
    const iv = get('SELECT * FROM interviews WHERE id = ?', ctx.params.id);
    if (!iv) return ctx.notFound();
    const a = loadApp(ctx, iv.application_id); if (!a) return;
    const qa = JSON.parse(iv.qa_json || '[]');
    const u = ctx.user;
    const qaView = html`<ol class="qa">${qa.map((x) => html`<li><span class="badge info">${x.category}</span><p class="q">Q. ${x.q}</p><p class="hint">答え方のヒント：${x.hint}</p></li>`)}</ol>`;
    const qaEdit = form(ctx, `/interviews/${iv.id}/qa`, html`${qa.map((x) => html`<div class="qaedit"><input name="category" value="${x.category}"><input name="q" value="${x.q}"><textarea name="hint" rows="2">${x.hint}</textarea></div>`)}
<div class="qaedit"><input name="category" placeholder="分類（追加）"><input name="q" placeholder="質問（追加）"><textarea name="hint" rows="2" placeholder="答え方のヒント"></textarea></div>
<button class="btn">Q&A を保存</button>`);
    ctx.page(`面談 ${iv.round}回目：${a.title}`, html`<div class="cols"><div>
${card('面談', dl([['案件', html`<a href="/cases/${a.case_id}">${a.title}</a>`], ['エンジニア', a.eg_name], ['日時', fmtDateTime(iv.scheduled_at)], ['場所', iv.place], ['結果', badge('ivResult', iv.result)], ['感想・フィードバック', nl2br(iv.feedback)]]))}
${card('面談対策の Q&A', html`<p class="muted">想定質問と答え方のヒントです。丸暗記ではなく、自分の言葉で、事実だけを答えられるようにしておきましょう。</p>${qaView}`,
    u.role === 'admin' ? postButton(ctx, `/interviews/${iv.id}/regen`, '作り直す', { cls: 'ghost small', confirm: '今の Q&A を消して作り直します。よろしいですか？' }) : '')}
${u.role === 'admin' ? card('Q&A を直す', qaEdit) : ''}
</div><div>
${u.role === 'eg' ? card('自分用のメモ（答えの練習）', form(ctx, `/interviews/${iv.id}/memo`, html`${field('', 'eg_memo', iv.eg_memo, { type: 'textarea', rows: 10 })}<button class="btn">保存</button>`)) : iv.eg_memo && u.role === 'admin' ? card('本人のメモ', html`<p>${nl2br(iv.eg_memo)}</p>`) : ''}
${u.role === 'admin' && iv.result === 'pending' ? card('結果を記録', form(ctx, `/interviews/${iv.id}/result`, html`
${field('結果', 'result', 'pass', { type: 'select', options: { pass: '通過', fail: '見送り' } })}${field('感想・元請けからの印象', 'feedback', '', { type: 'textarea', rows: 3 })}<button class="btn">記録する</button>`)) : ''}
<p><a href="/applications/${a.id}">← 選考の画面へ</a></p>
</div></div>`, { wide: true });
  });
  app.post('/interviews/:id/qa', ['admin'], (ctx) => {
    const iv = get('SELECT * FROM interviews WHERE id = ?', ctx.params.id); if (!iv) return ctx.notFound();
    const cats = [].concat(ctx.body.category || []); const qs = [].concat(ctx.body.q || []); const hints = [].concat(ctx.body.hint || []);
    const qa = qs.map((q, i) => ({ category: cats[i] || '', q: String(q).trim(), hint: String(hints[i] || '').trim() })).filter((x) => x.q);
    run('UPDATE interviews SET qa_json = ? WHERE id = ?', JSON.stringify(qa), iv.id);
    ctx.redirect(`/interviews/${iv.id}`, 'Q&A を保存しました。');
  });
  app.post('/interviews/:id/regen', ['admin'], (ctx) => {
    const iv = get('SELECT * FROM interviews WHERE id = ?', ctx.params.id); if (!iv) return ctx.notFound();
    const a = get('SELECT * FROM applications WHERE id = ?', iv.application_id);
    run('UPDATE interviews SET qa_json = ? WHERE id = ?', JSON.stringify(generateQA(a.case_id, a.engineer_id)), iv.id);
    ctx.redirect(`/interviews/${iv.id}`, '作り直しました。');
  });
  app.post('/interviews/:id/memo', ['eg'], (ctx) => {
    const iv = get('SELECT * FROM interviews WHERE id = ?', ctx.params.id); if (!iv) return ctx.notFound();
    const a = loadApp(ctx, iv.application_id); if (!a) return;
    run('UPDATE interviews SET eg_memo = ? WHERE id = ?', str(ctx.body.eg_memo), iv.id);
    ctx.redirect(`/interviews/${iv.id}`, '保存しました。');
  });
  app.post('/interviews/:id/result', ['admin'], (ctx) => {
    const iv = get('SELECT * FROM interviews WHERE id = ?', ctx.params.id); if (!iv) return ctx.notFound();
    svc.interviewResult(iv.id, str(ctx.body.result) === 'fail' ? 'fail' : 'pass', ctx.body.feedback, ctx.user);
    ctx.redirect(`/applications/${iv.application_id}`, '結果を記録しました。');
  });

  // ---------- 契約（延長・終了・成約後のフォロー） ----------
  app.get('/contracts/:id', '*', (ctx) => {
    const k = get(`SELECT k.*, c.title, e.name AS eg_name, s.name AS ses_name FROM contracts k JOIN cases c ON c.id = k.case_id
      JOIN engineers e ON e.id = k.engineer_id JOIN ses_companies s ON s.id = k.ses_id WHERE k.id = ?`, ctx.params.id);
    if (!k) return ctx.notFound();
    if (!canApp(ctx.user, k)) return ctx.forbid();
    const u = ctx.user;
    const fus = all('SELECT f.*, u.name FROM follow_ups f LEFT JOIN users u ON u.id = f.by_user WHERE contract_id = ? ORDER BY f.id DESC', k.id);
    const base = k.price * 10000;
    ctx.page(`契約：${k.title}`, html`<div class="cols"><div>
${card('契約', dl([['案件', html`<a href="/cases/${k.case_id}">${k.title}</a>`], ['エンジニア', html`<a href="/engineers/${k.engineer_id}">${k.eg_name}</a>`], ['SES', k.ses_name],
    ['状態', badge('contractStatus', k.status)], ['金額', man(k.price)], ['期間', `${fmtDate(k.start_date)}〜${fmtDate(k.end_date)}`], ['延長', `${k.extensions}回`],
    k.end_reason ? ['終了の理由', k.end_reason] : null,
    u.role !== 'eg' ? ['成功報酬（税別）', html`初期費用 ${yen(base * Number(setting('fee_initial_rate')) / 100)}／月額 ${yen(base * Number(setting('fee_monthly_rate')) / 100)}`] : null]))}
${u.role === 'admin' && k.status === 'active' ? card('延長・終了', html`
${form(ctx, `/contracts/${k.id}/extend`, html`<div class="grid2">${field('延長する月数', 'months', 3, { type: 'number', min: 1 })}<div><button class="btn">延長を記録</button></div></div>`)}
<hr>${form(ctx, `/contracts/${k.id}/end`, html`<div class="grid2">${field('終了日', 'end_date', k.end_date, { type: 'date' })}${field('理由', 'end_reason', '', { placeholder: '満了、元請けの都合、相性 など' })}</div><button class="btn ghost">終了にする</button>`, { confirm: '契約を終了にしますか？' })}`) : ''}
</div><div>
${card('成約後のフォロー', html`<p class="muted">配属後の最初の1か月に、困りごと・相性を短く聞きます。早めに気づけば、延長につながります。</p>
${u.role !== 'ses' && k.status === 'active' ? form(ctx, `/contracts/${k.id}/followup`, html`
${field('今の調子（5がとても良い）', 'mood', 3, { type: 'select', options: [[5, '5 とても良い'], [4, '4 良い'], [3, '3 ふつう'], [2, '2 少し不安'], [1, '1 困っている']] })}
${field('困っていること', 'troubles', '', { type: 'textarea', rows: 2 })}${field('メモ', 'note', '', {})}<button class="btn">記録する</button>`) : ''}
${table(['日', '調子', '困りごと', 'メモ', '記入'], fus.map((f) => [fmtDate(f.at), f.mood, f.troubles, f.note, f.name]), 'まだ記録はありません。')}`)}
</div></div>`, { wide: true });
  });
  app.post('/contracts/:id/extend', ['admin'], (ctx) => { svc.extendContract(ctx.params.id, intOrNull(ctx.body.months) || 3, ctx.user); ctx.redirect(`/contracts/${ctx.params.id}`, '延長を記録しました。'); });
  app.post('/contracts/:id/end', ['admin'], (ctx) => { svc.endContract(ctx.params.id, ctx.body, ctx.user); ctx.redirect(`/contracts/${ctx.params.id}`, '終了にしました。'); });
  app.post('/contracts/:id/followup', ['admin', 'eg'], (ctx) => {
    const k = get('SELECT * FROM contracts WHERE id = ?', ctx.params.id);
    if (!k || !canApp(ctx.user, k)) return ctx.forbid();
    run('INSERT INTO follow_ups (contract_id, at, mood, troubles, note, by_user) VALUES (?, ?, ?, ?, ?, ?)', k.id, now(), intOrNull(ctx.body.mood), str(ctx.body.troubles), str(ctx.body.note), ctx.user.id);
    if (intOrNull(ctx.body.mood) <= 2 || str(ctx.body.troubles)) {
      const { notifyAdmins } = require('../mail');
      notifyAdmins('フォロー：困りごとがあります', `契約 #${k.id}：${str(ctx.body.troubles) || '調子が良くない'}`, `/contracts/${k.id}`, { kind: 'followup' });
    }
    ctx.redirect(`/contracts/${k.id}`, '記録しました。');
  });

  // ---------- 請求書（印刷用） ----------
  app.get('/invoices/:id', ['admin', 'ses'], (ctx) => {
    const inv = get('SELECT i.*, s.name AS ses_name, s.address, s.rep_name FROM invoices i JOIN ses_companies s ON s.id = i.ses_id WHERE i.id = ?', ctx.params.id);
    if (!inv) return ctx.notFound();
    if (ctx.user.role === 'ses' && (inv.ses_id !== ctx.user.ses_id || inv.status === 'draft')) return ctx.forbid();
    const items = JSON.parse(inv.items_json);
    const body = html`<div class="noprint toolbar"><a href="${ctx.user.role === 'admin' ? '/admin/invoices' : '/ses/invoices'}">← 戻る</a> <button class="btn small" onclick="print()">印刷・PDF に保存</button>
${ctx.user.role === 'admin' && inv.status === 'draft' ? postButton(ctx, `/admin/invoices/${inv.id}/issue`, '発行して SES に知らせる', { cls: 'small' }) : ''}
${ctx.user.role === 'admin' && inv.status === 'issued' ? postButton(ctx, `/admin/invoices/${inv.id}/paid`, '入金を記録', { cls: 'small' }) : ''} ${badge('invoiceStatus', inv.status)}</div>
<article class="sheet invoice"><header><h1>ご請求書</h1><div>${inv.period} 分　発行日 ${fmtDate(inv.issued_at) === '—' ? today() : fmtDate(inv.issued_at)}</div></header>
<p class="to">${inv.ses_name} 御中</p><p>下記のとおりご請求申し上げます。</p>
<p class="total">ご請求金額　${yen(inv.total)}（税込）</p>
<table class="grid"><thead><tr><th>内容</th><th>基準額</th><th>率</th><th>金額</th></tr></thead><tbody>
${items.map((it) => html`<tr><td>${it.label}</td><td class="r">${yen(it.base)}</td><td class="r">${Math.round(it.rate * 1000) / 10}%</td><td class="r">${yen(it.amount)}</td></tr>`)}
<tr><td colspan="3" class="r">小計</td><td class="r">${yen(inv.subtotal)}</td></tr><tr><td colspan="3" class="r">消費税（${setting('tax_rate')}%）</td><td class="r">${yen(inv.tax)}</td></tr>
<tr><td colspan="3" class="r"><b>合計</b></td><td class="r"><b>${yen(inv.total)}</b></td></tr></tbody></table>
<p class="muted">成功報酬（成約したときだけ）：初期費用は稼働開始の月、月額費用は契約が続く間。基準は案件の金額（月額）です。</p>
<footer>${setting('operator_name')}</footer></article>`;
    ctx.send(200, layout(ctx, `請求書 ${inv.period} ${inv.ses_name}`, body, { print: true, noTitle: true }));
  });
};
