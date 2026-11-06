/**
 * O envio de formulário conta UMA conversão, e só onde há paciente.
 *
 * O cupom de #fale valida no próprio onSubmit e chama `rastrearEnvioDeFormulario`
 * depois de validar; o ouvinte global pula quem tem `data-rastreio-proprio`.
 * Este arquivo fixa o que a função empurra para o dataLayer em cada página.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ehFerramentaInterna, rastrearEnvioDeFormulario } from "./formulario";

type Item = Record<string, unknown>;

function emPagina(pathname: string, search = ""): Item[] {
  const dataLayer: Item[] = [];
  vi.stubGlobal("window", { location: { pathname, search }, dataLayer });
  return dataLayer;
}

const form = { id: "", getAttribute: () => null } as unknown as HTMLFormElement;
const eventos = (camada: Item[]) => camada.map((i) => i["event"]);

describe("rastrearEnvioDeFormulario", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("na home: form_submit e UM generate_lead pelo formulário", () => {
    const camada = emPagina("/");
    rastrearEnvioDeFormulario(form);
    expect(eventos(camada)).toEqual(["form_submit", "generate_lead"]);
    expect(camada[1]?.["channel"]).toBe("formulario");
  });

  it("numa página de tratamento, o lead leva o tratamento", () => {
    const camada = emPagina("/tratamentos/ortodontia");
    rastrearEnvioDeFormulario(form);
    expect(camada.filter((i) => i["event"] === "generate_lead")).toHaveLength(1);
    expect(camada[1]?.["treatment"]).toBe("ortodontia");
  });

  it("candidatura não é lead: vira career_apply", () => {
    const camada = emPagina("/trabalhe-conosco", "?vaga=recepcao");
    rastrearEnvioDeFormulario(form);
    expect(eventos(camada)).toEqual(["form_submit", "career_apply"]);
    expect(camada[1]?.["vaga"]).toBe("recepcao");
  });

  it.each(["/rh", "/rh/vagas", "/crc", "/crc/inbox"])(
    "o login e as telas de %s não contam nada",
    (pathname) => {
      const camada = emPagina(pathname);
      rastrearEnvioDeFormulario(form);
      expect(camada).toEqual([]);
    },
  );
});

describe("ehFerramentaInterna", () => {
  it("separa as ferramentas internas das páginas públicas", () => {
    expect(ehFerramentaInterna("/rh")).toBe(true);
    expect(ehFerramentaInterna("/crc-vitrine")).toBe(false);
    expect(ehFerramentaInterna("/crc-institucional")).toBe(false);
    expect(ehFerramentaInterna("/rhum")).toBe(false);
    expect(ehFerramentaInterna("/")).toBe(false);
  });
});
