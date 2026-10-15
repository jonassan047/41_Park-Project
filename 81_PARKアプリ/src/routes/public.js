'use strict';
// ログイン前の画面：トップ・ログイン・SES の参加申込・招待（パスワード設定）・パスワード再設定・最初の運営アカウント
const { get, run } = require('../db');
const { html, now, str } = require('../util');
const auth = require('../auth');
const { form, field, card } = require('../views');
const svc = require('../services');
const { queueMail, audit } = require('../mail');
const { setting } = require('../db');

const home = { admin: '/admin', ses: '/ses', eg: '/eg' };
// エンジニアが、まだ個人情報の取り扱いに同意していないか
const needConsent = (u) => u.role === 'eg' && u.engineer_id && !get('SELECT consent_at FROM engineers WHERE id = ?', u.engineer_id)?.consent_at;

module.exports = (app) => {
  app.get('/', null, (ctx) => {
    if (!get("SELECT id FROM users WHERE role = 'admin'")) return ctx.redirect('/setup');
    if (ctx.user) return ctx.redirect(home[ctx.user.role]);
    ctx.page('PARK', html`
<section class="hero"><h1>SES 企業のみなさまと、エンジニアが集う庭</h1>
<p>小さな SES 企業どうしが1つのグループにまとまり、届いた案件に、グループ全体のエンジニアからいちばん合う人を出します。<br>
いちばん大事にするのは、<b>エンジニアの成約率を上げること</b>です。</p>
<p><a class="btn" href="/apply">参加のお申し込み（SES 企業さま）</a> <a class="btn ghost" href="/login">ログイン</a></p></section>
<div class="grid3">
${card('1. 準備', html`<p>SES がエンジニアの基本情報を登録。エンジニアは運営とやり取りしながら、事実にもとづいた理想のスキルシートを作ります。</p>`)}
${card('2. 適材を判断して配信', html`<p>案件が届くと、条件に合うエンジニアを選んでメールで配信。SES にもお知らせします。二重応募はグループで一本化します。</p>`)}
${card('3. 面談サポート', html`<p>面談が決まると、案件に合わせた想定質問と答え方（Q&A）を用意。結果と理由をためて、次に活かします。</p>`)}
</div>
${card('費用（案）', html`<p>先払いはありません。<b>成約したときだけ</b>、案件の金額に対して初期費用 ${setting('fee_initial_rate')}%、契約が続く間は月額 ${setting('fee_monthly_rate')}% をいただきます。率・条件はご相談のうえ決めます。</p>`)}`, { noTitle: true });
  });

  // ---------- ログイン ----------
  const loginForm = (ctx, email = '', err = '') => ctx.page('ログイン', html`
${err ? html`<div class="flash bad">${err}</div>` : ''}
${card(null, form(ctx, '/login' + (ctx.query.next ? `?next=${encodeURIComponent(ctx.query.next)}` : ''), html`
${field('メールアドレス', 'email', email, { type: 'email', required: true, autocomplete: 'username' })}
${field('パスワード', 'password', '', { type: 'password', required: true, autocomplete: 'current-password' })}
<button class="btn">ログイン</button> <a href="/forgot">パスワードを忘れたとき</a>`, { cls: 'narrow' }))}`);
  app.get('/login', null, (ctx) => (ctx.user ? ctx.redirect(home[ctx.user.role]) : loginForm(ctx)));
  app.post('/login', null, (ctx) => {
    const email = str(ctx.body.email).toLowerCase();
    const u = get('SELECT * FROM users WHERE email = ? AND active = 1', email);
    if (!u || !auth.verifyPassword(ctx.body.password, u.password_hash)) return loginForm(ctx, email, 'メールアドレスかパスワードが違います。');
    if (u.role === 'ses') {
      const s = get('SELECT status FROM ses_companies WHERE id = ?', u.ses_id);
      if (!s || s.status !== 'active') return loginForm(ctx, email, '会社の参加がまだ承認されていないか、停止されています。');
    }
    ctx.relogin(auth.login(ctx.session, u.id));
    const next = ctx.query.next && ctx.query.next.startsWith('/') && !ctx.query.next.startsWith('//') ? ctx.query.next : home[u.role];
    ctx.redirect(next);
  });
  app.post('/logout', null, (ctx) => { auth.logout(ctx.session); ctx.setCookie = 'park_sid=; Path=/; Max-Age=0'; ctx.send(303, '', { Location: '/login' }); });

  // ---------- 最初の運営アカウント（運営が1人もいないときだけ） ----------
  app.get('/setup', null, (ctx) => {
    if (get("SELECT id FROM users WHERE role = 'admin'")) return ctx.redirect('/login');
    ctx.page('はじめの設定', html`<p>最初に、運営（システム管理者）のアカウントを作ります。</p>
${card(null, form(ctx, '/setup', html`${field('お名前', 'name', '', { required: true })}${field('メールアドレス', 'email', '', { type: 'email', required: true })}
${field('パスワード（8文字以上）', 'password', '', { type: 'password', required: true })}<button class="btn">作成する</button>`, { cls: 'narrow' }))}`);
  });
  app.post('/setup', null, (ctx) => {
    if (get("SELECT id FROM users WHERE role = 'admin'")) return ctx.redirect('/login');
    if (String(ctx.body.password || '').length < 8) return ctx.redirect('/setup', 'パスワードは8文字以上にしてください。', 'bad');
    const r = run("INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, 'admin', ?)", str(ctx.body.email).toLowerCase(), auth.hashPassword(ctx.body.password), str(ctx.body.name), now());
    ctx.relogin(auth.login(ctx.session, Number(r.lastInsertRowid)));
    ctx.redirect('/admin/settings', '運営のアカウントを作りました。まず設定（URL・メール）を確認してください。');
  });

  // ---------- SES の参加申込 ----------
  app.get('/apply', null, (ctx) => ctx.page('参加のお申し込み（SES 企業さま）', html`
<p>PARK は、SES 企業どうしが結束して、エンジニアの成約率を上げるための仕組みです。お申し込みのあと、運営が内容を確認してご連絡します。</p>
${card(null, form(ctx, '/apply', html`<div class="grid2">
${field('会社名', 'name', '', { required: true })}${field('代表者名', 'rep_name', '')}
${field('ご担当者名', 'contact_name', '', { required: true })}${field('メールアドレス', 'email', '', { type: 'email', required: true })}
${field('電話番号', 'phone', '', { type: 'tel' })}${field('所在地', 'address', '')}
${field('所属エンジニアの人数', 'employees', '', { type: 'number', min: 0 })}${field('得意な分野', 'strengths', '', { placeholder: '例：Java の業務系、インフラ' })}</div>
${field('ひとこと', 'message', '', { type: 'textarea', rows: 3 })}
${field('守秘義務を守り、案件・エンジニアの情報をグループの外に出さないことに同意します', 'agree', false, { type: 'checkbox', required: true })}
<button class="btn">申し込む</button>`))}`));
  app.post('/apply', null, (ctx) => {
    if (!str(ctx.body.name) || !str(ctx.body.email)) return ctx.redirect('/apply', '会社名とメールアドレスを入れてください。', 'bad');
    svc.applySes(ctx.body);
    ctx.page('お申し込みを受け付けました', html`<p>ありがとうございます。運営で内容を確認のうえ、ご連絡します。</p><p><a href="/">トップへ</a></p>`);
  });

  // ---------- 招待（パスワードの設定と、エンジニアの同意） ----------
  app.get('/invite/:token', null, (ctx) => {
    const u = auth.userByToken(ctx.params.token);
    if (!u) return ctx.page('リンクの期限切れ', html`<p>このリンクは使えません（期限切れか、使用済み）。運営またはご担当の SES にご連絡ください。</p>`);
    ctx.page('パスワードの設定', html`<p>${u.name} 様、PARK へようこそ。パスワードを設定してください。</p>
${card(null, form(ctx, `/invite/${ctx.params.token}`, html`
${field('パスワード（8文字以上）', 'password', '', { type: 'password', required: true, autocomplete: 'new-password' })}
${field('パスワード（確認）', 'password2', '', { type: 'password', required: true, autocomplete: 'new-password' })}
${needConsent(u) ? html`<div class="note"><b>個人情報の取り扱い</b><br>登録した経歴・スキルは、案件へのご提案（スキルシート）と面談の準備にだけ使います。
氏名はスキルシートではイニシャルで伏せることができます。外部のサービスには渡しません。事実と違う内容（盛った内容）は書きません。</div>
${field('上の取り扱いに同意します', 'consent', false, { type: 'checkbox', required: true })}` : ''}
<button class="btn">設定して始める</button>`, { cls: 'narrow' }))}`);
  });
  app.post('/invite/:token', null, (ctx) => {
    const u = auth.userByToken(ctx.params.token);
    if (!u) return ctx.redirect('/login', 'リンクの期限が切れています。', 'bad');
    const pw = String(ctx.body.password || '');
    if (pw.length < 8 || pw !== ctx.body.password2) return ctx.redirect(`/invite/${ctx.params.token}`, 'パスワードは8文字以上で、確認と同じにしてください。', 'bad');
    if (needConsent(u) && !ctx.body.consent) return ctx.redirect(`/invite/${ctx.params.token}`, '個人情報の取り扱いへの同意が必要です。', 'bad');
    run('UPDATE users SET password_hash = ?, token = NULL, token_expires = NULL WHERE id = ?', auth.hashPassword(pw), u.id);
    if (needConsent(u)) run('UPDATE engineers SET consent_at = ? WHERE id = ?', now(), u.engineer_id);
    audit(u.id, 'password-set', u.email);
    ctx.relogin(auth.login(ctx.session, u.id));
    ctx.redirect(home[u.role], u.role === 'eg' ? 'ようこそ。まずプロフィールと経験票を入れて、スキルシートを作りましょう。' : 'ようこそ。');
  });

  // ---------- パスワードを忘れたとき ----------
  app.get('/forgot', null, (ctx) => ctx.page('パスワードの再設定', card(null, form(ctx, '/forgot', html`<p>登録したメールアドレスに、再設定のリンクを送ります。</p>
${field('メールアドレス', 'email', '', { type: 'email', required: true })}<button class="btn">送る</button>`, { cls: 'narrow' }))));
  app.post('/forgot', null, (ctx) => {
    const u = get('SELECT * FROM users WHERE email = ? AND active = 1', str(ctx.body.email).toLowerCase());
    if (u) {
      const t = auth.issueUserToken(u.id, 1);
      queueMail(u.email, u.name, 'パスワードの再設定', `${u.name} 様\n\n次のリンクから、新しいパスワードを設定してください（24時間有効）。\n${setting('base_url')}/invite/${t}\n\n心当たりがない場合は、このメールを無視してください。`, 'reset');
    }
    ctx.page('メールを送りました', html`<p>登録があれば、再設定のリンクをメールで送りました。</p><p><a href="/login">ログインへ</a></p>`);
  });
};
