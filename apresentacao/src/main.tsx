import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { definirResolvedorDeAsset, resolverPelaBase } from "@/utils/asset";
import "./styles.css";

// A peça também é servida em `/crc-institucional/` dentro do site da clínica.
// Sem isto, os caminhos de logo, foto e narração apontariam para a raiz do
// domínio e viriam 404.
definirResolvedorDeAsset(resolverPelaBase(import.meta.env.BASE_URL));

const raiz = document.getElementById("root");
if (raiz === null) throw new Error("Elemento #root não encontrado em index.html.");

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
