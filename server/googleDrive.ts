import crypto from "node:crypto";
import type { Express, Request, Response } from "express";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const SESSION_COOKIE = "drivebeat_session";
const STATE_COOKIE = "drivebeat_google_state";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function secretKey() {
  const secret = process.env.JWT_SECRET || process.env.DRIVEBEAT_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET/DRIVEBEAT_SESSION_SECRET must contain at least 32 characters");
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(v => v.toString("base64url")).join(".");
}

function decrypt(value: string) {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("Invalid encrypted session");
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function isSecure(req: Request) {
  return req.protocol === "https" || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function cookieOptions(req: Request) {
  const secure = isSecure(req);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "lax" as const : "lax" as const,
    path: "/",
  };
}

function getClientId() {
  const value = process.env.GOOGLE_CLIENT_ID;
  if (!value) throw new Error("GOOGLE_CLIENT_ID is not configured");
  return value;
}

function getClientSecret() {
  const value = process.env.GOOGLE_CLIENT_SECRET;
  if (!value) throw new Error("GOOGLE_CLIENT_SECRET is not configured");
  return value;
}

function getRedirectUri(req: Request) {
  return process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
}

function getStatePayload(value: string) {
  try {
    const payload = JSON.parse(decrypt(value)) as { nonce?: string; createdAt?: number };
    if (!payload.nonce || !payload.createdAt || Date.now() - payload.createdAt > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

function getCookie(req: Request, name: string) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export type DriveUser = {
  sub: string;
  name: string;
  email: string;
  picture?: string;
};

type Session = {
  user: DriveUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  expiresAt: number;
};

function readSession(req: Request): Session | null {
  const cookie = getCookie(req, SESSION_COOKIE);
  if (!cookie) return null;
  try {
    const session = JSON.parse(decrypt(cookie)) as Session;
    if (!session.user?.sub || !session.refreshToken || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function writeSession(res: Response, req: Request, session: Session) {
  res.cookie(SESSION_COOKIE, encrypt(JSON.stringify(session)), {
    ...cookieOptions(req),
    maxAge: Math.max(0, session.expiresAt - Date.now()),
  });
}

async function exchangeCode(code: string, redirectUri: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const payload = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!response.ok || !payload.access_token) throw new Error(`Google token exchange failed: ${payload.error || response.status}`);
  return payload;
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(`Google token refresh failed: ${payload.error || response.status}`);
  return payload;
}

async function getAccessToken(req: Request, res: Response) {
  const session = readSession(req);
  if (!session) return null;
  if (session.accessTokenExpiresAt > Date.now() + 60_000) return { token: session.accessToken, session };
  try {
    const refreshed = await refreshAccessToken(session.refreshToken);
    session.accessToken = refreshed.access_token!;
    session.accessTokenExpiresAt = Date.now() + (refreshed.expires_in || 3600) * 1000;
    writeSession(res, req, session);
    return { token: session.accessToken, session };
  } catch {
    return null;
  }
}

async function driveFetch(req: Request, res: Response, path: string, init: RequestInit = {}) {
  const auth = await getAccessToken(req, res);
  if (!auth) throw Object.assign(new Error("authentication_required"), { status: 401 });
  let response = await fetch(`${GOOGLE_DRIVE_API_URL}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), authorization: `Bearer ${auth.token}` },
  });
  if (response.status === 401) {
    const session = readSession(req);
    if (!session) throw Object.assign(new Error("authentication_required"), { status: 401 });
    const refreshed = await refreshAccessToken(session.refreshToken);
    session.accessToken = refreshed.access_token!;
    session.accessTokenExpiresAt = Date.now() + (refreshed.expires_in || 3600) * 1000;
    writeSession(res, req, session);
    response = await fetch(`${GOOGLE_DRIVE_API_URL}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), authorization: `Bearer ${session.accessToken}` },
    });
  }
  return response;
}

type DriveFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
};

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Lista arquivos do Google Drive com paginação.
 * O Google Drive API retorna no máximo uma página por chamada; sem esta
 * paginação, pastas/arquivos além da primeira página podem desaparecer.
 */
async function listDriveFiles(
  req: Request,
  res: Response,
  query: string,
  fields: string,
) {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      pageSize: "1000",
      fields: `nextPageToken,files(${fields})`,
      orderBy: "name",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await driveFetch(req, res, `/files?${params.toString()}`);
    const payload = await response.json() as {
      files?: DriveFile[];
      nextPageToken?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw Object.assign(
        new Error(payload.error?.message || `Google Drive API returned ${response.status}`),
        { status: response.status },
      );
    }

    if (Array.isArray(payload.files)) files.push(...payload.files);
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return files;
}

function normalizeDriveName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function findChildFolder(
  folders: DriveFile[],
  parentId: string,
  names: string[],
) {
  const accepted = new Set(names.map(normalizeDriveName));
  return folders.find(folder =>
    Boolean(folder.id) &&
    accepted.has(normalizeDriveName(folder.name || "")) &&
    (folder.parents || []).includes(parentId),
  );
}

function findDriveBeatFolder(folders: DriveFile[]) {
  const accepted = new Set(["drivebeat"].map(normalizeDriveName));
  return folders.find(folder =>
    Boolean(folder.id) && accepted.has(normalizeDriveName(folder.name || "")),
  );
}

function buildFolderIndex(folders: DriveFile[]) {
  const byId = new Map<string, DriveFile>();
  const children = new Map<string, DriveFile[]>();
  for (const folder of folders) {
    if (!folder.id) continue;
    byId.set(folder.id, folder);
    for (const parentId of folder.parents || []) {
      const list = children.get(parentId) || [];
      list.push(folder);
      children.set(parentId, list);
    }
  }
  return { byId, children };
}

function collectDescendantFolders(rootId: string, children: Map<string, DriveFile[]>) {
  const result = new Map<string, { name: string; parents: string[]; relativePath: string }>();
  const queue: Array<{ id: string; path: string }> = [{ id: rootId, path: "" }];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    for (const folder of children.get(current.id) || []) {
      if (!folder.id) continue;
      const relativePath = current.path ? `${current.path}/${folder.name || "Pasta"}` : (folder.name || "Pasta");
      result.set(folder.id, {
        name: folder.name || "Pasta",
        parents: folder.parents || [],
        relativePath,
      });
      queue.push({ id: folder.id, path: relativePath });
    }
  }
  return result;
}

