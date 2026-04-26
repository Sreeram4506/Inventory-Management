import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("React initialized:", !!React.createContext);

// Enforce Light Mode or use system preference
document.documentElement.classList.remove('dark');

createRoot(document.getElementById("root")!).render(<App />);
