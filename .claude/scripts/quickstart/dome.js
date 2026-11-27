// 表紙（art.js）の若枝のドームだけを、背景を透明にした PNG に書き出す（2026-11-27 TEZZO「PPT と全く同じに。書き出して保持して」）
// 形・写真の切り抜き・白と薄緑の縁・影は art.js の .sp と同じ値。影が切れないよう周りに余白を取る。
// 使い方：hero.jpg をこのフォルダに置いて `node dome.js 出力先.png [倍率]`
const { chromium } = require('playwright-core');
const fs = require('fs');
const b64 = f => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
const out = process.argv[2] || 'dome.png', scale = +(process.argv[3] || 2); // 2：保存用、1：Web 用
(async () => {
  const br = await chromium.launch({ channel: 'chrome' });
  const pg = await br.newPage({ viewport: { width: 1200, height: 460 }, deviceScaleFactor: scale });
  await pg.setContent(`<html><head><style>
  html,body{margin:0;background:transparent}
  .sp{width:1040px;height:340px;position:absolute;left:30px;top:30px;border-radius:520px 520px 0 0;background:url(${b64('hero.jpg')}) 50% 52%/1040px auto;box-shadow:0 0 0 7px #fff,0 0 0 18px rgba(190,235,140,.45),0 14px 34px rgba(0,0,0,.35)}
  </style></head><body><div class=sp></div></body></html>`);
  await pg.waitForLoadState('networkidle');
  // 余白：上・左右 30px（縁 18px＋ゆとり）、下は影のぶん 50px
  await pg.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: 1100, height: 420 } });
  await br.close();
})();
