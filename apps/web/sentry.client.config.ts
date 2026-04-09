import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,

  // Replay 1% of sessions, 100% with an error
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [Sentry.replayIntegration()],

  // Don't report errors in development
  enabled: process.env.NODE_ENV === "production",

  debug: false,
});
