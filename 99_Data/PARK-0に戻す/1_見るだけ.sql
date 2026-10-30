-- PARK 公開版：消す前に数を見るだけ（何も変えない）。2026-10-28 Leo
-- keep_admin が 1 であること（tezzo047@gmail.com の管理者がいる）を確かめる。0 なら次へ進まない。
SELECT
  (SELECT COUNT(*) FROM users WHERE email = 'tezzo047@gmail.com' AND role = 'admin') AS keep_admin,
  (SELECT COUNT(*) FROM users WHERE email <> 'tezzo047@gmail.com') AS del_users,
  (SELECT COUNT(*) FROM ses_companies WHERE kind <> 'direct') AS del_ses,
  (SELECT COUNT(*) FROM engineers) AS del_engineers,
  (SELECT COUNT(*) FROM cases) AS del_cases,
  (SELECT COUNT(*) FROM applications) AS del_applications,
  (SELECT COUNT(*) FROM contracts) AS del_contracts,
  (SELECT COUNT(*) FROM mail_outbox) AS del_mails;
