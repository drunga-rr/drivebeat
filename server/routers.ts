import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { getPersistedCloudLibrary, syncGoogleDriveLibrary } from "./googleDrive";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  googleDrive: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const connection = await db.getGoogleDriveConnection(ctx.user.id);
      const library = await getPersistedCloudLibrary(ctx.user.id);
      return {
        connected: Boolean(connection),
        connectedAt: connection?.createdAt ?? null,
        folderCount: library.folders.length,
        trackCount: library.files.length,
      };
    }),
    library: protectedProcedure.query(({ ctx }) => getPersistedCloudLibrary(ctx.user.id)),
    sync: protectedProcedure.mutation(({ ctx }) => syncGoogleDriveLibrary(ctx.user.id)),
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      await db.deleteGoogleDriveConnection(ctx.user.id);
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
