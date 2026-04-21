"use client";

import { type RouterOutputs, apiR } from "~/trpc/react";
import { Button } from "~/components/ui/button";

type DashboardData = RouterOutputs["user"]["getDashboard"];

const sideOptions = [
  { value: "solo", label: "Both" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
] as const;

function labelForSide(side: string | null) {
  return sideOptions.find((option) => option.value === side)?.label ?? side ?? "--";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds: number | null) {
  if (!seconds) {
    return "--";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function formatNumber(
  value: number | null,
  options?: Intl.NumberFormatOptions,
  suffix = "",
) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  return `${new Intl.NumberFormat("en-US", options).format(value)}${suffix}`;
}

function statClass(active: boolean | null) {
  if (active === null) {
    return "border-white/10 bg-white/5 text-white/70";
  }

  return active
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
    : "border-white/10 bg-white/5 text-white/70";
}

function StatusPill({
  label,
  active,
}: {
  label: string;
  active: boolean | null;
}) {
  return (
    <div className={`rounded-full border px-3 py-1 text-xs ${statClass(active)}`}>
      {label}: {active === null ? "--" : active ? "Yes" : "No"}
    </div>
  );
}

function SideTempCard({
  label,
  active,
  current,
  target,
  heating,
}: {
  label: string;
  active: boolean;
  current: number | null;
  target: number | null;
  heating: boolean | null;
}) {
  return (
    <div
      className={`rounded-[22px] border p-4 transition ${
        active
          ? "border-cyan-300/40 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(103,232,249,0.12)]"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white">{label}</div>
        {active && (
          <div className="rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-950">
            Active
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Current
          </div>
          <div className="mt-1 text-xl font-semibold text-white">
            {formatNumber(current)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Target
          </div>
          <div className="mt-1 text-xl font-semibold text-white">
            {formatNumber(target)}
          </div>
        </div>
      </div>
      <div className="mt-3 text-sm text-white/70">
        {heating === null ? "--" : heating ? "Actively heating" : "Idle"}
      </div>
    </div>
  );
}

function SleepCard({ sleep }: { sleep: DashboardData["sleep"] }) {
  if (!sleep) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-[#2a0f52]/90 p-5 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Sleep Snapshot</h3>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
            Unavailable
          </div>
        </div>
        <p className="mt-4 text-sm text-white/70">
          No recent sleep data from Eight yet.
        </p>
      </section>
    );
  }

  const stageEntries = Object.entries(sleep.stageBreakdown);

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#2a0f52]/90 p-5 text-white shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Sleep Snapshot</h3>
          <p className="text-sm text-white/60">{sleep.sessionDate ?? "Latest session"}</p>
        </div>
        <div className="rounded-[20px] border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-right">
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/70">
            Score
          </div>
          <div className="text-3xl font-semibold text-cyan-100">
            {sleep.score ?? "--"}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Time Asleep
          </div>
          <div className="mt-2 text-xl font-semibold">
            {formatDuration(sleep.durationSeconds)}
          </div>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Stage
          </div>
          <div className="mt-2 text-xl font-semibold capitalize">
            {sleep.currentStage ?? "--"}
          </div>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Bedtime
          </div>
          <div className="mt-2 text-base font-semibold">
            {formatDateTime(sleep.bedtime)}
          </div>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Wake
          </div>
          <div className="mt-2 text-base font-semibold">
            {formatDateTime(sleep.wakeTime)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Heart Rate
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatNumber(sleep.heartRate, { maximumFractionDigits: 0 }, " bpm")}
          </div>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            HRV
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatNumber(sleep.hrv, { maximumFractionDigits: 0 }, " ms")}
          </div>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Breath Rate
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatNumber(sleep.breathRate, { maximumFractionDigits: 1 }, " rpm")}
          </div>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Bed Temp
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatNumber(sleep.bedTempC, { maximumFractionDigits: 1 }, " C")}
          </div>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4 col-span-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Room Temp
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatNumber(sleep.roomTempC, { maximumFractionDigits: 1 }, " C")}
          </div>
        </div>
      </div>

      {stageEntries.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/45">
            Stage Breakdown
          </div>
          <div className="grid grid-cols-2 gap-3">
          {stageEntries.map(([stage, seconds]) => (
            <div
              key={stage}
              className="rounded-[20px] border border-white/10 bg-white/5 p-4"
            >
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
                {stage}
              </div>
              <div className="mt-2 text-lg font-semibold">
                {formatDuration(seconds)}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function EightDashboard() {
  const utils = apiR.useUtils();
  const dashboardQuery = apiR.user.getDashboard.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const primePodMutation = apiR.user.primePod.useMutation({
    onSuccess: async () => {
      await utils.user.getDashboard.invalidate();
    },
  });

  const setBedSideMutation = apiR.user.setBedSide.useMutation({
    onSuccess: async () => {
      await utils.user.getDashboard.invalidate();
    },
  });

  if (dashboardQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white shadow-xl">
        Loading dashboard...
      </div>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-6 text-white shadow-xl">
        Failed to load dashboard.
      </div>
    );
  }

  const { account, podStatus, sleep } = dashboardQuery.data;
  const currentSideLabel = labelForSide(account.currentSide);
  const leftActive = account.currentSide === "left";
  const rightActive = account.currentSide === "right";
  const bothActive = account.currentSide === "solo";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <section className="rounded-[28px] border border-white/10 bg-[#2a0f52]/90 p-5 text-white shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Bed Side</h3>
            <p className="text-sm text-white/60">
              {account.email} · {account.timezone}
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">
            Current: {currentSideLabel}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-[22px] bg-black/20 p-1">
          {sideOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-[18px] px-3 py-3 text-sm font-semibold transition ${
                account.currentSide === option.value
                  ? "bg-white text-[#2a0f52]"
                  : "text-white/75"
              }`}
              disabled={setBedSideMutation.isPending}
              onClick={() => setBedSideMutation.mutate({ side: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-sm text-white/65">
          Select which mattress side your controls target. `Both` maps to the shared
          profile. Active side is highlighted below.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <SideTempCard
            label="Left Side"
            active={leftActive || bothActive}
            current={podStatus.leftHeatingLevel}
            target={podStatus.leftTargetHeatingLevel}
            heating={podStatus.leftNowHeating}
          />
          <SideTempCard
            label="Right Side"
            active={rightActive}
            current={podStatus.rightHeatingLevel}
            target={podStatus.rightTargetHeatingLevel}
            heating={podStatus.rightNowHeating}
          />
        </div>

        {account.features.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {account.features.map((feature) => (
              <span
                key={feature}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"
              >
                {feature}
              </span>
            ))}
          </div>
        )}
      </section>

      <SleepCard sleep={sleep} />

      <section className="rounded-[28px] border border-white/10 bg-[#2a0f52]/90 p-5 text-white shadow-xl">
        <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold">Pod Status</h3>
              <p className="text-sm text-white/60">{podStatus.deviceId}</p>
            </div>
            <Button
              className="rounded-full bg-cyan-300 px-4 text-slate-950 hover:bg-cyan-200"
              disabled={primePodMutation.isPending}
              onClick={() => primePodMutation.mutate()}
            >
              {primePodMutation.isPending ? "Priming..." : "Prime Pod"}
            </Button>
          </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusPill label="Online" active={podStatus.online} />
          <StatusPill label="Priming" active={podStatus.priming} />
          <StatusPill label="Needs Priming" active={podStatus.needsPriming} />
          <StatusPill label="Has Water" active={podStatus.hasWater} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              Last Prime
            </div>
            <div className="mt-2 text-base font-semibold">
              {formatDateTime(podStatus.lastPrime)}
            </div>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              Last Heard
            </div>
            <div className="mt-2 text-base font-semibold">
              {formatDateTime(podStatus.lastHeard)}
            </div>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              Firmware
            </div>
            <div className="mt-2 text-base font-semibold">
              {podStatus.firmwareVersion ?? "--"}
            </div>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              Model
            </div>
            <div className="mt-2 text-base font-semibold">
              {podStatus.modelString ?? "--"}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
