/**
 * fase4-migration.test.ts
 *
 * A migração 0017 roda sozinha no deploy (runPendingMigrations), antes do servidor
 * aceitar tráfego. Por isso ela só pode ADICIONAR: tabelas, índices, colunas — e
 * um único alargamento de enum (alarm_changes.changeType ganha 'created', no
 * fim da lista, o que no MySQL não reescreve a tabela). Nada que apague, renomeie
 * ou reescreva dado existente.
 *
 * Também trava que o schema do Drizzle, o SQL, o journal e o snapshot contam a
 * mesma história (um deploy com schema divergente derrubou o monitoramento por
 * 27 h em julho/2026).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accountLiveness,
  alarmChanges,
  alarmManagement,
  managedAlarmLists,
  userData,
} from "../drizzle/schema";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

const SQL = read("drizzle/0017_fase4_gerenciamento.sql");
const statements = SQL.split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

describe("0017_fase4_gerenciamento.sql — só adiciona", () => {
  it("todo comando é CREATE TABLE, CREATE INDEX, ADD de coluna ou o único MODIFY COLUMN", () => {
    for (const s of statements) {
      expect(
        /^(CREATE TABLE `\w+` \(|CREATE INDEX `\w+` ON `\w+`|ALTER TABLE `\w+` ADD `\w+` |ALTER TABLE `\w+` MODIFY COLUMN `\w+` enum)/.test(
          s,
        ),
        s.slice(0, 80),
      ).toBe(true);
    }
  });

  it("não apaga, renomeia nem reescreve nada", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/\bDELETE\b/i);
    expect(SQL).not.toMatch(/\bTRUNCATE\b/i);
    expect(SQL).not.toMatch(/\bRENAME\b/i);
    expect(SQL).not.toMatch(/\bUPDATE\s+`/i);
    expect(SQL).not.toMatch(/\bCHANGE\s+`/i);
  });

  it("tem exatamente um MODIFY COLUMN: o enum alarm_changes.changeType, sem perder valor e com 'created'", () => {
    const modifies = statements.filter((s) => /MODIFY COLUMN/i.test(s));
    expect(modifies).toHaveLength(1);
    expect(modifies[0]).toBe(
      "ALTER TABLE `alarm_changes` MODIFY COLUMN `changeType` enum('deleted','disabled','rescheduled','created') NOT NULL;",
    );
  });

  it("cria as duas tabelas novas e os índices do acordo", () => {
    expect(SQL).toMatch(/CREATE TABLE `alarm_management`/);
    expect(SQL).toMatch(/CREATE TABLE `managed_alarm_lists`/);
    expect(SQL).toMatch(/managed_alarm_lists_monitoredOpenId_unique` UNIQUE\(`monitoredOpenId`\)/);
    expect(SQL).toMatch(/CREATE INDEX `alarm_management_monitored_idx` ON `alarm_management` \(`monitoredOpenId`\)/);
    expect(SQL).toMatch(/CREATE INDEX `alarm_management_caregiver_idx` ON `alarm_management` \(`caregiverOpenId`\)/);
  });

  it("acrescenta as colunas novas, todas anuláveis (linhas antigas continuam válidas)", () => {
    for (const col of [
      "ALTER TABLE `user_data` ADD `timezone` varchar(64);",
      "ALTER TABLE `account_liveness` ADD `dmsPausedReason` enum('logged_out','app_removed','no_signal');",
      "ALTER TABLE `account_liveness` ADD `dmsPausedAt` timestamp;",
      "ALTER TABLE `account_liveness` ADD `pauseNoticeSentAt` timestamp;",
      "ALTER TABLE `alarm_changes` ADD `changedByOpenId` varchar(64);",
    ]) {
      expect(SQL).toContain(col);
    }
  });
});

describe("schema, journal e snapshot contam a mesma história", () => {
  it("o schema do Drizzle tem as tabelas e colunas do contrato", () => {
    expect(Object.keys(getTableColumns(alarmManagement)).sort()).toEqual(
      [
        "caregiverOpenId",
        "endedAt",
        "endedReason",
        "id",
        "monitoredOpenId",
        "requestedAt",
        "respondedAt",
        "status",
      ].sort(),
    );
    expect(Object.keys(getTableColumns(managedAlarmLists)).sort()).toEqual(
      [
        "alarms",
        "appliedAlarms",
        "appliedAt",
        "appliedVersion",
        "failedAlarmIds",
        "id",
        "monitoredOpenId",
        "updatedAt",
        "updatedByOpenId",
        "version",
        "visibleNoticeSentForVersion",
      ].sort(),
    );
    expect(userData.timezone.notNull).toBe(false);
    expect(accountLiveness.dmsPausedReason.enumValues).toEqual(["logged_out", "app_removed", "no_signal"]);
    expect(accountLiveness.dmsPausedAt.notNull).toBe(false);
    expect(accountLiveness.pauseNoticeSentAt.notNull).toBe(false);
    expect(alarmChanges.changedByOpenId.notNull).toBe(false);
    expect(alarmChanges.changeType.enumValues).toEqual(["deleted", "disabled", "rescheduled", "created"]);
    expect(alarmManagement.status.enumValues).toEqual(["pending", "active", "ended"]);
    expect(alarmManagement.endedReason.enumValues).toEqual([
      "declined",
      "expired",
      "cancelled",
      "stopped_by_monitored",
      "stopped_by_caregiver",
      "unlinked",
      "account_deleted",
    ]);
  });

  it("o journal registra a 0017 logo depois da 0016", () => {
    const journal = JSON.parse(read("drizzle/meta/_journal.json")) as {
      entries: Array<{ idx: number; tag: string; breakpoints: boolean }>;
    };
    expect(journal.entries[16].tag).toBe("0016_alarm_events_kind_grace");
    expect(journal.entries[17]).toMatchObject({
      idx: 17,
      tag: "0017_fase4_gerenciamento",
      breakpoints: true,
    });
  });

  it("o snapshot da 0017 encadeia na 0016 e inclui as tabelas novas", () => {
    const s16 = JSON.parse(read("drizzle/meta/0016_snapshot.json")) as { id: string };
    const s17 = JSON.parse(read("drizzle/meta/0017_snapshot.json")) as {
      prevId: string;
      tables: Record<string, { columns: Record<string, unknown> }>;
    };
    expect(s17.prevId).toBe(s16.id);
    expect(Object.keys(s17.tables)).toEqual(expect.arrayContaining(["alarm_management", "managed_alarm_lists"]));
    expect(s17.tables["user_data"].columns).toHaveProperty("timezone");
    expect(s17.tables["alarm_changes"].columns).toHaveProperty("changedByOpenId");
    expect(s17.tables["account_liveness"].columns).toHaveProperty("dmsPausedReason");
  });
});
