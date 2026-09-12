/**
 * De quem é esta credencial — resolvido num lugar só.
 *
 * ============================================================================
 *  O QUE ESTE ARQUIVO IMPEDE, e o cenário é curto: a Clínica B escrevendo na
 *  conta do Dental Office da Clínica A.
 *
 *  As tabelas `crc_canais_whatsapp` e `crc_integracoes_clinica` foram criadas
 *  no `supabase/23` para guardar credencial por tenant. Ninguém as lia. O
 *  runtime inteiro continuava montando provedor a partir de
 *  `process.env["DENTAL_OFFICE_SECRET"]` — uma conta para a INSTALAÇÃO.
 *
 *  Com uma organização, correto por acidente. Com duas, todo mundo escreve na
 *  primeira que configurou o ambiente.
 * ============================================================================
 *
 * A ORDEM DE RESOLUÇÃO, e cada degrau existe por um motivo:
 *
 *   1. CLÍNICA   `crc_integracoes_clinica` / `crc_canais_whatsapp` da unidade.
 *                É o grão mais fino e vence sempre.
 *
 *   2. ORGANIZAÇÃO  a única linha ativa da organização, quando ela tem uma só.
 *                Cobre a organização com três unidades e um contrato só — que
 *                é o caso comum do Dental Office, onde as unidades são
 *                `clinicaExternaId` dentro da MESMA conta.
 *
 *   3. AMBIENTE  as variáveis de sempre. É COMPATIBILIDADE COM A INSTALAÇÃO
 *                LEGADA, e nada mais.
 *
 * ============================================================================
 *  A REGRA QUE FAZ O DEGRAU 3 NÃO SER UMA BOMBA-RELÓGIO.
 *
 *  O ambiente não tem tenant. Usá-lo quando existe mais de um candidato é
 *  exatamente o defeito que este arquivo existe para matar — então ele SE
 *  DESLIGA SOZINHO assim que a instalação deixa de ser única:
 *
 *      Dental Office → cai fora com mais de uma ORGANIZAÇÃO
 *      WhatsApp      → cai fora com mais de uma CLÍNICA
 *
 *  Os grãos são diferentes porque as contas são diferentes: uma conta do Dental
 *  Office atende várias unidades da mesma empresa; um número de WhatsApp é de
 *  uma unidade só.
 *
 *  É o mesmo padrão de `resolverEscopo()` em `aplicacao/webhooks.ts`: um
 *  caminho de transição que não sobrevive à condição que o tornava seguro.
 * ============================================================================
 */
import { selecionar, selecionarUm, type Linha } from "../servidor/banco";
import { decifrar } from "../servidor/segredo";
import { registrar } from "../servidor/registro";

export type OrigemDaCredencial = "clinica" | "organizacao" | "ambiente";

export type CredenciaisDentalOffice = {
  baseUrl: string;
  clientId: string;
  secret: string;
};

export type Resolucao<T> =
  | {
      ok: true;
      credenciais: T;
      origem: OrigemDaCredencial;
      /**
       * A identidade desta credencial, para cache.
       *
       * NUNCA CONTÉM O SEGREDO — ver `impressao()`. Contém uma impressão dele,
       * que é o que faz a rotação invalidar o cache sozinha.
       */
      chave: string;
    }
  | { ok: false; motivo: string; faltando: string[] };

/* -------------------------------------------------------------------------- */
/* A impressão digital                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Um resumo curto e irreversível do segredo, para compor chave de cache.
 *
 * POR QUE NÃO USAR SÓ `baseUrl|clientId`: porque a rotação do segredo não
 * mudaria a chave, e o cache continuaria servindo o token antigo até ele vencer
 * sozinho — o 401 consertaria, depois de falhar em produção uma vez por
 * instância. Com a impressão, trocar o segredo troca a chave, e o token novo é
 * pedido na primeira chamada.
 *
 * POR QUE NÃO O SEGREDO INTEIRO: uma chave de `Map` vive na memória do processo
 * e aparece inteira em qualquer heap dump. Um hash não.
 */
