import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

/**
 * Try to translate a raw error into a human-readable hint.
 *
 * Common failure modes we've seen on the live deploy:
 *  - "string did not match the expected pattern" → URL parser tripped on
 *    an empty / placeholder Convex URL, or fetch tried to parse HTML as JSON
 *    (e.g. /api/trpc rewriting to index.html when no API is deployed).
 *  - "client_secret must be defined" → Stack Auth project's Google OAuth
 *    provider is missing credentials in the dashboard.
 *  - "publishableClientKey" / "projectId" empty → VITE_STACK_* env vars
 *    not set in Vercel.
 */
function diagnoseError(error: Error | null): string | null {
  if (!error) return null;
  const msg = (error.message || "").toLowerCase();
  const stack = (error.stack || "").toLowerCase();
  const blob = `${msg}\n${stack}`;

  if (
    blob.includes("convex-not-configured") ||
    (blob.includes("convex") && blob.includes("invalid url"))
  ) {
    return "Convex backend URL is missing or invalid. Set VITE_CONVEX_URL in Vercel and redeploy.";
  }
  if (blob.includes("client_secret must be defined")) {
    return "Stack Auth's Google OAuth provider is not configured. In the Stack Auth dashboard → Auth Methods → Google, enter the Google client_id and client_secret.";
  }
  if (
    blob.includes("publishableclientkey") ||
    blob.includes("publishable_client_key")
  ) {
    return "Stack Auth publishable client key is missing. Set VITE_STACK_PUBLISHABLE_CLIENT_KEY in Vercel and redeploy.";
  }
  if (blob.includes("string did not match the expected pattern")) {
    return "An API call returned non-JSON (likely HTML). The most common cause is a missing backend endpoint — the tRPC server is not deployed on Vercel. The frontend needs to be migrated to Convex (see DEBUG-REPORT.md).";
  }
  if (
    blob.includes("the page could not be found") ||
    blob.includes("not_found")
  ) {
    return "An expected backend endpoint returned 404. Verify the API route exists in this deploy.";
  }
  return null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Always log to console so the underlying error is recoverable from
    // browser devtools even when we render a friendly fallback.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      const hint = diagnoseError(this.state.error);

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">An unexpected error occurred.</h2>

            {hint ? (
              <div
                className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-100 p-4 mb-4 text-sm"
                role="status"
              >
                <strong className="block mb-1">Likely cause</strong>
                {hint}
              </div>
            ) : null}

            {this.state.error?.message ? (
              <div className="p-3 w-full rounded bg-muted text-sm font-mono break-words mb-4">
                {this.state.error.name}: {this.state.error.message}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() =>
                this.setState((s) => ({ showDetails: !s.showDetails }))
              }
              className="text-xs text-muted-foreground underline mb-3"
            >
              {this.state.showDetails ? "Hide" : "Show"} technical details
            </button>

            {this.state.showDetails ? (
              <div className="p-4 w-full rounded bg-muted overflow-auto mb-6 max-h-72">
                <pre className="text-xs text-muted-foreground whitespace-break-spaces">
                  {this.state.error?.stack}
                  {"\n\n"}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            ) : null}

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
