import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { users, userTemperatureProfile } from "~/server/db/schema";
import { cookies } from "next/headers";
import {
  authenticate,
  obtainFreshAccessToken,
  AuthError,
} from "~/server/eight/auth";
import { eq } from "drizzle-orm";
import { type Token } from "~/server/eight/types";
import { TRPCError } from "@trpc/server";
import { adjustTemperature } from "~/app/api/temperatureCron/route";
import jwt from "jsonwebtoken";
import {
  getIntervalsData,
  getTrendData,
  getUserProfile,
  primePod as primePodApi,
  setBedSide as setBedSideApi,
} from "~/server/eight/user";
import { getDeviceData } from "~/server/eight/eight";

class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

const checkAuthCookie = async (headers: Headers) => {
  const cookies = headers.get("cookie");
  console.log("Checking cookies");
  if (!cookies) {
    throw new AuthError(`Auth request failed. No cookies found.`, 401);
  }

  const token = cookies
    .split("; ")
    .find((row) => row.startsWith("8slpAutht="))
    ?.split("=")[1];
  console.log("Token:", token);

  if (!token) {
    throw new AuthError(`Auth request failed. No cookies found.`, 401);
  }
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      email: string;
    };
  } catch {
    throw new AuthError(`Auth request failed. Invalid token.`, 401);
  }

  return decoded;
};

function normalizeTimezone(timeZone: string | undefined) {
  if (!timeZone) {
    return "UTC";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
    }).resolvedOptions().timeZone;
  } catch (error) {
    console.warn(`Invalid timezone "${timeZone}", falling back to UTC`, error);
    return "UTC";
  }
}

function formatDateInTimezone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimezone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function safeSortByDateValue<T>(
  items: T[],
  getValue: (item: T) => string | undefined,
) {
  return [...items].sort((a, b) => {
    const aValue = Date.parse(getValue(a) ?? "");
    const bValue = Date.parse(getValue(b) ?? "");
    const safeA = Number.isNaN(aValue) ? 0 : aValue;
    const safeB = Number.isNaN(bValue) ? 0 : bValue;
    return safeA - safeB;
  });
}

function getLatestNumericValue(
  values: Array<[string, number]> | undefined,
): number | null {
  if (!values || values.length === 0) {
    return null;
  }

  return values[values.length - 1]?.[1] ?? null;
}

function logDashboardFailure(label: string, error: unknown) {
  console.error(`Dashboard source failed: ${label}`, error);
}

async function getAuthenticatedEightContext(headers: Headers) {
  const decoded = await checkAuthCookie(headers);

  const userList = await db
    .select()
    .from(users)
    .where(eq(users.email, decoded.email))
    .limit(1)
    .execute();
  const user = userList[0];

  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User not found.",
    });
  }

  let token: Token = {
    eightAccessToken: user.eightAccessToken,
    eightRefreshToken: user.eightRefreshToken,
    eightExpiresAtPosix: user.eightTokenExpiresAt.getTime(),
    eightUserId: user.eightUserId,
  };

  if (user.eightTokenExpiresAt < new Date()) {
    token = await obtainFreshAccessToken(
      user.eightRefreshToken,
      user.eightUserId,
    );

    await db
      .update(users)
      .set({
        eightAccessToken: token.eightAccessToken,
        eightRefreshToken: token.eightRefreshToken,
        eightTokenExpiresAt: new Date(token.eightExpiresAtPosix),
      })
      .where(eq(users.email, user.email))
      .execute();
  }

  const userProfile = await getUserProfile(token);
  const deviceId = userProfile.currentDevice?.id ?? userProfile.devices[0];

  if (!deviceId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No Eight Sleep device found for user.",
    });
  }

  return {
    user,
    token,
    userProfile,
    deviceId,
    timezone: normalizeTimezone(userProfile.currentDevice?.timeZone),
  };
}

