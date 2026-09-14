import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const googleDriveConnections = mysqlTable("googleDriveConnections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  encryptedAccessToken: text("encryptedAccessToken").notNull(),
  encryptedRefreshToken: text("encryptedRefreshToken"),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  scope: varchar("scope", { length: 512 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const googleDriveFiles = mysqlTable("googleDriveFiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  driveFileId: varchar("driveFileId", { length: 128 }).notNull(),
  parentDriveFolderId: varchar("parentDriveFolderId", { length: 128 }),
  parentDriveFolderName: varchar("parentDriveFolderName", { length: 512 }),
  name: varchar("name", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  sizeBytes: int("sizeBytes"),
  modifiedTime: timestamp("modifiedTime"),
  album: varchar("album", { length: 512 }),
  artist: varchar("artist", { length: 512 }),
  coverDriveFileId: varchar("coverDriveFileId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userDriveFileUnique: uniqueIndex("googleDriveFiles_user_drive_unique").on(table.userId, table.driveFileId),
}));

export type GoogleDriveConnection = typeof googleDriveConnections.$inferSelect;
export type GoogleDriveFile = typeof googleDriveFiles.$inferSelect;