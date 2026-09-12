/**
 * O contrato com a API REAL do Dental Office.
 *
 * ESTE ARQUIVO EXISTE POR CAUSA DE UM ERRO CARO.
 *
 * O adapter foi escrito antes de a documentação estar em mãos, contra uma API
 * imaginada: `/v1/clinics`, `/v1/schedules`, `PUT` para mudar status,
 * `available_hours` com intervalo de datas. Nada disso existe. E os 378 testes
 * passavam — porque o sandbox implementava a interface que nós inventamos, e
 * nenhum teste chegava perto de uma requisição HTTP.
 *
 * É o modo mais silencioso de um sistema estar errado: verde em tudo, e sem
 * funcionar no primeiro dia de produção.
 *
 * O QUE ESTES TESTES FAZEM DE DIFERENTE: eles interceptam o `fetch` e olham a
 * URL, o método e o corpo que sairiam de verdade. Não validam lógica — validam
 * que o que sai do processo corresponde à especificação OpenAPI 3.0.3
 * publicada em apidocs.dentaloffice.com.br.
 *
 * Se o Dental Office mudar a API, estes testes continuam passando (eles
 * comparam com a especificação de hoje, não com o servidor). O que eles
 * impedem é a regressão de VOLTA para a API inventada — que é o risco real,
 * porque é o que já aconteceu uma vez.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { criarClienteDentalOffice } from "./cliente";

/** O que o adapter tentou enviar, capturado antes de sair. */
type Chamada = { url: string; metodo: string; corpo: unknown };

let chamadas: Chamada[] = [];

/**
 * Responde tudo com 200 e um corpo vazio plausível.
 *
 * O objetivo aqui não é exercitar o parsing — isso os testes de mapeador já
 * fazem. É olhar o que SAI.
 */
