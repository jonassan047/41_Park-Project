// 4ページ版：画面と画面を矢印でつなぎ、「どこを押すと次の画面が出るか」を見せる
// 使い方：cap.js と login.js で shots/ と meta.json を作ってから node build3.js
const P = require('pptxgenjs');
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const meta = require('./meta.json');
const OUT = 'D:/Workspace/41_Park-Project/98_Outputs/SES用クイックスタート/2026-11-27-04-PARKクイックスタート-SES.pptx';
const DK = '214E37', LIGHT = 'E1F0E8', MID = '3D9465', RED = 'D62828', INK = '222222', F = 'Yu Gothic';
const R = (x, y, width, height) => ({ x, y, width, height });
const M = (k, i) => meta[k].boxes[i];

// 画面の切り抜き（CSS px）。marks: [箱, 'in'（入れる・見る）|'push'（押す）]
const crops = {
  hero:  { src: 'top', c: R(0, 0, 1100, 760), marks: [[R(1006, 20, 76, 24), 'in'], [R(74, 599, 316, 55), 'in'], [R(400, 599, 116, 55), 'in']] },
  walk:  { src: 'top', c: R(0, 770, 1100, 330), marks: [[R(18, 860, 521, 230), 'push', '押す → 2ページ']] },
  how:   { src: 'top', c: R(0, 1115, 1100, 430), marks: [] },
  sflow: { src: 'startpub', c: R(0, 385, 1100, 250), marks: [[R(18, 399, 527, 46), 'in'], [R(18, 452, 1064, 175), 'in']] },
  sdo:   { src: 'startpub', c: R(0, 640, 1100, 370), marks: [[R(423, 930, 126, 53), 'push']] },
  mail1: { src: 's1-mail', c: R(0, 0, 640, 262), marks: [[M('s1-mail', 0), 'push']] },
  form:  { src: 's1-form2', c: R(0, 435, 460, 280), marks: [[M('s1-form2', 3), 'in'], [M('s1-form2', 4), 'in'], [M('s1-form2', 5), 'push']] },
  code:  { src: 's1-code', c: R(0, 140, 560, 285), marks: [[M('s1-code', 0), 'in'], [M('s1-code', 1), 'push']] },
  dash1: { src: 's1-dash', c: R(0, 0, 720, 275), marks: [[R(18, 164, 690, 46), 'in']] },
  login: { src: 'login', c: R(0, 60, 560, 300), marks: [[M('login', 0), 'in'], [M('login', 1), 'in'], [M('login', 2), 'push']] },
  start: { src: 's1-start', c: R(0, 380, 1100, 640), marks: [[M('s1-start', 0), 'push']] },
  dash2: { src: 's1-dash', c: R(0, 0, 720, 275), marks: [[M('s1-dash', 0), 'push']] },
  list:  { src: 's2-list', c: R(380, 0, 720, 270), marks: [[M('s2-list', 1), 'push']] },
  eform: { src: 's2-form', c: R(0, 250, 1100, 530), marks: [[M('s2-form', 0), 'in'], [M('s2-form', 1), 'in'], [M('s2-form', 2), 'in'], [M('s2-form', 3), 'push']] },
  edone: { src: 's2-done', c: R(0, 145, 800, 205), marks: [[M('s2-done', 0), 'in']] },
  mail2: { src: 's2-mail', c: R(0, 0, 640, 262), marks: [[M('s2-mail', 0), 'push']] },
  after: { src: 's2-after', c: R(330, 255, 570, 195), marks: [[M('s2-after', 0), 'in'], [R(806, 313, 75, 28), 'push']] },
};

async function cut() {
  fs.mkdirSync('cuts', { recursive: true });
  const br = await chromium.launch({ channel: 'chrome' });
  const pg = await br.newPage();
  for (const [k, v] of Object.entries(crops)) {
    const b64 = fs.readFileSync(path.resolve('shots', v.src + '.png')).toString('base64');
    await pg.setViewportSize({ width: 800, height: 600 });
    await pg.setContent(`<body style="margin:0"><img src="data:image/png;base64,${b64}"></body>`);
    await pg.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
    const nat = await pg.evaluate(() => [document.images[0].naturalWidth, document.images[0].naturalHeight]);
    await pg.setViewportSize({ width: nat[0], height: nat[1] });
    const c = v.c, s = 2;
    await pg.screenshot({ path: `cuts/${k}.png`, clip: { x: c.x * s, y: c.y * s, width: Math.min(c.width * s, nat[0] - c.x * s), height: Math.min(c.height * s, nat[1] - c.y * s) } });
  }
  await br.close();
}

