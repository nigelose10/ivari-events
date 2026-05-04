import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { stackClientApp } from "@/stack";
import { StackHandler } from "@stackframe/react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Forge from "./pages/Forge";
import Pulse from "./pages/Pulse";
import Portal from "./pages/Portal";
import MemoryWall from "./pages/MemoryWall";
import Gallery from "./pages/Gallery";
import CheckIn from "./pages/CheckIn";

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
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/forge" component={Forge} />
      <Route path="/pulse/:id" component={Pulse} />
      <Route path="/checkin/:id" component={CheckIn} />
      <Route path="/portal/:slug" component={Portal} />
      <Route path="/memory/:slug" component={MemoryWall} />
      <Route path="/gallery" component={Gallery} />
      {/* Stack Auth pre-built UI — sign-in, sign-up, sign-out, OAuth callbacks */}
      <Route path="/handler/:rest*" component={StackAuthHandler} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
          <PWAInstallPrompt />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