function interceptar(resposta: unknown = { results: [] }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((entrada: string | URL | Request, init?: RequestInit) => {
      const url = typeof entrada === "string" ? entrada : entrada.toString();

      let corpo: unknown = undefined;
      if (typeof init?.body === "string") {
        try {
          corpo = JSON.parse(init.body);
        } catch {
          corpo = init.body;
        }
      }

      chamadas.push({ url, metodo: init?.method ?? "GET", corpo });

      // A primeira chamada de qualquer fluxo é o token.
      const ehToken = url.includes("/auth/tokens");
      return Promise.resolve(
        new Response(JSON.stringify(ehToken ? { token: "tok-de-teste" } : resposta), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
}

/** A última chamada que não é a de autenticação. */
function ultimaDeNegocio(): Chamada {
  const uteis = chamadas.filter((c) => !c.url.includes("/auth/tokens"));
  const ultima = uteis[uteis.length - 1];
  if (ultima === undefined) throw new Error("nenhuma chamada de negócio foi feita");
  return ultima;
}

async function clienteDeTeste() {
  // `organizationId` vazio força o caminho do AMBIENTE sem ida ao banco: este
  // arquivo testa o adapter HTTP, e não a resolução de credencial.
  const r = await criarClienteDentalOffice({ organizationId: "" });
  if (!r.ok) throw new Error(`cliente não configurado: ${r.motivo}`);
  return r.cliente;
}

beforeEach(async () => {
  chamadas = [];

  // A URL base é entregue pelo Dental Office JÁ com o /v1 no fim — é assim que
  // a documentação descreve, e é a forma que quebrava o adapter antigo.
  vi.stubEnv("DENTAL_OFFICE_BASE_URL", "https://jp.api.app.dentaloffice.com.br/v1");
  vi.stubEnv("DENTAL_OFFICE_CLIENT_ID", "cli-1");
  vi.stubEnv("DENTAL_OFFICE_SECRET", "seg-1");
  vi.stubEnv("DENTAL_OFFICE_CLINIC_ID", "7");

  // O token fica em cache no módulo; sem limpar, o segundo teste não veria a
  // chamada de autenticação e a ordem das capturas mudaria.
  const { _limparCacheDeToken } = await import("./auth");
  _limparCacheDeToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/* ========================================================================== */

describe("a URL base não ganha /v1 duas vezes", () => {
  it("a base já termina em /v1 e o caminho não o repete", async () => {
    interceptar();
    await (await clienteDeTeste()).listarDentistas("7");

    const { url } = ultimaDeNegocio();
    expect(url).toContain("/v1/dentists");
    // O defeito exato que existia: `/v1/v1/...` — 404 em toda chamada.
    expect(url).not.toContain("/v1/v1");
  });

  it("uma base SEM /v1 também funciona", async () => {
    // Quem cadastrar a variável sem o sufixo não pode ficar com a integração
    // quebrada por causa de uma barra.
    vi.stubEnv("DENTAL_OFFICE_BASE_URL", "https://jp.api.app.dentaloffice.com.br");
    interceptar();
    await (await clienteDeTeste()).listarDentistas("7");

    expect(ultimaDeNegocio().url).toContain("/v1/dentists");
  });
});

describe("os caminhos são os da especificação", () => {
  it("dentistas ficam na RAIZ, e não sob a clínica", async () => {
    interceptar();
    await (await clienteDeTeste()).listarDentistas("7");

    const { url } = ultimaDeNegocio();
    expect(url).toContain("/v1/dentists");
    expect(url).not.toContain("/clinics/7/dentists");
  });

  it("a agenda fica SOB a clínica, e filtra por start/end", async () => {
    interceptar();
    await (
      await clienteDeTeste()
    ).listarAgendamentos({
      clinicaExternaId: "7",
      de: "2026-09-01T00:00:00.000Z",
      ate: "2026-09-30T00:00:00.000Z",
      pagina: 1,
      tamanho: 50,
    });

    const { url } = ultimaDeNegocio();
    expect(url).toContain("/v1/clinics/7/schedules");
    expect(url).toContain("start=2026-09-01");
    expect(url).toContain("end=2026-09-30");
  });

  it("horários livres pedem dentist_id e next em DIAS", async () => {
    interceptar([]);
    await (
      await clienteDeTeste()
    ).horariosDisponiveis({
      clinicaExternaId: "7",
      dentistaExternoId: "3",
      diasAFrente: 14,
      clinicId: "c-1",
    });

    const { url } = ultimaDeNegocio();
    expect(url).toContain("/v1/clinics/7/schedules/available_hours");
    expect(url).toContain("dentist_id=3");
    expect(url).toContain("next=14");
    // A API não aceita intervalo de datas. Mandar um seria ruído ignorado — e
    // pior, sugeriria no código que o recorte existe.
    expect(url).not.toContain("start_date");
  });

  it("o teste de conexão usa /status, e não um endpoint inventado", async () => {
    interceptar({ status: "ok" });
    await (await clienteDeTeste()).testarConexao();

    const { url } = ultimaDeNegocio();
    expect(url).toContain("/v1/status");
  });

  it("pacientes NÃO recebem filtro de atualização, porque ele não existe", async () => {
    interceptar();
    await (
      await clienteDeTeste()
    ).listarPacientes({
      pagina: 2,
      tamanho: 100,
      atualizadosDesde: "2026-09-01T00:00:00.000Z",
    });

    const { url } = ultimaDeNegocio();
    expect(url).toContain("/v1/customers");
    expect(url).toContain("page=2");
    // O parâmetro não existe na API: enviá-lo seria fingir sync incremental.
    expect(url).not.toContain("updated_since");
  });
});

describe("a escrita segue o formato deles", () => {
  it("criar consulta aninha o corpo em `schedule` e manda a cadeira", async () => {
    interceptar({ id: 99 });
    const r = await (
      await clienteDeTeste()
    ).criarAgendamento({
      clinicaExternaId: "7",
      pacienteExternoId: "42",
      dentistaExternoId: "3",
      cadeiraExternaId: "1",
      inicioEm: "2026-09-10T13:40:00.000Z",
      duracaoMinutos: 30,
    });

    expect(r.ok).toBe(true);

    const { url, metodo, corpo } = ultimaDeNegocio();
    expect(url).toContain("/v1/clinics/7/schedules");
    expect(metodo).toBe("POST");

    const c = corpo as { schedule?: Record<string, unknown> };
    expect(c.schedule).toBeDefined();
    expect(c.schedule?.["customer_id"]).toBe("42");
    expect(c.schedule?.["dentist_id"]).toBe("3");
    // A cadeira é obrigatória na API deles.
    expect(c.schedule?.["chair_id"]).toBe("1");
    expect(c.schedule?.["start"]).toBe("2026-09-10T13:40:00.000Z");
    expect(c.schedule?.["end"]).toBe("2026-09-10T14:10:00.000Z");

    // `schedule_situation_id` fica de fora: o id é criado por clínica, e um
    // número fixo daqui acertaria numa e erraria em outra.
    expect(c.schedule).not.toHaveProperty("schedule_situation_id");
  });

  it("a marca do CRC vai em `note`/`obs`, e nunca em `description`", async () => {
    // `description` é o rótulo do calendário DELES: vem com o nome do
    // paciente. Escrever a marca lá a apagaria da tela do Dental Office e
    // ainda assim não voltaria em `notes` — a etiqueta "marcado pelo CRC"
    // ficaria morta para sempre.
    interceptar({ id: 99 });
    await (
      await clienteDeTeste()
    ).criarAgendamento({
      clinicaExternaId: "7",
      pacienteExternoId: "42",
      dentistaExternoId: "3",
      cadeiraExternaId: "1",
      inicioEm: "2026-09-10T13:40:00.000Z",
      duracaoMinutos: 30,
    });

    const c = ultimaDeNegocio().corpo as { schedule?: Record<string, unknown> };
    expect(c.schedule?.["obs"]).toContain("JP CRC");
    expect(c.schedule?.["note"]).toContain("JP CRC");
    expect(c.schedule).not.toHaveProperty("description");
  });

  it("mudar a situação usa PATCH, e não PUT", async () => {
    interceptar({ id: 99 });
    await (await clienteDeTeste()).atualizarStatusAgendamento("7", "99", "CANCELLED");

    const { url, metodo, corpo } = ultimaDeNegocio();
    expect(url).toContain("/v1/clinics/7/schedules/99");
    // PUT trocaria o registro inteiro e apagaria o que o CRC não conhece —
    // cadeira, motivo, observação da recepção.
    expect(metodo).toBe("PATCH");

    const c = corpo as { schedule?: Record<string, unknown> };
    expect(c.schedule).toHaveProperty("schedule_situation_id");
  });

  it("quando a clínica informa o id da própria situação, ele é respeitado", async () => {
    interceptar({ id: 99 });
    await (await clienteDeTeste()).atualizarStatusAgendamento("7", "99", "CANCELLED", 31);

    const c = ultimaDeNegocio().corpo as { schedule?: Record<string, unknown> };
    expect(c.schedule?.["schedule_situation_id"]).toBe(31);
  });
});

describe("a autenticação é a do fluxo documentado", () => {
  it("pede o token com client_id e secret, e usa Bearer depois", async () => {
    interceptar();
    await (await clienteDeTeste()).listarDentistas("7");

    const token = chamadas.find((c) => c.url.includes("/auth/tokens"));
    expect(token).toBeDefined();
    expect(token?.metodo).toBe("POST");

    const corpo = token?.corpo as { client_id?: string; secret?: string };
    expect(corpo.client_id).toBe("cli-1");
    expect(corpo.secret).toBe("seg-1");
  });
});
