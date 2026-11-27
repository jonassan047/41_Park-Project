// 4ページ版：画面と画面を矢印でつなぎ、「どこを押すと次の画面が出るか」を見せる
// 使い方：cap.js と login.js で shots/ と meta.json を作ってから node build3.js
const P = require('pptxgenjs');
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const meta = require('./meta.json');
const OUT = 'D:/Workspace/41_Park-Project/98_Outputs/SES用クイックスタート/2026-11-27-07-PARKクイックスタート-SES.pptx';
const DK = '214E37', LIGHT = 'E1F0E8', MID = '3D9465', RED = 'D62828', INK = '222222', F = 'Yu Gothic';
const R = (x, y, width, height) => ({ x, y, width, height });
const M = (k, i) => meta[k].boxes[i];

// 画面の切り抜き（CSS px）。marks: [箱, 'in'（入れる・見る）|'push'（押す）]
const crops = {
  hero:  { src: 'top', c: R(0, 0, 1100, 760), marks: [[R(1006, 20, 76, 24), 'in'], [R(74, 599, 316, 55), 'in'], [R(400, 599, 116, 55), 'in']] },
  walk:  { src: 'top', c: R(0, 856, 1100, 238), marks: [] },
  how:   { src: 'top', c: R(0, 1115, 1100, 430), marks: [] },
  sflow: { src: 'startpub', c: R(0, 392, 1100, 238), marks: [] },
  menu:  { src: 's1-dash', c: R(0, 0, 1100, 150), marks: [] },
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
const TOTAL = 5, CW = 5.6, CH = 2.95, X = [0.35, 7.38], Y = [1.12, 4.38];
const WHO = { '全員': '3D9465', 'SES': 'B5651D' };

// 「対象」の札と若芽のアイコン（右端。TEZZO のタイトル行.jpg の並び：題 … ページ番号・対象・アイコン）
function tag(s, x, y, who, dark) {
  s.addShape('roundRect', { x, y: y + 0.12, w: 1.3, h: 0.38, rectRadius: 0.19, fill: { color: WHO[who] }, line: { color: 'FFFFFF', width: dark ? 1 : 0 } });
  s.addText('対象：' + who, { x, y: y + 0.12, w: 1.3, h: 0.38, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
  if (dark) s.addShape('ellipse', { x: x + 1.36, y: y - 0.04, w: 0.7, h: 0.7, fill: { color: 'FFFFFF' } });
  s.addImage({ path: 'sprout.png', x: x + 1.4, y, w: 0.62, h: 0.62 });
}
function header(s, no, who, title, lead) {
  s.background = { color: 'FFFFFF' };
  s.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.78, fill: { color: LIGHT } });
  s.addShape('roundRect', { x: 0.35, y: 0.14, w: 0.5, h: 0.5, rectRadius: 0.08, fill: { color: DK } });
  s.addText(String(no), { x: 0.35, y: 0.14, w: 0.5, h: 0.5, fontSize: 20, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
  s.addText(title, { x: 1.0, y: 0.06, w: 6.6, h: 0.66, fontSize: 24, bold: true, color: DK, valign: 'middle', fontFace: F, margin: 0 });
  s.addText('PARK システム・クイックスタート　' + no + ' / ' + TOTAL, { x: 7.2, y: 0.06, w: 3.7, h: 0.66, fontSize: 11, color: '555555', align: 'right', valign: 'middle', fontFace: F, margin: 0 });
  tag(s, 11.05, 0.08, who);
  if (lead) s.addText(lead, { x: 0.35, y: 0.82, w: 12.6, h: 0.26, fontSize: 12, color: '444444', fontFace: F, margin: 0 });
}

// 画面のカード。sz：{w, h, capH, fs, tagRoom}。戻り値：画像の位置と倍率（上に描き足すとき用）
function card(s, pos, n, name, key, cap, sz = {}) {
  const W = sz.w || CW, H = sz.h || CH, capH = sz.capH || 0.62, fs = sz.fs || 11.5;
  const [cx, cy] = pos, cr = crops[key];
  s.addShape('roundRect', { x: cx, y: cy, w: W, h: H, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: MID, width: 1.25 } });
  s.addShape('ellipse', { x: cx + 0.1, y: cy + 0.07, w: 0.32, h: 0.32, fill: { color: DK } });
  s.addText(String(n), { x: cx + 0.1, y: cy + 0.07, w: 0.32, h: 0.32, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
  s.addText(name, { x: cx + 0.5, y: cy + 0.04, w: W - 0.6, h: 0.38, fontSize: 14, bold: true, color: DK, valign: 'middle', fontFace: F, margin: 0 });
  const A = { x: cx + 0.12, y: cy + 0.46, w: W - 0.24 - (sz.tagRoom ?? 0.5), h: H - 0.46 - capH };
  const c = cr.c, k = Math.min(A.w / c.width, A.h / c.height), w = c.width * k, h = c.height * k, x = A.x + (A.w - w) / 2, y = A.y;
  s.addImage({ path: `cuts/${key}.png`, x, y, w, h });
  s.addShape('rect', { x, y, w, h, fill: { type: 'none' }, line: { color: 'BBBBBB', width: 0.5 } });
  for (let [b, kind, tg] of cr.marks) {
    { const l = Math.max(b.x, c.x + 4), r = Math.min(b.x + b.width, c.x + c.width - 4); b = { ...b, x: l, width: r - l }; }
    const x1 = x + (b.x - c.x - 3) * k, y1 = y + (b.y - c.y - 3) * k, bw = (b.width + 6) * k, bh = (b.height + 6) * k;
    s.addShape('rect', { x: x1, y: y1, w: bw, h: bh, fill: { type: 'none' }, line: { color: RED, width: kind === 'push' ? 2.5 : 1.25, dashType: kind === 'push' ? 'solid' : 'dash' } });
    if (kind === 'push') {
      const tw = tg ? 1.0 : 0.48, up = tg && tg.includes('↓'), tx = up ? x1 + bw / 2 - tw / 2 : Math.min(x1 + bw + 0.03, cx + W - tw - 0.07), ty = up ? y1 - 0.3 : y1 + bh / 2 - 0.13;
      s.addShape('roundRect', { x: tx, y: ty, w: tw, h: 0.26, rectRadius: 0.05, fill: { color: RED } });
      s.addText(tg || '押す', { x: tx, y: ty, w: tw, h: 0.26, fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
    }
  }
  s.addText(cap, { x: cx + 0.15, y: cy + H - capH + 0.02, w: W - 0.3, h: capH - 0.07, fontSize: fs, color: INK, valign: 'middle', fontFace: F, margin: 0, lineSpacingMultiple: 1.05 });
  return { x, y, k, c };
}
// 横の矢印（x1 → x2、高さ y）
function arrowH(s, x1, x2, y, label, sub = '次の画面', fs = 11) {
  s.addText(label, { x: x1 - 0.05, y: y - 1.0, w: x2 - x1 + 0.1, h: 0.9, fontSize: fs, bold: true, color: RED, align: 'center', valign: 'bottom', fontFace: F, margin: 0 });
  s.addShape('line', { x: x1, y, w: x2 - x1, h: 0, line: { color: RED, width: 3, endArrowType: 'triangle' } });
  if (sub) s.addText(sub, { x: x1 - 0.05, y: y + 0.08, w: x2 - x1 + 0.1, h: 0.3, fontSize: 9, color: '777777', align: 'center', fontFace: F, margin: 0 });
}
const right = (s, row, label, sub) => arrowH(s, X[0] + CW + 0.06, X[1] - 0.06, Y[row] + CH / 2, label, sub);
// 折り返し（右上 xr,y0 → 左下 xl,y1）
function wrapAt(s, xr, xl, y0, y1, label) {
  const ym = (y0 + y1) / 2, ln = { color: RED, width: 3 };
  s.addShape('line', { x: xr, y: y0, w: 0, h: ym - y0, line: ln });
  s.addShape('line', { x: xl, y: ym, w: xr - xl, h: 0, line: ln });
  s.addShape('line', { x: xl, y: ym, w: 0, h: y1 - ym, line: { ...ln, endArrowType: 'triangle' } });
  s.addText(label, { x: (xl + xr) / 2 - 2.6, y: ym - 0.15, w: 5.2, h: 0.3, fontSize: 11, bold: true, color: RED, align: 'center', valign: 'middle', fill: { color: 'FFFFFF' }, fontFace: F, margin: 0 });
}
const wrap = (s, label) => wrapAt(s, X[1] + CW / 2, X[0] + CW / 2, Y[0] + CH, Y[1], label + '　→　次の画面');

function build() {
  let s;
  // 1 表紙（トップページのデザイン）
  s = p.addSlide();
  s.background = { path: 'cover.png' };
  tag(s, 11.0, 0.25, '全員', true);

  // 2 PARK システムの流れ：上に「PARK の歩き方」、下に流れ。画像はどちらもカードの幅いっぱい（TEZZO が上の段で合わせた形）
  s = p.addSlide();
  header(s, 2, '全員', 'PARK システムの流れ');
  const IW = 11.8, IX = 0.35 + (12.6 - IW) / 2, kk = IW / 1100, IH = 238 * kk, CH2 = 0.44 + IH + 0.1;
  const row = (y, n, name, cap, key) => {
    s.addShape('roundRect', { x: 0.35, y, w: 12.6, h: CH2, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: MID, width: 1.25 } });
    s.addShape('ellipse', { x: IX, y: y + 0.07, w: 0.32, h: 0.32, fill: { color: DK } });
    s.addText(String(n), { x: IX, y: y + 0.07, w: 0.32, h: 0.32, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
    s.addText([{ text: name, options: { fontSize: 14, bold: true, color: DK } }, { text: '　' + cap, options: { fontSize: 11, color: INK } }], { x: IX + 0.42, y: y + 0.04, w: IW - 0.42, h: 0.38, valign: 'middle', fontFace: F, margin: 0 });
    const iy = y + 0.44, c = crops[key].c;
    s.addImage({ path: `cuts/${key}.png`, x: IX, y: iy, w: IW, h: IH });
    s.addShape('rect', { x: IX, y: iy, w: IW, h: IH, fill: { type: 'none' }, line: { color: 'BBBBBB', width: 0.5 } });
    return { px: v => IX + (v - c.x) * kk, py: v => iy + (v - c.y) * kk };
  };
  const y1 = 0.9, y2 = y1 + CH2 + 0.28;
  const t = row(y1, 1, 'トップページ「PARK の歩き方」', '自分の立場のカードを押します。SES は「SES 企業さま」、エンジニアは「エンジニアのみなさま」です。', 'walk');
  // 押す所（SES 企業さまのカード）
  const bx1 = t.px(18) - 0.03, by1 = t.py(860) - 0.03, bw1 = 521 * kk + 0.06, bh1 = 230 * kk + 0.06;
  s.addShape('rect', { x: bx1, y: by1, w: bw1, h: bh1, fill: { type: 'none' }, line: { color: RED, width: 2.5 } });
  s.addShape('roundRect', { x: bx1 + bw1 - 1.1, y: by1 + 0.1, w: 1.0, h: 0.3, rectRadius: 0.05, fill: { color: RED } });
  s.addText('押す ↓', { x: bx1 + bw1 - 1.1, y: by1 + 0.1, w: 1.0, h: 0.3, fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
  // 段の間の矢印（押すカードの真下から）
  const ax = bx1 + bw1 / 2;
  s.addShape('line', { x: ax, y: y1 + CH2, w: 0, h: y2 - y1 - CH2, line: { color: RED, width: 3, endArrowType: 'triangle' } });
  s.addText('「SES 企業さま」を押す　→　次の画面', { x: ax + 0.2, y: y1 + CH2, w: 5, h: y2 - y1 - CH2, fontSize: 11, bold: true, color: RED, valign: 'middle', fontFace: F, margin: 0 });
  const g = row(y2, 2, 'PARK システムの流れ', '①〜⑤ が仕事の流れです。上の帯は、だれの作業かを表します。明るい札が SES の担当です。', 'sflow');
  // 上の帯を描き直す：①② SES の作業、③〜④の半分 エンジニアの作業、④の半分〜⑤ エンジニア / SES の作業
  s.addShape('rect', { x: g.px(4), y: g.py(392), w: g.px(1096) - g.px(4), h: g.py(448) - g.py(392), fill: { color: 'EEF6F1' }, line: { type: 'none' } });
  for (const [l, r, txt, fill, col, line] of [[18, 437, 'SES の作業', DK, 'FFFFFF', DK], [448, 760, 'エンジニアの作業', 'FFFFFF', DK, MID], [770, 1080, 'エンジニア / SES の作業', MID, 'FFFFFF', MID]]) {
    s.addShape('roundRect', { x: g.px(l), y: g.py(400), w: g.px(r) - g.px(l), h: g.py(444) - g.py(400), rectRadius: 0.12, fill: { color: fill }, line: { color: line, width: 1.25 } });
    s.addText(txt, { x: g.px(l), y: g.py(400), w: g.px(r) - g.px(l), h: g.py(444) - g.py(400), fontSize: 13, bold: true, color: col, align: 'center', valign: 'middle', fontFace: F, margin: 0 });
  }

  // 3 はじめての本登録（-04 の 3 ページ）
  s = p.addSlide();
  header(s, 3, '全員', 'はじめての本登録（招待メールから）', '仮登録されると、ご本人にメールが届きます。そこから ①→②→③→④ の順に画面が進みます（画面は SES の例）。');
  card(s, [X[0], Y[0]], 1, 'メール「仮登録のご案内」', 'mail1', 'メールを開き、本文のリンクを押します（7日以内）。');
  right(s, 0, 'リンクを押す');
  card(s, [X[1], Y[0]], 2, '本登録の画面', 'form', '上で会社名・氏名を確かめ、電話・郵便番号・住所を入れます。下へ進み、守秘義務にチェック、パスワードを2回入れます。');
  wrap(s, '「本登録する」を押す');
  card(s, [X[0], Y[1]], 3, '確認コードの画面', 'code', 'メールで届いた6桁の確認コード（10分間有効）を入れます。');
  right(s, 1, '「ログイン」を押す');
  card(s, [X[1], Y[1]], 4, 'ダッシュボード', 'dash1', '「本登録が完了しました」と出れば完了です。2回目からは、トップページ右上の「ログイン」から入ります（4 ページ）。');

  // 4 ダッシュボードと上のメニュー
  s = p.addSlide();
  header(s, 4, '全員', 'ダッシュボードと上のメニュー', 'ダッシュボードが毎日の出発点です。上のメニューから各画面へ進みます（画面は SES代表担当者の例。立場でメニューが変わります）。');
  const m = { x: 0.35, y: 1.2, k: 12.6 / 1100 };
  s.addImage({ path: 'cuts/menu.png', x: m.x, y: m.y, w: 1100 * m.k, h: 150 * m.k });
  s.addShape('rect', { x: m.x, y: m.y, w: 1100 * m.k, h: 150 * m.k, fill: { type: 'none' }, line: { color: 'BBBBBB', width: 0.5 } });
  // [番号を置く x, y（画面の px）, 名前, 説明]
  const items = [
    [212, 10, 'ダッシュボード', '毎日の出発点。「今やること」と、所属エンジニア・稼働中・選考中・成約・今月の成功報酬の数。'],
    [339, 10, 'SES', '自社の会社情報。一般担当者の登録・停止は SES代表担当者が行います。'],
    [392, 10, 'エンジニア一覧', '自社エンジニアの仮登録、状態とアカウントの確認、案内の送り直し（5 ページ）。'],
    [518, 10, 'プロバイダー一覧', '案件をくれるプロバイダーの登録。受けた案件（原文）も見られます。'],
    [214, 48, '案件一覧', '案件の登録。合うエンジニアを探して、案内メールを送ります。'],
    [298, 48, '応募・選考一覧', '応募から書類・面談・合否までの進み具合。'],
    [423, 48, '契約一覧', '成約した案件の契約（期間・延長・終了）。'],
    [508, 48, '請求一覧', '成功報酬の請求の確認。'],
    [591, 48, '案件のやり取り', '案件ごとの、エンジニア・管理者との質問と返事。'],
    [214, 86, '返信メール', '案内メールへのエンジニアの返信、プロバイダーからの返信を読みます。'],
    [311, 86, '連絡メール', 'エンジニアとの連絡のメール。送る・受け取ったものを読む。'],
    [408, 86, '使い方', 'マニュアルと操作手順書。困ったらここ。'],
    [716, 50, '通知（ベル）', 'お知らせ。数字は未読の数です。'],
    [756, 36, '自分のアカウント', '名前と立場（SES代表担当者／一般担当者）。押すとパスワードなどの設定。'],
    [1040, 40, 'ログアウト', '作業を終えるとき。'],
    [668, 133, 'ID で探す', 'CA-（案件）などの ID を入れて「探す」。その画面へ直接進みます。'],
  ];
  const bx = 0.26;
  items.forEach(([ix, iy], i) => {
    const x = m.x + ix * m.k - bx / 2, y = m.y + iy * m.k - bx / 2;
    s.addShape('ellipse', { x, y, w: bx, h: bx, fill: { color: RED }, line: { color: 'FFFFFF', width: 1 } });
    s.addText(String(i + 1), { x, y, w: bx, h: bx, fontSize: 9.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
  });
  const GX = 0.35, GY = 3.05, gw = 3.06, gh = 1.0, gap = 0.12;
  items.forEach(([, , name, desc], i) => {
    const x = GX + (i % 4) * (gw + gap), y = GY + Math.floor(i / 4) * (gh + 0.07);
    s.addShape('roundRect', { x, y, w: gw, h: gh, rectRadius: 0.06, fill: { color: i < 12 ? 'F4FAF6' : 'FFF8E6' }, line: { color: i < 12 ? MID : 'E0C060', width: 0.75 } });
    s.addShape('ellipse', { x: x + 0.08, y: y + 0.08, w: bx, h: bx, fill: { color: RED } });
    s.addText(String(i + 1), { x: x + 0.08, y: y + 0.08, w: bx, h: bx, fontSize: 9.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
    s.addText(name, { x: x + 0.42, y: y + 0.06, w: gw - 0.5, h: 0.3, fontSize: 12, bold: true, color: DK, valign: 'middle', fontFace: F, margin: 0 });
    s.addText(desc, { x: x + 0.12, y: y + 0.38, w: gw - 0.22, h: gh - 0.42, fontSize: 9.5, color: INK, valign: 'top', fontFace: F, margin: 0, lineSpacingMultiple: 1.0 });
  });

  // 5 エンジニアの登録と本登録（-04 の 5・6 ページをまとめた）
  s = p.addSlide();
  header(s, 5, 'SES', 'エンジニアを登録し、本登録を見届ける', '自社のエンジニアを仮登録すると、ご本人に案内メールが届きます。本登録が済むまで、案件の候補に出ません。');
  const sw = 3.72, sh = 2.78, sx = [0.35, 4.79, 9.23], sy = [1.12, 4.2], so = { w: sw, h: sh, capH: 0.78, fs: 10, tagRoom: 0.45 };
  card(s, [sx[0], sy[0]], 1, 'ダッシュボード', 'dash2', '上のメニューの「エンジニア一覧」を押します。', so);
  arrowH(s, sx[0] + sw + 0.05, sx[1] - 0.05, sy[0] + sh / 2, '「エンジニア一覧」を押す', '次の画面', 9);
  card(s, [sx[1], sy[0]], 2, 'エンジニア一覧', 'list', '右の「エンジニアを登録」を押します。', so);
  arrowH(s, sx[1] + sw + 0.05, sx[2] - 0.05, sy[0] + sh / 2, '「エンジニアを登録」を押す', '次の画面', 9);
  card(s, [sx[2], sy[0]], 3, 'エンジニアの登録画面', 'eform', '姓・名、ご本人のメールアドレスを入れます。推薦文を貼るとスキルが自動で入ります（任意。ご本人・他社には見えません）。', so);
  wrapAt(s, sx[2] + sw / 2, sx[0] + sw / 2, sy[0] + sh, sy[1], '「仮登録してメールを送る」を押す　→　次の画面');
  card(s, [sx[0], sy[1]], 4, 'エンジニアの詳細', 'edone', '「仮登録し、ご本人に仮登録のご案内を送りました」と出れば、SES の操作は完了です。', so);
  arrowH(s, sx[0] + sw + 0.05, sx[1] - 0.05, sy[1] + sh / 2, 'ご本人にメールが届く', '', 9);
  card(s, [sx[1], sy[1]], 5, 'ご本人に届くメール', 'mail2', 'ご本人がリンクを押して本登録します（7日以内）。「PARK からメールが届きます」と一言伝えておくと確実です。', so);
  arrowH(s, sx[1] + sw + 0.05, sx[2] - 0.05, sy[1] + sh / 2, 'ご本人が本登録', '', 9);
  card(s, [sx[2], sy[1]], 6, 'エンジニア一覧（本登録の確認）', 'after', '「アカウント」が「仮登録」ならまだ、「参加中」なら完了。届いていなければ「送り直し」を押します。', so);
  s.addText('「状態」は仕事の状態（待機中・稼働中など）です。本登録が済んだかは「アカウント」の欄で見ます。期限（7日）が切れたら「送り直し」で新しいリンクが届きます。次は、ご本人がスキルと経験を登録し、SES が案件を登録して案内します。', { x: 0.35, y: 7.03, w: 12.6, h: 0.4, fontSize: 10, color: '444444', fontFace: F, margin: 0.04, fill: { color: 'FFF4CE' } });
}

(async () => { await cut(); build(); await p.writeFile({ fileName: OUT }); console.log('ok'); })().catch(e => { console.error(e); process.exit(1); });
