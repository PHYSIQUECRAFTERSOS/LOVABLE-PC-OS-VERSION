import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0a",
            color: "#e5e0d5",
            fontFamily: "Inter, system-ui, sans-serif",
            padding: "24px",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: "#888", marginBottom: 16 }}>
              {this.state.error?.message || "Unknown error"}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 24px",
                backgroundColor: "#D4A017",
                color: "#0a0a0a",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
