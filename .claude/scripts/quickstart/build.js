const P = require('pptxgenjs');
const meta = require('./meta.json');
const OUT = 'D:/Workspace/41_Park-Project/98_Outputs/2026-11-26-01-PARKクイックスタート-SES.pptx';
const p = new P();
p.defineLayout({ name: 'W', width: 13.333, height: 7.5 }); p.layout = 'W';
p.theme = { headFontFace: 'Yu Gothic', bodyFontFace: 'Yu Gothic' };
const BLUE = '1F4E79', LIGHT = 'DEEBF7', MID = '2E75B6', RED = 'D62828', INK = '222222', F = 'Yu Gothic';

// 表紙
let s = p.addSlide(); s.background = { color: 'F3F8FC' };
s.addShape('rect', { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: MID } });
s.addText('PARK', { x: 1.1, y: 1.5, w: 8, h: 1.0, fontSize: 54, bold: true, color: BLUE, fontFace: F, margin: 0 });
s.addText('クイックスタート', { x: 1.1, y: 2.55, w: 11, h: 1.0, fontSize: 44, bold: true, color: BLUE, fontFace: F, margin: 0 });
s.addText('SES 企業さま向け　―　登録から案件の合否の登録まで', { x: 1.1, y: 3.8, w: 11, h: 0.6, fontSize: 22, color: INK, fontFace: F, margin: 0 });
s.addShape('line', { x: 1.1, y: 4.7, w: 11, h: 0, line: { color: MID, width: 1.5 } });
s.addText('2026年11月26日版\n画面の会社名・氏名・メールアドレスは、説明用の見本です。', { x: 1.1, y: 4.95, w: 11, h: 0.9, fontSize: 14, color: '555555', fontFace: F, margin: 0, lineSpacingMultiple: 1.3 });

