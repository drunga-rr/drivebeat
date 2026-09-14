import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  GoogleDriveFile,
  InsertUser,
  googleDriveConnections,
  googleDriveFiles,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getGoogleDriveConnection(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(googleDriveConnections)
    .where(eq(googleDriveConnections.userId, userId))
    .limit(1);
  return result[0];
}

export async function saveGoogleDriveConnection(input: {
  userId: number;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  scope: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(googleDriveConnections).values(input).onDuplicateKeyUpdate({
    set: {
      encryptedAccessToken: input.encryptedAccessToken,
      encryptedRefreshToken: input.encryptedRefreshToken,
      tokenExpiresAt: input.tokenExpiresAt,
      scope: input.scope,
      updatedAt: new Date(),
    },
  });
}

export async function deleteGoogleDriveConnection(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(googleDriveConnections).where(eq(googleDriveConnections.userId, userId));
  await db.delete(googleDriveFiles).where(eq(googleDriveFiles.userId, userId));
}

export async function replaceGoogleDriveFiles(userId: number, files: Array<Omit<GoogleDriveFile, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(googleDriveFiles).where(eq(googleDriveFiles.userId, userId));
  if (files.length > 0) {
    await db.insert(googleDriveFiles).values(files);
  }
}

export async function listGoogleDriveFiles(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(googleDriveFiles)
    .where(eq(googleDriveFiles.userId, userId));
}

export async function getGoogleDriveFile(userId: number, driveFileId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(googleDriveFiles)
    .where(eq(googleDriveFiles.userId, userId))
    .then(rows => rows.filter(row => row.driveFileId === driveFileId).slice(0, 1));
  return result[0];
}
