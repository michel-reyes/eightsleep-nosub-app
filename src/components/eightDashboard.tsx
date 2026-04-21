"use client";

import { useEffect, useState } from "react";
import { type RouterOutputs, apiR } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  type TempUnit,
  formatTemp,
  rawLevelToTemp,
  tempToRawLevel,
} from "~/lib/eightTemperature";

type DashboardData = RouterOutputs["user"]["getDashboard"];
type SideValue = "solo" | "left" | "right";

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

function rawToDisplay(rawLevel: number | null, unit: TempUnit) {
  return formatTemp(rawLevelToTemp(rawLevel, unit), unit, 0);
}

function rawToAltDisplay(rawLevel: number | null, unit: TempUnit) {
  const altUnit = unit === "f" ? "c" : "f";
  return formatTemp(rawLevelToTemp(rawLevel, altUnit), altUnit, 0);
}

function sideSummary(side: SideValue) {
  if (side === "solo") {
    return "Both sides";
  }

  return `${labelForSide(side)} side`;
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
  unit,
}: {
  label: string;
  active: boolean;
  current: number | null;
  target: number | null;
  heating: boolean | null;
  unit: TempUnit;
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
            {rawToDisplay(current, unit)}
          </div>
          <div className="text-xs text-white/45">{rawToAltDisplay(current, unit)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Target
          </div>
          <div className="mt-1 text-xl font-semibold text-white">
            {rawToDisplay(target, unit)}
          </div>
          <div className="text-xs text-white/45">{rawToAltDisplay(target, unit)}</div>
        </div>
      </div>
      <div className="mt-3 text-sm text-white/70">
        {heating === null ? "--" : heating ? "Actively heating" : "Idle"}
      </div>
    </div>
  );
}

