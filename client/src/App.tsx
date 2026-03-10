import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Forge from "./pages/Forge";
import Pulse from "./pages/Pulse";
import Portal from "./pages/Portal";
import MemoryWall from "./pages/MemoryWall";
import Gallery from "./pages/Gallery";
import CheckIn from "./pages/CheckIn";

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
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
