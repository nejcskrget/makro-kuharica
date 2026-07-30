import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthGate } from "./AuthGate.jsx";
import "./index.css";
import { registerNotificationServiceWorker } from "./notifications/pushNotifications";

registerNotificationServiceWorker().catch((error) => {
  console.warn("[Makro kuharica] Registracija service workerja ni uspela.", error);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
