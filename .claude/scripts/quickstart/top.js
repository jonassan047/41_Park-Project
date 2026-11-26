const { chromium } = require('playwright-core');
const fs=require('fs');
(async()=>{
 const br=await chromium.launch({channel:'chrome'});
 const c=await br.newContext({viewport:{width:1100,height:760},deviceScaleFactor:2,locale:'ja-JP'});
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:8123/setup');
 for (const [k, v] of Object.entries({ company_name: 'PARK運営', name_sei: '運営', name_mei: '管理', phone: '03-0000-0000', email: 'admin@example.com', password: 'Sample-pass1' })) await p.fill(`[name=${k}]`, v);
 await Promise.all([p.waitForNavigation(), p.getByRole('button',{name:'作成する'}).click()]);
 await c.clearCookies();
 const m=JSON.parse(fs.readFileSync('meta.json'));
 for (const [u,k] of [['/','top'],['/start/ses','startpub']]) {
  await p.goto('http://127.0.0.1:8123'+u); await p.waitForLoadState('networkidle');
  await p.screenshot({path:'shots/'+k+'.png',fullPage:true});
  const h=await p.evaluate(()=>document.documentElement.scrollHeight);
  const links = await p.evaluate(()=>[...document.querySelectorAll('a,button,h1,h2,h3,section,.card')].map(e=>{const r=e.getBoundingClientRect();return {t:e.tagName,s:e.innerText.trim().slice(0,30).replace(/\n/g,' '),x:Math.round(r.x),y:Math.round(r.y+scrollY),width:Math.round(r.width),height:Math.round(r.height)}}).filter(x=>x.s));
  m[k]={w:1100,h,boxes:[],els:links};
  console.log(k,h); for (const l of links) console.log(JSON.stringify(l));
 }
 fs.writeFileSync('meta.json',JSON.stringify(m,null,1));
 await br.close();})();
