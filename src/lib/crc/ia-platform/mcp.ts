/**
 * O gateway MCP — Fase F, item 24. Implementa o ADR-06.
 *
 * O QUE O MCP É AQUI, e o que ele explicitamente NÃO é.
 *
 * É uma FACHADA sobre o registro de ferramentas que já existe. Um cliente MCP —
 * o Claude Desktop de alguém da clínica, um agente externo, uma automação — pede
 * a lista de ferramentas e chama uma delas pelo protocolo. Do lado de dentro,
 * cada chamada desce pelo MESMO caminho que o turno do agente percorre:
 * `avaliarPolitica`, executor, auditoria, tenant.
 *
 * NÃO É uma porta para o banco. O ADR-06 chama isso de "porta dos fundos que
 * ignora RBAC", e a frase é literal: se o MCP falasse com o Postgres, todo o
 * trabalho das fases B a E — política de ferramenta, dono da conversa, teto de
 * gasto, filtro de tenant — seria contornável por quem tivesse o endereço do
 * gateway.
 *
 * AS TRÊS TRAVAS QUE ESTE ARQUIVO CARREGA, e por que cada uma existe:
 *
 *   O TENANT VEM DA SESSÃO, NUNCA DO PEDIDO. Um cliente MCP não escolhe a
 *   organização: ela é fixada quando a sessão é aberta, a partir de quem
 *   autenticou. Aceitar `organizationId` no payload seria entregar a base de
 *   qualquer clínica a quem soubesse digitar um uuid.
 *
 *   FERRAMENTA SENSÍVEL NÃO É EXPOSTA. O catálogo MCP mostra LEITURA e ESCRITA;
 *   `SENSIVEL` fica de fora, porque essas exigem aprovação humana dentro de um
 *   fluxo de conversa que o MCP não tem.
 *
 *   O TETO DE PASSOS NÃO SE APLICA, e é preciso dizer por quê: ele existe para
 *   impedir um LAÇO do modelo, e no MCP quem chama é um cliente externo com
 *   ciclo próprio. O que protege aqui é a política por ferramenta, que é a
 *   mesma.
 */
import {
  acharFerramenta,
  avaliarPolitica,
  TODAS_AS_FERRAMENTAS,
  type DefinicaoFerramenta,
  type EstadoPolitica,
} from "./ferramentas";

/* -------------------------------------------------------------------------- */
/* O protocolo                                                                */
/* -------------------------------------------------------------------------- */

/** Uma ferramenta como o MCP a descreve. */
export type FerramentaMcp = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ResultadoMcp =
  { ok: true; conteudo: string } | { ok: false; codigo: string; motivo: string };

/**
 * A sessão MCP. O tenant mora AQUI, e não no payload de cada chamada.
 *
 * `permitirEscrita` é separado das flags da clínica de propósito: um cliente MCP
 * pode ser autorizado só a ler, mesmo numa clínica com escrita liberada. São
 * duas perguntas diferentes — "a clínica permite?" e "este cliente pode?" — e
 * juntá-las numa só faria a resposta ser a mais permissiva das duas.
 */
export type SessaoMcp = {
  organizationId: string;
  /** Quem abriu a sessão. Vai para a auditoria de cada chamada. */
  clienteId: string;
  permitirEscrita: boolean;
};

/* -------------------------------------------------------------------------- */
/* O catálogo                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * O nome no MCP usa PONTO, como no CRC: `paciente.resumo`.
 *
 * Muitos clientes MCP esperam `snake_case`. Traduzir aqui criaria dois nomes
 * para a mesma coisa — um na auditoria, outro no protocolo — e a primeira
 * investigação séria esbarraria nisso. O ponto é válido no MCP; o custo de
 * parecer diferente é menor do que o de ter dois nomes.
 */
export function catalogoMcp(sessao: SessaoMcp): FerramentaMcp[] {
  return TODAS_AS_FERRAMENTAS.filter((f) => exposta(f, sessao)).map((f) => ({
    name: f.chave,
    description: f.descricao,
    inputSchema: f.entrada,
  }));
}

function exposta(f: DefinicaoFerramenta, sessao: SessaoMcp): boolean {
  /*
   * `SENSIVEL` NUNCA APARECE NO CATÁLOGO.
   *
   * Não é só "não pode ser chamada": não pode nem ser VISTA. Uma ferramenta
   * sensível listada convida o cliente a tentar, e cada tentativa recusada é
   * uma linha de auditoria que parece ataque sem ser. Pior: a descrição dela
   * revela capacidades do sistema a quem talvez não devesse saber.
   */
  if (f.permissao === "SENSIVEL") return false;

  // Aprovação humana pressupõe um humano no fluxo. O MCP não tem esse humano:
  // do outro lado pode haver um script rodando às três da manhã.
  if (f.aprovacao === "HUMANO") return false;

  if (f.permissao === "ESCRITA" && !sessao.permitirEscrita) return false;

  return true;
}

/* -------------------------------------------------------------------------- */
/* A chamada                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Executa uma ferramenta pedida por um cliente MCP.
 *
 * O CAMINHO É O MESMO DO TURNO. `avaliarPolitica` decide; o executor roda; a
 * auditoria registra. Um caminho paralelo aqui significaria duas regras de
 * política — e a segunda seria a que ninguém revisa.
 *
 * NUNCA LANÇA. Um erro de protocolo devolve `{ok:false}` com motivo, porque o
 * cliente do outro lado precisa saber o que houve; uma exceção viraria uma
 * desconexão sem explicação.
 */