function impressao(segredo: string): string {
  // `node:crypto` por `require` dinâmico não: este módulo só é importado de
  // caminho de servidor, como todo o resto de `integracoes/`.
  let h = 0x811c9dc5;
  for (let i = 0; i < segredo.length; i += 1) {
    h ^= segredo.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* -------------------------------------------------------------------------- */
/* Quão única é esta instalação                                               */
/* -------------------------------------------------------------------------- */

/**
 * Quantas organizações existem — no máximo duas, porque a resposta que
 * interessa é "uma, ou mais de uma".
 *
 * `limite: 2` e não `contar()`: contar a tabela inteira é uma varredura para
 * responder uma pergunta binária.
 *
 * COM CACHE CURTO porque isto é perguntado a cada montagem de cliente, e a
 * resposta muda uma vez na vida da instalação — no dia em que ela deixa de ser
 * de um cliente só. Um minuto é rápido o bastante para o segundo tenant passar
 * a valer sem ninguém reiniciar nada, e curto o bastante para não martelar o
 * banco em toda chamada.
 */
type Contagem = { demais: boolean; expiraEm: number };
const contagens = new Map<string, Contagem>();
const VALIDADE_CONTAGEM_MS = 60_000;

export function _limparContagemDeTenants(): void {
  contagens.clear();
}

async function maisDeUm(qual: "organizacoes" | "clinicas"): Promise<boolean> {
  const guardado = contagens.get(qual);
  if (guardado !== undefined && guardado.expiraEm > Date.now()) return guardado.demais;

  const linhas =
    qual === "organizacoes"
      ? await selecionar("crc_organizations", { colunas: "id", limite: 2 })
      : await selecionar("crc_clinics", {
          colunas: "id",
          filtros: [{ coluna: "ativa", op: "eq", valor: true }],
          limite: 2,
        });

  const demais = linhas.length > 1;
  contagens.set(qual, { demais, expiraEm: Date.now() + VALIDADE_CONTAGEM_MS });
  return demais;
}

/* -------------------------------------------------------------------------- */
/* Dental Office                                                              */
/* -------------------------------------------------------------------------- */

const SISTEMA_DENTAL_OFFICE = "dental_office";

/**
 * As credenciais do Dental Office desta organização/clínica.
 *
 * `clinicId` NULO É LEGÍTIMO e significa "o trabalho é da organização inteira"
 * — a sincronização de pacientes, por exemplo, que não tem unidade. Nesse caso
 * a resolução para no degrau 2.
 */
export async function credenciaisDentalOffice(
  organizationId: string,
  clinicId: string | null = null,
): Promise<Resolucao<CredenciaisDentalOffice>> {
  if (organizationId.length > 0) {
    const daClinica =
      clinicId === null || clinicId.length === 0
        ? null
        : await selecionarUm("crc_integracoes_clinica", {
            colunas: "base_url,client_id,segredo_cifrado",
            filtros: [
              { coluna: "organization_id", op: "eq", valor: organizationId },
              { coluna: "clinic_id", op: "eq", valor: clinicId },
              { coluna: "sistema", op: "eq", valor: SISTEMA_DENTAL_OFFICE },
              { coluna: "ativo", op: "eq", valor: true },
            ],
          });

    const montada = daClinica === null ? null : montarDentalOffice(daClinica, "clinica");
    if (montada !== null) return montada;

    /*
     * O DEGRAU DA ORGANIZAÇÃO só vale quando ela tem UMA integração ativa.
     * Com duas unidades em contas diferentes e um trabalho sem clínica, não há
     * resposta certa — e escolher uma seria exatamente o defeito de origem.
     */
    const daOrg = await selecionar("crc_integracoes_clinica", {
      colunas: "base_url,client_id,segredo_cifrado",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "sistema", op: "eq", valor: SISTEMA_DENTAL_OFFICE },
        { coluna: "ativo", op: "eq", valor: true },
      ],
      limite: 2,
    });

    if (daOrg.length === 1) {
      const primeira = daOrg[0];
      const r = primeira === undefined ? null : montarDentalOffice(primeira, "organizacao");
      if (r !== null) return r;
    }

    if (daOrg.length > 1) {
      return {
        ok: false,
        motivo:
          "Esta organização tem mais de uma conta do Dental Office cadastrada e a operação não disse de qual clínica é. Recusado para não escrever na conta errada.",
        faltando: [],
      };
    }
  }

  /*
   * A CONFERÊNCIA DE AMBIGUIDADE SÓ ACONTECE QUANDO HÁ TENANT.
   *
   * Com `organizationId` vazio não existe a quem atribuir errado — é o caminho
   * de diagnóstico e de teste do adapter. Todo caminho que ESCREVE no mundo
   * carrega a organização, e é nele que a trava vale.
   */
  return await dentalOfficeDoAmbiente(organizationId, organizationId.length > 0);
}

