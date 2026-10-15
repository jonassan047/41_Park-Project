'use strict';
// マッチング（案件票 × 経験票）。点数と「合う理由」「足りないもの」を出す。最終判断は人がする。
const { all, get, setting } = require('./db');
const { parseList, normSkill, today } = require('./util');

const WEIGHTS = { required: 55, preferred: 15, years: 8, price: 10, start: 6, style: 6 };

function skillIndex(engineerId) {
  const idx = new Map();
  for (const s of all('SELECT * FROM engineer_skills WHERE engineer_id = ?', engineerId)) idx.set(normSkill(s.name), s);
  // 経験票（プロジェクト）で使った技術も「経験あり」として数える
  for (const p of all('SELECT tech FROM engineer_projects WHERE engineer_id = ?', engineerId)) {
    for (const t of parseList(p.tech)) { const k = normSkill(t); if (!idx.has(k)) idx.set(k, { name: t, years: null, level: 2, fromProject: true }); }
  }
  return idx;
}

function hasSkill(idx, name) {
  const k = normSkill(name);
  if (idx.has(k)) return idx.get(k);
  // 「Spring Boot」と「Spring」のような部分一致も拾う（3文字以上のとき）
  if (k.length >= 3) for (const [key, s] of idx) if (key.length >= 3 && looseMatch(key, k)) return s;
  return null;
}
// 名前が似ていても別の技術（Java と JavaScript など）は一致にしない
const DISTINCT = [['java', 'javascript']];
function looseMatch(a, b) {
  if (!(a.includes(b) || b.includes(a))) return false;
  return !DISTINCT.some(([x, y]) => (a.startsWith(x) && b.startsWith(y) && !a.startsWith(y)) || (b.startsWith(x) && a.startsWith(y) && !b.startsWith(y)));
}

function scoreEngineer(c, e) {
  const idx = skillIndex(e.id);
  const reasons = []; const missing = [];
  let score = 0;

  const req = parseList(c.required_skills);
  if (req.length) {
    let hit = 0;
    for (const r of req) {
      const s = hasSkill(idx, r);
      if (s) { hit += s.fromProject ? 0.8 : 1; reasons.push(`必須 ${r}${s.years ? `（${s.years}年）` : ''}`); } else missing.push(`必須 ${r}`);
    }
    score += (WEIGHTS.required * hit) / req.length;
  } else score += WEIGHTS.required * 0.5;

  const pref = parseList(c.preferred_skills);
  if (pref.length) {
    let hit = 0;
    for (const r of pref) { if (hasSkill(idx, r)) { hit++; reasons.push(`尚可 ${r}`); } }
    score += (WEIGHTS.preferred * hit) / pref.length;
  } else score += WEIGHTS.preferred * 0.5;

  if (c.min_years) {
    if ((e.years_exp || 0) >= c.min_years) { score += WEIGHTS.years; reasons.push(`経験${e.years_exp}年`); }
    else missing.push(`経験年数（${c.min_years}年以上）`);
  } else score += WEIGHTS.years;

  if (c.price && e.desired_price) {
    if (e.desired_price <= c.price) { score += WEIGHTS.price; reasons.push('単価が合う'); }
    else if (e.min_price && e.min_price <= c.price) { score += WEIGHTS.price * 0.6; reasons.push('単価は下限なら合う'); }
    else missing.push(`単価（希望 ${e.desired_price}万円 ＞ ${c.price}万円）`);
  } else score += WEIGHTS.price * 0.5;

  const start = c.start_date || today();
  if (!e.available_from || e.available_from <= start) score += WEIGHTS.start;
  else missing.push(`開始日（${e.available_from} から可）`);

  const cs = c.work_style || 'any'; const es = e.work_style || 'any';
  if (cs === 'any' || es === 'any' || cs === es || (cs === 'hybrid' && es !== 'remote') || (es === 'hybrid' && cs !== 'onsite')) score += WEIGHTS.style;
  else missing.push('働き方（リモート／出社）');

  return { score: Math.round(score), reasons, missing };
}

// 案件に合うエンジニアを点数順に並べる（稼働中・休止・応募済みは除く）
function matchCase(caseId, { includeBusy = false } = {}) {
  const c = get('SELECT * FROM cases WHERE id = ?', caseId);
  if (!c) return [];
  const engs = all(`SELECT e.*, s.name AS ses_name FROM engineers e JOIN ses_companies s ON s.id = e.ses_id
    WHERE s.status = 'active' ${includeBusy ? '' : "AND e.status IN ('available','proposing')"}`);
  const applied = new Set(all('SELECT engineer_id FROM applications WHERE case_id = ?', caseId).map((r) => r.engineer_id));
  const offered = new Map(all('SELECT engineer_id, status FROM case_offers WHERE case_id = ?', caseId).map((r) => [r.engineer_id, r.status]));
  return engs.filter((e) => !applied.has(e.id))
    .map((e) => ({ engineer: e, ...scoreEngineer(c, e), offered: offered.get(e.id) || null }))
    .sort((a, b) => b.score - a.score);
}

const threshold = () => Number(setting('match_threshold')) || 40;

module.exports = { scoreEngineer, matchCase, skillIndex, hasSkill, looseMatch, threshold };
