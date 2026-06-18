import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { getToken } from "./lib/auth";
import App from "./App";
import "./index.css";

setBaseUrl("https://riviera-api.onrender.com");

setAuthTokenGetter(getToken);

createRoot(document.getElementById("root")!).render(<App />);