function SleepCard({ sleep, unit }: { sleep: DashboardData["sleep"]; unit: TempUnit }) {
  if (!sleep) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-[#2a0f52]/90 p-5 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Sleep Snapshot</h3>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
            Unavailable
          </div>
        </div>
        <p className="mt-4 text-sm text-white/70">No recent sleep data from Eight yet.</p>
      </section>
    );
  }

  const stageEntries = Object.entries(sleep.stageBreakdown);
  const bedTemp =
    sleep.bedTempC === null
      ? "--"
      : formatTemp(unit === "c" ? sleep.bedTempC : sleep.bedTempC * 1.8 + 32, unit, 1);
  const roomTemp =
    sleep.roomTempC === null
      ? "--"
      : formatTemp(unit === "c" ? sleep.roomTempC : sleep.roomTempC * 1.8 + 32, unit, 1);

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
          <div className="text-3xl font-semibold text-cyan-100">{sleep.score ?? "--"}</div>
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
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Stage</div>
          <div className="mt-2 text-xl font-semibold capitalize">
            {sleep.currentStage ?? "--"}
          </div>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Bedtime</div>
          <div className="mt-2 text-base font-semibold">{formatDateTime(sleep.bedtime)}</div>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Wake</div>
          <div className="mt-2 text-base font-semibold">{formatDateTime(sleep.wakeTime)}</div>
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
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">HRV</div>
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
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Bed Temp</div>
          <div className="mt-2 text-lg font-semibold">{bedTemp}</div>
        </div>
        <div className="col-span-2 rounded-[20px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Room Temp
          </div>
          <div className="mt-2 text-lg font-semibold">{roomTemp}</div>
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
                <div className="mt-2 text-lg font-semibold">{formatDuration(seconds)}</div>
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
  const [serverSide, setServerSide] = useState<SideValue>("solo");
  const [optimisticSide, setOptimisticSide] = useState<SideValue | null>(null);
  const [tempUnit, setTempUnit] = useState<TempUnit>("f");
  const [tempInput, setTempInput] = useState(81);
  const [pendingRawLevel, setPendingRawLevel] = useState<number | null>(null);
  const currentSideValue = dashboardQuery.data?.account.currentSide;
  const leftTargetValue = dashboardQuery.data?.podStatus.leftTargetHeatingLevel;
  const rightTargetValue = dashboardQuery.data?.podStatus.rightTargetHeatingLevel;

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

  const setCurrentTemperatureMutation = apiR.user.setCurrentTemperature.useMutation({
    onSuccess: async () => {
      await utils.user.getDashboard.invalidate();
    },
    onError: () => {
      setPendingRawLevel(null);
    },
  });

  useEffect(() => {
    if (currentSideValue === undefined) {
      return;
    }

    const nextServerSide = (currentSideValue as SideValue | null) ?? "solo";
    setServerSide(nextServerSide);

    if (optimisticSide === nextServerSide) {
      setOptimisticSide(null);
    }
  }, [currentSideValue, optimisticSide]);

  useEffect(() => {
    if (leftTargetValue === undefined && rightTargetValue === undefined) {
      return;
    }

    setPendingRawLevel(null);
  }, [leftTargetValue, rightTargetValue]);

  const selectedSide = optimisticSide ?? serverSide;

  const selectedCurrentRaw = dashboardQuery.data
    ? selectedSide === "right"
      ? dashboardQuery.data.podStatus.rightHeatingLevel
      : dashboardQuery.data.podStatus.leftHeatingLevel
    : null;
  const selectedServerTargetRaw = dashboardQuery.data
    ? selectedSide === "right"
      ? dashboardQuery.data.podStatus.rightTargetHeatingLevel
      : dashboardQuery.data.podStatus.leftTargetHeatingLevel
    : null;
  const selectedTargetRaw = pendingRawLevel ?? selectedServerTargetRaw ?? selectedCurrentRaw;

  useEffect(() => {
    const nextTemp = rawLevelToTemp(selectedTargetRaw, tempUnit);
    if (nextTemp !== null) {
      setTempInput(Math.round(nextTemp));
    }
  }, [selectedTargetRaw, tempUnit]);

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

  const leftActive = selectedSide === "left" || selectedSide === "solo";
  const rightActive = selectedSide === "right" || selectedSide === "solo";
  const leftTargetDisplay =
    pendingRawLevel !== null && selectedSide !== "right"
      ? pendingRawLevel
      : podStatus.leftTargetHeatingLevel;
  const rightTargetDisplay =
    pendingRawLevel !== null && selectedSide !== "left"
      ? pendingRawLevel
      : podStatus.rightTargetHeatingLevel;
  const sliderMin = tempUnit === "f" ? 55 : 13;
  const sliderMax = tempUnit === "f" ? 111 : 44;

  const applyTemperature = () => {
    const rawLevel = tempToRawLevel(tempInput, tempUnit);
    setPendingRawLevel(rawLevel);
    setCurrentTemperatureMutation.mutate({
      side: selectedSide,
      rawLevel,
    });
  };

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
            Current: {labelForSide(selectedSide)}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-[22px] bg-black/20 p-1">
          {sideOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-[18px] px-3 py-3 text-sm font-semibold transition ${
                selectedSide === option.value ? "bg-white text-[#2a0f52]" : "text-white/75"
              }`}
              disabled={setBedSideMutation.isPending}
              onClick={() => {
                const nextSide = option.value;
                setOptimisticSide(nextSide);
                setBedSideMutation.mutate(
                  { side: nextSide },
                  {
                    onError: () => {
                      setOptimisticSide(null);
                    },
                  },
                );
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-sm text-white/65">
          Pick the side first. Then set the live temperature for that side. `Both`
          applies one shared level.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <SideTempCard
            label="Left Side"
            active={leftActive}
            current={podStatus.leftHeatingLevel}
            target={leftTargetDisplay}
            heating={podStatus.leftNowHeating}
            unit={tempUnit}
          />
          <SideTempCard
            label="Right Side"
            active={rightActive}
            current={podStatus.rightHeatingLevel}
            target={rightTargetDisplay}
            heating={podStatus.rightNowHeating}
            unit={tempUnit}
          />
        </div>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
                Set Temperature
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {sideSummary(selectedSide)}
              </div>
              <div className="text-sm text-white/55">
                Current {rawToDisplay(selectedCurrentRaw, tempUnit)} · Target{" "}
                {rawToDisplay(selectedTargetRaw, tempUnit)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-white/5 p-1">
              {(["f", "c"] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    tempUnit === unit ? "bg-white text-[#2a0f52]" : "text-white/70"
                  }`}
                  onClick={() => setTempUnit(unit)}
                >
                  °{unit.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-[20px] border border-cyan-300/20 bg-cyan-300/10 p-4 text-center">
            <div className="text-3xl font-semibold text-cyan-100">
              {formatTemp(tempInput, tempUnit, 0)}
            </div>
            <div className="mt-1 text-sm text-cyan-100/70">
              {formatTemp(
                tempUnit === "f" ? (tempInput - 32) / 1.8 : tempInput * 1.8 + 32,
                tempUnit === "f" ? "c" : "f",
                0,
              )}
            </div>
          </div>

          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step="1"
            value={tempInput}
            onChange={(event) => setTempInput(Number(event.target.value))}
            className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/15"
          />

          <div className="mt-2 flex items-center justify-between text-xs text-white/45">
            <span>
              {formatTemp(sliderMin, tempUnit, 0)}
            </span>
            <span>
              Raw {tempToRawLevel(tempInput, tempUnit)}
            </span>
            <span>
              {formatTemp(sliderMax, tempUnit, 0)}
            </span>
          </div>

          <Button
            className="mt-4 h-12 w-full rounded-[18px] bg-white text-[#2a0f52] hover:bg-white/90"
            disabled={setCurrentTemperatureMutation.isPending}
            onClick={applyTemperature}
          >
            {setCurrentTemperatureMutation.isPending
              ? "Applying..."
              : `Set ${sideSummary(selectedSide)} to ${formatTemp(tempInput, tempUnit, 0)}`}
          </Button>
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

      <SleepCard sleep={sleep} unit={tempUnit} />

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
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Model</div>
            <div className="mt-2 text-base font-semibold">{podStatus.modelString ?? "--"}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