const p = new P();
p.defineLayout({ name: 'W', width: 13.333, height: 7.5 }); p.layout = 'W';
p.theme = { headFontFace: F, bodyFontFace: F };
const CW = 5.6, CH = 2.95, X = [0.35, 7.38], Y = [1.12, 4.38];

function header(s, no, title, lead) {
  s.background = { color: 'FFFFFF' };
  s.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.78, fill: { color: LIGHT } });
  s.addShape('roundRect', { x: 0.35, y: 0.14, w: 0.5, h: 0.5, rectRadius: 0.08, fill: { color: DK } });
  s.addText(String(no), { x: 0.35, y: 0.14, w: 0.5, h: 0.5, fontSize: 20, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
  s.addText(title, { x: 1.0, y: 0.06, w: 7.6, h: 0.66, fontSize: 24, bold: true, color: DK, valign: 'middle', fontFace: F, margin: 0 });
  s.addText('PARK クイックスタート（SES 企業さま向け）　' + no + ' / 6', { x: 8.6, y: 0.06, w: 4.4, h: 0.66, fontSize: 11, color: '555555', align: 'right', valign: 'middle', fontFace: F, margin: 0 });
  if (lead) s.addText(lead, { x: 0.35, y: 0.82, w: 12.6, h: 0.26, fontSize: 12, color: '444444', fontFace: F, margin: 0 });
}

// 画面のカード。n：番号、name：画面の名前、key：切り抜き、cap：説明
function card(s, pos, n, name, key, cap) {
  const [cx, cy] = pos, cr = crops[key];
  s.addShape('roundRect', { x: cx, y: cy, w: CW, h: CH, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: MID, width: 1.25 } });
  s.addShape('ellipse', { x: cx + 0.1, y: cy + 0.07, w: 0.32, h: 0.32, fill: { color: DK } });
  s.addText(String(n), { x: cx + 0.1, y: cy + 0.07, w: 0.32, h: 0.32, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
  s.addText(name, { x: cx + 0.5, y: cy + 0.04, w: CW - 0.6, h: 0.38, fontSize: 14, bold: true, color: DK, valign: 'middle', fontFace: F, margin: 0 });
  const A = { x: cx + 0.12, y: cy + 0.46, w: CW - 0.24 - 0.5, h: CH - 0.46 - 0.62 };
  const c = cr.c, k = Math.min(A.w / c.width, A.h / c.height), w = c.width * k, h = c.height * k, x = A.x + (A.w - w) / 2, y = A.y;
  s.addImage({ path: `cuts/${key}.png`, x, y, w, h });
  s.addShape('rect', { x, y, w, h, fill: { type: 'none' }, line: { color: 'BBBBBB', width: 0.5 } });
  for (let [b, kind, tag] of cr.marks) {
    { const l = Math.max(b.x, c.x + 4), r = Math.min(b.x + b.width, c.x + c.width - 4); b = { ...b, x: l, width: r - l }; }
    const x1 = x + (b.x - c.x - 3) * k, y1 = y + (b.y - c.y - 3) * k, bw = (b.width + 6) * k, bh = (b.height + 6) * k;
    s.addShape('rect', { x: x1, y: y1, w: bw, h: bh, fill: { type: 'none' }, line: { color: RED, width: kind === 'push' ? 2.5 : 1.25, dashType: kind === 'push' ? 'solid' : 'dash' } });
    if (kind === 'push') {
      const tw = tag ? 1.3 : 0.48, tx = Math.min(x1 + bw + 0.03, cx + CW - tw - 0.07);
      s.addShape('roundRect', { x: tx, y: y1 + bh / 2 - 0.13, w: tw, h: 0.26, rectRadius: 0.05, fill: { color: RED } });
      s.addText(tag || '押す', { x: tx, y: y1 + bh / 2 - 0.13, w: tw, h: 0.26, fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
    }
  }
  s.addText(cap, { x: cx + 0.15, y: cy + CH - 0.6, w: CW - 0.3, h: 0.55, fontSize: 11.5, color: INK, valign: 'middle', fontFace: F, margin: 0, lineSpacingMultiple: 1.05 });
}

// 横の矢印（左のカード → 右のカード）
function right(s, row, label, sub = '次の画面') {
  const y = Y[row] + CH / 2, x1 = X[0] + CW + 0.06, x2 = X[1] - 0.06;
  s.addText(label, { x: x1 - 0.05, y: y - 1.0, w: x2 - x1 + 0.1, h: 0.9, fontSize: 11, bold: true, color: RED, align: 'center', valign: 'bottom', fontFace: F, margin: 0 });
  s.addShape('line', { x: x1, y, w: x2 - x1, h: 0, line: { color: RED, width: 3, endArrowType: 'triangle' } });
  s.addText(sub, { x: x1, y: y + 0.08, w: x2 - x1, h: 0.3, fontSize: 9.5, color: '777777', align: 'center', fontFace: F, margin: 0 });
}
// 段の折り返し（右上のカード → 左下のカード）
function wrap(s, label, next = true) {
  const xr = X[1] + CW / 2, xl = X[0] + CW / 2, y0 = Y[0] + CH, ym = (Y[0] + CH + Y[1]) / 2, y1 = Y[1];
  const ln = { color: RED, width: 3 };
  s.addShape('line', { x: xr, y: y0, w: 0, h: ym - y0, line: ln });
  s.addShape('line', { x: xl, y: ym, w: xr - xl, h: 0, line: ln });
  s.addShape('line', { x: xl, y: ym, w: 0, h: y1 - ym, line: { ...ln, endArrowType: 'triangle' } });
  s.addText(label + (next ? '　→　次の画面' : ''), { x: (xl + xr) / 2 - 2.4, y: ym - 0.15, w: 4.8, h: 0.3, fontSize: 11, bold: true, color: RED, align: 'center', valign: 'middle', fill: { color: 'FFFFFF' }, fontFace: F, margin: 0 });
}
function note(s, pos, title, body) {
  const [cx, cy] = pos;
  s.addShape('roundRect', { x: cx, y: cy, w: CW, h: CH, rectRadius: 0.08, fill: { color: 'FFF4CE' }, line: { color: 'E0C060', width: 1 } });
  s.addText([{ text: title + '\n', options: { bold: true, fontSize: 14, color: DK } }, { text: body, options: { fontSize: 12.5, color: INK } }], { x: cx + 0.25, y: cy + 0.2, w: CW - 0.5, h: CH - 0.4, valign: 'top', fontFace: F, margin: 0, lineSpacingMultiple: 1.25 });
}

function build() {
  let s;
  // 1 トップページ
  s = p.addSlide();
  header(s, 1, 'トップページ', 'ブラウザで https://www.jona.jp/park/ を開くと、この画面が出ます。上から順に見ていきます。');
  card(s, [X[0], Y[0]], 1, 'トップページ（いちばん上）', 'hero', '参加がまだの会社は「参加のお申し込み」。参加済みなら「ログイン」（右上か中央。3・4 ページ）。');
  right(s, 0, '下へ進む\n（スクロール）', '同じ画面');
  card(s, [X[1], Y[0]], 2, 'PARK の歩き方', 'walk', '「SES 企業さま」を押すと、SES の仕事の流れが出ます（2 ページ）。');
  wrap(s, 'さらに下へ進む（スクロール）　→　同じ画面', false);
  card(s, [X[0], Y[1]], 3, 'PARK のしくみ・費用', 'how', '準備 → 適材を判断して配信 → 面談サポートの3つで支えます。費用は成約したときだけです。');
  note(s, [X[1], Y[1]], 'トップページのボタンの行き先', '・「SES 企業さま」→ SES の作業（2 ページ）\n・「ログイン」→ ログインの画面（4 ページ）\n・「参加のお申し込み」→ 申し込みの画面\n・「使い方」→ 使い方（マニュアル）');

  // 2 SES の作業
  s = p.addSlide();
  header(s, 2, 'SES の作業（仕事の流れ）', 'トップページの「SES 企業さま」を押すと出ます。2回目からは、ログインした直後にも出ます（4 ページ）。');
  card(s, [X[0], Y[0]], 1, '「ここからは SES の作業です」の画面', 'sflow', '①〜⑤ が仕事の流れです。明るい札が SES の担当、暗い札はエンジニア・管理者の担当です。');
  right(s, 0, '下へ進む\n（スクロール）', '同じ画面');
  card(s, [X[1], Y[0]], 2, 'SES でやること', 'sdo', 'SES の作業の一覧です。始めるときは下の「ログイン」を押します。');
  wrap(s, '「ログイン」を押す');
  card(s, [X[0], Y[1]], 3, 'ログインの画面', 'login', 'はじめての方は、先に招待メールから本登録します（3 ページ）。2回目からは 4 ページ。');
  note(s, [X[1], Y[1]], '① 〜 ⑤ の流れ', '① 登録・準備：エンジニアを登録（このあとの 5・6 ページ）\n② 案件の登録・案内：案件を登録し、エンジニアに案内\n③ 応募・確かめごと：エンジニアの返事を受け、書類を返す\n④ 面談：面談の依頼と結果の記録\n⑤ 成約・契約：成約の記録');

  // 1
  s = p.addSlide();
  header(s, 3, 'はじめての本登録（招待メールから）', '管理者が仮登録すると、代表の方にメールが届きます。そこから ①→②→③→④ の順に画面が進みます。');
  card(s, [X[0], Y[0]], 1, 'メール「仮登録のご案内」', 'mail1', 'メールを開き、本文のリンクを押します（7日以内）。');
  right(s, 0, 'リンクを押す');
  card(s, [X[1], Y[0]], 2, '本登録の画面', 'form', '上で会社名・氏名を確かめ、電話・郵便番号・住所を入れます。下へ進み、守秘義務にチェック、パスワードを2回入れます。');
  wrap(s, '「本登録する」を押す');
  card(s, [X[0], Y[1]], 3, '確認コードの画面', 'code', 'メールで届いた6桁の確認コード（10分間有効）を入れます。');
  right(s, 1, '「ログイン」を押す');
  card(s, [X[1], Y[1]], 4, 'ダッシュボード', 'dash1', '「本登録が完了しました」と出れば完了です。次からは 4 ページの方法でログインします。');

  // 2
  s = p.addSlide();
  header(s, 4, '2回目からのログイン', 'ブラウザで https://www.jona.jp/park/ を開き、右上の「ログイン」を押します。');
  card(s, [X[0], Y[0]], 1, 'ログインの画面', 'login', 'メールアドレスとパスワードを入れます。');
  right(s, 0, '「ログイン」を押す');
  card(s, [X[1], Y[0]], 2, '「ここからは SES の作業です」', 'start', '仕事の流れ ①〜⑤ が出ます（濃い札が SES の担当）。いちばん下のボタンを押します。');
  wrap(s, '「作業を始める（ダッシュボードへ）」を押す');
  card(s, [X[0], Y[1]], 3, 'ダッシュボード', 'dash2', 'ここが毎日の出発点です。エンジニアを登録するときは、上のメニューの「エンジニア一覧」を押します（5 ページ）。');
  note(s, [X[1], Y[1]], 'こんなときは', '・確認コードを聞かれるのは、はじめての本登録のときだけです。\n・パスワードを忘れたら、ログインの画面の「パスワードを忘れたとき」から。\n・作業をやめるときは、右上の「ログアウト」。');

  // 3
  s = p.addSlide();
  header(s, 5, 'エンジニアを仮登録する', '自社のエンジニアを登録すると、ご本人に本登録の案内メールが届きます。');
  card(s, [X[0], Y[0]], 1, 'ダッシュボード', 'dash2', '上のメニューの「エンジニア一覧」を押します。');
  right(s, 0, '「エンジニア一覧」を押す');
  card(s, [X[1], Y[0]], 2, 'エンジニア一覧', 'list', '右の「エンジニアを登録」を押します。');
  wrap(s, '「エンジニアを登録」を押す');
  card(s, [X[0], Y[1]], 3, 'エンジニアの登録画面', 'eform', '姓・名、ご本人のメールアドレスを入れます。推薦文を貼るとスキルが自動で入ります（任意。ご本人・他社には見えません）。');
  right(s, 1, '「仮登録してメールを送る」を押す');
  card(s, [X[1], Y[1]], 4, 'エンジニアの詳細', 'edone', '「仮登録し、ご本人に仮登録のご案内を送りました」と出れば完了です。次は 6 ページ。');

  // 4
  s = p.addSlide();
  header(s, 6, 'エンジニアの本登録を見届ける', 'ご本人が本登録を済ませるまで、そのエンジニアは案件の候補に出ません。');
  card(s, [X[0], Y[0]], 1, 'ご本人に届くメール', 'mail2', 'ご本人がリンクを押して本登録します（7日以内）。「PARK からメールが届きます」と一言伝えておくと確実です。');
  right(s, 0, 'ご本人が本登録');
  card(s, [X[1], Y[0]], 2, 'エンジニア一覧', 'after', '「アカウント」が「仮登録」なら、まだです。済むと「参加中」に変わります。届いていなければ「送り直し」を押します。');
  note(s, [X[0], Y[1]], '「状態」と「アカウント」の違い', '・「状態」は仕事の状態です（待機中・稼働中など）。\n・本登録が済んだかは「アカウント」の欄で見ます。\n・期限（7日）が切れたら「送り直し」で、新しいリンクが届きます。');
  note(s, [X[1], Y[1]], 'この次にやること', '・ご本人がスキルと経験を登録します。\n・そのあと、SES が案件を登録して、エンジニアに案内します。\n（続きの手順は、次の版で足します）');
}

(async () => { await cut(); build(); await p.writeFile({ fileName: OUT }); console.log('ok'); })().catch(e => { console.error(e); process.exit(1); });
