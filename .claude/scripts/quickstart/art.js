// 表紙（トップのヒーローと同じ色）と、若芽だけを切り抜いたアイコンを作る
const { chromium } = require('playwright-core');
const fs = require('fs');
const b64 = f => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
(async () => {
  const br = await chromium.launch({ channel: 'chrome' });
  const pg = await br.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  // 1. 若芽の切り抜き：緑の強い画素で、中央につながっている部分だけ残す
  await pg.setContent(`<canvas id=c></canvas><img id=i src="${b64('sprig.jpg')}">`);
  await pg.waitForFunction(() => document.getElementById('i').complete);
  const png = await pg.evaluate(() => {
    const im = document.getElementById('i'), W = im.naturalWidth, H = im.naturalHeight;
    const c = document.getElementById('c'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, W, H), a = d.data;
    const g = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { const r = a[4*i], gg = a[4*i+1], b = a[4*i+2]; g[i] = (gg > 55 && gg > r * 1.35 && gg > b * 1.15) ? 1 : 0; }
    // 中央付近から塗りつぶし（つながった葉だけ）
    const keep = new Uint8Array(W * H), st = [];
    for (let yy = H*0.35|0; yy < H*0.65; yy++) for (let xx = W*0.35|0; xx < W*0.65; xx++) { const i = yy*W+xx; if (g[i]) { keep[i]=1; st.push(i); } }
    while (st.length) { const i = st.pop(), px = i % W, py = (i / W) | 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) { const nx = px+dx, ny = py+dy; if (nx<0||ny<0||nx>=W||ny>=H) continue; const j = ny*W+nx; if (g[j] && !keep[j]) { keep[j]=1; st.push(j); } } }
    let x0=W,y0=H,x1=0,y1=0;
    for (let i = 0; i < W*H; i++) { if (!keep[i]) a[4*i+3] = 0; else { const px=i%W,py=(i/W)|0; x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);} }
    x.putImageData(d, 0, 0);
    const s = Math.max(x1-x0, y1-y0) + 8, o = document.createElement('canvas'); o.width = o.height = s;
    o.getContext('2d').drawImage(c, x0-((s-(x1-x0))>>1), y0-((s-(y1-y0))>>1), s, s, 0, 0, s, s);
    return o.toDataURL('image/png');
  });
  fs.writeFileSync('sprout.png', Buffer.from(png.split(',')[1], 'base64'));
  // 2. 表紙
  await pg.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700;800&display=swap" rel="stylesheet"><style>
  body{margin:0;width:1600px;height:900px;font-family:'M PLUS Rounded 1c',sans-serif;overflow:hidden;
   background:radial-gradient(circle at 88% 8%,rgba(190,235,140,.45),transparent 42%),radial-gradient(circle at 4% 100%,rgba(110,200,140,.35),transparent 45%),linear-gradient(135deg,#0b2b1c,#175236 52%,#2f8458);color:#fff;
   display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  .photo{position:absolute;border-radius:28px;border:6px solid #fff;box-shadow:0 24px 50px rgba(0,0,0,.4);background:url(${b64('hero.jpg')}) center/cover;opacity:.22}
  .sp{width:1040px;height:340px;border-radius:520px 520px 0 0;background:url(${b64('hero.jpg')}) 50% 52%/1040px auto;box-shadow:0 0 0 7px #fff,0 0 0 18px rgba(190,235,140,.45),0 14px 34px rgba(0,0,0,.35);margin-bottom:30px;position:relative}
  .pill{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:8px 22px;font-size:22px;font-weight:700;position:relative}
  .pill i{width:11px;height:11px;border-radius:50%;background:#bdeb8c}
  h1{font-size:84px;font-weight:800;margin:30px 0 22px;text-shadow:0 4px 18px rgba(0,0,0,.35);position:relative;letter-spacing:.02em}
  p{font-size:26px;opacity:.92;margin:0;position:relative}
  </style></head><body>
  <div class=photo style="width:430px;height:430px;right:-150px;bottom:-270px;transform:rotate(8deg)"></div>
  <div class=photo style="width:300px;height:300px;left:-60px;top:-70px;transform:rotate(-6deg);opacity:.14"></div>
  <div class=sp></div><span class=pill><i></i>木漏れ日の下で、仕事と仲間がつながる庭</span>
  <h1>PARK システム・クイックスタート</h1><p>SES とエンジニアが集う庭</p></body></html>`);
  await pg.waitForLoadState('networkidle'); await pg.evaluate(() => document.fonts.ready);
  await pg.screenshot({ path: 'cover.png' });
  await br.close();
})();
