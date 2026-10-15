'use strict';
// エンジニアの画面：ホーム・届いた案件・応募と面談。プロフィール・経験票・スキルシート・やり取りは共通の画面へ
const { all, get } = require('../db');
const { html, man, fmtDate, fmtDateTime, today } = require('../util');
const { L, badge, card, table, stats, scoreBar } = require('../views');
const { sheetCheck } = require('../qa');
const E = ['eg'];

module.exports = (app) => {
  app.get('/eg', E, (ctx) => {
    const eid = ctx.user.engineer_id;
    const e = get('SELECT * FROM engineers WHERE id = ?', eid);
    const check = sheetCheck(eid);
    const offers = all(`SELECT o.*, c.title, c.price, c.start_date FROM case_offers o JOIN cases c ON c.id = o.case_id
      WHERE o.engineer_id = ? AND o.status IN ('sent','viewed') AND c.status = 'open' ORDER BY o.sent_at DESC`, eid);
    const apps = all(`SELECT a.*, c.title FROM applications a JOIN cases c ON c.id = a.case_id WHERE a.engineer_id = ? AND a.status NOT IN ('rejected','withdrawn') ORDER BY a.updated_at DESC`, eid);
    const ivs = all(`SELECT iv.*, c.title FROM interviews iv JOIN applications a ON a.id = iv.application_id JOIN cases c ON c.id = a.case_id
      WHERE a.engineer_id = ? AND iv.result = 'pending' ORDER BY iv.scheduled_at`, eid);
    const contract = get(`SELECT k.*, c.title FROM contracts k JOIN cases c ON c.id = k.case_id WHERE k.engineer_id = ? AND k.status = 'active'`, eid);
    const needFollow = contract && !get('SELECT id FROM follow_ups WHERE contract_id = ?', contract.id);
    const unread = get('SELECT COUNT(*) AS n FROM messages WHERE engineer_id = ? AND read_by_eg = 0', eid).n;
    ctx.page(`${e.name} さん`, html`
${stats([['スキルシートの完成度', `${check.score}%`, check.score < 80 ? 'あと少し' : 'いい感じです'], ['届いている案件', offers.length, ''], ['選考中', apps.filter((a) => a.status !== 'won').length, ''], ['今の状態', L.engStatus[e.status], '']])}
${ivs.length ? card('面談の予定', table(['日時', '案件', ''], ivs.map((iv) => [fmtDateTime(iv.scheduled_at), iv.title, html`<a class="btn small" href="/interviews/${iv.id}">面談対策の Q&A を見る</a>`]))) : ''}
${needFollow ? card('配属後のひとこと', html`<p>「${contract.title}」が始まりました。困りごとや相性など、短く教えてください。早めに気づけば手を打てます。</p><a class="btn small" href="/contracts/${contract.id}">記入する</a>`) : ''}
${unread ? card('運営からのメッセージ', html`<p>未読が ${unread} 件あります。</p><a class="btn small" href="/engineers/${eid}/messages">読む</a>`) : ''}
<div class="cols"><div>
${card('あなたに届いた案件', table(['案件', '相性', '金額', '開始', ''], offers.map((o) => [o.title, scoreBar(o.score), man(o.price), fmtDate(o.start_date), html`<a href="/cases/${o.case_id}">${o.status === 'sent' ? html`<b>新着</b>` : '開く'}</a>`]), 'いまは届いていません。経験票を充実させると、合う案件が届きやすくなります。'))}
${card('応募・選考', table(['案件', '状態', ''], apps.map((a) => [a.title, badge('appStatus', a.status), html`<a href="/applications/${a.id}">開く</a>`]), 'ありません。'))}
</div><div>
${card('スキルシートを良くするには', html`<div class="meter"><i style="width:${check.score}%"></i><b>${check.score}%</b></div><ul class="tips">${check.tips.slice(0, 5).map((t) => html`<li>${t}</li>`)}</ul>
<p><a class="btn small" href="/engineers/${eid}">経験票を編集</a> <a class="btn ghost small" href="/engineers/${eid}/sheet">スキルシートを見る</a> <a class="btn ghost small" href="/engineers/${eid}/messages">運営に見てもらう</a></p>`)}
</div></div>`, { wide: true });
  });

  app.get('/eg/offers', E, (ctx) => {
    const list = all(`SELECT o.*, c.title, c.price, c.start_date, c.status AS case_status FROM case_offers o JOIN cases c ON c.id = o.case_id WHERE o.engineer_id = ? ORDER BY o.sent_at DESC`, ctx.user.engineer_id);
    ctx.page('届いた案件', table(['案件', '相性', '合う点', '金額', '開始', '状態', ''], list.map((o) => [o.title, scoreBar(o.score), html`<small>${o.reasons}</small>`, man(o.price), fmtDate(o.start_date),
      o.case_status !== 'open' && o.status !== 'applied' ? html`<span class="muted">募集終了</span>` : badge('offerStatus', o.status), html`<a href="/cases/${o.case_id}">開く</a>`]), 'まだ届いていません。'), { wide: true });
  });

  app.get('/eg/applications', E, (ctx) => {
    const list = all(`SELECT a.*, c.title, (SELECT MIN(scheduled_at) FROM interviews iv WHERE iv.application_id = a.id AND iv.result = 'pending') AS next_iv
      FROM applications a JOIN cases c ON c.id = a.case_id WHERE a.engineer_id = ? ORDER BY a.updated_at DESC`, ctx.user.engineer_id);
    ctx.page('応募・面談', table(['案件', '状態', '次の面談', '応募日', ''], list.map((a) => [a.title, badge('appStatus', a.status), fmtDateTime(a.next_iv), fmtDate(a.applied_at), html`<a href="/applications/${a.id}">開く</a>`]), 'まだ応募はありません。'));
  });

  app.get('/eg/profile', E, (ctx) => ctx.redirect(`/engineers/${ctx.user.engineer_id}`));
  app.get('/eg/projects', E, (ctx) => ctx.redirect(`/engineers/${ctx.user.engineer_id}`));
  app.get('/eg/sheet', E, (ctx) => ctx.redirect(`/engineers/${ctx.user.engineer_id}/sheet`));
  app.get('/eg/messages', E, (ctx) => ctx.redirect(`/engineers/${ctx.user.engineer_id}/messages`));
};
