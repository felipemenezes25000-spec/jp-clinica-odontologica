import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import "./styles.css";

const raiz = document.getElementById("root");
if (raiz === null) throw new Error("Elemento #root não encontrado em index.html.");

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
