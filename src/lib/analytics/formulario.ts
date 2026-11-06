import { rastrear } from "./eventos";
import { tratamentoDaRota } from "./rotas";

/**
 * O envio de formulário como evento de funil.
 *
 * O ouvinte global de `submit` (RastreioDeContato) roda em modo capture, ANTES
 * do `onSubmit` do formulário. Para um formulário sem validação própria isso
 * basta. Para um que valida no `onSubmit` (o cupom de #fale), o ouvinte contaria
 * a tentativa recusada como conversão, e o reenvio corrigido como outra. Esse
 * formulário se marca com `data-rastreio-proprio` e chama
 * `rastrearEnvioDeFormulario` ele mesmo, depois de validar.
 */
export const ATRIBUTO_RASTREIO_PROPRIO = "data-rastreio-proprio";

/** Ferramentas internas: nada que se envia nelas é lead de paciente. */
export function ehFerramentaInterna(pathname: string): boolean {
  return /^\/(rh|crc)(\/|$)/.test(pathname);
}

export function dadosDoFormulario(form: HTMLFormElement) {
  return {
    pagina: window.location.pathname,
    formulario: form.id || form.getAttribute("name") || form.getAttribute("action") || "form",
  };
}

/*
 * O FORMULÁRIO É O ÚNICO LUGAR COM DOIS EVENTOS, e eles têm pesos diferentes:
 * `form_submit` é leitura de funil e não vira nada na Meta; `generate_lead` é a
 * conversão. Quem enviou o formulário pediu contato tanto quanto quem clicou no
 * CTA de WhatsApp — se só o primeiro contasse, o Google otimizaria contra
 * metade dos leads da clínica.
 */
export function rastrearEnvioDeFormulario(form: HTMLFormElement): void {
  const pathname = window.location.pathname;
  if (ehFerramentaInterna(pathname)) return;

  const dados = dadosDoFormulario(form);
  rastrear("form_submit", dados);

  if (pathname === "/trabalhe-conosco") {
    // Candidatura NÃO é lead comercial. Mandá-la como conversão ensinaria o
    // algoritmo a buscar candidato, não paciente — e a clínica pagaria por isso.
    const vaga = new URLSearchParams(window.location.search).get("vaga") ?? "";
    rastrear("career_apply", { ...dados, etapa: "submit", vaga });
    return;
  }

  const tratamento = tratamentoDaRota(pathname);
  rastrear("generate_lead", {
    ...dados,
    channel: "formulario",
    ...(tratamento !== null ? { treatment: tratamento } : {}),
  });
}
