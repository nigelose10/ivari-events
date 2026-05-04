import { trpc } from "@/lib/trpc";
import { stackClientApp } from "@/stack";
import { useAuthForConvex, convex } from "@/lib/convex";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { StackProvider, StackTheme } from "@stackframe/react";
import { ConvexProviderWithAuth } from "convex/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import EnvGuardBanner from "./components/EnvGuard";
import "./index.css";

const queryClient = new QueryClient();

const STACK_SIGN_IN_PATH = "/handler/sign-in";

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;
  // Don't bounce while already on a Stack handler page.
  if (window.location.pathname.startsWith("/handler")) return;

  window.location.href = STACK_SIGN_IN_PATH;
};

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <>
    <EnvGuardBanner />
    <StackProvider app={stackClientApp}>
      <StackTheme>
        <ConvexProviderWithAuth client={convex} useAuth={useAuthForConvex}>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <App />
            </QueryClientProvider>
          </trpc.Provider>
        </ConvexProviderWithAuth>
      </StackTheme>
    </StackProvider>
  </>
);
