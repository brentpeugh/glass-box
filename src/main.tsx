import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Self-hosted fonts (was a Google Fonts @import — external font files are blocked under CSP and in
// the preview sandbox, which made every width measurement fall back to system metrics). Latin subset,
// only the weights the register uses. Tuning 2b: two voices — sans (language) + mono (figures &
// tracked-caps labels); serif removed (the ground marks model-authored content, so serif was a
// redundant signal). Weight range 400/600/700: sans 400+600, mono 400+700 (figures) +600.
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
