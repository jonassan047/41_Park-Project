'use strict';
// 動作確認：一時フォルダに見本データを入れて立ち上げ、3つの役割で主な画面と操作を一通りたどる
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'park-test-'));
process.env.PARK_DATA = dir;
execFileSync(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'scripts', 'seed.js')], { env: process.env, stdio: 'inherit' });
const { server } = require('../server');

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok  ', msg); else { failures++; console.log('  NG  ', msg); } };

class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  async req(method, p, form) {
    const headers = { Cookie: this.cookie };
    let body;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    const r = await fetch(this.base + p, { method, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const text = await r.text();
    return { status: r.status, text, location: r.headers.get('location') };
  }
  async csrf(p) { const r = await this.req('GET', p); const m = r.text.match(/name="_csrf" value="([^"]+)"/); return m && m[1]; }
  async post(p, form, from = p) { const t = await this.csrf(from); return this.req('POST', p, { _csrf: t, ...form }); }
  async login(email) { const r = await this.post('/login', { email, password: 'park1234' }); return r.status === 303; }
}

async function pages(c, list) {
  for (const p of list) {
    const r = await c.req('GET', p);
    ok(r.status === 200 && !r.text.includes('エラーが起きました'), `GET ${p} → ${r.status}`);
  }
}

server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const anon = new Client(base);
    await pages(anon, ['/', '/login', '/apply', '/forgot']);
    ok((await anon.req('GET', '/admin')).status === 303, '未ログインで /admin はログインへ');
    ok((await anon.post('/apply', { name: 'テスト SES', contact_name: '試験 一郎', email: 'new-ses@park.example', agree: '1' })).status === 200, 'SES の参加申込');
    ok((await anon.req('POST', '/apply', { _csrf: 'bad', name: 'x' })).status === 400, 'CSRF の不一致は弾く');

    console.log('運営');
    const ad = new Client(base);
    ok(await ad.login('admin@park.example'), 'ログイン');
    await pages(ad, ['/admin', '/admin/ses', '/admin/ses/1', '/admin/ses/4', '/admin/engineers', '/admin/cases', '/admin/cases?status=all', '/admin/applications', '/admin/contracts',
      '/admin/invoices', '/admin/messages', '/admin/mail', '/admin/mail/1', '/admin/reports', '/admin/settings', '/admin/audit', '/cases/1', '/cases/1?all=1', '/cases/2', '/cases/new',
      '/engineers/1', '/engineers/1/sheet', '/engineers/1/sheet?case=1&anon=1', '/engineers/1/skills', '/engineers/1/projects/new', '/engineers/2/messages',
      '/applications/1', '/applications/2', '/interviews/1', '/contracts/1', '/notifications', '/account', '/engineers/new']);
    let r = await ad.post('/admin/ses/4/approve', {}, '/admin/ses/4');
    ok(r.status === 303, 'SES の承認');
    r = await ad.post('/cases/import', { raw_text: '【案件名】在庫管理システム開発\n【単価】〜65万円\n【必須】Java、SQL\n【尚可】AWS\n【場所】リモート可\n【開始】12月〜\n【面談】1回' }, '/cases/new');
    ok(r.text.includes('在庫管理システム開発') && r.text.includes('65'), '案件メールの取り込み');
    r = await ad.post('/cases', { title: '在庫管理システム開発', price: '65', required_skills: 'Java、SQL', work_style: 'any', status: 'open' }, '/cases/new');
    ok(r.status === 303 && /\/cases\/\d+/.test(r.location), '案件の登録');
    const newCase = r.location.match(/\/cases\/(\d+)/)[1];
    r = await ad.req('GET', `/cases/${newCase}?all=1`);
    ok(r.text.includes('山田 太郎'), 'マッチングの候補に出る');
    r = await ad.post(`/cases/${newCase}/distribute`, { engineer_id: '4', message: 'どうぞ' }, `/cases/${newCase}`);
    ok(r.status === 303, '配信');
    r = await ad.post('/applications/1/status', { status: 'rejected', reason: '他の候補者で決定' }, '/applications/1');
    ok(r.status === 303, '見送り');
    r = await ad.post('/admin/invoices/build', { period: new Date().toISOString().slice(0, 7) }, '/admin/invoices');
    ok(r.status === 303, '請求書の作成');
    r = await ad.req('GET', '/invoices/1');
    ok(r.status === 200 && r.text.includes('ご請求書'), '請求書の表示');
    r = await ad.post('/admin/invoices/1/issue', {}, '/invoices/1');
    ok(r.status === 303, '請求書の発行');
    r = await ad.post('/admin/mail/broadcast', { target: 'ses', subject: 'お知らせ', body: 'テスト' }, '/admin/mail');
    ok(r.status === 303, '一斉配信');
    r = await ad.post('/contracts/1/extend', { months: '3' }, '/contracts/1');
    ok(r.status === 303, '契約の延長');

