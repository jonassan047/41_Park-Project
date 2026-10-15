'use strict';
// どの役割でも使う画面：通知・アカウント。あわせて、役割ごとに見え方が変わる共通の画面（案件・エンジニア・選考）を読み込む
const { all, get, run } = require('../db');
const { html, now, str, fmtDateTime } = require('../util');
const auth = require('../auth');
const { form, field, card, table, postButton } = require('../views');

module.exports = (app) => {
  app.get('/notifications', '*', (ctx) => {
    const list = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 200', ctx.user.id);
    ctx.page('通知', html`
${list.some((n) => !n.read_at) ? postButton(ctx, '/notifications/read-all', 'すべて既読にする', { cls: 'ghost' }) : ''}
${table(['', '日時', '内容'], list.map((n) => [n.read_at ? '' : html`<span class="dot"></span>`, fmtDateTime(n.created_at),
    html`<a href="/notifications/${n.id}"><b>${n.title}</b></a><div class="muted clamp">${n.body}</div>`]), '通知はありません。')}`);
  });
  app.get('/notifications/:id', '*', (ctx) => {
    const n = get('SELECT * FROM notifications WHERE id = ? AND user_id = ?', ctx.params.id, ctx.user.id);
    if (!n) return ctx.notFound();
    run('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?', now(), n.id);
    ctx.redirect(n.link || '/notifications');
  });
  app.post('/notifications/read-all', '*', (ctx) => {
    run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), ctx.user.id);
    ctx.redirect('/notifications');
  });

  app.get('/account', '*', (ctx) => {
    const u = ctx.user;
    ctx.page('アカウント', html`<div class="grid2">
${card('基本', form(ctx, '/account', html`${field('お名前', 'name', u.name, { required: true })}
${field('メールでも通知を受け取る', 'mail_opt_in', u.mail_opt_in, { type: 'checkbox' })}
<p class="muted">メールアドレス：${u.email}（変えるときは運営にご連絡ください）</p><button class="btn">保存</button>`))}
${card('パスワードの変更', form(ctx, '/account/password', html`${field('今のパスワード', 'current', '', { type: 'password', required: true, autocomplete: 'current-password' })}
${field('新しいパスワード（8文字以上）', 'password', '', { type: 'password', required: true, autocomplete: 'new-password' })}
${field('新しいパスワード（確認）', 'password2', '', { type: 'password', required: true, autocomplete: 'new-password' })}<button class="btn">変更</button>`))}
</div>`);
  });
  app.post('/account', '*', (ctx) => {
    run('UPDATE users SET name = ?, mail_opt_in = ? WHERE id = ?', str(ctx.body.name) || ctx.user.name, ctx.body.mail_opt_in ? 1 : 0, ctx.user.id);
    ctx.redirect('/account', '保存しました。');
  });
  app.post('/account/password', '*', (ctx) => {
    if (!auth.verifyPassword(ctx.body.current, ctx.user.password_hash)) return ctx.redirect('/account', '今のパスワードが違います。', 'bad');
    if (String(ctx.body.password).length < 8 || ctx.body.password !== ctx.body.password2) return ctx.redirect('/account', '新しいパスワードは8文字以上で、確認と同じにしてください。', 'bad');
    run('UPDATE users SET password_hash = ? WHERE id = ?', auth.hashPassword(ctx.body.password), ctx.user.id);
    ctx.redirect('/account', 'パスワードを変えました。');
  });

  require('./cases')(app);
  require('./engineers')(app);
  require('./pipeline')(app);
};