export async function chamarFerramentaMcp(
  sessao: SessaoMcp,
  nome: string,
  argumentos: unknown,
  executor: (chave: string, args: unknown) => Promise<string>,
): Promise<ResultadoMcp> {
  const definicao = acharFerramenta(nome);

  if (definicao === null || !exposta(definicao, sessao)) {
    /*
     * MESMA RESPOSTA PARA "NÃO EXISTE" E PARA "NÃO PODE".
     *
     * Distinguir as duas diria a um cliente não autorizado quais ferramentas
     * sensíveis existem — que é exatamente a informação que `exposta` esconde.
     * O log interno registra a diferença; a resposta, não.
     */
    return {
      ok: false,
      codigo: "ferramenta_desconhecida",
      motivo: `Ferramenta “${nome}” não está disponível nesta sessão.`,
    };
  }

  /*
   * O ESTADO DA POLÍTICA É MONTADO AQUI, e três campos merecem explicação.
   *
   * `ferramentasUsadas: 0` — o teto por turno não se aplica: ele existe para
   * cortar LAÇO do modelo, e aqui quem itera é o cliente, com ciclo próprio.
   *
   * `agendamentoAutonomo` vem das flags da clínica, e não da sessão: se a
   * clínica não autorizou a IA a marcar sozinha, nenhum cliente MCP autoriza.
   *
   * `escritaLiberada` é o E das duas perguntas — a da clínica e a do cliente.
   * OU seria a mais permissiva, e a mais permissiva é a errada aqui.
   */
  const flags = await lerFlagsSeguro(sessao.organizationId);
  const interruptores = await lerInterruptoresSeguro(sessao.organizationId);

  const estado: EstadoPolitica = {
    escritaLiberada: sessao.permitirEscrita && flags["ai_agente_escrita"] === true,
    writebackLiberado: flags["dental_office_writeback"] === true,
    agendamentoAutonomo: flags["auto_scheduling"] === true,
    escritasDentalOfficePausadas: interruptores["kill_escritas_do"] === true,
    ferramentasUsadas: 0,
  };

  const veredicto = avaliarPolitica(nome, estado);
  if (!veredicto.permite) {
    await auditar(sessao, nome, "recusada", veredicto.motivo);
    return { ok: false, codigo: veredicto.codigo, motivo: veredicto.motivo };
  }

  try {
    const conteudo = await executor(nome, argumentos);
    await auditar(sessao, nome, "ok", "");
    return { ok: true, conteudo };
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    await auditar(sessao, nome, "erro", detalhe);
    return { ok: false, codigo: "falha_na_execucao", motivo: detalhe.slice(0, 300) };
  }
}

/* -------------------------------------------------------------------------- */

/**
 * TODA CHAMADA MCP É AUDITADA, inclusive as recusadas.
 *
 * As recusadas importam mais do que as bem-sucedidas: uma sequência de recusas
 * do mesmo cliente é o formato que uma sondagem tem. Sem elas, o padrão fica
 * invisível.
 *
 * NUNCA LANÇA: perder uma linha de auditoria é ruim, derrubar a chamada porque
 * a auditoria falhou é pior.
 */
async function auditar(
  sessao: SessaoMcp,
  ferramenta: string,
  desfecho: string,
  detalhe: string,
): Promise<void> {
  try {
    const { auditar: gravar } = await import("../servidor/registro");
    await gravar({
      organizationId: sessao.organizationId,
      // Não há usuário humano: quem agiu foi um cliente de protocolo. O ator
      // `ia` é o que o resto do sistema usa para "não foi pessoa".
      userId: null,
      ator: "ia",
      acao: `mcp.${ferramenta}`,
      entityType: "mcp",
      entityId: sessao.clienteId,
      depois: { desfecho, detalhe: detalhe.slice(0, 300), cliente: sessao.clienteId },
    });
  } catch {
    // Ver o cabeçalho desta função.
  }
}

async function lerFlagsSeguro(organizationId: string): Promise<Record<string, boolean>> {
  try {
    const { lerFlags } = await import("../servidor/configuracao");
    return await lerFlags(organizationId);
  } catch {
    // SEM FLAGS, NADA É LIBERADO. Um erro de leitura não pode virar permissão:
    // o objeto vazio faz toda checagem `=== true` falhar, que é o lado certo.
    return {};
  }
}

async function lerInterruptoresSeguro(organizationId: string): Promise<Record<string, boolean>> {
  try {
    const { lerKillSwitches } = await import("../servidor/configuracao");
    return await lerKillSwitches(organizationId);
  } catch {
    /*
     * AQUI O PADRÃO SEGURO É O CONTRÁRIO, e a assimetria é proposital.
     *
     * Flag ausente = não liberado. Interruptor ausente = ACIONADO. Os dois
     * escolhem o lado que faz menos: a flag libera, então sua ausência barra; o
     * interruptor barra, então sua ausência também barra.
     */
    return { kill_escritas_do: true };
  }
}
