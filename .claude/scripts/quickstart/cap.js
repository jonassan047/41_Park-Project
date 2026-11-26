const { chromium } = require('playwright-core');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const B = 'http://127.0.0.1:8123';
const db = () => new DatabaseSync('m.sqlite');
const lastMail = (to, like) => { const d = db(); const r = d.prepare("select * from mail_outbox where to_email=? and subject like ? order by id desc limit 1").get(to, like); d.close(); return r; };
fs.mkdirSync('shots', { recursive: true });
const meta = {};
const SES = 'sato@example.com', PW = 'Sample-pass1';
(async () => {
  const br = await chromium.launch({ channel: 'chrome' });
  const ctx = async () => { const c = await br.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2, locale: 'ja-JP' }); const p = await c.newPage(); p.on('dialog', d => d.accept()); return p; };
  const flashes = async p => (await p.locator('.flash').allInnerTexts()).join(' / ');
  const submit = async (p, name) => { await Promise.all([p.waitForLoadState('load'), p.waitForNavigation(), p.getByRole('button', { name, exact: true }).first().click()]); console.log(name, '->', p.url(), await flashes(p)); };
  // shot: clip from top to the bottom of the last marked element (or given height)
  const shot = async (p, key, marks = [], height) => {
    const vw = p.viewportSize().width;
    await p.evaluate(() => window.scrollTo(0, 0));
    const boxes = [];
    for (const m of marks) { const b = await m.boundingBox(); if (!b) throw new Error('no box in ' + key); boxes.push(b); }
    const full = await p.evaluate(() => document.documentElement.scrollHeight);
    const h = Math.min(full, height || Math.max(560, ...boxes.map(b => b.y + b.height + 40)));
    await p.screenshot({ path: `shots/${key}.png`, fullPage: true, clip: { x: 0, y: 0, width: vw, height: h } });
    meta[key] = { w: vw, h, boxes };
  };
  const mail = async (p, key, m, markText) => {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const body = esc(m.body.split(B).join('https://www.jona.jp/park')).replace(/(https?:\/\/\S+)/g, '<a href="#">$1</a>');
    await p.setViewportSize({ width: 900, height: 400 });
    await p.setContent(`<body style="margin:0;font-family:'Yu Gothic UI',Meiryo;background:#fff;padding:24px;font-size:16px"><div style="border-bottom:1px solid #ccc;padding-bottom:12px"><div style="font-size:20px;font-weight:bold">${esc(m.subject)}</div><div style="color:#555">差出人：PARK 運営事務局　／　宛先：${esc(m.to_email)}</div></div><div style="white-space:pre-wrap;line-height:1.6;margin-top:12px">${body}</div></body>`);
    const h = await p.evaluate(() => document.body.scrollHeight);
    const boxes = markText ? [await p.locator('a').first().boundingBox()] : [];
    await p.screenshot({ path: `shots/${key}.png`, fullPage: true, clip: { x: 0, y: 0, width: 900, height: h } });
    meta[key] = { w: 900, h, boxes };
    await p.setViewportSize({ width: 1100, height: 760 });
  };

  const admin = await ctx();
  await admin.goto(B + '/setup');
  for (const [k, v] of Object.entries({ company_name: 'PARK運営', name_sei: '運営', name_mei: '管理', phone: '03-0000-0000', email: 'admin@example.com', password: PW })) await admin.fill(`[name=${k}]`, v);
  await submit(admin, '作成する');
  await admin.goto(B + '/admin/ses/new');
  for (const [k, v] of Object.entries({ name: 'サンプルシステム株式会社', rep_sei: '佐藤', rep_mei: '一郎', email: SES })) await admin.fill(`[name=${k}]`, v);
  await submit(admin, '仮登録してメールを送る');

  const inv = lastMail(SES, '%仮登録%');
  const mp = await ctx();
  await mail(mp, 's1-mail', inv, true);
  const url = inv.body.match(/https?:\/\/\S+\/invite\/\S+/)[0];

  const s = await ctx();
  await s.goto(url);
  const f = { phone: '03-1234-5678', postal_code: '100-0001', address: '東京都千代田区サンプル1-2-3', password: PW, password_confirmation: PW };
  for (const [k, v] of Object.entries(f)) await s.fill(`[name=${k}]`, v);
  await s.locator('input[type=checkbox]').last().check();
  const reg = s.getByRole('button', { name: '本登録する' });
  const crop = async (key, top, bottom, marks) => {
    await s.evaluate(() => window.scrollTo(0, 0));
    const bx = []; for (const m of marks) bx.push(await m.boundingBox());
    const t = (await top.boundingBox()).y - 36, bt = await bottom.boundingBox(), h = bt.y + bt.height + 24 - t;
    await s.screenshot({ path: `shots/${key}.png`, fullPage: true, clip: { x: 28, y: t, width: 460, height: h } });
    meta[key] = { w: 460, h, boxes: bx.map(r => ({ x: r.x - 28, y: r.y - t, width: r.width, height: r.height })) };
  };
  await crop('s1-form1', s.locator('[name=ses_name], [name=company_name], [name=name]').first(), s.locator('[name=kana_sei]'), [s.locator('[name=ses_name], [name=company_name], [name=name]').first(), s.locator('.pair').first()]);
  await crop('s1-form2', s.locator('[name=phone]'), reg, [s.locator('[name=phone]'), s.locator('[name=postal_code]'), s.locator('[name=address]'), s.locator('input[type=checkbox]').last(), s.locator('[name=password]'), reg]);
  await submit(s, '本登録する');

  const code = lastMail(SES, '%確認コード%');
  const num = code.subject.match(/\d{6}/)[0];
  await s.fill('input[name=code]', num);
  await shot(s, 's1-code', [s.locator('input[name=code]'), s.getByRole('button', { name: 'ログイン', exact: true })]);
  await mail(mp, 's1-codemail', code, false);
  await submit(s, 'ログイン');
  await shot(s, 's1-dash', [s.locator('a[href$="/ses/engineers"]').first()], 760);

  await s.goto(B + '/ses/engineers');
  const add = s.getByRole('link', { name: 'エンジニアを登録' }).first();
  await shot(s, 's2-list', [s.locator('a[href$="/ses/engineers"]').first(), add], 620);
  await add.click(); await s.waitForLoadState('load');
  await s.fill('[name=name_sei]', '山田'); await s.fill('[name=name_mei]', '太郎'); await s.fill('[name=email]', 'yamada@example.com');
  await s.fill('[name=intro]', '【推薦文】\n・Java（Spring Boot）の開発経験 5年。基本設計から結合テストまで担当。\n・SQL（Oracle、MySQL）3年以上。\n・AWS の運用経験 1年。\n・Git を使ったチーム開発。顧客との打ち合わせにも参加。');
  const send = s.getByRole('button', { name: '仮登録してメールを送る' });
  await shot(s, 's2-form', [s.locator('.pair').first(), s.locator('[name=email]'), s.locator('[name=intro]'), send]);
  await submit(s, '仮登録してメールを送る');
  await shot(s, 's2-done', [s.locator('.flash').first()], 760);
  await s.setViewportSize({ width: 1300, height: 760 });
  await s.goto(B + '/ses/engineers');
  await shot(s, 's2-after', [s.locator('td').filter({ hasText: '有効期限' }).first()], 500);
  await mail(mp, 's2-mail', lastMail('yamada@example.com', '%仮登録%'), true);
  fs.writeFileSync('meta.json', JSON.stringify(meta, null, 1));
  await br.close();
})().catch(e => { console.error(e.message); process.exit(1); });
