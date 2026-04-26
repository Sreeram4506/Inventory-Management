import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("React initialized:", !!React.createContext);

// Enforce Dark Mode globally for the professional dashboard theme
document.documentElement.classList.add('dark');

createRoot(document.getElementById("root")!).render(<App />);
