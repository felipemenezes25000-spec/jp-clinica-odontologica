import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";

import { registrarEntrada } from "@/lib/analytics/atribuicao";
import { decidirEventoDeClique, rastrear } from "@/lib/analytics/eventos";
import { tratamentoDaRota } from "@/lib/analytics/rotas";

/**
 * Registra o que vale medir — num lugar só.
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
 *
 * A DECISÃO DE QUAL EVENTO NÃO MORA MAIS AQUI. Ela é uma função pura em
 * `@/lib/analytics/eventos.ts`, que devolve no máximo UM evento por clique.
 * Enquanto ela morava neste componente, o mesmo clique caía em três `if`
 * seguidos e virava três conversões — ver o cabeçalho daquele arquivo. Agora o
 * componente faz o que um componente deve fazer: ouvir, perguntar e despachar.
 */
export function RastreioDeContato() {
  const location = useLocation();

  /*
   * A ATRIBUIÇÃO É REGISTRADA ANTES DE QUALQUER EVENTO, e a ordem importa.
   *
   * `registrarEntrada` guarda a campanha da primeira entrada da sessão. Se um
   * `generate_lead` disparasse antes disso — pessoa que clica no CTA do hero em
   * dois segundos —, ele iria sem `utm_campaign` e sem `gclid`, e a conversão
   * mais rápida do funil seria justamente a que chega órfã no relatório.
   */
  useEffect(() => {
    registrarEntrada(window.location.href);
  }, []);

  /*
   * As views acompanham navegação SPA também. Ler `window.location` só no
   * primeiro mount perderia toda troca de rota feita sem recarregar a página.
   */
  useEffect(() => {
    const pagina = location.pathname;

    // `tratamentoDaRota` reconhece as DUAS famílias de URL — `/tratamentos/x` e
    // as oito de anúncio. Era aqui que a LP paga sumia do funil: o teste antigo
    // era `pathname.startsWith("/tratamentos/")`, e `/implante-dentario` não
    // começa com isso.
    const tratamento = tratamentoDaRota(pagina);
    if (tratamento !== null) {
      rastrear("treatment_view", { pagina, treatment: tratamento });
    }

    if (pagina === "/carreiras" || pagina.startsWith("/carreiras/")) {
      rastrear("career_view", {
        pagina,
        vaga: pagina.startsWith("/carreiras/")
          ? (pagina.split("/").filter(Boolean).pop() ?? "")
          : "",
      });
    }
  }, [location.pathname]);

  useEffect(() => {
    const formulariosIniciados = new WeakSet<HTMLFormElement>();

    const dadosDoFormulario = (form: HTMLFormElement) => ({
      pagina: window.location.pathname,
      formulario: form.id || form.getAttribute("name") || form.getAttribute("action") || "form",
    });

    /** De que seção partiu: o `id` da seção ancestral mais próxima é o mesmo
     *  nome que o menu usa, então o relatório fala a língua do site. */
    const origemDoLink = (link: Element): string => {
      let n: Element | null = link;
      while (n && n !== document.body) {
        if (n.tagName === "FOOTER") return "rodape";
        if (n.tagName === "HEADER") return "topo";
        if (n.id) return n.id;
        n = n.parentElement;
      }
      return "outro";
    };

    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target;
      if (!(alvo instanceof Element)) return;
      const link = alvo.closest("a");
      if (!link) return;

      const planejado = decidirEventoDeClique({
        href: link.getAttribute("href") ?? "",
        rotulo: (link.textContent ?? "").trim().replace(/\s+/gu, " ").slice(0, 60),
        origem: origemDoLink(link),
        pathname: window.location.pathname,
      });

      // UM evento, ou nenhum. Não existe segundo `rastrear` neste caminho, e é
      // essa ausência que impede a conversão de ser contada duas vezes.
      if (planejado !== null) rastrear(planejado.evento, planejado.dados);
    };

    const aoIniciarFormulario = (e: FocusEvent) => {
      const alvo = e.target;
      if (!(alvo instanceof Element)) return;
      const form = alvo.closest("form");
      if (!(form instanceof HTMLFormElement) || formulariosIniciados.has(form)) return;

      formulariosIniciados.add(form);
      rastrear("form_start", dadosDoFormulario(form));
    };

    /*
     * O FORMULÁRIO É O ÚNICO LUGAR COM DOIS EVENTOS, e eles têm pesos
     * diferentes: `form_submit` é leitura de funil e não vira nada na Meta;
     * `generate_lead` é a conversão. Quem enviou o formulário pediu contato
     * tanto quanto quem clicou no CTA de WhatsApp — se só o primeiro contasse,
     * o Google otimizaria contra metade dos leads da clínica.
     */
    const aoEnviarFormulario = (e: SubmitEvent) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;

      const dados = dadosDoFormulario(form);
      const tratamento = tratamentoDaRota(window.location.pathname);

      rastrear("form_submit", dados);

      if (window.location.pathname === "/trabalhe-conosco") {
        // Candidatura NÃO é lead comercial. Mandá-la como conversão ensinaria o
        // algoritmo a buscar candidato, não paciente — e a clínica pagaria por isso.
        const vaga = new URLSearchParams(window.location.search).get("vaga") ?? "";
        rastrear("career_apply", { ...dados, etapa: "submit", vaga });
        return;
      }

      rastrear("generate_lead", {
        ...dados,
        channel: "formulario",
        ...(tratamento !== null ? { treatment: tratamento } : {}),
      });
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
