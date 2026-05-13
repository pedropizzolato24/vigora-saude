/**
 * location-privacy.test.ts
 *
 * Validates Fix #13:
 *   1. The location screen's privacy copy no longer claims location
 *      is "nunca guardada em servidores" — it disclosed the server
 *      sync when autoShareLocation is on.
 *   2. The MonitoringInitializer gates location sharing on the user's
 *      autoShareLocation setting (we test by inspecting the source —
 *      a true e2e check would require RN runtime).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const locationSrc = readFileSync(
  join(__dirname, "..", "app", "(tabs)", "location.tsx"),
  "utf-8"
);

const monitorInitSrc = readFileSync(
  join(__dirname, "..", "components", "monitoring-initializer.tsx"),
  "utf-8"
);

describe("Privacy copy on the Location screen", () => {
  it("does NOT contain the misleading 'Nunca é guardada em servidores' line", () => {
    expect(locationSrc).not.toMatch(/Nunca é guardada em servidores/);
  });

  it("does NOT contain the misleading 'nunca é armazenada em servidores externos' line", () => {
    expect(locationSrc).not.toMatch(/nunca é armazenada em servidores externos/);
  });

  it("discloses that location may be sent to the server for monitoring", () => {
    // Either of these phrasings is acceptable evidence of disclosure.
    const honest =
      /enviada\s+(?:ao|para o)\s+servidor/i.test(locationSrc) ||
      /Compartilhar localização automaticamente/i.test(locationSrc);
    expect(honest).toBe(true);
  });

  it("does not promise that location stays only on-device", () => {
    expect(locationSrc).not.toMatch(/só fica no dispositivo/i);
    expect(locationSrc).not.toMatch(/apenas no aparelho/i);
  });
});

describe("MonitoringInitializer location opt-in gating", () => {
  it("uses the autoShareLocation setting to decide whether to fetch location", () => {
    expect(monitorInitSrc).toMatch(/autoShareLocation/);
    expect(monitorInitSrc).toMatch(/getCurrentLocationStringIfOptedIn/);
  });

  it("passes the opt-in flag to the heartbeat callback", () => {
    // Heartbeat callback must call the opted-in version, not the old one
    expect(monitorInitSrc).toMatch(
      /startHeartbeat\(\s*\(\)\s*=>\s*getCurrentLocationStringIfOptedIn/
    );
  });
});
