'use strict';
// 業務の手続き（登録・配信・応募・選考・成約）。画面（routes）からはここを呼ぶ。
const { all, get, run, tx, setting } = require('./db');
const { now, today, addMonths, monthEnd, parseList, str, intOrNull, numOrNull } = require('./util');
const { queueMail, notify, notifyAdmins, notifySes, notifyEg, audit } = require('./mail');
const { issueUserToken } = require('./auth');
const { generateQA } = require('./qa');
const { scoreEngineer } = require('./match');
const { L } = require('./views');

const base = () => setting('base_url');

// ---------- ユーザーと招待 ----------
function inviteUser({ email, name, role, ses_id = null, engineer_id = null }, actor, note = '') {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  let u = get('SELECT * FROM users WHERE email = ?', email);
  if (u && u.password_hash) return u; // すでに使っている人は招待しない
  if (!u) {
    const r = run('INSERT INTO users (email, name, role, ses_id, engineer_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', email, name, role, ses_id, engineer_id, now());
    u = get('SELECT * FROM users WHERE id = ?', Number(r.lastInsertRowid));
  }
  const t = issueUserToken(u.id);
  const what = role === 'eg' ? 'エンジニアとして PARK に登録されました。' : role === 'ses' ? 'SES のご担当者として PARK にご招待します。' : 'PARK の運営メンバーに招待されました。';
  queueMail(email, name, 'ご招待：パスワードを設定してください',
    `${name} 様\n\n${what}${note ? '\n' + note : ''}\n\n次のリンクから、パスワードを設定してください（7日間有効）。\n${base()}/invite/${t}\n\n` +
    (role === 'eg' ? 'パスワードの設定のときに、個人情報の取り扱いへの同意をお願いしています。スキルシートは、事実にもとづいて一緒に作ります。' : ''), 'invite');
  audit(actor?.id, 'invite', `${L.role[role]} ${name} <${email}>`);
  return u;
}

// ---------- SES ----------
function applySes(d) {
  const r = run(`INSERT INTO ses_companies (name, rep_name, contact_name, email, phone, address, employees, strengths, message, status, agreed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`, str(d.name), str(d.rep_name), str(d.contact_name), str(d.email).toLowerCase(), str(d.phone),
  str(d.address), intOrNull(d.employees), str(d.strengths), str(d.message), d.agree ? now() : null, now());
  const id = Number(r.lastInsertRowid);
  notifyAdmins('SES から参加の申し込みがありました', `${str(d.name)}（${str(d.contact_name)} 様）から参加の申し込みがありました。内容を確認し、承認してください。`, `/admin/ses/${id}`, { kind: 'ses-apply' });
  queueMail(str(d.email), str(d.contact_name), '参加のお申し込みを受け付けました',
    `${str(d.contact_name)} 様\n\nPARK への参加のお申し込みを受け付けました。運営で内容を確認のうえ、ご連絡します。\n\n会社名：${str(d.name)}`, 'ses-apply');
  return id;
}
function approveSes(sesId, actor) {
  const s = get('SELECT * FROM ses_companies WHERE id = ?', sesId);
  run("UPDATE ses_companies SET status = 'active', joined_at = COALESCE(joined_at, ?) WHERE id = ?", today(), sesId);
  audit(actor.id, 'ses-approve', s.name);
  if (s.email) inviteUser({ email: s.email, name: s.contact_name || s.rep_name || s.name, role: 'ses', ses_id: sesId }, actor, `${s.name} の PARK への参加を承認しました。`);
}