    console.log('SES');
    const se = new Client(base);
    ok(await se.login('ses1@park.example'), 'ログイン');
    await pages(se, ['/ses', '/ses/engineers', '/ses/cases', '/ses/cases?mine=1', '/ses/applications', '/ses/contracts', '/ses/invoices', '/ses/company', '/cases/1', '/engineers/1', '/engineers/new', '/cases/new']);
    ok((await se.req('GET', '/engineers/2')).status === 403, '他社のエンジニアは見られない');
    ok((await se.req('GET', '/admin')).status === 403, '運営の画面は見られない');
    r = await se.post('/engineers', { name: '新人 一郎', kana: 'しんじん いちろう', email: 'eg-new@park.example', years_exp: '1' }, '/engineers/new');
    ok(r.status === 303, 'エンジニアの登録（招待メール）');
    r = await se.post(`/cases/${newCase}/apply`, { engineer_id: '1', start_ok: '1', price_ok: '1', style_ok: '1' }, `/cases/${newCase}`);
    ok(r.status === 303 && r.location.startsWith('/applications/'), 'SES から応募を出す');
    r = await se.post(`/cases/${newCase}/apply`, { engineer_id: '1', start_ok: '1', price_ok: '1', style_ok: '1' }, `/cases/${newCase}`);
    ok(r.status === 303 && !r.location.startsWith('/applications/'), '二重応募は受け付けない');

    console.log('エンジニア');
    const eg = new Client(base);
    ok(await eg.login('eg2@park.example'), 'ログイン');
    await pages(eg, ['/eg', '/eg/offers', '/eg/applications', '/cases/2', '/engineers/2', '/engineers/2/sheet', '/engineers/2/messages', '/engineers/2/skills']);
    ok((await eg.req('GET', '/cases/1')).status === 403, '届いていない案件は見られない');
    ok((await eg.req('GET', '/engineers/1')).status === 403, '他人のプロフィールは見られない');
    r = await eg.post('/cases/2/apply', { start_ok: '1', price_ok: '1', style_ok: '1', condition_note: '' }, '/cases/2');
    ok(r.status === 303 && r.location.startsWith('/applications/'), '条件を確かめて応募');
    r = await eg.post('/engineers/2/projects', { title: '社内ツールの開発', tech: 'Vue、PHP', phases: ['実装', '単体テスト'], description: '社内の申請ツールを開発した。画面とAPIの両方を担当し、運用まで行った。', achievements: '申請の処理時間を半分に短縮' }, '/engineers/2/projects/new');
    ok(r.status === 303, '経験票に追加');
    r = await eg.post('/engineers/2/messages', { body: '見てください', review: '1' }, '/engineers/2/messages');
    ok(r.status === 303, '運営にメッセージ');
    r = await eg.req('GET', '/applications/1');
    ok(r.status === 403, '他人の応募は見られない');

    const egNew = new Client(base);
    const { get } = require('../src/db');
    const tok = get("SELECT token FROM users WHERE email = 'eg-new@park.example'").token;
    r = await egNew.post(`/invite/${tok}`, { password: 'abcd1234', password2: 'abcd1234', consent: '1' }, `/invite/${tok}`);
    ok(r.status === 303 && r.location === '/eg', '招待からパスワード設定・同意');

    const mails = get('SELECT COUNT(*) AS n FROM mail_outbox').n;
    ok(mails > 10, `メールが送信箱に入る（${mails}通）`);
  } catch (e) { failures++; console.error(e); }
  server.close();
  console.log(failures ? `\n${failures} 件 NG` : '\nすべて OK');
  process.exit(failures ? 1 : 0);
});
