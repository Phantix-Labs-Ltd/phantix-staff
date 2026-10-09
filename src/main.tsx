import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import App from "./App";
import PageErrorBoundary from "./components/PageErrorBoundary";
import { bootstrapTheme } from "./lib/theme";
// Geist + Geist Mono (Xalgorix-style typography) — variable woff2, loaded first
// so the app never flashes a fallback face.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { initAnalytics } from "./lib/analytics";
import { loadBrandTokens } from "./lib/branding";
import "./index.css";

bootstrapTheme();
initAnalytics();
loadBrandTokens();

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = "<p style='padding:2rem;font-family:system-ui'>Missing #root element.</p>";
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      {/* reducedMotion="user" drops transform/layout animation for anyone who
          asked the OS for calmer motion; quick opacity fades still carry the
          reveal so content never snaps in (Learn UI — reduced motion). */}
      <MotionConfig reducedMotion="user">
        {/* Last line of defence: nothing renders a blank screen. */}
        <PageErrorBoundary fullScreen>
          <App />
        </PageErrorBoundary>
      </MotionConfig>
    </React.StrictMode>,
  );
}
