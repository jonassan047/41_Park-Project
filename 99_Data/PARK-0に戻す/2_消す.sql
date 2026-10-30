-- PARK 公開版を 0 に戻す（2026-10-29 TEZZO 指示「1はa」）
-- 管理者 tezzo047@gmail.com だけを残し、ほかのアカウント・SES・エンジニア・案件・応募・通知などを全部消す。
-- 残すもの：その管理者1人、管理者の直属（ses_companies.kind = 'direct'）、settings、skill_terms、migrations。
-- 安全装置：管理者 tezzo047@gmail.com が見つからないときは、何も消さない（@keep が NULL になり、どの DELETE も 0 件）。
-- phpMyAdmin で、PARK の DB を選んでから「インポート」でこのファイルを流す。

SET @keep := (SELECT id FROM users WHERE email = 'tezzo047@gmail.com' AND role = 'admin' LIMIT 1);
SELECT @keep AS `残す管理者の id（NULL なら何も消さない）`;

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM ai_jobs            WHERE @keep IS NOT NULL;
DELETE FROM application_events WHERE @keep IS NOT NULL;
DELETE FROM interviews         WHERE @keep IS NOT NULL;
DELETE FROM follow_ups         WHERE @keep IS NOT NULL;
DELETE FROM contracts          WHERE @keep IS NOT NULL;
DELETE FROM applications       WHERE @keep IS NOT NULL;
DELETE FROM invoices           WHERE @keep IS NOT NULL;
DELETE FROM case_mails         WHERE @keep IS NOT NULL;
DELETE FROM case_offers        WHERE @keep IS NOT NULL;
DELETE FROM cases              WHERE @keep IS NOT NULL;
DELETE FROM messages           WHERE @keep IS NOT NULL;
DELETE FROM engineer_files     WHERE @keep IS NOT NULL;
DELETE FROM engineer_certs     WHERE @keep IS NOT NULL;
DELETE FROM engineer_histories WHERE @keep IS NOT NULL;
DELETE FROM engineer_projects  WHERE @keep IS NOT NULL;
DELETE FROM engineer_skills    WHERE @keep IS NOT NULL;
DELETE FROM engineers          WHERE @keep IS NOT NULL;
DELETE FROM ses_companies      WHERE @keep IS NOT NULL AND kind <> 'direct';
DELETE FROM app_notifications  WHERE @keep IS NOT NULL;
DELETE FROM mail_outbox        WHERE @keep IS NOT NULL;
DELETE FROM audit_log          WHERE @keep IS NOT NULL;
DELETE FROM jobs               WHERE @keep IS NOT NULL;
DELETE FROM failed_jobs        WHERE @keep IS NOT NULL;
DELETE FROM password_reset_tokens WHERE @keep IS NOT NULL;
DELETE FROM sessions           WHERE @keep IS NOT NULL AND (user_id IS NULL OR user_id <> @keep);
-- 残す管理者のエンジニア・SES との兼任も外す（消したエンジニア・SES を指さないように）
UPDATE users SET engineer_id = NULL, ses_id = NULL WHERE @keep IS NOT NULL AND id = @keep;
DELETE FROM users              WHERE @keep IS NOT NULL AND id <> @keep;

SET FOREIGN_KEY_CHECKS = 1;

-- 結果（users は 1、ほかは 0 になっていればよい。ses_companies は直属の 1 が残ることがある）
SELECT
  (SELECT COUNT(*) FROM users)         AS users,
  (SELECT COUNT(*) FROM ses_companies) AS ses_companies,
  (SELECT COUNT(*) FROM engineers)     AS engineers,
  (SELECT COUNT(*) FROM cases)         AS cases,
  (SELECT COUNT(*) FROM applications)  AS applications,
  (SELECT COUNT(*) FROM app_notifications) AS notifications,
  (SELECT COUNT(*) FROM mail_outbox)   AS mail_outbox;
