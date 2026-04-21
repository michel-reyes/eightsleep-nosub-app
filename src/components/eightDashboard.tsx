"use client";

import { type RouterOutputs, apiR } from "~/trpc/react";
import { Button } from "~/components/ui/button";

type DashboardData = RouterOutputs["user"]["getDashboard"];

const sideOptions = [
  { value: "solo", label: "Both" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
] as const;

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

function SleepCard({ sleep }: { sleep: DashboardData["sleep"] }) {
  if (!sleep) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white shadow-xl">
        <h3 className="text-lg font-semibold">Sleep Snapshot</h3>
        <p className="mt-3 text-sm text-white/70">No recent sleep data.</p>
      </section>
    );
  }

  const stageEntries = Object.entries(sleep.stageBreakdown);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Sleep Snapshot</h3>
          <p className="text-sm text-white/60">{sleep.sessionDate}</p>
        </div>
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-right">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/70">
            Score
          </div>
          <div className="text-2xl font-semibold text-cyan-100">{sleep.score}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Time Asleep
          </div>
          <div className="mt-1 text-lg font-medium">
            {formatDuration(sleep.durationSeconds)}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Bedtime
          </div>
          <div className="mt-1 text-lg font-medium">
            {formatDateTime(sleep.bedtime)}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Wake
          </div>
          <div className="mt-1 text-lg font-medium">
            {formatDateTime(sleep.wakeTime)}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Stage
          </div>
          <div className="mt-1 text-lg font-medium capitalize">
            {sleep.currentStage ?? "--"}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Heart Rate
          </div>
          <div className="mt-1 text-lg font-medium">
            {formatNumber(sleep.heartRate, { maximumFractionDigits: 0 }, " bpm")}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            HRV
          </div>
          <div className="mt-1 text-lg font-medium">
            {formatNumber(sleep.hrv, { maximumFractionDigits: 0 }, " ms")}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Breath Rate
          </div>
          <div className="mt-1 text-lg font-medium">
            {formatNumber(sleep.breathRate, { maximumFractionDigits: 1 }, " rpm")}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Bed Temp
          </div>
          <div className="mt-1 text-lg font-medium">
            {formatNumber(sleep.bedTempC, { maximumFractionDigits: 1 }, " C")}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Room Temp
          </div>
          <div className="mt-1 text-lg font-medium">
            {formatNumber(sleep.roomTempC, { maximumFractionDigits: 1 }, " C")}
          </div>
        </div>
      </div>

      {stageEntries.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stageEntries.map(([stage, seconds]) => (
            <div
              key={stage}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <div className="text-xs uppercase tracking-[0.2em] text-white/50">
                {stage}
              </div>
              <div className="mt-1 text-lg font-medium">
                {formatDuration(seconds)}
              </div>
            </div>
          ))}
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

  return (
    <div className="grid w-full gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Bed Side</h3>
              <p className="text-sm text-white/60">
                {account.email} · {account.timezone}
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">
              Current:{" "}
              {sideOptions.find((option) => option.value === account.currentSide)
                ?.label ?? account.currentSide ?? "--"}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {sideOptions.map((option) => (
              <Button
                key={option.value}
                variant={account.currentSide === option.value ? "secondary" : "outline"}
                className="border-white/10 bg-white/5 text-white hover:bg-white/15"
                disabled={setBedSideMutation.isPending}
                onClick={() => setBedSideMutation.mutate({ side: option.value })}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {account.features.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
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
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Pod Status</h3>
            <p className="text-sm text-white/60">{podStatus.deviceId}</p>
          </div>
          <Button
            className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
            disabled={primePodMutation.isPending}
            onClick={() => primePodMutation.mutate()}
          >
            {primePodMutation.isPending ? "Priming..." : "Prime Pod"}
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <StatusPill label="Online" active={podStatus.online} />
          <StatusPill label="Priming" active={podStatus.priming} />
          <StatusPill label="Needs Priming" active={podStatus.needsPriming} />
          <StatusPill label="Has Water" active={podStatus.hasWater} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">
              Last Prime
            </div>
            <div className="mt-1 text-lg font-medium">
              {formatDateTime(podStatus.lastPrime)}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">
              Last Heard
            </div>
            <div className="mt-1 text-lg font-medium">
              {formatDateTime(podStatus.lastHeard)}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">
              Firmware
            </div>
            <div className="mt-1 text-lg font-medium">
              {podStatus.firmwareVersion ?? "--"}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">
              Model
            </div>
            <div className="mt-1 text-lg font-medium">
              {podStatus.modelString ?? "--"}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">
              Left Side
            </div>
            <div className="mt-3 space-y-1 text-sm text-white/80">
              <div>Current: {podStatus.leftHeatingLevel}</div>
              <div>Target: {podStatus.leftTargetHeatingLevel}</div>
              <div>Active: {podStatus.leftNowHeating ? "Yes" : "No"}</div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">
              Right Side
            </div>
            <div className="mt-3 space-y-1 text-sm text-white/80">
              <div>Current: {podStatus.rightHeatingLevel}</div>
              <div>Target: {podStatus.rightTargetHeatingLevel}</div>
              <div>Active: {podStatus.rightNowHeating ? "Yes" : "No"}</div>
            </div>
          </div>
        </div>

        {podStatus.features.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {podStatus.features.map((feature) => (
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
    </div>
  );
}