function montarDentalOffice(
  linha: Linha,
  origem: OrigemDaCredencial,
): Resolucao<CredenciaisDentalOffice> | null {
  const baseUrl = String(linha["base_url"] ?? "")
    .trim()
    .replace(/\/+$/u, "");
  const clientId = String(linha["client_id"] ?? "").trim();
  const cifrado = typeof linha["segredo_cifrado"] === "string" ? linha["segredo_cifrado"] : "";

  // Linha sem segredo é cadastro pela metade, e o caminho certo é CAIR para o
  // degrau seguinte — foi assim que o `supabase/23` desenhou a migração:
  // "canal cadastrado sem credencial cai no ambiente".
  if (baseUrl.length === 0 || clientId.length === 0 || cifrado.length === 0) return null;

  const secret = decifrar(cifrado);
  if (secret === null || secret.length === 0) {
    /*
     * DECIFRAR FALHOU, E ISSO NÃO PODE CAIR PARA O AMBIENTE.
     *
     * A linha existe e diz de quem é. Se a chave do servidor mudou ou alguém
     * mexeu na coluna, o comportamento seguro é recusar — cair no ambiente aqui
     * faria a Clínica B escrever na conta do ambiente, que é a da A.
     */
    return {
      ok: false,
      motivo:
        "A credencial do Dental Office desta clínica está cadastrada mas não pôde ser decifrada. Confira CRC_SEGREDO_CHAVE.",
      faltando: ["CRC_SEGREDO_CHAVE"],
    };
  }

  return {
    ok: true,
    credenciais: { baseUrl, clientId, secret },
    origem,
    chave: `do|${origem}|${baseUrl}|${clientId}|${impressao(secret)}`,
  };
}

async function dentalOfficeDoAmbiente(
  organizationId: string,
  conferirAmbiguidade: boolean,
): Promise<Resolucao<CredenciaisDentalOffice>> {
  const baseUrl = (process.env["DENTAL_OFFICE_BASE_URL"] ?? "").trim().replace(/\/+$/u, "");
  const clientId = (process.env["DENTAL_OFFICE_CLIENT_ID"] ?? "").trim();
  const secret = process.env["DENTAL_OFFICE_SECRET"] ?? "";

  const faltando: string[] = [];
  if (baseUrl.length === 0) faltando.push("DENTAL_OFFICE_BASE_URL");
  if (clientId.length === 0) faltando.push("DENTAL_OFFICE_CLIENT_ID");
  if (secret.length === 0) faltando.push("DENTAL_OFFICE_SECRET");

  if (faltando.length > 0) {
    return {
      ok: false,
      motivo: "A integração com o Dental Office ainda não foi configurada.",
      faltando,
    };
  }

  // A TRAVA. Ver o cabeçalho: o ambiente não tem tenant, então ele só vale
  // enquanto existir um tenant só.
  if (conferirAmbiguidade && (await maisDeUm("organizacoes"))) {
    registrar(
      "erro",
      "Credencial do Dental Office só existe no ambiente, e há mais de uma organização.",
      {
        organizationId,
        detalhe: "Cadastre a integração em crc_integracoes_clinica para cada clínica.",
      },
    );
    return {
      ok: false,
      motivo:
        "As credenciais do Dental Office estão só nas variáveis de ambiente, e esta instalação tem mais de uma organização. Cadastre a integração por clínica antes de continuar.",
      faltando: [],
    };
  }

  return {
    ok: true,
    credenciais: { baseUrl, clientId, secret },
    origem: "ambiente",
    chave: `do|ambiente|${baseUrl}|${clientId}|${impressao(secret)}`,
  };
}

/* -------------------------------------------------------------------------- */
/* WhatsApp                                                                   */
/* -------------------------------------------------------------------------- */

