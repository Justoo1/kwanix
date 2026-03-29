import type { Metadata } from "next";

import LoginForm from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in — RoutePass",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            RoutePass
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in to your station dashboard
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