function getRelativeFolderPath(
  folderId: string | null,
  rootId: string,
  folderIndex: Map<string, { name: string; parents: string[]; relativePath: string }>,
) {
  if (!folderId || folderId === rootId) return "Músicas";
  return folderIndex.get(folderId)?.relativePath || "Músicas";
}

export async function getCurrentDriveUser(req: Request) {
  const session = readSession(req);
  return session?.user || null;
}

/**
 * Sincroniza somente a árvore DriveBeat/Músicas e todas as suas subpastas.
 *
 * A busca não depende de uma profundidade fixa. Assim, por exemplo:
 * DriveBeat/Músicas/Pop
 * DriveBeat/Músicas/Pop/Internacional
 * DriveBeat/Músicas/Pop/Internacional/Artista
 * serão todos encontrados automaticamente.
 */
export async function listCloudLibrary(req: Request, res: Response) {
  const [folders, audioFiles] = await Promise.all([
    listDriveFiles(req, res, `trashed = false and mimeType = '${DRIVE_FOLDER_MIME}'`, "id,name,parents"),
    listDriveFiles(
      req,
      res,
      "trashed = false and (mimeType = 'audio/mpeg' or mimeType = 'audio/mp3' or name contains '.mp3' or name contains '.MP3')",
      "id,name,mimeType,size,modifiedTime,parents",
    ),
  ]);

  const driveBeatCandidates = folders.filter(folder =>
    Boolean(folder.id) && normalizeDriveName(folder.name || "") === "drivebeat",
  );
  const driveBeat = driveBeatCandidates.find(folder =>
    Boolean(folder.id) && Boolean(findChildFolder(folders, folder.id!, ["Músicas", "Musicas"])),
  ) || findDriveBeatFolder(folders);
  if (!driveBeat?.id) {
    console.warn('[Google Drive] Pasta "DriveBeat" não encontrada. Nenhuma faixa será sincronizada.');
    return [];
  }

  const musicRoot = findChildFolder(folders, driveBeat.id, ["Músicas", "Musicas"]);
  if (!musicRoot?.id) {
    console.warn('[Google Drive] Pasta "DriveBeat/Músicas" não encontrada. Nenhuma faixa será sincronizada.');
    return [];
  }

  const { children } = buildFolderIndex(folders);
  const descendantFolders = collectDescendantFolders(musicRoot.id, children);
  const allowedFolderIds = new Set<string>([musicRoot.id, ...descendantFolders.keys()]);

  const files = audioFiles
    .filter(file => {
      if (!file.id || !file.name || !/\.mp3$/i.test(file.name)) return false;
      const parentId = file.parents?.[0] || null;
      return Boolean(parentId && allowedFolderIds.has(parentId));
    })
    .map((file, index) => {
      const parentId = file.parents?.[0] || null;
      const title = file.name!.replace(/\.mp3$/i, "").trim() || file.name!;
      const folderPath = getRelativeFolderPath(parentId, musicRoot.id, descendantFolders);
      const pathParts = folderPath.split("/").filter(Boolean);
      const album = pathParts[pathParts.length - 1] || "Músicas";
      const artist = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "Google Drive";

      return {
        id: file.id!,
        title,
        artist,
        album,
        folder: folderPath,
        duration: "—",
        mimeType: file.mimeType || "audio/mpeg",
        sizeBytes: file.size ? Number(file.size) : null,
        modifiedTime: file.modifiedTime || null,
        order: index,
      };
    });

  console.log(`[Google Drive] DriveBeat/Músicas: ${files.length} MP3(s) em ${descendantFolders.size + 1} pasta(s).`);
  return files;
}