// ---------- エンジニア ----------
const ENG_FIELDS = ['name', 'kana', 'initials', 'email', 'birth_year', 'gender', 'nearest_station', 'years_exp', 'summary', 'strengths', 'desired_price', 'min_price', 'available_from', 'work_style', 'days_per_week', 'status'];
function engValues(d, old = {}) {
  const v = {};
  for (const f of ENG_FIELDS) {
    if (!(f in d)) { v[f] = old[f] ?? null; continue; }
    if (['birth_year', 'days_per_week'].includes(f)) v[f] = intOrNull(d[f]);
    else if (['years_exp', 'desired_price', 'min_price'].includes(f)) v[f] = numOrNull(d[f]);
    else v[f] = str(d[f]) || null;
  }
  if (!v.initials && v.kana) v.initials = initialsFromKana(v.kana);
  v.email = v.email ? v.email.toLowerCase() : null;
  return v;
}
// 「やまだ たろう」→「T.Y」（スキルシートで名前を伏せるとき用）
function initialsFromKana(kana) {
  const ROMA = { あ: 'A', い: 'I', う: 'U', え: 'E', お: 'O', か: 'K', き: 'K', く: 'K', け: 'K', こ: 'K', が: 'G', ぎ: 'G', ぐ: 'G', げ: 'G', ご: 'G', さ: 'S', し: 'S', す: 'S', せ: 'S', そ: 'S', ざ: 'Z', じ: 'J', ず: 'Z', ぜ: 'Z', ぞ: 'Z', た: 'T', ち: 'C', つ: 'T', て: 'T', と: 'T', だ: 'D', ぢ: 'D', づ: 'D', で: 'D', ど: 'D', な: 'N', に: 'N', ぬ: 'N', ね: 'N', の: 'N', は: 'H', ひ: 'H', ふ: 'F', へ: 'H', ほ: 'H', ば: 'B', び: 'B', ぶ: 'B', べ: 'B', ぼ: 'B', ぱ: 'P', ぴ: 'P', ぷ: 'P', ぺ: 'P', ぽ: 'P', ま: 'M', み: 'M', む: 'M', め: 'M', も: 'M', や: 'Y', ゆ: 'Y', よ: 'Y', ら: 'R', り: 'R', る: 'R', れ: 'R', ろ: 'R', わ: 'W' };
  const hira = String(kana).replace(/[ァ-ン]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const parts = hira.split(/[\s　]+/).filter(Boolean);
  if (parts.length < 2) return null;
  return `${ROMA[parts[1][0]] || '?'}.${ROMA[parts[0][0]] || '?'}`;
}
function createEngineer(sesId, d, actor, { invite = true } = {}) {
  const v = engValues(d);
  const r = run(`INSERT INTO engineers (ses_id, ${ENG_FIELDS.join(', ')}, created_at, updated_at) VALUES (?, ${ENG_FIELDS.map(() => '?').join(', ')}, ?, ?)`,
    sesId, ...ENG_FIELDS.map((f) => v[f] ?? (f === 'status' ? 'available' : f === 'work_style' ? 'any' : null)), now(), now());
  const id = Number(r.lastInsertRowid);
  audit(actor?.id, 'engineer-create', `${v.name}（SES ${sesId}）`);
  if (invite && v.email) inviteUser({ email: v.email, name: v.name, role: 'eg', ses_id: sesId, engineer_id: id }, actor);
  notifyAdmins('エンジニアが登録されました', `${v.name} さんが登録されました。経験票・スキルシートの作成を一緒に進めてください。`, `/engineers/${id}`, { mail: false });
  return id;
}
function updateEngineer(id, d, actor) {
  const old = get('SELECT * FROM engineers WHERE id = ?', id);
  const v = engValues(d, old);
  run(`UPDATE engineers SET ${ENG_FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...ENG_FIELDS.map((f) => v[f]), now(), id);
  audit(actor?.id, 'engineer-update', v.name);
}
function saveSkills(engineerId, d) {
  const names = [].concat(d.skill_name || []); const cats = [].concat(d.skill_cat || []);
  const years = [].concat(d.skill_years || []); const levels = [].concat(d.skill_level || []);
  tx(() => {
    run('DELETE FROM engineer_skills WHERE engineer_id = ?', engineerId);
    names.forEach((n, i) => {
      if (!String(n).trim()) return;
      run('INSERT INTO engineer_skills (engineer_id, name, category, years, level) VALUES (?, ?, ?, ?, ?)', engineerId, String(n).trim(), cats[i] || 'other', numOrNull(years[i]), intOrNull(levels[i]) || 3);
    });
  });
}
const PROJ_FIELDS = ['title', 'industry', 'period_from', 'period_to', 'role', 'team_size', 'tech', 'phases', 'description', 'achievements'];
function saveProject(engineerId, d, projectId) {
  const vals = PROJ_FIELDS.map((f) => (f === 'team_size' ? intOrNull(d[f]) : f === 'phases' ? parseList([].concat(d[f] || []).join('、')).join('、') || null : str(d[f]) || null));
  if (projectId) run(`UPDATE engineer_projects SET ${PROJ_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ? AND engineer_id = ?`, ...vals, projectId, engineerId);
  else run(`INSERT INTO engineer_projects (engineer_id, ${PROJ_FIELDS.join(', ')}) VALUES (?, ${PROJ_FIELDS.map(() => '?').join(', ')})`, engineerId, ...vals);
  run('UPDATE engineers SET updated_at = ? WHERE id = ?', now(), engineerId);
}

// ---------- 案件 ----------
const CASE_FIELDS = ['title', 'client_label', 'price', 'price_note', 'required_skills', 'preferred_skills', 'description', 'location', 'work_style', 'start_date', 'period', 'days_per_week', 'interviews_count', 'headcount', 'min_years', 'conditions', 'deadline', 'status', 'raw_text'];
function caseValues(d) {
  return CASE_FIELDS.map((f) => {
    if (['days_per_week', 'interviews_count', 'headcount'].includes(f)) return intOrNull(d[f]);
    if (['price', 'min_years'].includes(f)) return numOrNull(d[f]);
    return str(d[f]) || null;
  });
}
function saveCase(d, user, id) {
  if (id) {
    run(`UPDATE cases SET ${CASE_FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...caseValues(d), now(), id);
    audit(user.id, 'case-update', str(d.title));
    return id;
  }
  const r = run(`INSERT INTO cases (${CASE_FIELDS.join(', ')}, source_ses_id, registered_by, created_at, updated_at) VALUES (${CASE_FIELDS.map(() => '?').join(', ')}, ?, ?, ?, ?)`,
    ...caseValues(d), user.role === 'ses' ? user.ses_id : intOrNull(d.source_ses_id), user.id, now(), now());
  const newId = Number(r.lastInsertRowid);
  audit(user.id, 'case-create', str(d.title));
  if (user.role === 'ses') notifyAdmins('SES から案件が登録されました', `「${str(d.title)}」が登録されました。マッチングして配信してください。`, `/cases/${newId}`, { kind: 'case' });
  return newId;
}

// 選んだエンジニアに案件を配信し、所属の SES にも知らせる
function distribute(caseId, engineerIds, actor, message = '') {
  const c = get('SELECT * FROM cases WHERE id = ?', caseId);
  const bySes = new Map(); let count = 0;
  for (const eid of engineerIds.map(Number)) {
    const e = get('SELECT * FROM engineers WHERE id = ?', eid);
    if (!e) continue;
    if (get('SELECT id FROM case_offers WHERE case_id = ? AND engineer_id = ?', caseId, eid)) continue;
    const s = scoreEngineer(c, e);
    run('INSERT INTO case_offers (case_id, engineer_id, score, reasons, missing, sent_by, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      caseId, eid, s.score, s.reasons.join(' / '), s.missing.join(' / '), actor.id, now());
    notifyEg(eid, `あなたに合う案件が届きました：${c.title}`,
      `${c.title}\n単価：${c.price ? c.price + '万円' : '相談'}／開始：${c.start_date || '相談'}／${L.workStyle[c.work_style] || ''}\n合う点：${s.reasons.slice(0, 4).join('、') || '—'}` +
      `${message ? `\n\n運営より：${message}` : ''}\n\n条件を確認のうえ、応募するか見送るかを選んでください。`, `/cases/${caseId}`, { kind: 'offer' });
    if (!bySes.has(e.ses_id)) bySes.set(e.ses_id, []);
    bySes.get(e.ses_id).push(`${e.name}（${s.score}点）`);
    count++;
  }
  for (const [sesId, names] of bySes) {
    notifySes(sesId, `貴社のエンジニアに案件を配信しました：${c.title}`, `次の方に「${c.title}」を配信しました。\n${names.join('\n')}\n\nご本人が応募を決めるほか、貴社から個別にご案内いただくこともできます。`, `/cases/${caseId}`, { kind: 'offer-ses' });
  }
  audit(actor.id, 'distribute', `${c.title} → ${count}名`);
  return count;
}

// ---------- 応募と選考 ----------
function addEvent(appId, status, note, actor) {
  run('INSERT INTO application_events (application_id, status, note, user_id, at) VALUES (?, ?, ?, ?, ?)', appId, status, note || '', actor?.id || null, now());
}
function apply(caseId, engineerId, d, actor) {
  const c = get('SELECT * FROM cases WHERE id = ?', caseId);
  const e = get('SELECT * FROM engineers WHERE id = ?', engineerId);
  if (!c || !e) throw new Error('案件またはエンジニアが見つかりません');
  if (c.status !== 'open') throw new Error('この案件は募集を終えています');
  // GP の中での二重応募は受け付けない（同じ人が別の SES 経由で出るのを防ぐ）
  if (get('SELECT id FROM applications WHERE case_id = ? AND engineer_id = ?', caseId, engineerId)) throw new Error('この案件には応募済みです');
  const r = run(`INSERT INTO applications (case_id, engineer_id, ses_id, status, proposed_price, start_ok, price_ok, style_ok, condition_note, applied_by, applied_at, updated_at)
    VALUES (?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?, ?, ?)`, caseId, engineerId, e.ses_id, numOrNull(d.proposed_price) ?? c.price,
  d.start_ok ? 1 : 0, d.price_ok ? 1 : 0, d.style_ok ? 1 : 0, str(d.condition_note) || null, actor.id, now(), now());
  const appId = Number(r.lastInsertRowid);
  addEvent(appId, 'applied', str(d.condition_note), actor);
  run("UPDATE case_offers SET status = 'applied' WHERE case_id = ? AND engineer_id = ?", caseId, engineerId);
  if (e.status === 'available') run("UPDATE engineers SET status = 'proposing' WHERE id = ?", engineerId);
  const who = actor.role === 'eg' ? 'ご本人' : actor.role === 'ses' ? '所属の SES' : '運営';
  notifyAdmins(`応募がありました：${c.title}`, `${e.name} さんが「${c.title}」に応募しました（${who}から）。スキルシートを案件に合わせて整え、提出してください。`, `/applications/${appId}`, { kind: 'apply' });
  notifySes(e.ses_id, `貴社のエンジニアが応募しました：${c.title}`, `${e.name} さんが「${c.title}」に応募しました。選考の進み具合は PARK でご確認いただけます。`, `/applications/${appId}`, { kind: 'apply' });
  if (actor.role !== 'eg') notifyEg(engineerId, `案件に応募しました：${c.title}`, `「${c.title}」に、${who}からあなたの応募を出しました。条件に問題があれば、すぐにご連絡ください。`, `/applications/${appId}`, { kind: 'apply' });
  audit(actor.id, 'apply', `${e.name} → ${c.title}`);
  return appId;
}

function refreshEngineerStatus(engineerId) {
  const e = get('SELECT * FROM engineers WHERE id = ?', engineerId);
  if (!e || e.status === 'unavailable') return;
  if (get("SELECT id FROM contracts WHERE engineer_id = ? AND status = 'active'", engineerId)) return run("UPDATE engineers SET status = 'working' WHERE id = ?", engineerId);
  const active = get("SELECT id FROM applications WHERE engineer_id = ? AND status NOT IN ('won','rejected','withdrawn')", engineerId);
  run('UPDATE engineers SET status = ? WHERE id = ?', active ? 'proposing' : 'available', engineerId);
}

function setStatus(appId, status, actor, { note = '', reason = '' } = {}) {
  const a = get('SELECT a.*, c.title, e.name AS eg_name FROM applications a JOIN cases c ON c.id = a.case_id JOIN engineers e ON e.id = a.engineer_id WHERE a.id = ?', appId);
  if (!a) throw new Error('応募が見つかりません');
  run('UPDATE applications SET status = ?, updated_at = ?, reject_reason = ?, reject_note = ? WHERE id = ?', status, now(),
    status === 'rejected' ? reason || 'その他' : a.reject_reason, status === 'rejected' ? note : a.reject_note, appId);
  addEvent(appId, status, [reason, note].filter(Boolean).join('：'), actor);
  const label = L.appStatus[status];
  const msgs = {
    submitted: 'スキルシートを提出しました。書類の結果をお待ちください。',
    doc_passed: '書類選考を通過しました。面談の日程を調整します。',
    rejected: `今回は見送りとなりました。${reason ? `理由：${reason}。` : ''}${note ? note + '。' : ''}次の案件に活かします。`,
    withdrawn: '応募を取り下げました。',
  };
  if (msgs[status]) {
    notifyEg(a.engineer_id, `${label}：${a.title}`, msgs[status], `/applications/${appId}`, { kind: 'status' });
    notifySes(a.ses_id, `${a.eg_name} さん ${label}：${a.title}`, msgs[status], `/applications/${appId}`, { kind: 'status' });
  }
  if (status === 'withdrawn') notifyAdmins(`応募の取り下げ：${a.title}`, `${a.eg_name} さんが応募を取り下げました。${note}`, `/applications/${appId}`, { mail: false });
  audit(actor.id, 'app-status', `${a.eg_name} / ${a.title} → ${label}`);
  refreshEngineerStatus(a.engineer_id);
}

function scheduleInterview(appId, d, actor) {
  const a = get('SELECT a.*, c.title FROM applications a JOIN cases c ON c.id = a.case_id WHERE a.id = ?', appId);
  const round = (get('SELECT MAX(round) AS r FROM interviews WHERE application_id = ?', appId).r || 0) + 1;
  const qa = generateQA(a.case_id, a.engineer_id);
  const r = run('INSERT INTO interviews (application_id, round, scheduled_at, place, qa_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    appId, round, str(d.scheduled_at).replace('T', ' ') || null, str(d.place) || null, JSON.stringify(qa), now());
  run("UPDATE applications SET status = 'interview', updated_at = ? WHERE id = ?", now(), appId);
  addEvent(appId, 'interview', `${round}回目 ${str(d.scheduled_at).replace('T', ' ')} ${str(d.place)}`, actor);
  const when = `${str(d.scheduled_at).replace('T', ' ') || '日時調整中'}／${str(d.place) || '場所・URL は追ってご連絡'}`;
  notifyEg(a.engineer_id, `面談が決まりました：${a.title}（${round}回目）`, `面談：${when}\n\nこの案件に合わせた「面談対策の Q&A」を用意しました。面談の前に目を通し、自分の言葉で答えられるようにしておいてください。`, `/interviews/${Number(r.lastInsertRowid)}`, { kind: 'interview' });
  notifySes(a.ses_id, `面談が決まりました：${a.title}`, `面談：${when}`, `/applications/${appId}`, { kind: 'interview' });
  audit(actor.id, 'interview', `${a.title} ${round}回目`);
  return Number(r.lastInsertRowid);
}
function interviewResult(ivId, result, feedback, actor) {
  const iv = get('SELECT * FROM interviews WHERE id = ?', ivId);
  run('UPDATE interviews SET result = ?, feedback = ? WHERE id = ?', result, str(feedback) || null, ivId);
  if (result === 'pass') {
    run("UPDATE applications SET status = 'interviewed', updated_at = ? WHERE id = ?", now(), iv.application_id);
    addEvent(iv.application_id, 'interviewed', `${iv.round}回目 通過。${str(feedback)}`, actor);
    const a = get('SELECT a.*, c.title FROM applications a JOIN cases c ON c.id = a.case_id WHERE a.id = ?', iv.application_id);
    notifyEg(a.engineer_id, `面談を通過しました：${a.title}`, `${iv.round}回目の面談を通過しました。${str(feedback) ? '\n感想：' + str(feedback) : ''}\n次のご連絡をお待ちください。`, `/applications/${a.id}`, { kind: 'status' });
    notifySes(a.ses_id, `面談通過：${a.title}`, `${iv.round}回目の面談を通過しました。`, `/applications/${a.id}`, { kind: 'status' });
  } else if (result === 'fail') {
    setStatus(iv.application_id, 'rejected', actor, { reason: '面談の受け答え', note: str(feedback) });
  }
}

function makeContract(appId, d, actor) {
  const a = get('SELECT a.*, c.title, c.price AS case_price, c.headcount, e.name AS eg_name FROM applications a JOIN cases c ON c.id = a.case_id JOIN engineers e ON e.id = a.engineer_id WHERE a.id = ?', appId);
  if (get('SELECT id FROM contracts WHERE application_id = ?', appId)) throw new Error('この応募はすでに契約になっています');
  const start = str(d.start_date) || today();
  // 契約は3か月ごと（初めの契約の終わりは、開始から3か月目の月末）
  const endDay = str(d.end_date) || monthEnd(start, 2);
  const price = numOrNull(d.price) ?? a.proposed_price ?? a.case_price;
  if (!price) throw new Error('契約の金額を入れてください');
  const r = run('INSERT INTO contracts (application_id, case_id, engineer_id, ses_id, price, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    appId, a.case_id, a.engineer_id, a.ses_id, price, start, endDay, 'active', now());
  run("UPDATE applications SET status = 'won', updated_at = ? WHERE id = ?", now(), appId);
  addEvent(appId, 'won', `契約 ${start}〜${endDay}／${price}万円`, actor);
  run("UPDATE engineers SET status = 'working' WHERE id = ?", a.engineer_id);
  const won = get("SELECT COUNT(*) AS n FROM applications WHERE case_id = ? AND status = 'won'", a.case_id).n;
  if (won >= (a.headcount || 1)) run("UPDATE cases SET status = 'filled', updated_at = ? WHERE id = ?", now(), a.case_id);
  const kid = Number(r.lastInsertRowid);
  notifyEg(a.engineer_id, `成約おめでとうございます：${a.title}`, `「${a.title}」に決まりました。開始は ${start} です。\n最初の1か月に、困りごとがないか短くお話を聞かせてください（PARK のホームから記入できます）。`, `/applications/${appId}`, { kind: 'won' });
  notifySes(a.ses_id, `成約しました：${a.title}`, `${a.eg_name} さんが「${a.title}」に決まりました。\n契約：${start}〜${endDay}／${price}万円\n成功報酬（初期費用）は、稼働開始の月の請求に含まれます。`, `/contracts/${kid}`, { kind: 'won' });
  audit(actor.id, 'contract', `${a.eg_name} / ${a.title} ${price}万円`);
  return kid;
}
function extendContract(id, months, actor) {
  const k = get('SELECT k.*, c.title FROM contracts k JOIN cases c ON c.id = k.case_id WHERE k.id = ?', id);
  const newEnd = monthEnd(k.end_date, Number(months) || 3);
  run('UPDATE contracts SET end_date = ?, extensions = extensions + 1, status = ? WHERE id = ?', newEnd, 'active', id);
  notifySes(k.ses_id, `契約が延長されました：${k.title}`, `契約の終わりが ${newEnd} になりました。`, `/contracts/${id}`, { kind: 'contract' });
  notifyEg(k.engineer_id, `契約が延長されました：${k.title}`, `契約の終わりが ${newEnd} になりました。引き続きよろしくお願いします。`, `/contracts/${id}`, { kind: 'contract' });
  audit(actor.id, 'contract-extend', `${k.title} → ${newEnd}`);
}
function endContract(id, d, actor) {
  const k = get('SELECT * FROM contracts WHERE id = ?', id);
  run("UPDATE contracts SET status = 'ended', end_date = ?, end_reason = ? WHERE id = ?", str(d.end_date) || k.end_date || today(), str(d.end_reason) || null, id);
  audit(actor.id, 'contract-end', `#${id} ${str(d.end_reason)}`);
  refreshEngineerStatus(k.engineer_id);
}

module.exports = {
  inviteUser, applySes, approveSes, createEngineer, updateEngineer, saveSkills, saveProject, initialsFromKana,
  saveCase, distribute, apply, setStatus, scheduleInterview, interviewResult, makeContract, extendContract, endContract,
  refreshEngineerStatus, addEvent, CASE_FIELDS,
};
