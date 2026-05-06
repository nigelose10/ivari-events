import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { stackClientApp } from "@/stack";
import { StackHandler } from "@stackframe/react";
import { lazy, Suspense } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import MobileBottomNav from "./components/MobileBottomNav";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

// Lazy-loaded routes — keep Home eager (first paint surface) and Stack handler eager (auth-critical)
const Forge = lazy(() => import("./pages/Forge"));
const Pulse = lazy(() => import("./pages/Pulse"));
const Portal = lazy(() => import("./pages/Portal"));
const LiveEvent = lazy(() => import("./pages/LiveEvent"));
const MemoryWall = lazy(() => import("./pages/MemoryWall"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Chats = lazy(() => import("./pages/Chats"));
const CheckIn = lazy(() => import("./pages/CheckIn"));
const NotFound = lazy(() => import("./pages/NotFound"));

/**
 * Tiny ambient-bg loader shown while a lazy route chunk is fetched.
 * Matches the dark gradient + accent ring used elsewhere in the app.
 */
function RouteLoader() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(120, 80, 200, 0.15), transparent 60%), radial-gradient(ellipse at bottom, rgba(80, 120, 200, 0.1), transparent 60%), #0a0a0f",
      }}
    >
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white/70 animate-spin" />
      </div>
    </div>
  );
}

/**
 * Mount Stack Auth's pre-built UI at /handler/*.
 * Handles sign-in, sign-up, sign-out, password reset, magic link, OAuth
 * callbacks, etc. — all routed internally based on the current path.
 */
function StackAuthHandler() {
  const [location] = useLocation();
  return (
    <StackHandler
      app={stackClientApp}
      location={location}
      fullPage
    />
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/forge" component={Forge} />
        <Route path="/pulse/:id" component={Pulse} />
        <Route path="/checkin/:id" component={CheckIn} />
        <Route path="/portal/:slug" component={Portal} />
        <Route path="/live/:slug" component={LiveEvent} />
        <Route path="/memory/:slug" component={MemoryWall} />
        <Route path="/chats/:slug" component={Chats} />
        <Route path="/gallery" component={Gallery} />
        {/* Stack Auth pre-built UI — sign-in, sign-up, sign-out, OAuth callbacks */}
        <Route path="/handler/:rest*" component={StackAuthHandler} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
          <MobileBottomNav />
          <PWAInstallPrompt />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