// 本文。steps の番号は、画面の赤い番号と同じ。marks は [meta の boxes の番号, ...]
function slide(tag, title, img, steps, marks = [], note) {
  const s = p.addSlide(); s.background = { color: 'FFFFFF' };
  s.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.95, fill: { color: LIGHT } });
  s.addShape('roundRect', { x: 0.35, y: 0.22, w: 1.15, h: 0.52, rectRadius: 0.08, fill: { color: BLUE } });
  s.addText(tag, { x: 0.35, y: 0.22, w: 1.15, h: 0.52, fontSize: 18, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
  s.addText(title, { x: 1.7, y: 0.15, w: 11, h: 0.65, fontSize: 24, bold: true, color: BLUE, valign: 'middle', fontFace: F, margin: 0 });
  let y = 1.35;
  steps.forEach((t, i) => {
    s.addShape('ellipse', { x: 0.35, y: y + 0.04, w: 0.36, h: 0.36, fill: { color: RED } });
    s.addText(String(i + 1), { x: 0.35, y: y + 0.04, w: 0.36, h: 0.36, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
    const lines = Math.ceil([...t].length / 15) + 0;
    const h = Math.max(0.5, lines * 0.29 + 0.1);
    s.addText(t, { x: 0.85, y, w: 2.95, h, fontSize: 15, color: INK, valign: 'top', fontFace: F, margin: 0 });
    y += h + 0.22;
  });
  if (note) s.addText(note, { x: 0.35, y: Math.max(y + 0.1, 5.2), w: 3.45, h: 1.6, fontSize: 13, color: INK, fill: { color: 'FFF4CE' }, valign: 'middle', fontFace: F, margin: 8 });
  const m = meta[img], A = { x: 4.15, y: 1.15, w: 8.85, h: 6.1 };
  const k = Math.min(A.w / m.w, A.h / m.h), w = m.w * k, h = m.h * k, x = A.x + (A.w - w) / 2, iy = A.y;
  s.addImage({ path: `shots/${img}.png`, x, y: iy, w, h });
  s.addShape('rect', { x, y: iy, w, h, fill: { type: 'none' }, line: { color: 'BBBBBB', width: 0.75 } });
  marks.forEach((bi, i) => {
    if (bi === null) return;
    const ids = [].concat(bi), bs = ids.map(n => m.boxes[n]);
    const x1 = Math.min(...bs.map(b => b.x)) - 5, y1 = Math.min(...bs.map(b => b.y)) - 5;
    const x2 = Math.max(...bs.map(b => b.x + b.width)) + 5, y2 = Math.max(...bs.map(b => b.y + b.height)) + 5;
    s.addShape('rect', { x: x + x1 * k, y: iy + y1 * k, w: (x2 - x1) * k, h: (y2 - y1) * k, fill: { type: 'none' }, line: { color: RED, width: 2.25 } });
    const bx = Math.max(x + x1 * k - 0.32, x - 0.15), by = iy + y1 * k - 0.12;
    s.addShape('ellipse', { x: bx, y: by, w: 0.32, h: 0.32, fill: { color: RED } });
    s.addText(String(i + 1), { x: bx, y: by, w: 0.32, h: 0.32, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: F, margin: 0 });
  });
}

slide('S1-1', '招待メールのリンクを開く', 's1-mail', ['件名「仮登録のご案内」のメールを開き、リンクを押します'], [0], 'リンクの期限は7日です。切れていたら、管理者に送り直しを依頼してください。');
slide('S1-2', '本登録：会社名と氏名を確かめる', 's1-form1', ['企業正式名称を確かめます', 'ご自身の氏名を確かめます'], [0, 1], '違っていたら、この画面で直せます。ふりがなは任意です。');
slide('S1-3', '本登録：入力して「本登録する」', 's1-form2', ['会社の電話番号', '郵便番号', '住所', '守秘義務への同意にチェック', 'パスワード（8文字以上）を2回入れます', '「本登録する」を押します'], [0, 1, 2, 3, 4, 5]);
slide('S1-4', '確認コードを入れる', 's1-code', ['メールで届いた6桁の確認コードを入れます（件名「確認コード ○○○○○○」）', '「ログイン」を押します'], [0, 1], 'コードは10分間有効です。入れるまで、本登録は保存されません。届かないときは、迷惑メールを確かめてから「コードを送り直す」。');
slide('S1-5', '本登録の完了', 's1-dash', ['「本登録が完了しました」と出て、ダッシュボードが開きます。次は上の「エンジニア一覧」を押します'], [0], '2回目からは、メールアドレスとパスワードを入れ、届いた確認コードでログインします。');
slide('S2-1', 'エンジニアの登録画面を開く', 's2-list', ['上のメニューの「エンジニア一覧」を開きます', '「エンジニアを登録」を押します'], [0, 1]);
slide('S2-2', '姓・名・メールを入れて仮登録', 's2-form', ['氏名（姓・名）', 'ご本人のメールアドレス', '推薦文があれば貼り付けます（任意）', '「仮登録してメールを送る」を押します'], [0, 1, 2, 3], '推薦文を貼ると、スキルが自動で登録されます。推薦文は、ご本人と他社には見えません。');
slide('S2-3', '仮登録できたことを確かめる', 's2-done', ['案内を送ったことと、登録されたスキルの件数が出ます'], [0], 'ここの「状態：待機中」は、本登録が済んだという意味ではありません。次の一覧の「アカウント」で確かめます。');
slide('S2-4', 'エンジニアに届くメール', 's2-mail', ['ご本人に、このメールが届きます。リンクから本登録してもらいます'], [0], 'ご本人に「PARK からメールが届くので、7日以内に本登録してください」と伝えておくと確実です。');
slide('S2-5', '本登録が済んだかを確かめる', 's2-after', ['「アカウント」が「仮登録」の間は、案件の候補に出ません'], [0], '本登録が済むと「参加中」に変わります。届かないと言われたら、同じ行の「送り直し」を押します。');
p.writeFile({ fileName: OUT }).then(() => console.log('ok'));