export function registerGoogleDriveRoutes(app: Express) {
  app.get("/api/auth/google", (req, res) => {
    try {
      const nonce = crypto.randomBytes(24).toString("base64url");
      const state = encrypt(JSON.stringify({ nonce, createdAt: Date.now() }));
      res.cookie(STATE_COOKIE, state, { ...cookieOptions(req), maxAge: STATE_TTL_MS });
      const params = new URLSearchParams({
        client_id: getClientId(),
        redirect_uri: getRedirectUri(req),
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        scope: `openid email profile ${DRIVE_SCOPE}`,
        state,
      });
      res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    } catch (error) {
      console.error("[Google OAuth] start failed", error);
      res.status(500).json({ error: "google_oauth_not_configured" });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const stateCookie = getCookie(req, STATE_COOKIE);
    res.clearCookie(STATE_COOKIE, { ...cookieOptions(req) });
    const expected = stateCookie ? getStatePayload(stateCookie) : null;
    const received = state ? getStatePayload(state) : null;
    if (!code || !state || !expected || !received || expected.nonce !== received.nonce) {
      res.status(403).json({ error: "invalid_google_oauth_state" });
      return;
    }
    try {
      const token = await exchangeCode(code, getRedirectUri(req));
      if (!token.refresh_token) throw new Error("Google did not return a refresh token. Revoke this app in Google Account permissions and connect again.");
      const userResponse = await fetch(GOOGLE_USERINFO_URL, { headers: { authorization: `Bearer ${token.access_token}` } });
      if (!userResponse.ok) throw new Error("Unable to read Google account information");
      const userInfo = await userResponse.json() as { sub?: string; name?: string; email?: string; picture?: string };
      if (!userInfo.sub || !userInfo.email) throw new Error("Google account information is incomplete");
      const session: Session = {
        user: { sub: userInfo.sub, name: userInfo.name || userInfo.email, email: userInfo.email, picture: userInfo.picture },
        accessToken: token.access_token!,
        refreshToken: token.refresh_token,
        accessTokenExpiresAt: Date.now() + (token.expires_in || 3600) * 1000,
        expiresAt: Date.now() + SESSION_TTL_MS,
      };
      writeSession(res, req, session);
      res.redirect("/");
    } catch (error) {
      console.error("[Google OAuth] callback failed", error);
      res.redirect(`/?google=error&reason=${encodeURIComponent(error instanceof Error ? error.message : "callback_failed")}`);
    }
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ authenticated: Boolean(readSession(req)), user: readSession(req)?.user || null });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(req), maxAge: 0 });
    res.json({ success: true });
  });

  app.get("/api/google/library", async (req, res) => {
    try {
      if (!readSession(req)) { res.status(401).json({ error: "authentication_required" }); return; }
      const files = await listCloudLibrary(req, res);
      res.json({ files });
    } catch (error: any) {
      console.error("[Google Drive] Library failed", error);
      res.status(error?.status === 401 ? 401 : 502).json({ error: error?.message || "library_failed" });
    }
  });

  app.get("/api/google/audio/:fileId", async (req, res) => {
    try {
      if (!readSession(req)) { res.status(401).json({ error: "authentication_required" }); return; }
      const fileId = req.params.fileId;
      const range = req.get("range");
      const headers: Record<string, string> = {};
      if (range) headers.range = range;
      const response = await driveFetch(req, res, `/files/${encodeURIComponent(fileId)}?alt=media`, { headers });
      if (!response.ok) {
        res.status(response.status).json({ error: "audio_unavailable" });
        return;
      }
      res.status(response.status);
      res.setHeader("Content-Type", response.headers.get("content-type") || "audio/mpeg");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Accept-Ranges", response.headers.get("accept-ranges") || "bytes");
      for (const header of ["content-length", "content-range", "etag"]) {
        const value = response.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      if (!response.body) { res.end(); return; }
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) res.write(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      res.end();
    } catch (error: any) {
      console.error("[Google Drive] Audio proxy failed", error);
      if (!res.headersSent) res.status(error?.status === 401 ? 401 : 502).json({ error: error?.message || "audio_proxy_failed" });
      else res.end();
    }
  });
}