export type CanalWhatsapp = {
  /** `meta_cloud` | `twilio` | `waha` */
  provedor: string;
  /** `phone_number_id` na Meta, o número no Twilio, a sessão no WAHA. */
  identificador: string;
  segredo: string;
  /** O que não é secreto: `business_id`, `app_secret`, `url`, `versao`. */
  config: Readonly<Record<string, unknown>>;
};

/**
 * O canal de WhatsApp desta clínica.
 *
 * O GRÃO AQUI É A CLÍNICA, e não a organização: `crc_canais_whatsapp` tem
 * `unique (provedor, identificador)` e FK composta para a unidade. Um número é
 * de uma unidade — é isso que o roteamento de entrada usa para saber de quem é
 * a mensagem, e o de saída tem que usar o mesmo.
 */
export async function credenciaisWhatsapp(
  organizationId: string,
  clinicId: string | null = null,
): Promise<Resolucao<CanalWhatsapp>> {
  if (organizationId.length > 0) {
    const filtros = [
      { coluna: "organization_id" as const, op: "eq" as const, valor: organizationId },
      { coluna: "ativo" as const, op: "eq" as const, valor: true },
      ...(clinicId !== null && clinicId.length > 0
        ? [{ coluna: "clinic_id" as const, op: "eq" as const, valor: clinicId }]
        : []),
    ];

    const linhas = await selecionar("crc_canais_whatsapp", {
      colunas: "provedor,identificador,segredo_cifrado,config",
      filtros,
      ordenar: [{ coluna: "criado_em", ascendente: true }],
      limite: 2,
    });

    if (linhas.length > 1) {
      return {
        ok: false,
        motivo:
          "Esta organização tem mais de um canal de WhatsApp ativo e a operação não disse de qual clínica é. Recusado para não mandar mensagem pelo número errado.",
        faltando: [],
      };
    }

    const unica = linhas[0];
    if (unica !== undefined) {
      const montado = montarCanal(unica, clinicId === null ? "organizacao" : "clinica");
      if (montado !== null) return montado;
    }
  }

  return await whatsappDoAmbiente(organizationId, organizationId.length > 0);
}

function montarCanal(linha: Linha, origem: OrigemDaCredencial): Resolucao<CanalWhatsapp> | null {
  const provedor = String(linha["provedor"] ?? "").trim();
  const identificador = String(linha["identificador"] ?? "").trim();
  const cifrado = typeof linha["segredo_cifrado"] === "string" ? linha["segredo_cifrado"] : "";

  // Canal cadastrado só para ROTEAMENTO DE ENTRADA, sem credencial de envio.
  // É o caminho de migração previsto no `supabase/23`: ele existe para o
  // webhook saber de quem é a mensagem, e o envio segue pelo ambiente.
  if (provedor.length === 0 || identificador.length === 0 || cifrado.length === 0) return null;

  const segredo = decifrar(cifrado);
  if (segredo === null || segredo.length === 0) {
    return {
      ok: false,
      motivo:
        "O canal de WhatsApp desta clínica está cadastrado mas o segredo não pôde ser decifrado. Confira CRC_SEGREDO_CHAVE.",
      faltando: ["CRC_SEGREDO_CHAVE"],
    };
  }

  const config =
    typeof linha["config"] === "object" && linha["config"] !== null
      ? (linha["config"] as Record<string, unknown>)
      : {};

  return {
    ok: true,
    credenciais: { provedor, identificador, segredo, config },
    origem,
    chave: `zap|${origem}|${provedor}|${identificador}|${impressao(segredo)}`,
  };
}

async function whatsappDoAmbiente(
  organizationId: string,
  conferirAmbiguidade: boolean,
): Promise<Resolucao<CanalWhatsapp>> {
  /*
   * O AMBIENTE NÃO DIZ DE QUEM É, e com duas unidades isso significa mandar
   * mensagem de uma clínica pelo número da outra — para o paciente, uma
   * clínica que ele não conhece falando com ele.
   */
  if (conferirAmbiguidade && (await maisDeUm("clinicas"))) {
    registrar("erro", "Credencial de WhatsApp só existe no ambiente, e há mais de uma clínica.", {
      organizationId,
      detalhe: "Cadastre o canal em crc_canais_whatsapp para cada unidade.",
    });
    return {
      ok: false,
      motivo:
        "As credenciais do WhatsApp estão só nas variáveis de ambiente, e esta instalação tem mais de uma clínica. Cadastre o canal de cada unidade antes de continuar.",
      faltando: [],
    };
  }

  // Sem linha e sem ambiguidade: quem monta o provedor a partir do ambiente é
  // `provedores.ts`, que já sabe qual variável falta para cada provedor.
  return { ok: false, motivo: "AMBIENTE", faltando: [] };
}

