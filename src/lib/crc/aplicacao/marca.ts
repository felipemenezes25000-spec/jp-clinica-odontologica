/**
 * De quem é a voz — o nome que aparece para o paciente.
 *
 * ============================================================================
 *  "JP CLÍNICA INTEGRADA ODONTOLÓGICA" ESTAVA ESCRITO NO RUNTIME, em seis
 *  lugares:
 *
 *      automacao/templates.ts       o preview de template
 *      automacao/handlers.ts        a resposta de agendamento e a de lead
 *      automacao/motor.ts           o passo de mensagem da jornada
 *      aplicacao/campanhas.ts       cada mensagem de campanha
 *      ia-platform/instrucoes.ts    a primeira linha do prompt do agente
 *
 *  Com um cliente, isso é só um literal. No dia em que existir um segundo, é
 *  uma clínica se apresentando com o nome de outra — para o paciente de lá, que
 *  não faz ideia de quem é a JP. E não daria erro: a mensagem sai, é entregue,
 *  e quem descobre é o paciente.
 * ============================================================================
 *
 * O QUE FICA HARDCODED, E ESTÁ CERTO ASSIM: o site institucional em `src/routes`
 * e `src/components/site`. Ele É a JP — não é runtime de SaaS, é a página de uma
 * empresa. A separação é essa: o que atende UM cliente pode dizer o nome dele; o
 * que atende QUALQUER cliente pergunta.
 *
 * A CLÍNICA VENCE A ORGANIZAÇÃO quando existe. "Rede Sorriso — Unidade Centro"
 * é o que o paciente reconhece; o nome da holding não diz nada para ele.
 */
import { selecionarUm } from "../servidor/banco";

/**
 * Cache curto, pelo mesmo motivo do de configuração: o nome é lido em TODA
 * mensagem, e um ciclo de trinta jornadas faria trinta leituras idênticas.
 * Cinco minutos — trocar o nome da clínica não é operação de emergência.
 */
type Entrada = { nome: string; expiraEm: number };
const cache = new Map<string, Entrada>();
const VALIDADE_MS = 5 * 60_000;

export function _limparCacheDeMarca(): void {
  cache.clear();
}

/**
 * O nome que o paciente vê.
 *
 * DEVOLVE STRING VAZIA, e nunca um padrão inventado. Um fallback tipo
 * "sua clínica" produziria "Olá, Maria! Somos da sua clínica" — que é pior do
 * que a frase sem o nome, porque parece golpe. Quem chama decide: o template
 * com a variável vazia vira uma frase mais curta, e não uma frase esquisita.
 */
export async function nomeDaMarca(
  organizationId: string,
  clinicId: string | null = null,
): Promise<string> {
  const chave = `${organizationId}|${clinicId ?? ""}`;
  const emCache = cache.get(chave);
  if (emCache !== undefined && emCache.expiraEm > Date.now()) return emCache.nome;

  const nome = await buscar(organizationId, clinicId);

  /*
   * VAZIO NÃO É CACHEADO, e isso não é detalhe.
   *
   * Nome vazio significa "a linha não foi lida" — organização recém-criada,
   * leitura que falhou, tenant que ainda está sendo instalado. Guardar esse
   * resultado por cinco minutos faria as mensagens da clínica saírem sem nome
   * durante a instalação dela, que é justamente quando alguém está olhando.
   *
   * Cachear o sucesso é economia; cachear a ausência é congelar um estado
   * transitório.
   */
  if (nome.length > 0) cache.set(chave, { nome, expiraEm: Date.now() + VALIDADE_MS });
  return nome;
}

async function buscar(organizationId: string, clinicId: string | null): Promise<string> {
  if (organizationId.length === 0) return "";

  if (clinicId !== null && clinicId.length > 0) {
    const clinica = await selecionarUm("crc_clinics", {
      colunas: "nome",
      filtros: [
        { coluna: "id", op: "eq", valor: clinicId },
        // O TENANT NO FILTRO, sempre: um id de clínica vazado não pode devolver
        // o nome de uma unidade de outra empresa.
        { coluna: "organization_id", op: "eq", valor: organizationId },
      ],
    });
    const nome = typeof clinica?.["nome"] === "string" ? clinica["nome"].trim() : "";
    if (nome.length > 0) return nome;
  }

  const org = await selecionarUm("crc_organizations", {
    colunas: "nome",
    filtros: [{ coluna: "id", op: "eq", valor: organizationId }],
  });
  return typeof org?.["nome"] === "string" ? org["nome"].trim() : "";
}
