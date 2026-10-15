'use strict';
// 案件メールの本文から、案件票の項目を抜き出す（このPCの中だけで処理する。外部サービスには送らない）

const LABELS = {
  title: ['案件名', '件名', '案件', 'タイトル', 'PJ名', 'プロジェクト'],
  price: ['単価', '金額', '報酬', '予算', '月額'],
  location: ['場所', '勤務地', '最寄', '作業場所', '就業場所'],
  start_date: ['開始', '開始時期', '期間開始', '参画時期', '入場'],
  period: ['期間', '契約期間'],
  required_skills: ['必須', '必須スキル', '必須要件', 'MUST'],
  preferred_skills: ['尚可', '歓迎', '尚可スキル', '歓迎スキル', 'WANT', 'BETTER'],
  interviews_count: ['面談', '面談回数'],
  headcount: ['人数', '募集人数', '募集'],
  description: ['概要', '内容', '業務内容', '作業内容', '詳細'],
  conditions: ['備考', 'その他', '条件', '精算'],
};

function cleanLine(l) { return l.replace(/^[\s・●■◆◇□○\-\*＊【\[]+/, '').trim(); }

function parseCaseText(text) {
  const out = {};
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let current = null; const buckets = {};
  for (const line of lines) {
    const l = line.trim();
    if (!l) { current = null; continue; }
    let matched = false;
    for (const [field, labels] of Object.entries(LABELS)) {
      for (const lb of labels) {
        const re = new RegExp(`^[\\s・●■◆◇□○\\-\\*＊【\\[]*${lb}[^】\\]：:]{0,6}[】\\]]?\\s*[：:】\\]]?\\s*(.*)$`, 'i');
        const m = l.match(re);
        if (m && (l.length < 120)) {
          // 「期間開始」を「期間」と取り違えないよう、先に一致した方を使う
          if (field === 'period' && /開始/.test(l.slice(0, 6))) continue;
          current = field; buckets[field] = buckets[field] || [];
          if (m[1]) buckets[field].push(m[1].trim());
          matched = true; break;
        }
      }
      if (matched) break;
    }
    if (!matched && current) buckets[current].push(cleanLine(l));
  }
  for (const [k, v] of Object.entries(buckets)) out[k] = v.filter(Boolean).join(k.endsWith('skills') ? '、' : '\n');

  if (out.title) out.title = out.title.split('\n')[0].replace(/[【】\[\]]/g, '').slice(0, 80);
  else { const first = lines.find((l) => l.trim()); if (first) out.title = cleanLine(first).slice(0, 80); }

  if (out.price) {
    const nums = [...out.price.normalize('NFKC').matchAll(/(\d+(?:\.\d+)?)\s*万/g)].map((m) => Number(m[1]));
    out.price_note = out.price;
    out.price = nums.length ? Math.max(...nums) : (out.price.match(/\d{2,3}/) ? Number(out.price.match(/\d{2,3}/)[0]) : null);
  }
  const all = String(text).normalize('NFKC');
  if (/フルリモート|完全リモート|リモート\s*可?\s*[（(]?\s*100/.test(all)) out.work_style = 'remote';
  else if (/リモート|在宅|テレワーク/.test(all)) out.work_style = /常駐|出社/.test(all) ? 'hybrid' : 'remote';
  else if (/常駐|出社/.test(all)) out.work_style = 'onsite';
  if (out.interviews_count) { const m = out.interviews_count.normalize('NFKC').match(/(\d)/); out.interviews_count = m ? Number(m[1]) : 1; }
  if (out.headcount) { const m = out.headcount.normalize('NFKC').match(/(\d+)/); out.headcount = m ? Number(m[1]) : 1; }
  if (out.start_date) {
    const s = out.start_date.normalize('NFKC');
    let m = s.match(/(20\d{2})[\/\-年](\d{1,2})/);
    if (m) out.start_date = `${m[1]}-${m[2].padStart(2, '0')}-01`;
    else if ((m = s.match(/(\d{1,2})\s*月/))) {
      const y = new Date().getFullYear(); const mm = Number(m[1]);
      out.start_date = `${mm < new Date().getMonth() + 1 ? y + 1 : y}-${String(mm).padStart(2, '0')}-01`;
    } else if (/即日|ASAP/i.test(s)) out.start_date = new Date().toISOString().slice(0, 10);
    else { out.conditions = [out.conditions, `開始：${out.start_date}`].filter(Boolean).join('\n'); delete out.start_date; }
  }
  const y = all.match(/(\d+)\s*年以上/); if (y) out.min_years = Number(y[1]);
  return out;
}

module.exports = { parseCaseText };
