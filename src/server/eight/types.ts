// types.ts
import { z } from "zod";

export interface Token {
  eightAccessToken: string;
  eightRefreshToken: string;
  eightExpiresAtPosix: number;
  eightUserId: string;
}

export const EightTokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  userId: z.string().optional(),
});

export type TokenResponse = z.infer<typeof EightTokenSchema>;

export const DeviceListSchema = z.object({
  user: z.object({
    devices: z.array(z.string()),
  }),
});

export const UserProfileSchema = z.object({
  user: z.object({
    userId: z.string().optional(),
    email: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    gender: z.string().optional(),
    tempPreference: z.string().optional(),
    tempPreferenceUpdatedAt: z.string().optional(),
    dob: z.string().optional(),
    zip: z.number().optional(),
    devices: z.array(z.string()),
    emailVerified: z.boolean().optional(),
    sharingMetricsTo: z.array(z.unknown()).optional(),
    sharingMetricsFrom: z.array(z.unknown()).optional(),
    notifications: z.record(z.boolean()).optional(),
    createdAt: z.string().optional(),
    experimentalFeatures: z.boolean().optional(),
    autopilotEnabled: z.boolean().optional(),
    lastReset: z.string().optional(),
    nextReset: z.string().optional(),
    sleepTracking: z.object({
      enabledSince: z.string().optional(),
    }).optional(),
    features: z.array(z.string()).optional(),
    currentDevice: z.object({
      id: z.string(),
      side: z.string().optional(),
      timeZone: z.string().optional(),
    }).optional(),
    hotelGuest: z.boolean().optional(),
  }).catchall(z.unknown()),
});

export const DeviceDataSchema = z.object({
  result: z.object({
    deviceId: z.string().optional(),
    leftHeatingLevel: z.number().optional(),
    leftTargetHeatingLevel: z.number().optional(),
    leftNowHeating: z.boolean().optional(),
    leftHeatingDuration: z.number().optional(),
    rightHeatingLevel: z.number().optional(),
    rightTargetHeatingLevel: z.number().optional(),
    rightNowHeating: z.boolean().optional(),
    rightHeatingDuration: z.number().optional(),
    features: z.array(z.string()).optional(),
    online: z.boolean().optional(),
    priming: z.boolean().optional(),
    needsPriming: z.boolean().optional(),
    hasWater: z.boolean().optional(),
    lastPrime: z.string().optional(),
    lastHeard: z.string().optional(),
    modelString: z.string().optional(),
    hubSerial: z.string().optional(),
    firmwareVersion: z.string().optional(),
    leftKelvin: z.number().optional(),
    rightKelvin: z.number().optional(),
  }).passthrough(),
});

export const TrendDataSchema = z.object({
  result: z.object({
    days: z.array(
      z.object({
        day: z.string().optional(),
        score: z.number().optional(),
        sleepDuration: z.number().optional(),
        presenceStart: z.string().optional(),
        presenceEnd: z.string().optional(),
        lightDuration: z.number().optional(),
        deepDuration: z.number().optional(),
        remDuration: z.number().optional(),
        presenceDuration: z.number().optional(),
        processing: z.boolean().optional(),
        sleepQualityScore: z.object({
          total: z.number().optional(),
          sleepDurationSeconds: z.object({ score: z.number().optional() }).optional(),
          hrv: z.object({ current: z.number().nullable().optional() }).optional(),
          respiratoryRate: z.object({ current: z.number().nullable().optional() }).optional(),
        }).passthrough().optional(),
        sleepRoutineScore: z.object({
          total: z.number().optional(),
          latencyAsleepSeconds: z.object({ score: z.number().optional() }).optional(),
          latencyOutSeconds: z.object({ score: z.number().optional() }).optional(),
          wakeupConsistency: z.object({ score: z.number().optional() }).optional(),
          heartRate: z.object({ current: z.number().nullable().optional() }).optional(),
        }).passthrough().optional(),
      }),
    ),
  }),
});

export const IntervalsDataSchema = z.object({
  result: z.object({
    intervals: z.array(
      z.object({
        id: z.string().optional(),
        ts: z.string().optional(),
        stages: z.array(
          z.object({
            stage: z.enum(["awake", "light", "deep", "rem", "out"]),
            duration: z.number(),
          }),
        ),
        score: z.number().optional(),
        timeseries: z.object({
          tnt: z.array(z.tuple([z.string(), z.number()])).optional(),
          tempBedC: z.array(z.tuple([z.string(), z.number()])).optional(),
          tempRoomC: z.array(z.tuple([z.string(), z.number()])).optional(),
          respiratoryRate: z.array(z.tuple([z.string(), z.number()])).optional(),
          heartRate: z.array(z.tuple([z.string(), z.number()])).optional(),
        }).passthrough().optional(),
        incomplete: z.boolean().optional(),
      }),
    ),
  }),
});

export const RoutinesDataSchema = z.object({
  result: z.object({
    state: z.object({
      nextAlarm: z.object({
        nextTimestamp: z.string(),
        alarmId: z.string(),
      }),
    }),
  }),
});

export const TemperatureDataSchema = z.object({
  result: z.object({
    currentLevel: z.number(),
    currentDeviceLevel: z.number(),
    currentState: z.object({
      type: z.enum(["smart", "off"]),
    }),
    smart: z.record(z.number()),
  }),
});

export type UserProfile = z.infer<typeof UserProfileSchema>["user"];
export type TrendData = z.infer<
  typeof TrendDataSchema
>["result"]["days"][number];
export type IntervalData = z.infer<
  typeof IntervalsDataSchema
>["result"]["intervals"][number];
export type RoutineData = z.infer<
  typeof RoutinesDataSchema
>["result"]["state"]["nextAlarm"];
export type TemperatureData = z.infer<typeof TemperatureDataSchema>["result"];

export interface DeviceData {
  id: string;
  lastSeen: string;
  firmwareVersion: string;
  wifiInfo: {
    ssid: string;
    strength: number;
  };
  leftUserId?: string;
  rightUserId?: string;
  needsPriming: boolean;
  priming: boolean;
  hasWater: boolean;
  lastPrime: string;
}

export type HeatingLevel = number;
export type DeviceLevel = number;
export type BedStateType = "smart" | "off";
export type Side = "left" | "right" | "solo";
export type AwayModeAction = "start" | "end";
export type DegreeUnit = "c" | "f";
export type SleepStage = "awake" | "light" | "deep" | "rem" | "out";

export type HeatingStatus = {
  heatingLevel: HeatingLevel;
  isHeating: boolean;
  heatingDuration: number;
  targetHeatingLevel: HeatingLevel;
};
