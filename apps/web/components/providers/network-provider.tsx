"use client";

import { useSyncExternalStore } from "react";

// useSyncExternalStore is the correct React API for subscribing to browser
// state. getServerSnapshot always returns true (online) so the server render
// and the hydration render produce identical HTML, with no mismatch.

function subscribe(callback: () => void) {
  window.addEventListener("online",  callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online",  callback);
    window.removeEventListener("offline", callback);
  };
}

const getSnapshot       = () => navigator.onLine;
const getServerSnapshot = () => true;

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className={[
          "fixed top-0 left-0 right-0 z-60",
          "bg-amber-400 text-amber-950 text-sm font-medium text-center py-2 px-4",
          "transition-transform duration-300 ease-in-out",
          isOnline ? "-translate-y-full" : "translate-y-0",
        ].join(" ")}
      >
        Offline — Connection Unstable. Cached data may be shown.
      </div>
      {children}
    </>
  );
}
