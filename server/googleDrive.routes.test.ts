import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const authenticateRequestMock = vi.hoisted(() => vi.fn());

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: authenticateRequestMock },
}));

vi.mock("./db", () => ({
  getGoogleDriveConnection: vi.fn(),
  saveGoogleDriveConnection: vi.fn(),
  getGoogleDriveFile: vi.fn(),
  replaceGoogleDriveFiles: vi.fn(),
  listGoogleDriveFiles: vi.fn().mockResolvedValue([]),
  deleteGoogleDriveConnection: vi.fn(),
}));

import { registerGoogleDriveRoutes } from "./googleDrive";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  authenticateRequestMock.mockReset();
});

async function requestGoogle(path: string) {
  const app = express();
  registerGoogleDriveRoutes(app);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  return fetch(`http://127.0.0.1:${address.port}${path}`, { redirect: "manual" });
}

describe("Google Drive route authorization", () => {
  it("rejects connecting without a signed-in application session", async () => {
    authenticateRequestMock.mockResolvedValue(null);
    const response = await requestGoogle("/api/google/connect");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication_required" });
  });

  it("rejects the callback when the OAuth state does not match the browser cookie", async () => {
    authenticateRequestMock.mockResolvedValue({ id: 7 });
    const response = await requestGoogle("/api/google/callback?code=received-code&state=forged-state");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_google_oauth_state" });
  });

  it("rejects streaming before checking the Drive file when no session exists", async () => {
    authenticateRequestMock.mockResolvedValue(null);
    const response = await requestGoogle("/api/google/audio/drive-file-id");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication_required" });
  });
});
