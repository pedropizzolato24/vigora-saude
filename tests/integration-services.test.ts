/**
 * integration-services.test.ts
 *
 * Validates that Resend (email) and Twilio (SMS) credentials are correctly
 * configured in the environment. Uses lightweight API calls that don't
 * actually send messages.
 */
import { describe, it, expect } from "vitest";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER ?? "";

describe("Resend Email Service", () => {
  it("should have RESEND_API_KEY configured", () => {
    expect(RESEND_API_KEY).toBeTruthy();
    expect(RESEND_API_KEY).toMatch(/^re_/);
  });

  it("should authenticate successfully with Resend API", async () => {
    // Use the /emails endpoint with a test recipient that Resend provides
    // This validates the key without sending a real email
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Vigora Saúde <onboarding@resend.dev>",
        to: ["delivered@resend.dev"],
        subject: "Vigora Saúde — Teste de Integração",
        html: "<p>Validação de credenciais Resend</p>",
      }),
    });

    // 200 = sent successfully, 422 = validation error (key valid but params wrong)
    // Both indicate the key is valid
    expect([200, 422]).toContain(response.status);
    if (response.status === 200) {
      const data = (await response.json()) as any;
      expect(data.id).toBeTruthy();
    }
  });
});

describe("Twilio SMS Service", () => {
  it("should have TWILIO_ACCOUNT_SID configured", () => {
    expect(TWILIO_ACCOUNT_SID).toBeTruthy();
    expect(TWILIO_ACCOUNT_SID).toMatch(/^AC/);
  });

  it("should have TWILIO_AUTH_TOKEN configured", () => {
    expect(TWILIO_AUTH_TOKEN).toBeTruthy();
    expect(TWILIO_AUTH_TOKEN.length).toBeGreaterThan(10);
  });

  it("should have TWILIO_FROM_NUMBER configured", () => {
    expect(TWILIO_FROM_NUMBER).toBeTruthy();
    expect(TWILIO_FROM_NUMBER).toMatch(/^\+/);
  });

  it("should authenticate successfully with Twilio API", async () => {
    // Fetch account info — lightweight call that validates credentials
    const credentials = Buffer.from(
      `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
    ).toString("base64");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json`,
      {
        headers: { Authorization: `Basic ${credentials}` },
      }
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.status).toBe("active");
    expect(data.sid).toBe(TWILIO_ACCOUNT_SID);
  });

  it("should have the FROM number registered in the account", async () => {
    const credentials = Buffer.from(
      `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
    ).toString("base64");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`,
      {
        headers: { Authorization: `Basic ${credentials}` },
      }
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    const numbers = (data.incoming_phone_numbers ?? []).map(
      (n: any) => n.phone_number
    );
    expect(numbers).toContain(TWILIO_FROM_NUMBER);
  });
});
