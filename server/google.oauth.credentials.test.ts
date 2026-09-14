import { describe, expect, it } from "vitest";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

describe("Google OAuth credentials", () => {
  it("is configured with a valid web client shape", () => {
    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(clientSecret).toMatch(/^GOCSPX-/);
  });

  it("reaches the official token endpoint without accepting an invalid grant", async () => {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId ?? "",
        client_secret: clientSecret ?? "",
        code: "drivebeat-validation-code",
        grant_type: "authorization_code",
        redirect_uri: "https://drivebeat-9kwyogtl.manus.space/api/google/callback",
      }),
    });
    const payload = await response.json() as { error?: string };
    expect(response.ok).toBe(false);
    expect(payload.error).not.toBe("invalid_client");
    expect(["invalid_grant", "invalid_request"]).toContain(payload.error);
  }, 15000);
});
