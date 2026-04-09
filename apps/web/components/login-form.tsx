"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Phone, Lock, Eye, EyeOff, LogIn, Loader2 } from "lucide-react";

import { login } from "@/actions/auth";

const schema = z.object({
  username: z.string().min(1, "Phone or email is required"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormValues) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("username", data.username);
      fd.set("password", data.password);
      const result = await login(undefined, fd);
      if (result?.message) {
        toast.error(result.message);
      }
      // On success, login() calls redirect("/dashboard") — Next.js handles navigation
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {/* Username */}
      <div className="space-y-1.5">
        <label
          htmlFor="username"
          className="block text-sm font-medium text-foreground"
        >
          Phone or Email
        </label>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="username"
            type="text"
            autoComplete="username"
            placeholder="233541234567 or admin@example.com"
            {...register("username")}
            className="block w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
          />
        </div>
        {errors.username && (
          <p className="text-xs text-destructive">{errors.username.message}</p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-foreground"
        >
          Password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            {...register("password")}
            className="block w-full rounded-lg border border-border bg-background pl-9 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="btn-press flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing in…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            Sign in
          </>
        )}
      </button>
    </form>
  );
}
