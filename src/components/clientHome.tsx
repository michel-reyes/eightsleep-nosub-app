"use client";

import { useState } from "react";
import { EightLoginDialog } from "~/components/eightLogin";
import { EightDashboard } from "~/components/eightDashboard";
import { TemperatureProfileForm } from "~/components/temperatureProfileForm";
import { LogoutButton } from "~/components/logout";

export default function ClientHome({
  initialLoginState,
}: {
  initialLoginState: boolean;
}) {
  const [isLoggedIn, setIsLoggedIn] = useState(initialLoginState);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <h1 className="text-center text-4xl font-extrabold tracking-tight sm:text-6xl">
          Eightsleep <span className="text-[hsl(280,100%,70%)]">Nosub</span> App
        </h1>
        <div className="flex flex-col gap-6">
          {!isLoggedIn && (
            <EightLoginDialog onLoginSuccess={() => setIsLoggedIn(true)} />
          )}
          {isLoggedIn && (
            <>
              <div className="flex w-full justify-end rounded-2xl border border-white/10 bg-black/20 p-4 shadow-xl">
                <LogoutButton onLogoutSuccess={() => setIsLoggedIn(false)} />
              </div>
              <EightDashboard />
              <TemperatureProfileForm />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
