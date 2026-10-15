'use strict';
// 面談対策の Q&A。案件の要件と本人の経験票から、想定質問と「答え方のヒント」を作る。
// 外部の AI には渡さない（案件・個人の情報を外に出さない約束）。文は運営が画面で直せる。
const { all, get } = require('./db');
const { parseList, normSkill } = require('./util');
const { skillIndex, hasSkill, looseMatch } = require('./match');

function projectsUsing(projects, skill) {
  const k = normSkill(skill);
  return projects.filter((p) => parseList(p.tech).some((t) => { const n = normSkill(t); return n === k || (k.length >= 3 && n.length >= 3 && looseMatch(n, k)); }));
}
const projLine = (p) => `「${p.title}」（${p.period_from || '?'}〜${p.period_to || '現在'}、${p.role || '担当'}${p.team_size ? `、${p.team_size}名体制` : ''}）`;

function generateQA(caseId, engineerId) {
  const c = get('SELECT * FROM cases WHERE id = ?', caseId);
  const e = get('SELECT * FROM engineers WHERE id = ?', engineerId);
  if (!c || !e) return [];
  const projects = all('SELECT * FROM engineer_projects WHERE engineer_id = ? ORDER BY period_from DESC', engineerId);
  const idx = skillIndex(engineerId);
  const qa = [];
  const add = (category, q, hint) => qa.push({ category, q, hint });

  const latest = projects[0];
  add('自己紹介', '簡単に自己紹介と、これまでのご経歴をお願いします。',
    `1分程度で。経験${e.years_exp || '?'}年、得意分野、直近の案件の順に話す。` +
    (latest ? `直近は${projLine(latest)}。` : '') + (e.strengths ? `強み：${e.strengths}` : ''));

  if (latest) {
    add('直近の案件', '直近の案件で、どのような役割・作業を担当しましたか。',
      `${projLine(latest)}。担当工程：${latest.phases || '（経験票に工程を書いておく）'}。` +
      (latest.achievements ? `成果は数字で：${latest.achievements}` : '成果を数字で1つ言えるようにしておく（件数・時間・割合など）。'));
  }

  for (const r of parseList(c.required_skills)) {
    const s = hasSkill(idx, r);
    const ps = projectsUsing(projects, r);
    if (s) {
      add(`必須：${r}`, `${r} の経験について、年数と担当した範囲を教えてください。`,
        `${s.years ? `${s.years}年。` : ''}${ps.length ? `使った案件：${ps.slice(0, 2).map(projLine).join('、')}。` : ''}` +
        '「何を作ったか」「どこまで1人でできるか」「困ったことと解決」を1つずつ。');
    } else {
      add(`必須：${r}（要準備）`, `${r} のご経験はありますか。`,
        '経験が無い・浅い場合は、正直に答える。近い技術の経験と、自分で学んでいること（期間・内容）を具体的に言う。盛らない。');
    }
  }
  for (const r of parseList(c.preferred_skills)) {
    if (hasSkill(idx, r)) add(`尚可：${r}`, `${r} はどの程度触っていますか。`, `経験した範囲を短く。${projectsUsing(projects, r).slice(0, 1).map(projLine).join('')}`);
  }

  add('進め方', 'チームでの開発で、気をつけていることは何ですか。', '報告・連絡・相談のタイミング、レビュー、ドキュメントなど、具体的な習慣を1つ例に出す。');
  add('トラブル', 'これまでに困った・失敗した経験と、どう対応したかを教えてください。', '状況 → 自分がしたこと → 結果 → 学んだこと の順で。他人のせいにしない。');
  if (c.work_style === 'onsite' || c.work_style === 'hybrid') add('条件', `勤務地（${c.location || '現場'}）への通勤や、出社の頻度は問題ありませんか。`, '最寄り駅からの時間を事前に調べておく。条件が合わない点は応募前に確認済みのことを伝える。');
  add('条件', `開始日（${c.start_date || '相談'}）と、週${c.days_per_week || 5}日の稼働は可能ですか。`, '可能なら「可能です」とはっきり。難しい場合は、いつからなら可能かを具体的に。');
  add('意欲', 'この案件に興味を持った理由を教えてください。', `案件の内容（${(c.description || c.title).slice(0, 40)}…）と、自分の経験・伸ばしたい方向を結びつける。`);

  const reverse = ['チームの体制と、参画後に最初に担当する作業を教えてください。', '開発の進め方（レビュー・テスト・使っているツール）を教えてください。',
    '今いちばん困っていること・期待されていることは何ですか。', '評価されるのはどのような働き方ですか。'];
  add('逆質問', '最後に、何か質問はありますか。', `必ず1〜2個用意する。候補：${reverse.join(' / ')}`);
  return qa;
}

// 経験票の完成度と、スキルシートを良くするための指摘
function sheetCheck(engineerId) {
  const e = get('SELECT * FROM engineers WHERE id = ?', engineerId);
  const skills = all('SELECT * FROM engineer_skills WHERE engineer_id = ?', engineerId);
  const projects = all('SELECT * FROM engineer_projects WHERE engineer_id = ?', engineerId);
  const tips = []; let pts = 0; const max = 100;
  if (e.summary && e.summary.length >= 60) pts += 15; else tips.push('自己PR（60字以上）を書きましょう。得意分野と、どんな現場で力を出せるかを短く。');
  if (e.strengths) pts += 5; else tips.push('強み（ひとこと）を書きましょう。');
  if (skills.length >= 5) pts += 15; else tips.push('スキルは5つ以上、年数とレベルを入れましょう。');
  if (skills.every((s) => s.years)) pts += 5; else tips.push('スキルの年数が空のものがあります。');
  if (projects.length >= 2) pts += 20; else tips.push('経験したプロジェクトを2件以上入れましょう。');
  const noAch = projects.filter((p) => !p.achievements || !/\d/.test(p.achievements));
  if (projects.length && !noAch.length) pts += 15; else if (noAch.length) tips.push(`成果が数字で書かれていない案件が ${noAch.length} 件あります（例：処理時間を30%短縮、月200件の問い合わせを削減）。`);
  const noPhase = projects.filter((p) => !p.phases);
  if (projects.length && !noPhase.length) pts += 10; else if (noPhase.length) tips.push(`担当工程が空の案件が ${noPhase.length} 件あります。`);
  if (projects.length && projects.every((p) => p.description && p.description.length >= 40)) pts += 10; else if (projects.length) tips.push('案件の作業内容は40字以上で、何を・どこまで担当したかを具体的に。');
  if (e.desired_price && e.available_from) pts += 5; else tips.push('希望単価と稼働開始日を入れると、合う案件が届きやすくなります。');
  tips.push('事実と違うこと（盛った内容）は書かないでください。面談や配属後のトラブルの元になります。');
  return { score: Math.min(pts, max), tips };
}

module.exports = { generateQA, sheetCheck };
