'use strict';
// 誰が何を見られるか
const { get } = require('./db');

function canEngineer(u, e) {
  if (!u || !e) return false;
  return u.role === 'admin' || (u.role === 'ses' && e.ses_id === u.ses_id) || (u.role === 'eg' && e.id === u.engineer_id);
}
function canEditEngineer(u, e) { return canEngineer(u, e); }

function canCase(u, c) {
  if (!u || !c) return false;
  if (u.role === 'admin') return true;
  // SES はグループの案件をすべて見られる（下書きは自社が登録したものだけ）
  if (u.role === 'ses') return c.status !== 'draft' || c.source_ses_id === u.ses_id;
  if (u.role === 'eg') {
    return !!(get('SELECT id FROM case_offers WHERE case_id = ? AND engineer_id = ?', c.id, u.engineer_id)
      || get('SELECT id FROM applications WHERE case_id = ? AND engineer_id = ?', c.id, u.engineer_id));
  }
  return false;
}
function canEditCase(u, c) { return u.role === 'admin' || (u.role === 'ses' && c.source_ses_id === u.ses_id); }

function canApp(u, a) {
  if (!u || !a) return false;
  return u.role === 'admin' || (u.role === 'ses' && a.ses_id === u.ses_id) || (u.role === 'eg' && a.engineer_id === u.engineer_id);
}

module.exports = { canEngineer, canEditEngineer, canCase, canEditCase, canApp };
