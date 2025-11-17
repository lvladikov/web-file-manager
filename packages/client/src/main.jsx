import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { attachFMToWindow } from "../../../misc/fm";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Attach global FM to window/globalThis for console access
try {
  attachFMToWindow();
} catch (e) {
  // no-op
}
