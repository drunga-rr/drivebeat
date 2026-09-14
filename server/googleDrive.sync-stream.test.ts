import express from "express";
import { request as httpRequest, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequestMock = vi.hoisted(() => vi.fn());
const getGoogleDriveConnectionMock = vi.hoisted(() => vi.fn());
const getGoogleDriveFileMock = vi.hoisted(() => vi.fn());
const replaceGoogleDriveFilesMock = vi.hoisted(() => vi.fn());
const driveFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: authenticateRequestMock },
}));

vi.mock("./db", () => ({
  getGoogleDriveConnection: getGoogleDriveConnectionMock,
  getGoogleDriveFile: getGoogleDriveFileMock,
  replaceGoogleDriveFiles: replaceGoogleDriveFilesMock,
  getGoogleDriveConnectionForTest: vi.fn(),
  saveGoogleDriveConnection: vi.fn(),
  listGoogleDriveFiles: vi.fn().mockResolvedValue([]),
  deleteGoogleDriveConnection: vi.fn(),
}));

import {
  encryptSecret,
  registerGoogleDriveRoutes,
  syncGoogleDriveLibrary,
} from "./googleDrive";

let server: Server | undefined;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.JWT_SECRET = "google-drive-stream-test-secret";
  authenticateRequestMock.mockReset();
  getGoogleDriveConnectionMock.mockReset();
  getGoogleDriveFileMock.mockReset();
  replaceGoogleDriveFilesMock.mockReset();
  driveFetchMock.mockReset();
  vi.stubGlobal("fetch", driveFetchMock);
});

afterEach(async () => {
  vi.stubGlobal("fetch", originalFetch);
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
  }
});

describe("Google Drive sync and streaming", () => {
  it("filters non-MP3 files and persists folder grouping during sync", async () => {
    getGoogleDriveConnectionMock.mockResolvedValue({
      encryptedAccessToken: encryptSecret("access-token"),
      encryptedRefreshToken: null,
      tokenExpiresAt: new Date(Date.now() + 60_000),
      scope: "https://www.googleapis.com/auth/drive.readonly",
    });
    driveFetchMock.mockImplementation((input: string) => {
      const isFolderQuery = input.includes("application%2Fvnd.google-apps.folder");
      return Promise.resolve(new Response(JSON.stringify({
        files: isFolderQuery ? [
          { id: "folder-1", name: "Treinos", mimeType: "application/vnd.google-apps.folder" },
        ] : [
          { id: "track-1", name: "Abertura.MP3", mimeType: "application/octet-stream", parents: ["folder-1"], size: "1234" },
          { id: "cover-1", name: "capa.jpg", mimeType: "image/jpeg", parents: ["folder-1"] },
          { id: "track-2", name: "outro.wav", mimeType: "audio/wav", parents: ["folder-1"] },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    });

    const library = await syncGoogleDriveLibrary(9);

    expect(library.files).toHaveLength(1);
    expect(library.files[0]).toMatchObject({
      driveFileId: "track-1",
      name: "Abertura",
      parentDriveFolderId: "folder-1",
      parentDriveFolderName: "Treinos",
      album: "Treinos",
    });
    expect(library.folders).toEqual([{ id: "folder-1", name: "Treinos", trackCount: 1 }]);
    expect(replaceGoogleDriveFilesMock).toHaveBeenCalledWith(9, [expect.objectContaining({ driveFileId: "track-1", userId: 9 })]);
  });

  it("streams an indexed audio file with the caller's Range header", async () => {
    authenticateRequestMock.mockResolvedValue({ id: 9 });
    getGoogleDriveConnectionMock.mockResolvedValue({
      encryptedAccessToken: encryptSecret("access-token"),
      encryptedRefreshToken: null,
      tokenExpiresAt: new Date(Date.now() + 60_000),
      scope: "https://www.googleapis.com/auth/drive.readonly",
    });
    getGoogleDriveFileMock.mockResolvedValue({ driveFileId: "track-1", mimeType: "audio/mpeg" });
    driveFetchMock.mockResolvedValue(new Response("audio-data", {
      status: 206,
      headers: {
        "content-type": "audio/mpeg",
        "content-length": "10",
        "content-range": "bytes 0-9/10",
        "accept-ranges": "bytes",
      },
    }));

    const localFetch = originalFetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("http://127.0.0.1")) return localFetch(input, init);
      return driveFetchMock(input, init);
    });

    const app = express();
    registerGoogleDriveRoutes(app);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");

    const response = await new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
      const request = httpRequest({
        hostname: "127.0.0.1",
        port: address.port,
        path: "/api/google/audio/track-1",
        headers: { range: "bytes=0-9" },
      }, result => {
        const chunks: Buffer[] = [];
        result.on("data", chunk => chunks.push(Buffer.from(chunk)));
        result.on("end", () => resolve({ status: result.statusCode || 0, headers: result.headers, body: Buffer.concat(chunks).toString("utf8") }));
      });
      request.on("error", reject);
      request.end();
    });

    expect(response.status).toBe(206);
    expect(response.body).toBe("audio-data");
    expect(response.headers["content-range"]).toBe("bytes 0-9/10");
    expect(driveFetchMock).toHaveBeenCalledWith(expect.stringContaining("/files/track-1?alt=media"), expect.objectContaining({ headers: expect.objectContaining({ range: "bytes=0-9", authorization: "Bearer access-token" }) }));
  });

  it("does not fetch an audio asset that is not indexed for the user", async () => {
    authenticateRequestMock.mockResolvedValue({ id: 9 });
    getGoogleDriveFileMock.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", originalFetch);
    const app = express();
    registerGoogleDriveRoutes(app);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/google/audio/not-indexed`);
    expect(response.status).toBe(404);
    expect(driveFetchMock).not.toHaveBeenCalled();
  });

  it("rejects an indexed file whose MIME type is not audio", async () => {
    authenticateRequestMock.mockResolvedValue({ id: 9 });
    getGoogleDriveFileMock.mockResolvedValue({ driveFileId: "folder-1", mimeType: "application/vnd.google-apps.folder" });
    vi.stubGlobal("fetch", originalFetch);
    const app = express();
    registerGoogleDriveRoutes(app);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/google/audio/folder-1`);
    expect(response.status).toBe(404);
    expect(driveFetchMock).not.toHaveBeenCalled();
  });
});
