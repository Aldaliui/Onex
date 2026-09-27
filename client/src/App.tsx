import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppShellProvider } from "./contexts/AppShellContext";
import Home from "./pages/Home";
import WindowWorkbench from "./pages/WindowWorkbench";

const AccountingSuite = lazy(() => import("./pages/AccountingSuite"));
const SystemSetup = lazy(() => import("./pages/SystemSetup"));
const SystemAdministration = lazy(() => import("./pages/SystemAdministration"));
const ComponentShowcase = lazy(() => import("./pages/ComponentShowcase"));

function RouteFallback() {
  return (
    <main className="local-login-shell" dir="rtl">
      <section className="local-login-card">
        <p className="local-login-kicker">ONEX ERP</p>
        <h1>جارٍ تحميل الوحدة...</h1>
      </section>
    </main>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={AccountingSuite} />
        <Route path="/accounting" component={AccountingSuite} />
        <Route path="/workbench" component={WindowWorkbench} />
        <Route path="/home" component={Home} />
        <Route path="/setup" component={SystemSetup} />
        <Route path="/system-administration" component={SystemAdministration} />
        <Route path="/showcase" component={ComponentShowcase} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AppShellProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AppShellProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
