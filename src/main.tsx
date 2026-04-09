import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

console.log("React initialized:", !!React.createContext);

createRoot(document.getElementById("root")!).render(<App />);
