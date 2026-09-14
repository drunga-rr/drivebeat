import { afterEach, describe, expect, it } from "vitest";
import {
  buildGoogleAuthorizationUrl,
  decryptSecret,
  encryptSecret,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_REDIRECT_URI,
  isGoogleDriveAudioFile,
  createGoogleOAuthState,
  validateGoogleOAuthState,
} from "./googleDrive";

describe("Google Drive cloud contract", () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it("encrypts and decrypts a token without storing it in plaintext", () => {
    process.env.JWT_SECRET = "google-drive-test-secret";
    const token = "ya29.access-token-value";
    const encrypted = encryptSecret(token);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted)).toBe(token);
  });

  it("accepts only MP3 audio candidates for the cloud library", () => {
    expect(isGoogleDriveAudioFile({ name: "song.mp3", mimeType: "application/octet-stream" })).toBe(true);
    expect(isGoogleDriveAudioFile({ name: "SONG.MP3", mimeType: "application/octet-stream" })).toBe(true);
    expect(isGoogleDriveAudioFile({ name: "cover.jpg", mimeType: "image/jpeg" })).toBe(false);
    expect(isGoogleDriveAudioFile({ name: "song.wav", mimeType: "audio/wav" })).toBe(false);
  });

  it("binds OAuth state to the one-time browser cookie", () => {
    const { state } = createGoogleOAuthState();
    expect(validateGoogleOAuthState(state, state)).toBe(true);
    expect(validateGoogleOAuthState(state, "invalid-state")).toBe(false);
    expect(validateGoogleOAuthState(undefined, state)).toBe(false);
  });

  it("builds a Drive read-only authorization request", () => {
    process.env.JWT_SECRET = "google-drive-test-secret";
    const url = new URL(buildGoogleAuthorizationUrl("state-123"));
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(url.searchParams.get("scope")).toBe(GOOGLE_DRIVE_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("redirect_uri")).toBe(GOOGLE_REDIRECT_URI);
  });
});
