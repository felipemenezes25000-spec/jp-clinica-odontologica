import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";

import { rastrear } from "@/lib/contato";

/**
 * Registra os cliques que valem conversão — num lugar só.
 *
 * A alternativa era pendurar `onClick` em cada botão. São catorze links de
 * WhatsApp só na home, mais telefone, mapa e avaliações, espalhados por sete
 * componentes; e todo link novo nasceria sem rastreio até alguém lembrar. Um
 * ouvinte no documento cobre os que existem e os que vierem, e some inteiro
 * numa linha se um dia não servir mais.
 *
 * `capture: true` de propósito: o evento é registrado na descida, antes que
 * qualquer handler chame `stopPropagation`. Sem isso, um botão que interrompe a
 * propagação some silenciosamente do relatório — e é justamente o botão com
 * comportamento próprio que costuma ser o mais importante de medir.
 */
export function RastreioDeContato() {
  const location = useLocation();

  // Views precisam acompanhar navegação SPA também. Ler `window.location` só
  // no primeiro mount perderia toda troca de rota feita sem recarregar a página.
  useEffect(() => {
    const pagina = location.pathname;

    if (pagina.startsWith("/tratamentos/")) {
      rastrear("treatment_view", {
        pagina,
        tratamento: pagina.split("/").filter(Boolean).pop() ?? "",
      });
    }

    if (pagina === "/carreiras" || pagina.startsWith("/carreiras/")) {
      rastrear("career_view", {
        pagina,
        vaga: pagina.startsWith("/carreiras/") ? (pagina.split("/").filter(Boolean).pop() ?? "") : "",
      });
    }
  }, [location.pathname]);

  useEffect(() => {
    const formulariosIniciados = new WeakSet<HTMLFormElement>();

    const dadosDoFormulario = (form: HTMLFormElement) => ({
      pagina: window.location.pathname,
      formulario: form.id || form.getAttribute("name") || form.getAttribute("action") || "form",
    });

    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target;
      if (!(alvo instanceof Element)) return;
      const link = alvo.closest("a");
      if (!link) return;

      const href = link.getAttribute("href") ?? "";
      // De que seção partiu: o id da seção ancestral mais próxima é o mesmo
      // nome que o menu usa, então o relatório fala a língua do site.
      let origem = "outro";
      let n: Element | null = link;
      while (n && n !== document.body) {
        if (n.tagName === "FOOTER") {
          origem = "rodape";
          break;
        }
        if (n.tagName === "HEADER") {
          origem = "topo";
          break;
        }
        if (n.id) {
          origem = n.id;
          break;
        }
        n = n.parentElement;
      }

      const rotulo = (link.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
      const pagina = window.location.pathname;
      const comum = { origem, rotulo, pagina };

      if (href.includes("wa.me")) {
        rastrear("whatsapp_click", comum);
        // "Agendar" é o CTA primário, e separá-lo do WhatsApp genérico é o que
        // permite responder "quantas pessoas pediram avaliação?" em vez de
        // "quantas clicaram em algum botão verde?".
        //
        // A intenção é lida da MENSAGEM, não do rótulo visível: o cartão que
        // mostra o número tem "(11) 97616-5117" escrito nele e mesmo assim abre
        // o WhatsApp pedindo avaliação. Pelo rótulo, esse clique sumia da conta
        // de agendamentos; pela mensagem, ele conta -- e é o que de fato houve.
        const mensagem = decodeURIComponent(href.split("text=")[1] ?? "");
        if (/agendar uma avalia/i.test(mensagem)) rastrear("schedule_click", comum);
        if (pagina.startsWith("/tratamentos/")) {
          rastrear("treatment_cta_click", { ...comum, tratamento: pagina.split("/").pop() ?? "" });
        }
        return;
      }

      if (href.startsWith("tel:")) return rastrear("phone_click", comum);

      if (href.includes("google.com/maps")) {
        // O selo de avaliações também aponta para o Google Maps. Diferenciar
        // pelo conteúdo evita contar clique em "192 avaliações" como pedido de rota.
        if (/avalia|★|estrela/i.test(rotulo)) return rastrear("review_click", comum);
        return rastrear("map_click", comum);
      }

      if (href.includes("google.com/search") || href.includes("g.page")) {
        return rastrear("review_click", comum);
      }

      try {
        const destino = new URL(link.href, window.location.href);
        if (destino.pathname === "/trabalhe-conosco") {
          rastrear("career_apply", {
            ...comum,
            etapa: "cta",
            vaga: destino.searchParams.get("vaga") ?? "",
          });
        }
      } catch {
        // Link relativo inválido não deve interferir na navegação.
      }
    };

    const aoIniciarFormulario = (e: FocusEvent) => {
      const alvo = e.target;
      if (!(alvo instanceof Element)) return;
      const form = alvo.closest("form");
      if (!(form instanceof HTMLFormElement) || formulariosIniciados.has(form)) return;

      formulariosIniciados.add(form);
      rastrear("form_start", dadosDoFormulario(form));
    };

    const aoEnviarFormulario = (e: SubmitEvent) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;

      const dados = dadosDoFormulario(form);
      rastrear("form_submit", dados);

      if (window.location.pathname === "/trabalhe-conosco") {
        const vaga = new URLSearchParams(window.location.search).get("vaga") ?? "";
        rastrear("career_apply", { ...dados, etapa: "submit", vaga });
      }
    };

    document.addEventListener("click", aoClicar, { capture: true });
    document.addEventListener("focusin", aoIniciarFormulario, { capture: true });
    document.addEventListener("submit", aoEnviarFormulario, { capture: true });

    return () => {
      document.removeEventListener("click", aoClicar, { capture: true });
      document.removeEventListener("focusin", aoIniciarFormulario, { capture: true });
      document.removeEventListener("submit", aoEnviarFormulario, { capture: true });
    };
  }, []);

  // Só efeito: nada a desenhar.
  return null;
}