/**
 * Um canal pelo ID PÚBLICO dele — o caminho de ENTRADA.
 *
 * ============================================================================
 *  POR QUE A ENTRADA PRECISA DISTO, e a saída não precisava.
 *
 *  Na saída, o CRC sabe de quem é a mensagem: ele tem a conversa, e a conversa
 *  tem a clínica. Na ENTRADA não sabe — o corpo do webhook é justamente o que
 *  diz de quem é, e ele ainda não pode ser confiado, porque a assinatura não
 *  foi conferida.
 *
 *  E a assinatura precisa da credencial DAQUELE canal. Com dois Meta Apps, o
 *  `app secret` do tenant A não valida a assinatura do tenant B: a mensagem
 *  legítima da B seria recusada, e — pior — um payload forjado assinado com o
 *  segredo de A passaria por qualquer um.
 *
 *  O ID NA URL QUEBRA A CIRCULARIDADE. Ele não é segredo: é um uuid que só diz
 *  "qual linha ler". Quem o descobre ainda precisa assinar o corpo com o
 *  segredo daquele canal — que continua no banco, cifrado.
 * ============================================================================
 *
 * NÃO EXIGE SEGREDO DE ENVIO. Um canal cadastrado só para roteamento —
 * `segredo_cifrado` nulo — é legítimo, e este caminho o devolve: o `config`
 * dele pode ter o `appSecret`, que é o que a verificação de assinatura usa.
 */
export type CanalPorId = {
  id: string;
  organizationId: string;
  clinicId: string;
  provedor: string;
  identificador: string;
  /** Nulo quando o canal existe só para rotear, sem credencial de envio. */
  segredo: string | null;
  config: Readonly<Record<string, unknown>>;
};

export async function canalPorId(id: string): Promise<CanalPorId | null> {
  if (id.length === 0) return null;

  const linha = await selecionarUm("crc_canais_whatsapp", {
    colunas: "id,organization_id,clinic_id,provedor,identificador,segredo_cifrado,config",
    filtros: [
      { coluna: "id", op: "eq", valor: id },
      // CANAL DESATIVADO NÃO RECEBE. É o desligamento de um cliente, e ele tem
      // que valer na porta de entrada — não adianta parar de enviar e continuar
      // aceitando mensagem.
      { coluna: "ativo", op: "eq", valor: true },
    ],
  });
  if (linha === null) return null;

  const cifrado = typeof linha["segredo_cifrado"] === "string" ? linha["segredo_cifrado"] : "";
  let segredo: string | null = null;

  if (cifrado.length > 0) {
    segredo = decifrar(cifrado);
    if (segredo === null) {
      /*
       * DECIFRAR FALHOU: o canal existe e não dá para usar. `null` faz a rota
       * recusar — e recusar é o certo, porque a alternativa seria verificar a
       * assinatura com outra credencial qualquer.
       */
      registrar("erro", "Canal de WhatsApp com segredo que não decifra.", { canal: id });
      return null;
    }
  }

  return {
    id: String(linha["id"] ?? ""),
    organizationId: String(linha["organization_id"] ?? ""),
    clinicId: String(linha["clinic_id"] ?? ""),
    provedor: String(linha["provedor"] ?? ""),
    identificador: String(linha["identificador"] ?? ""),
    segredo,
    config:
      typeof linha["config"] === "object" && linha["config"] !== null
        ? (linha["config"] as Record<string, unknown>)
        : {},
  };
}

/** `true` quando a recusa foi "não há nada no banco; use o ambiente". */
export function ehCaminhoDoAmbiente(r: Resolucao<CanalWhatsapp>): boolean {
  return !r.ok && r.motivo === "AMBIENTE";
}
