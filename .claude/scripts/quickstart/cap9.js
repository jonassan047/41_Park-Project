// S3 以降（-09）：cap.js のあとに動かす。shots/ と meta9.json を作る
const { chromium } = require('playwright-core');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const B = 'http://127.0.0.1:8123', PW = 'Sample-pass1', SES = 'sato@example.com', EG = 'yamada@example.com';
const RAW = `【案件名】受発注システムの改修（Java）
【単価】〜70万円（スキル見合い）
【必須】Java、Spring Boot、SQL
【尚可】AWS、Git
【場所】東京都港区（最寄り：品川）一部リモート
【開始】2027年1月〜長期
【面談】1回
【募集】1名`;
const STAGE = +(process.argv[2] || 99);
const q = (sql, ...a) => { const d = new DatabaseSync('m.sqlite'); const r = d.prepare(sql).get(...a); d.close(); return r; };
const lastMail = (to, like) => q("select * from mail_outbox where to_email=? and subject like ? order by id desc limit 1", to, like);
const meta = fs.existsSync('meta9.json') ? JSON.parse(fs.readFileSync('meta9.json')) : {};
const save = () => fs.writeFileSync('meta9.json', JSON.stringify(meta, null, 1));
(async () => {
  const br = await chromium.launch({ channel: 'chrome' });
  const ctx = async (w = 1100) => { const c = await br.newContext({ viewport: { width: w, height: 760 }, deviceScaleFactor: 2, locale: 'ja-JP' }); const p = await c.newPage(); p.on('dialog', d => d.accept()); return p; };
  const flashes = async p => (await p.locator('.flash').allInnerTexts()).join(' / ');
  const click = async (p, loc) => { await Promise.all([p.waitForNavigation(), loc.click()]); await p.waitForLoadState('load'); console.log('->', p.url(), await flashes(p)); };
  const submit = (p, name) => click(p, p.getByRole('button', { name, exact: true }).first());
  // 画面を撮る。marks は Locator。top〜height（CSS px）を撮る
  const shot = async (p, key, marks = [], height, top = 0) => {
    const vw = p.viewportSize().width; await p.evaluate(() => window.scrollTo(0, 0));
    const boxes = []; for (const m of marks) { const b = await m.boundingBox(); if (!b) throw new Error('no box ' + key + ' ' + m); boxes.push({ ...b, y: b.y - top }); }
    const full = await p.evaluate(() => document.documentElement.scrollHeight);
    const h = Math.min(full - top, height || Math.max(560, ...boxes.map(b => b.y + b.height + 40)));
    await p.screenshot({ path: `shots/${key}.png`, fullPage: true, clip: { x: 0, y: top, width: vw, height: h } });
    meta[key] = { w: vw, h, boxes }; save(); console.log('shot', key, h, JSON.stringify(boxes.map(b => [b.x, b.y, b.width, b.height].map(Math.round))));
  };
  // ページ全体を撮る（箱はページの座標）
  const full = async (p, key, marks = []) => {
    const vw = p.viewportSize().width; await p.evaluate(() => window.scrollTo(0, 0));
    const boxes = []; for (const m of marks) { const b = await m.boundingBox(); if (!b) throw new Error('no box ' + key); boxes.push(b); }
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.screenshot({ path: `shots/${key}.png`, fullPage: true });
    meta[key] = { w: vw, h, boxes }; save(); console.log('full', key, h, JSON.stringify(boxes.map(b => [b.x, b.y, b.width, b.height].map(Math.round))));
  };
  const mail = async (p, key, m, linkText) => {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const body = esc(m.body.split(B).join('https://www.jona.jp/park')).replace(/(https?:\/\/\S+)/g, '<a href="#">$1</a>');
    await p.setViewportSize({ width: 900, height: 400 });
    await p.setContent(`<body style="margin:0;font-family:'Yu Gothic UI',Meiryo;background:#fff;padding:24px;font-size:16px"><div style="border-bottom:1px solid #ccc;padding-bottom:12px"><div style="font-size:20px;font-weight:bold">${esc(m.subject)}</div><div style="color:#555">差出人：${esc(m.from_name || 'PARK 運営事務局')}　／　宛先：${esc(m.to_email)}</div></div><div style="white-space:pre-wrap;line-height:1.6;margin-top:12px">${body}</div></body>`);
    const h = await p.evaluate(() => document.body.scrollHeight);
    const boxes = []; if (linkText) for (const t of [].concat(linkText)) { const l = p.locator('a').nth(t); boxes.push(await l.boundingBox()); }
    await p.screenshot({ path: `shots/${key}.png`, fullPage: true, clip: { x: 0, y: 0, width: 900, height: h } });
    meta[key] = { w: 900, h, boxes }; save(); console.log('mail', key, h, JSON.stringify(boxes));
  };
  const login = async (p, email) => { await p.goto(B + '/login'); await p.fill('[name=email]', email); await p.fill('[name=password]', PW); await click(p, p.getByRole('button', { name: 'ログイン', exact: true })); if (p.url().includes('/start/')) await click(p, p.getByRole('link', { name: /作業を始める/ }).or(p.getByRole('button', { name: /作業を始める/ })).first()); };

  // ---- E1：エンジニアの本登録（撮らない）
  if (STAGE >= 1 && !q("select 1 x from users where email=? and password is not null and password<>''", EG)) {
    const e = await ctx(); const inv = lastMail(EG, '%仮登録%');
    await e.goto(inv.body.match(/https?:\/\/\S+\/invite\/\S+/)[0]);
    for (const [k, v] of Object.entries({ kana_sei: 'やまだ', kana_mei: 'たろう', phone: '090-1234-5678', postal_code: '150-0001', address: '東京都渋谷区サンプル4-5-6', password: PW, password_confirmation: PW })) await e.fill(`[name=${k}]`, v);
    await e.locator('[name=consent]').check(); await submit(e, '本登録する');
    const code = lastMail(EG, '%確認コード%'); await e.fill('input[name=code]', code.subject.match(/\d{6}/)[0]); await submit(e, 'ログイン');
  }
  const s = await ctx(); await login(s, SES);
  // ---- S3 準備の確認
  if (STAGE >= 3) {
    await s.setViewportSize({ width: 1300, height: 760 });
    await s.goto(B + '/ses/engineers');
    await shot(s, 's3-list', [s.locator('td').filter({ hasText: '参加中' }).first(), s.locator('td').filter({ hasText: 'Spring Boot' }).first()], 420);
    await s.setViewportSize({ width: 1100, height: 760 });
    await s.goto(B + '/engineers/1');
    const sk = s.locator('h2', { hasText: 'スキル' }).first();
    const sb = await sk.boundingBox();
    await shot(s, 's3-skill', [sk, s.getByRole('link', { name: 'スキルを登録・編集' })], 420, Math.max(0, Math.round(sb.y) - 30));
  }
  // ---- S4 プロバイダーの登録
  if (STAGE >= 4 && !q('select 1 x from providers')) {
    await s.goto(B + '/ses/providers');
    const nb = s.getByRole('link', { name: /プロバイダーを登録/ }).first();
    await shot(s, 's4-list', [s.locator('a[href$="/ses/providers"]').first(), nb], 420);
    await click(s, nb);
    for (const [k, v] of Object.entries({ name: 'サンプルソフト株式会社', sei: '鈴木', mei: '花子', email: 'suzuki@provider.example.com', phone: '03-9876-5432' })) await s.fill(`[name=${k}]`, v);
    await shot(s, 's4-form', [s.locator('[name=name]'), s.locator('[name=sei]'), s.locator('[name=email]'), s.getByRole('button', { name: '登録する' })]);
    await submit(s, '登録する');
    await shot(s, 's4-done', [s.locator('.flash').first()], 420);
  }
  // ---- S5 案件の登録（案件メールから取り込む）
  if (STAGE >= 5 && !q('select 1 x from cases')) {
    await s.goto(B + '/ses/cases');
    const nb = s.getByRole('link', { name: /案件を登録/ }).first();
    await shot(s, 's5-list', [s.locator('a[href$="/ses/cases"]').first(), nb], 420);
    await click(s, nb);
    await s.fill('[name=raw_text]', RAW);
    await shot(s, 's5-import', [s.locator('[name=raw_text]').first(), s.getByRole('button', { name: '取り込む' })]);
    await submit(s, '取り込む');
    await s.selectOption('[name=provider_id]', { index: 1 });
    await s.selectOption('[name=status]', { label: '募集中' }).catch(() => {});
    const top = Math.round((await s.locator('h2', { hasText: '案件票' }).boundingBox()).y) - 30;
    await shot(s, 's5-form', [s.locator('[name=provider_id]'), s.locator('[name=title]'), s.locator('[name=price]'), s.locator('[name=required_skills]')], 700, top);
    const reg = s.getByRole('button', { name: '登録する' });
    await reg.scrollIntoViewIfNeeded();
    await submit(s, '登録する');
    await shot(s, 's5-done', [s.locator('.flash').first()], 760);
  }
  const dump = async p => console.log(await p.evaluate(() => [...document.querySelectorAll('h1,h2,h3,input:not([type=hidden]),select,textarea,button,a.btn')].map(e => e.tagName + ' ' + (e.name || '') + ' | ' + (e.innerText || e.value || '').trim().slice(0, 50).replace(/\n/g, ' ')).join('\n')));
  // ---- S6 エンジニアを検索
  if (STAGE >= 6 && !q('select 1 x from case_mails')) {
    await s.goto(B + '/cases/1');
    const go = s.getByRole('button', { name: 'エンジニアを検索', exact: true });
    const h2 = s.locator('h2', { hasText: 'エンジニアを検索' }); const t6 = Math.round((await h2.boundingBox()).y) - 30;
    await shot(s, 's6-kw', [s.locator('[name="on[req][]"]').first(), go], 900, t6);
    meta['s6-kw'].x = 640;
    await click(s, go);
    await dump(s);
    await s.screenshot({ path: 'shots/_s6-result.png', fullPage: true });
    if (STAGE >= 7) {
      const mk = s.getByRole('button', { name: /エンジニア・担当者へメールを作成/ }).or(s.getByRole('link', { name: /エンジニア・担当者へメールを作成/ })).first();
      await shot(s, 's6-pick', [s.locator('table').first(), mk], 900);
      await click(s, mk);
      await s.screenshot({ path: 'shots/_s7-form.png', fullPage: true });
      const body = await s.inputValue('[name=body]');
      await s.fill('[name=body]', body.replace(/■単価：.*/, '■単価：60万円'));
      const sendB = s.getByRole('button', { name: 'エンジニアへメールを送信' });
      await full(s, 's7-form', [s.locator('[name=subject]'), s.locator('[name=body]'), sendB]);
      await click(s, sendB);
      await full(s, 's7-done', [s.locator('.flash').first()]);
      await dump(s);
    }
  }
  // ---- E3 エンジニアの返事
  if (STAGE >= 8) {
    const m = lastMail(EG, '%案件のご案内%');
    const mp = await ctx(); await mail(mp, 'e3-mail', m, [0]);
    if (!q("select 1 x from case_mails where reply='interested'")) {
      const e = await ctx(); await login(e, EG);
      await e.goto(m.body.match(/https?:\/\/\S+\/interested/)[0]); await e.waitForLoadState('load');
      await full(e, 'e3-page'); await dump(e);
      await e.locator('[name=note]').fill('ぜひ応募したいです。1月から参画できます。'); const btn = e.getByRole('button', { name: 'この内容で返事をする' });
      if (await btn.count()) { await full(e, 'e3-page', [e.locator('[name=answer]'), e.locator('[name=note]'), btn]); await click(e, btn); await full(e, 'e3-done'); await dump(e); }
    }
  }
  // ---- S8 応募を確定させる
  if (STAGE >= 9 && !q("select 1 x from provider_mails where status='sent'")) {
    await s.goto(B + '/cases/1'); await s.waitForLoadState('load');
    const mc = s.locator('h2', { hasText: '案内済メール' });
    await mc.scrollIntoViewIfNeeded();
    const ap = s.locator('#mails').locator('xpath=ancestor::*[contains(@class,"card")][1]').getByRole('link', { name: '応募する' }).or(s.getByRole('button', { name: '応募する', exact: true })).first();
    await full(s, 's8-case', [mc, ap]);
    await click(s, ap);
    await dump(s);
    const cf = s.getByRole('link', { name: '応募を確定させる' }).or(s.getByRole('button', { name: '応募を確定させる' })).first();
    await full(s, 's8-app', [cf]);
    await click(s, cf);
    const sb = s.getByRole('button', { name: '送信', exact: true });
    await full(s, 's8-pm', [s.locator('[name=body]'), sb]);
    await click(s, sb);
    await full(s, 's8-sent', [s.locator('.flash').first()]); await dump(s);
  }
  // ---- S9 書類を自分のメールで送る ／ S10 合否
  if (STAGE >= 10) {
    await s.goto(B + '/cases/1'); await s.waitForLoadState('load');
    const doc = s.getByRole('link', { name: '業務経歴書（名前を伏せる）' }).first();
    await full(s, 's9-case', [s.locator('h2', { hasText: '案内済メール' }), s.getByRole('link', { name: '履歴書', exact: true }).first(), doc]);
    await dump(s);
    await s.goto(B + '/applications/1'); await s.waitForLoadState('load');
    await full(s, 's9-app'); await dump(s);
    await s.goto(B + '/provider-mails/1'); await s.waitForLoadState('load');
    if (!q("select 1 x from case_mails where result='passed'")) {
      await s.selectOption('#result [name=result]', 'passed').catch(async () => s.locator('select[name=result]').first().selectOption({ label: '合格' }));
      await s.locator('#result [name=note]').fill('書類選考を通過。面談の日程は追って').catch(() => {});
      const rb = s.locator('#result').getByRole('button', { name: '登録' });
      await full(s, 's10-pm', [s.locator('#result [name=result]'), s.locator('#result [name=note]'), rb]);
      await click(s, rb);
      await full(s, 's10-done', [s.locator('.flash').first()]);
    }
    await s.goto(B + '/cases/1'); await s.waitForLoadState('load');
    await full(s, 's10-case', [s.locator('h2', { hasText: '案内済メール' })]);
  }
  await br.close();
})().catch(e => { console.error(e.message); process.exit(1); });
