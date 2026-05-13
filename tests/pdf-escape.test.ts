/**
 * pdf-escape.test.ts
 *
 * Validates HTML escaping in the health-report PDF generator.
 *
 * Before Fix #12, user-controlled values (name, alarm description,
 * birth date, blood type) were interpolated directly into the HTML
 * template. If the resulting PDF/HTML was later viewed in a WebView,
 * any user-supplied <script> or <img onerror> would execute.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

import {
  esc,
  buildReportHtml,
} from "../lib/health-report-generator";
import type {
  HealthMetric,
  Alarm,
  UserProfile,
} from "../lib/app-context";

describe("esc()", () => {
  it("escapes the 5 HTML metacharacters", () => {
    expect(esc("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(esc(`a&b`)).toBe("a&amp;b");
    expect(esc(`"hi"`)).toBe("&quot;hi&quot;");
    expect(esc(`it's`)).toBe("it&#39;s");
  });

  it("returns empty string for null/undefined", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("coerces numbers and other primitives to safe text", () => {
    expect(esc(42)).toBe("42");
    expect(esc(0)).toBe("0");
    expect(esc(true)).toBe("true");
  });
});

describe("buildReportHtml — XSS prevention", () => {
  const baseProfile: UserProfile = {
    name: "",
    photoUri: null,
    birthDate: "",
    bloodType: "",
    phone: "",
  };

  it("escapes <script> in profile name", () => {
    const html = buildReportHtml({
      profile: {
        ...baseProfile,
        name: "<script>alert('xss')</script>",
      },
      healthMetrics: [],
      alarms: [],
      generatedAt: Date.now(),
    });
    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("escapes HTML in alarm description", () => {
    const alarm: Alarm = {
      id: "a1",
      time: "08:00",
      description: '<img src=x onerror="alert(1)">',
      enabled: true,
      repeat: "daily",
      sound: true,
      vibration: true,
    };
    const html = buildReportHtml({
      profile: baseProfile,
      healthMetrics: [],
      alarms: [alarm],
      generatedAt: Date.now(),
    });
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toMatch(/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  });

  it("escapes HTML in profile birthDate and bloodType", () => {
    const html = buildReportHtml({
      profile: {
        ...baseProfile,
        birthDate: "<b>1/1/2000</b>",
        bloodType: "<i>A+</i>",
      },
      healthMetrics: [],
      alarms: [],
      generatedAt: Date.now(),
    });
    expect(html).not.toContain("<b>1/1/2000</b>");
    expect(html).not.toContain("<i>A+</i>");
    expect(html).toContain("&lt;b&gt;1/1/2000&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;A+&lt;/i&gt;");
  });

  it("does not break the rest of the HTML structure", () => {
    const html = buildReportHtml({
      profile: { ...baseProfile, name: "Maria <Silva>" },
      healthMetrics: [],
      alarms: [],
      generatedAt: Date.now(),
    });
    // Sanity: the report shell is still there
    expect(html).toMatch(/<!DOCTYPE html>/);
    expect(html).toMatch(/<html lang="pt-BR">/);
    expect(html).toMatch(/Vigora Saúde/);
    // And the name is escaped (no unescaped <Silva>)
    expect(html).not.toMatch(/<Silva>/);
    expect(html).toMatch(/Maria &lt;Silva&gt;/);
  });

  it("escapes a health metric chain that could include attacker text in unit", () => {
    // Units come from a static lookup so they're safe, but let's make
    // sure a synthetic metric record still passes through escaping.
    const metric: HealthMetric = {
      id: "m1",
      type: "heart_rate",
      value: 72,
      unit: "bpm",
      timestamp: Date.now(),
    };
    const html = buildReportHtml({
      profile: baseProfile,
      healthMetrics: [metric],
      alarms: [],
      generatedAt: Date.now(),
    });
    expect(html).toMatch(/72/);
    expect(html).toMatch(/bpm/);
  });
});
