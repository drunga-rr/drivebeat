import express from "express";
import { request as httpRequest, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequestMock = vi.hoisted(() => vi.fn());
const getGoogleDriveConnectionMock = vi.hoisted(() => vi.fn());
const saveGoogleDriveConnectionMock = vi.hoisted(() => vi.fn());
const googleFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: authenticateRequestMock },
}));

vi.mock("./db", () => ({
  getGoogleDriveConnection: getGoogleDriveConnectionMock,
  saveGoogleDriveConnection: saveGoogleDriveConnectionMock,
  getGoogleDriveFile: vi.fn(),
  replaceGoogleDriveFiles: vi.fn(),
  listGoogleDriveFiles: vi.fn().mockResolvedValue([]),
  deleteGoogleDriveConnection: vi.fn(),
}));

import {
  createGoogleOAuthState,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_REDIRECT_URI,
  GOOGLE_STATE_COOKIE,
  registerGoogleDriveRoutes,
} from "./googleDrive";

let server: Server | undefined;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  authenticateRequestMock.mockReset();
  getGoogleDriveConnectionMock.mockReset();
  saveGoogleDriveConnectionMock.mockReset();
  googleFetchMock.mockReset();
  vi.stubGlobal("fetch", googleFetchMock);
});

afterEach(async () => {
  vi.stubGlobal("fetch", originalFetch);
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
  }
});

async function requestCallback(path: string, cookie?: string) {
  const app = express();
  registerGoogleDriveRoutes(app);
  server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const request = httpRequest({
      hostname: "127.0.0.1",
      port: address.port,
      path,
      method: "GET",
      headers: cookie ? { cookie } : undefined,
    }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

describe("Google OAuth callback", () => {
  it("redirects a provider denial without exchanging a code", async () => {
    const response = await requestCallback(`${GOOGLE_CALLBACK_PATH}?error=access_denied`);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/?google=error&reason=access_denied");
    expect(googleFetchMock).not.toHaveBeenCalled();
    expect(authenticateRequestMock).not.toHaveBeenCalled();
  });

  it("persists an authenticated user's token and redirects after a valid callback", async () => {
    authenticateRequestMock.mockResolvedValue({ id: 42, name: "DriveBeat User" });
    getGoogleDriveConnectionMock.mockResolvedValue(undefined);
    googleFetchMock.mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-token-for-test",
      refresh_token: "refresh-token-for-test",
      expires_in: 3600,
      scope: GOOGLE_DRIVE_SCOPE,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const { state } = createGoogleOAuthState();
    const response = await requestCallback(
      `${GOOGLE_CALLBACK_PATH}?code=google-code&state=${encodeURIComponent(state)}`,
      `${GOOGLE_STATE_COOKIE}=${state}`,
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/?google=connected");
    expect(googleFetchMock).toHaveBeenCalledTimes(1);
    const tokenRequest = googleFetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new URLSearchParams(String(tokenRequest.body)).get("redirect_uri")).toBe(GOOGLE_REDIRECT_URI);
    expect(saveGoogleDriveConnectionMock).toHaveBeenCalledTimes(1);
    const saved = saveGoogleDriveConnectionMock.mock.calls[0]?.[0];
    expect(saved.userId).toBe(42);
    expect(saved.scope).toBe(GOOGLE_DRIVE_SCOPE);
    expect(saved.encryptedAccessToken).not.toContain("access-token-for-test");
    expect(saved.encryptedRefreshToken).not.toContain("refresh-token-for-test");
  });
});
