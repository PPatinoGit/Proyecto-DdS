import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App";
import { AuthProvider } from "./components/auth/AuthProvider";
import { I18nProvider } from "./i18n/I18nProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Language first: the guards render a translated loader. */}
    <I18nProvider>
      <BrowserRouter>
        {/* AuthProvider asks the server for the session on mount. */}
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
