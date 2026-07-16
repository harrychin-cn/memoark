import { AlertCircle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useRouteError } from "react-router-dom";
import { useTranslate } from "@/utils/i18n";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const ErrorFallback = ({
  error,
  descriptionKey,
  onReset,
}: {
  error?: Error | null;
  descriptionKey: "ui.error-description" | "ui.error-update-description";
  onReset: () => void;
}) => {
  const t = useTranslate();
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="max-w-md w-full p-6 space-y-4">
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle className="w-8 h-8" />
          <h1 className="text-2xl font-bold">{t("ui.error-title")}</h1>
        </div>
        <p className="text-foreground/70">{t(descriptionKey)}</p>
        {error?.message && (
          <details className="bg-muted p-3 rounded-md text-sm">
            <summary className="cursor-pointer font-medium mb-2">{t("ui.error-details")}</summary>
            <pre className="whitespace-pre-wrap break-words text-xs text-foreground/60">{error.message}</pre>
          </details>
        )}
        <Button onClick={onReset} className="w-full gap-2">
          <RefreshCw className="w-4 h-4" />
          {t("ui.reload-application")}
        </Button>
      </div>
    </div>
  );
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback error={this.state.error} descriptionKey="ui.error-description" onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

// React Router errorElement for route-level errors (e.g., failed chunk loads after redeployment).
export function ChunkLoadErrorFallback() {
  const error = useRouteError() as Error | undefined;
  return <ErrorFallback error={error} descriptionKey="ui.error-update-description" onReset={() => window.location.reload()} />;
}
