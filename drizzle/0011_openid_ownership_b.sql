-- Migração de posse: deviceId -> openId (spec docs/design/2026-07-12-monitoring-account-ownership.md)
-- ORDEM IMPORTA: todo o backfill/consolidação roda ANTES de qualquer drop.
-- MySQL DDL não é transacional — aplicar com o job pausado e backup feito.

-- 1) account_liveness: consolida device_heartbeat + app_users por conta.
--    ROW_NUMBER particionado por openId (heartbeat mais RECENTE primeiro) => uma
--    linha por conta, sem risco de chave duplicada (openId é UNIQUE). Empate de
--    lastSeenAt é desempatado por deviceId, de forma determinística.
INSERT INTO `account_liveness` (`openId`, `lastSeenAt`, `lastLocation`, `lastLocationAt`, `lastDeviceId`, `appVersion`)
SELECT `openId`, `lastSeenAt`, `lastLocation`, `lastLocationAt`, `deviceId`, `appVersion`
FROM (
  SELECT au.`openId`, hb.`lastSeenAt`, au.`lastLocation`, au.`lastLocationAt`,
         hb.`deviceId`, hb.`appVersion`,
         ROW_NUMBER() OVER (PARTITION BY au.`openId` ORDER BY hb.`lastSeenAt` DESC, hb.`deviceId` DESC) AS rn
  FROM `device_heartbeat` hb
  JOIN `app_users` au ON au.`deviceId` = hb.`deviceId`
  WHERE au.`openId` IS NOT NULL
) ranked
WHERE rn = 1;--> statement-breakpoint

-- 2) alarm_events: re-atribui por conta (append-only; histórico preservado).
UPDATE `alarm_events` e JOIN `app_users` au ON au.`deviceId` = e.`deviceId` SET e.`openId` = au.`openId`;--> statement-breakpoint

-- 3) Órfãos (device sem conta resolvível) — descartados por decisão do spec.
DELETE FROM `alarm_events` WHERE `openId` IS NULL;--> statement-breakpoint

-- 4) Dedup da nova chave de idempotência (openId, alarmId, scheduledAt):
--    contas com o mesmo evento em vários devices — mantém o menor id.
DELETE e FROM `alarm_events` e
JOIN `alarm_events` k
  ON k.`openId` = e.`openId` AND k.`alarmId` = e.`alarmId`
 AND k.`scheduledAt` = e.`scheduledAt` AND k.`id` < e.`id`;--> statement-breakpoint

-- 5) warning_log: idem (sem dedupe — log de envio, duplicata é histórico real).
UPDATE `warning_log` w JOIN `app_users` au ON au.`deviceId` = w.`deviceId` SET w.`openId` = au.`openId`;--> statement-breakpoint
DELETE FROM `warning_log` WHERE `openId` IS NULL;--> statement-breakpoint

-- 6) Backfill defensivo de contatos: contas que registraram contatos no
--    app_users antes de um cloud sync. user_data é autoritativo — só copia
--    onde estiver vazio.
UPDATE `user_data` ud JOIN `app_users` au ON au.`openId` = ud.`openId`
SET ud.`emergencyContacts` = au.`emergencyContacts`
WHERE (ud.`emergencyContacts` IS NULL OR JSON_LENGTH(ud.`emergencyContacts`) = 0)
  AND au.`emergencyContacts` IS NOT NULL AND JSON_LENGTH(au.`emergencyContacts`) > 0;--> statement-breakpoint

-- 6b) Conta com contatos no app_users e SEM linha de user_data: cria a linha.
--     ROW_NUMBER dedupa contas com múltiplos devices (uma linha por openId),
--     evitando conflito de chave única sem precisar de ON DUPLICATE KEY UPDATE.
INSERT INTO `user_data` (`openId`, `emergencyContacts`)
SELECT `openId`, `emergencyContacts` FROM (
  SELECT au.`openId`, au.`emergencyContacts`,
         ROW_NUMBER() OVER (PARTITION BY au.`openId` ORDER BY au.`id`) AS rn
  FROM `app_users` au
  LEFT JOIN `user_data` ud ON ud.`openId` = au.`openId`
  WHERE au.`openId` IS NOT NULL
    AND au.`emergencyContacts` IS NOT NULL AND JSON_LENGTH(au.`emergencyContacts`) > 0
    AND ud.`id` IS NULL
) picked
WHERE rn = 1;--> statement-breakpoint

-- 7) Constraints e drops (só depois de todo o backfill acima).
ALTER TABLE `alarm_events` MODIFY COLUMN `openId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `warning_log` MODIFY COLUMN `openId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `alarm_events` DROP COLUMN `deviceId`;--> statement-breakpoint
ALTER TABLE `warning_log` DROP COLUMN `deviceId`;--> statement-breakpoint
DROP TABLE `app_users`;--> statement-breakpoint
DROP TABLE `device_heartbeat`;--> statement-breakpoint
DROP TABLE `synced_alarms`;
