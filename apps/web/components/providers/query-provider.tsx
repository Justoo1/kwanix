"use client";

import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { toast } from "sonner";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (query.meta?.silent) return;
            toast.error(error.message || "A network error occurred.");
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            toast.error(error.message || "Request failed.");
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