export const userRouter = createTRPCRouter({
  checkLoginState: publicProcedure.query(async ({ ctx }) => {
    try {
      let decoded;
      try {
        decoded = await checkAuthCookie(ctx.headers);
      } catch (error) {
        if (error instanceof AuthError) {
          return { loginRequired: true };
        }
        throw error;
      }
      const email = decoded.email;

      const userList = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .execute();

      if (userList.length !== 1 || userList[0] === undefined) {
        return { loginRequired: true };
      }

      const user = userList[0];

      // check if token is expired, and if so, refresh it
      if (user.eightTokenExpiresAt < new Date()) {
        console.log("Token expired, refreshing for user", user.email);
        try {
          const {
            eightAccessToken,
            eightRefreshToken,
            eightExpiresAtPosix: expiresAt,
          } = await obtainFreshAccessToken(
            user.eightRefreshToken,
            user.eightUserId,
          );

          await db
            .update(users)
            .set({
              eightAccessToken,
              eightRefreshToken,
              eightTokenExpiresAt: new Date(expiresAt),
            })
            .where(eq(users.email, email))
            .execute();

          return { loginRequired: false };
        } catch (error) {
          console.error("Token renewal failed:", error);
          return { loginRequired: true };
        }
      }
      return { loginRequired: false };
    } catch (error) {
      console.error("Error in checkLoginState:", error);
      throw new Error(
        "An unexpected error occurred while checking login state.",
      );
    }
  }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const authResult = await authenticateUser(input.email, input.password);

        const approvedEmails = process.env.APPROVED_EMAILS!.split(",").map(email => email.toLowerCase());

        if (!approvedEmails.includes(input.email.toLowerCase())) {
          throw new AuthError("Email not approved");
        }

        await saveUserToDatabase(input.email, authResult);

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          throw new Error("JWT_SECRET is not defined in the environment");
        }

        const token = jwt.sign({ email: input.email }, jwtSecret, {
          expiresIn: "90d",
        });
        const threeMonthsInSeconds = 90 * 24 * 60 * 60; // 90 days

        cookies().set("8slpAutht", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: threeMonthsInSeconds,
          path: "/",
        });
        console.log("Saving token to cookie.");

        // Set HTTP-only cookie
        return {
          success: true,
        };
      } catch (error) {
        console.error("Error in login process:", error);
        if (error instanceof AuthError) {
          throw new Error(`Authentication failed: ${error.message}`);
        } else if (error instanceof DatabaseError) {
          throw new Error(
            "Failed to save login information. Please try again.",
          );
        } else {
          throw new Error(
            "An unexpected error occurred. Please try again later.",
          );
        }
      }
    }),
  logout: publicProcedure.mutation(async () => {
    try {
      cookies().set("8slpAutht", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 0,
        path: "/",
      });
      return {
        success: true,
      };
    } catch (error) {
      console.error("Error during logout:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred during logout.",
      });
    }
  }),

  getUserTemperatureProfile: publicProcedure.query(async ({ ctx }) => {
    try {
      const decoded = await checkAuthCookie(ctx.headers);

      const profile = await db.query.userTemperatureProfile.findFirst({
        where: eq(userTemperatureProfile.email, decoded.email),
      });

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Temperature profile not found for this user.",
        });
      }

      return profile;
    } catch (error) {
      console.error("Error fetching user temperature profile:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "An unexpected error occurred while fetching the temperature profile.",
      });
    }
  }),

  getDashboard: publicProcedure.query(async ({ ctx }) => {
    try {
      const { user, token, userProfile, deviceId, timezone } =
        await getAuthenticatedEightContext(ctx.headers);

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 14);

      const [deviceDataResult, trendDataResult, intervalsDataResult] =
        await Promise.allSettled([
        getDeviceData(token, deviceId),
        getTrendData(
          token,
          user.eightUserId,
          formatDateInTimezone(startDate, timezone),
          formatDateInTimezone(now, timezone),
          timezone,
        ),
        getIntervalsData(token, user.eightUserId),
      ]);

      const deviceData =
        deviceDataResult.status === "fulfilled" ? deviceDataResult.value : null;
      const trendData =
        trendDataResult.status === "fulfilled" ? trendDataResult.value : [];
      const intervalsData =
        intervalsDataResult.status === "fulfilled"
          ? intervalsDataResult.value
          : [];

      if (deviceDataResult.status === "rejected") {
        logDashboardFailure("deviceData", deviceDataResult.reason);
      }
      if (trendDataResult.status === "rejected") {
        logDashboardFailure("trendData", trendDataResult.reason);
      }
      if (intervalsDataResult.status === "rejected") {
        logDashboardFailure("intervalsData", intervalsDataResult.reason);
      }

      const latestTrend = safeSortByDateValue(
        trendData,
        (item) => item.presenceEnd,
      )
        .filter(
          (item) =>
            (item.sleepDuration ?? 0) > 0 &&
            Boolean(item.presenceStart) &&
            Boolean(item.presenceEnd),
        )
        .at(-1);
      const latestInterval = safeSortByDateValue(
        intervalsData,
        (item) => item.ts,
      ).at(-1);

      const stageBreakdown =
        latestInterval?.stages?.reduce<Record<string, number>>((acc, stage) => {
          acc[stage.stage] = (acc[stage.stage] ?? 0) + stage.duration;
          return acc;
        }, {}) ?? {};

      const latestStages = latestInterval?.stages ?? [];
      const currentStage =
        latestStages.length === 0
          ? null
          : latestInterval?.incomplete && latestStages.length > 1
            ? latestStages[latestStages.length - 2]?.stage ?? null
            : latestStages[latestStages.length - 1]?.stage ?? null;

      return {
        account: {
          email: user.email,
          currentSide: userProfile.currentDevice?.side ?? null,
          currentDeviceId: deviceId,
          timezone,
          features: userProfile.features ?? [],
        },
        podStatus: {
          deviceId,
          online: deviceData?.online ?? null,
          priming: deviceData?.priming ?? null,
          needsPriming: deviceData?.needsPriming ?? null,
          hasWater: deviceData?.hasWater ?? null,
          lastPrime: deviceData?.lastPrime ?? null,
          lastHeard: deviceData?.lastHeard ?? null,
          firmwareVersion: deviceData?.firmwareVersion ?? null,
          modelString: deviceData?.modelString ?? null,
          hubSerial: deviceData?.hubSerial ?? null,
          features: deviceData?.features ?? [],
          leftHeatingLevel: deviceData?.leftHeatingLevel ?? null,
          leftTargetHeatingLevel: deviceData?.leftTargetHeatingLevel ?? null,
          leftNowHeating: deviceData?.leftNowHeating ?? null,
          rightHeatingLevel: deviceData?.rightHeatingLevel ?? null,
          rightTargetHeatingLevel: deviceData?.rightTargetHeatingLevel ?? null,
          rightNowHeating: deviceData?.rightNowHeating ?? null,
        },
        sleep: latestTrend
          ? {
              sessionDate: latestTrend.day ?? null,
              bedtime: latestTrend.presenceStart ?? null,
              wakeTime: latestTrend.presenceEnd ?? null,
              score: latestTrend.score ?? null,
              durationSeconds: latestTrend.sleepDuration ?? null,
              hrv: latestTrend.sleepQualityScore?.hrv?.current ?? null,
              heartRate:
                getLatestNumericValue(latestInterval?.timeseries?.heartRate) ??
                latestTrend.sleepRoutineScore?.heartRate?.current ??
                null,
              breathRate:
                getLatestNumericValue(
                  latestInterval?.timeseries?.respiratoryRate,
                ) ??
                latestTrend.sleepQualityScore?.respiratoryRate?.current ??
                null,
              roomTempC:
                getLatestNumericValue(latestInterval?.timeseries?.tempRoomC) ??
                null,
              bedTempC:
                getLatestNumericValue(latestInterval?.timeseries?.tempBedC) ??
                null,
              currentStage,
              stageBreakdown,
            }
          : null,
      };
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch dashboard data.",
      });
    }
  }),

  primePod: publicProcedure.mutation(async ({ ctx }) => {
    try {
      const { user, token, deviceId } = await getAuthenticatedEightContext(
        ctx.headers,
      );

      await primePodApi(token, deviceId, user.eightUserId);

      return { success: true };
    } catch (error) {
      console.error("Error priming pod:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to prime pod.",
      });
    }
  }),

  setBedSide: publicProcedure
    .input(
      z.object({
        side: z.enum(["solo", "left", "right"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, token, deviceId } = await getAuthenticatedEightContext(
          ctx.headers,
        );

        await setBedSideApi(token, user.eightUserId, deviceId, input.side);

        return { success: true };
      } catch (error) {
        console.error("Error setting bed side:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to set bed side.",
        });
      }
    }),

  updateUserTemperatureProfile: publicProcedure
    .input(
      z.object({
        bedTime: z.string().time(),
        wakeupTime: z.string().time(),
        initialSleepLevel: z.number().int().min(-100).max(100),
        midStageSleepLevel: z.number().int().min(-100).max(100),
        finalSleepLevel: z.number().int().min(-100).max(100),
        timezoneTZ: z.string().max(50),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const decoded = await checkAuthCookie(ctx.headers);
        const updatedProfile = {
          email: decoded.email,
          bedTime: input.bedTime,
          wakeupTime: input.wakeupTime,
          initialSleepLevel: input.initialSleepLevel,
          midStageSleepLevel: input.midStageSleepLevel,
          finalSleepLevel: input.finalSleepLevel,
          timezoneTZ: input.timezoneTZ,
          updatedAt: new Date(),
        };
        console.log("Updated profile:", updatedProfile);

        await db
          .insert(userTemperatureProfile)
          .values(updatedProfile)
          .onConflictDoUpdate({
            target: userTemperatureProfile.email,
            set: {
              bedTime: input.bedTime,
              wakeupTime: input.wakeupTime,
              initialSleepLevel: input.initialSleepLevel,
              midStageSleepLevel: input.midStageSleepLevel,
              finalSleepLevel: input.finalSleepLevel,
              timezoneTZ: input.timezoneTZ,
              updatedAt: new Date(),
            },
          })
          .execute();

        await adjustTemperature();

        return { success: true };
      } catch (error) {
        console.error("Error updating user temperature profile:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "An unexpected error occurred while updating the temperature profile.",
        });
      }
    }),

  deleteUserTemperatureProfile: publicProcedure.mutation(async ({ ctx }) => {
    try {
      const decoded = await checkAuthCookie(ctx.headers);
      const email = decoded.email;

      // Delete user temperature profile
      const result = await db
        .delete(userTemperatureProfile)
        .where(eq(userTemperatureProfile.email, email))
        .execute();

      if (result.rowCount === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Temperature profile not found for this user.",
        });
      }

      return {
        success: true,
        message: "User temperature profile deleted successfully",
      };
    } catch (error) {
      console.error("Error deleting user temperature profile:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "An unexpected error occurred while deleting the user temperature profile.",
      });
    }
  }),
});

async function authenticateUser(email: string, password: string) {
  try {
    return await authenticate(email, password);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error; // Propagate the AuthError with its specific message
    } else {
      throw new AuthError("Failed to authenticate user");
    }
  }
}

async function saveUserToDatabase(email: string, authResult: Token) {
  try {
    await db
      .insert(users)
      .values({
        email,
        eightAccessToken: authResult.eightAccessToken,
        eightRefreshToken: authResult.eightRefreshToken,
        eightTokenExpiresAt: new Date(authResult.eightExpiresAtPosix),
        eightUserId: authResult.eightUserId,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          eightAccessToken: authResult.eightAccessToken,
          eightRefreshToken: authResult.eightRefreshToken,
          eightTokenExpiresAt: new Date(authResult.eightExpiresAtPosix),
          eightUserId: authResult.eightUserId,
        },
      })
      .execute();
  } catch (error) {
    console.error("Database operation failed:", error);
    throw new DatabaseError("Failed to save user token to database.");
  }
}
