'use strict';
// 成功報酬の計算。基準は案件の金額（SES が受け取る月額）。成約時に初期費用、契約が続く間は月額費用。率は「設定」で変えられる（仮）。
const { all, get, run, setting } = require('./db');
const { monthDiff, now } = require('./util');

function rates() {
  return {
    initial: Number(setting('fee_initial_rate')) / 100,
    monthly: Number(setting('fee_monthly_rate')) / 100,
    monthlyFrom: Number(setting('monthly_from')) || 2,
    tax: Number(setting('tax_rate')) / 100,
  };
}

// ある月（YYYY-MM）に、その SES に請求する明細
function invoiceItems(sesId, period) {
  const r = rates();
  const items = [];
  const contracts = all(`SELECT k.*, c.title AS case_title, e.name AS eg_name, e.initials FROM contracts k
    JOIN cases c ON c.id = k.case_id JOIN engineers e ON e.id = k.engineer_id WHERE k.ses_id = ?`, sesId);
  for (const k of contracts) {
    const startYm = k.start_date.slice(0, 7);
    const endYm = k.end_date ? k.end_date.slice(0, 7) : null;
    const base = Math.round(k.price * 10000);
    const n = monthDiff(startYm, period) + 1; // 稼働の何か月目か
    if (n === 1) items.push({ contract_id: k.id, type: 'initial', label: `初期費用 ${k.case_title}（${k.eg_name}）`, base, rate: r.initial, amount: Math.round(base * r.initial) });
    const active = n >= r.monthlyFrom && (!endYm || period <= endYm) && !(k.status === 'ended' && endYm && period > endYm);
    if (n >= 1 && active) items.push({ contract_id: k.id, type: 'monthly', label: `月額費用 ${k.case_title}（${k.eg_name}・${n}か月目）`, base, rate: r.monthly, amount: Math.round(base * r.monthly) });
  }
  const subtotal = items.reduce((a, b) => a + b.amount, 0);
  const tax = Math.floor(subtotal * r.tax);
  return { items, subtotal, tax, total: subtotal + tax };
}

// 下書きの請求書を作る・作り直す（発行済みは変えない）
function buildInvoice(sesId, period) {
  const ex = get('SELECT * FROM invoices WHERE ses_id = ? AND period = ?', sesId, period);
  if (ex && ex.status !== 'draft') return ex;
  const inv = invoiceItems(sesId, period);
  if (!inv.items.length) { if (ex) run('DELETE FROM invoices WHERE id = ?', ex.id); return null; }
  if (ex) run('UPDATE invoices SET items_json = ?, subtotal = ?, tax = ?, total = ? WHERE id = ?', JSON.stringify(inv.items), inv.subtotal, inv.tax, inv.total, ex.id);
  else run('INSERT INTO invoices (ses_id, period, items_json, subtotal, tax, total, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    sesId, period, JSON.stringify(inv.items), inv.subtotal, inv.tax, inv.total, 'draft', now());
  return get('SELECT * FROM invoices WHERE ses_id = ? AND period = ?', sesId, period);
}

// 契約の今の月額費用（ダッシュボードの見込み用）
function monthlyEstimate(sesId, period) { return invoiceItems(sesId, period); }

module.exports = { rates, invoiceItems, buildInvoice, monthlyEstimate };
