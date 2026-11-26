const { chromium } = require('playwright-core');
const fs=require('fs');
(async()=>{
 const br=await chromium.launch({channel:'chrome'});
 const c=await br.newContext({viewport:{width:1100,height:760},deviceScaleFactor:2,locale:'ja-JP'});
 const p=await c.newPage(); await p.goto('http://127.0.0.1:8123/login');
 await p.fill('[name=email]','sato@example.com'); await p.fill('[name=password]','Sample-pass1');
 await p.screenshot({path:'shots/login.png'});
 const bx=[]; for (const s of ['[name=email]','[name=password]']) bx.push(await p.locator(s).boundingBox());
 bx.push(await p.getByRole('button',{name:'ログイン',exact:true}).boundingBox());
 const m=JSON.parse(fs.readFileSync('meta.json')); m.login={w:1100,h:760,boxes:bx}; fs.writeFileSync('meta.json',JSON.stringify(m,null,1));
 console.log(JSON.stringify(bx)); await br.close();})();
