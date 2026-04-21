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
  primePod as primePodApi,
  setBedSide as setBedSideApi,
} from "~/server/eight/user";
import { setHeatingLevel, turnOnSide } from "~/server/eight/eight";
import {
  APP_API_URL,
  CLIENT_API_URL,
  DEFAULT_API_HEADERS,
} from "~/server/eight/constants";

type JsonRecord = Record<string, unknown>;

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

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function formatDateInTimezone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimezone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function logDashboardFailure(label: string, error: unknown) {
  console.error(`Dashboard source failed: ${label}`, error);
}

async function fetchEightJson(
  url: string,
  token: Token,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...DEFAULT_API_HEADERS,
      ...options.headers,
      authorization: `Bearer ${token.eightAccessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as unknown;
}

function extractPrimaryDeviceId(mePayload: unknown): string | null {
  const user = asRecord(asRecord(mePayload).user);
  const currentDevice = asRecord(user.currentDevice);
  const currentDeviceId = asStringOrNull(currentDevice.id);
  if (currentDeviceId) {
    return currentDeviceId;
  }
  const devices = Array.isArray(user.devices) ? user.devices : [];
  return asStringOrNull(devices[0]);
}

function parseTrendsDays(payload: unknown): JsonRecord[] {
  const root = asRecord(payload);
  const result = asRecord(root.result);
  const days = Array.isArray(root.days)
    ? root.days
    : Array.isArray(result.days)
      ? result.days
      : [];

  return days.map(asRecord).filter((day) => Object.keys(day).length > 0);
}

function latestTimeseriesPoint(
  day: JsonRecord,
  key: string,
): { value: number | null; at: string | null } {
  const sessions = Array.isArray(day.sessions) ? day.sessions : [];
  const latestSession = asRecord(sessions.at(-1));
  const timeseries = asRecord(latestSession.timeseries);
  const series: unknown[] = Array.isArray(timeseries[key]) ? timeseries[key] : [];
  const latest = series.at(-1);

  if (!Array.isArray(latest) || latest.length < 2) {
    return { value: null, at: null };
  }

  return {
    at: asStringOrNull(latest[0]),
    value: asNumberOrNull(latest[1]),
  };
}

function extractSleepSnapshot(payload: unknown) {
  const days = parseTrendsDays(payload).sort((a, b) => {
    const aValue = Date.parse(asStringOrNull(a.presenceEnd) ?? asStringOrNull(a.day) ?? "");
    const bValue = Date.parse(asStringOrNull(b.presenceEnd) ?? asStringOrNull(b.day) ?? "");
    const safeA = Number.isNaN(aValue) ? 0 : aValue;
    const safeB = Number.isNaN(bValue) ? 0 : bValue;
    return safeA - safeB;
  });

  const latestDay = days.at(-1);
  if (!latestDay) {
    return null;
  }

  const sessions = Array.isArray(latestDay.sessions) ? latestDay.sessions : [];
  const latestSession = asRecord(sessions.at(-1));
  const stages = Array.isArray(latestSession.stages) ? latestSession.stages : [];
  const processing = asBooleanOrNull(latestDay.processing);
  const stageIndex =
    processing === true && stages.length > 1 ? stages.length - 2 : stages.length - 1;
  const latestStage = stageIndex >= 0 ? asRecord(stages[stageIndex]) : {};
  const stageBreakdown = stages.reduce<Record<string, number>>((acc, stage) => {
    const stageRecord = asRecord(stage);
    const stageName = asStringOrNull(stageRecord.stage);
    const duration = asNumberOrNull(stageRecord.duration);
    if (stageName && duration !== null) {
      acc[stageName] = (acc[stageName] ?? 0) + duration;
    }
    return acc;
  }, {});

  const heartRate = latestTimeseriesPoint(latestDay, "heartRate");
  const respiratoryRate = latestTimeseriesPoint(latestDay, "respiratoryRate");
  const roomTemp = latestTimeseriesPoint(latestDay, "tempRoomC");
  const bedTemp = latestTimeseriesPoint(latestDay, "tempBedC");

  return {
    sessionDate: asStringOrNull(latestDay.day),
    bedtime: asStringOrNull(latestDay.presenceStart),
    wakeTime: asStringOrNull(latestDay.presenceEnd),
    score: asNumberOrNull(latestDay.score),
    durationSeconds: asNumberOrNull(latestDay.sleepDuration),
    hrv: asNumberOrNull(asRecord(asRecord(latestDay.sleepQualityScore).hrv).current),
    heartRate: heartRate.value,
    breathRate: respiratoryRate.value,
    roomTempC: roomTemp.value,
    bedTempC: bedTemp.value,
    currentStage: asStringOrNull(latestStage.stage),
    stageBreakdown,
  };
}

async function fetchSessionsAll(token: Token, userId: string): Promise<JsonRecord[]> {
  const sessions: JsonRecord[] = [];
  const seen = new Set<string>();
  let next: string | undefined;

  for (let i = 0; i < 25; i += 1) {
    const baseUrl = `${APP_API_URL}v1/users/${encodeURIComponent(userId)}/sessions`;
    const url = next ? `${baseUrl}?next=${encodeURIComponent(next)}` : baseUrl;
    let payload: unknown;

    try {
      payload = await fetchEightJson(url, token);
    } catch (error) {
      logDashboardFailure("sessions", error);
      break;
    }

    const data = asRecord(payload);
    const batch = Array.isArray(data.sessions) ? data.sessions.map(asRecord) : [];

    for (const session of batch) {
      const key =
        asStringOrNull(session.id) ??
        asStringOrNull(session.ts) ??
        JSON.stringify(session);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      sessions.push(session);
    }

    const nextToken = asStringOrNull(data.next) ?? undefined;
    if (!nextToken) {
      break;
    }
    next = nextToken;
  }

  return sessions;
}

function extractSleepSnapshotFromSessions(sessions: JsonRecord[], timezone: string) {
  const latestSession = [...sessions]
    .sort((a, b) => {
      const aValue = Date.parse(asStringOrNull(a.ts) ?? "");
      const bValue = Date.parse(asStringOrNull(b.ts) ?? "");
      const safeA = Number.isNaN(aValue) ? 0 : aValue;
      const safeB = Number.isNaN(bValue) ? 0 : bValue;
      return safeA - safeB;
    })
    .at(-1);

  if (!latestSession) {
    return null;
  }

  const ts = asStringOrNull(latestSession.ts);
  const stageSummary = asRecord(latestSession.stageSummary);
  const stages = Array.isArray(latestSession.stages) ? latestSession.stages : [];

  const heartRate = latestTimeseriesPoint({ sessions: [latestSession] }, "heartRate");
  const respiratoryRate = latestTimeseriesPoint(
    { sessions: [latestSession] },
    "respiratoryRate",
  );
  const roomTemp = latestTimeseriesPoint({ sessions: [latestSession] }, "tempRoomC");
  const bedTemp = latestTimeseriesPoint({ sessions: [latestSession] }, "tempBedC");

  const latestStage = asRecord(stages.at(-1));
  const stageBreakdown = stages.reduce<Record<string, number>>((acc, stage) => {
    const stageRecord = asRecord(stage);
    const stageName = asStringOrNull(stageRecord.stage);
    const duration = asNumberOrNull(stageRecord.duration);
    if (stageName && duration !== null) {
      acc[stageName] = (acc[stageName] ?? 0) + duration;
    }
    return acc;
  }, {});

  return {
    sessionDate: ts ? formatDateInTimezone(new Date(ts), timezone) : null,
    bedtime: ts,
    wakeTime: null,
    score: asNumberOrNull(latestSession.score),
    durationSeconds: asNumberOrNull(stageSummary.sleepDuration),
    hrv: null,
    heartRate: heartRate.value,
    breathRate: respiratoryRate.value,
    roomTempC: roomTemp.value,
    bedTempC: bedTemp.value,
    currentStage: asStringOrNull(latestStage.stage),
    stageBreakdown,
  };
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

  const mePayload = await fetchEightJson(`${CLIENT_API_URL}/users/me`, token);
  const meUser = asRecord(asRecord(mePayload).user);
  const deviceId = extractPrimaryDeviceId(mePayload);

  if (!deviceId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No Eight Sleep device found for user.",
    });
  }

  return {
    user,
    token,
    meUser,
    deviceId,
    timezone: normalizeTimezone(asStringOrNull(asRecord(meUser.currentDevice).timeZone) ?? undefined),
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
      const { user, token, meUser, deviceId, timezone } =
        await getAuthenticatedEightContext(ctx.headers);

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 14);

      const [deviceDataResult, trendsResult] = await Promise.allSettled([
        fetchEightJson(`${CLIENT_API_URL}/devices/${deviceId}`, token),
        fetchEightJson(
          `${CLIENT_API_URL}/users/${user.eightUserId}/trends?${new URLSearchParams({
            tz: timezone,
            from: formatDateInTimezone(startDate, timezone),
            to: formatDateInTimezone(now, timezone),
            "include-main": "false",
            "include-all-sessions": "true",
            "model-version": "v2",
          }).toString()}`,
          token,
        ),
      ]);

      const deviceData =
        deviceDataResult.status === "fulfilled"
          ? asRecord(asRecord(deviceDataResult.value).result)
          : null;
      let sleepSnapshot =
        trendsResult.status === "fulfilled"
          ? extractSleepSnapshot(trendsResult.value)
          : null;

      if (deviceDataResult.status === "rejected") {
        logDashboardFailure("deviceData", deviceDataResult.reason);
      }
      if (trendsResult.status === "rejected") {
        logDashboardFailure("trends", trendsResult.reason);
      }

      if (!sleepSnapshot) {
        const sessions = await fetchSessionsAll(token, user.eightUserId);
        sleepSnapshot = extractSleepSnapshotFromSessions(sessions, timezone);
      }

      return {
        account: {
          email: user.email,
          currentSide: asStringOrNull(asRecord(meUser.currentDevice).side),
          currentDeviceId: deviceId,
          timezone,
          features: Array.isArray(meUser.features)
            ? meUser.features.map((value) => String(value))
            : [],
        },
        podStatus: {
          deviceId,
          online: asBooleanOrNull(deviceData?.online),
          priming: asBooleanOrNull(deviceData?.priming),
          needsPriming: asBooleanOrNull(deviceData?.needsPriming),
          hasWater: asBooleanOrNull(deviceData?.hasWater),
          lastPrime: asStringOrNull(deviceData?.lastPrime),
          lastHeard: asStringOrNull(deviceData?.lastHeard),
          firmwareVersion: asStringOrNull(deviceData?.firmwareVersion),
          modelString: asStringOrNull(deviceData?.modelString),
          hubSerial: asStringOrNull(deviceData?.hubSerial),
          features: Array.isArray(deviceData?.features)
            ? deviceData.features.map((value) => String(value))
            : [],
          leftHeatingLevel: asNumberOrNull(deviceData?.leftHeatingLevel),
          leftTargetHeatingLevel: asNumberOrNull(deviceData?.leftTargetHeatingLevel),
          leftNowHeating: asBooleanOrNull(deviceData?.leftNowHeating),
          rightHeatingLevel: asNumberOrNull(deviceData?.rightHeatingLevel),
          rightTargetHeatingLevel: asNumberOrNull(deviceData?.rightTargetHeatingLevel),
          rightNowHeating: asBooleanOrNull(deviceData?.rightNowHeating),
        },
        sleep: sleepSnapshot,
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

  setCurrentTemperature: publicProcedure
    .input(
      z.object({
        side: z.enum(["solo", "left", "right"]),
        rawLevel: z.number().int().min(-100).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, token, deviceId } = await getAuthenticatedEightContext(
          ctx.headers,
        );

        await setBedSideApi(token, user.eightUserId, deviceId, input.side);
        await turnOnSide(token, user.eightUserId);
        await setHeatingLevel(token, user.eightUserId, input.rawLevel);

        return { success: true };
      } catch (error) {
        console.error("Error setting current temperature:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to set current temperature.",
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
