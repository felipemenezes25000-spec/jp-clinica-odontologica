/**
 * Os erros da Graph API, classificados — §35, §38.
 *
 * ============================================================================
 *  O CRC JÁ TEM TRÊS CLASSES DE FALHA, E ELAS SÃO O CONTRATO.
 *
 *      permanente    não insista. Número inválido, permissão faltando.
 *      transitoria   o pedido NÃO chegou. Repetir é seguro e necessário.
 *      incerta       o pedido SAIU e a resposta não voltou. Repetir DUPLICA.
 *
 *  Ver `integracoes/whatsapp/porta.ts`, que explica por que um booleano não
 *  bastava: o estado que faltava — `incerta` — é o que manda mensagem repetida
 *  para paciente.
 *
 *  ESTE ARQUIVO REUSA AS MESMAS TRÊS, e não inventa um vocabulário paralelo. O
 *  que ele acrescenta é o MAPA: qual código da Meta cai em qual classe.
 * ============================================================================
 *
 * ============================================================================
 *  E O MAPA IMPORTA MAIS AQUI DO QUE NO WHATSAPP, por um motivo específico.
 *
 *  `meta-cloud.ts` classifica por FAIXA de HTTP: "4xx que não é 429 é
 *  permanente". Isso é certo para envio de WhatsApp e ERRADO para a Graph API
 *  em geral, porque a Meta devolve 400 para coisas que se resolvem sozinhas:
 *
 *      (#2)   erro temporário do serviço   → TRANSITÓRIA, e vem como 500/400
 *      (#4)   limite da aplicação          → TRANSITÓRIA (é cota, não defeito)
 *      (#190) token inválido/expirado      → PERMANENTE até alguém reconectar
 *      (#10)  falta permissão              → PERMANENTE até App Review
 *
 *  Tratar (#4) como permanente faria a integração desligar sozinha num pico de
 *  movimento — e ficar desligada. Tratar (#190) como transitória faria o
 *  sistema martelar um token morto por cinco tentativas, em cada mensagem, para
 *  sempre.
 * ============================================================================
 *
 * FONTE: https://developers.facebook.com/docs/graph-api/guides/error-handling/
 * Conferida em 15/09/2026.
 */
import { campo, numeroOpcional, textoOpcional } from "../../dominio/validar";
import { entregaFicouIncerta } from "../../servidor/http";
import type { ClasseDeFalha } from "../whatsapp/porta";

export type ErroDaGraph = {
  classe: ClasseDeFalha;
  /** `(#190)` ou o status HTTP quando a Meta não manda código. */
  codigo: string;
  /** A frase da Meta, ou a nossa quando não houve resposta. */
  detalhe: string;
  /**
   * O que fazer, em português, para o runbook e para a tela.
   *
   * NÃO É ENFEITE. "(#10) Application does not have permission for this action"
   * não diz a ninguém que falta pedir `instagram_business_manage_messages` no
   * App Review — e é essa a ação. Um erro sem próxima ação vira um chamado.
   */
  acao: string;
  /** Quando repetir, em ms. `null` quando repetir não resolve. */
  esperarMs: number | null;
  /**
   * `true` quando a credencial precisa ser renovada por uma PESSOA.
   *
   * A tela do §31 usa isto para mostrar "Reconectar" em vez de "Tentar de
   * novo" — e a saúde do §39 para separar "a Meta está fora" de "o nosso token
   * morreu", que exigem reações opostas.
   */
  exigeReconexao: boolean;
};

/* -------------------------------------------------------------------------- */
/* O catálogo                                                                 */
/* -------------------------------------------------------------------------- */

type Entrada = {
  classe: ClasseDeFalha;
  acao: string;
  esperarMs?: number | null;
  exigeReconexao?: boolean;
};

/**
 * Os códigos que importam, com o que fazer em cada um.
 *
 * A LISTA É CURTA DE PROPÓSITO. Ela cobre o que acontece de verdade nesta
 * integração; o resto cai no `porFaixaDeHttp`, que é conservador. Um catálogo
 * de sessenta códigos copiado da documentação envelhece sem ninguém notar, e a
 * parte envelhecida é justamente a que ninguém exercita.
 */
const POR_CODIGO: Readonly<Record<number, Entrada>> = {
  1: {
    classe: "transitoria",
    acao: "Erro desconhecido da API. Se persistir, confira o status da plataforma da Meta.",
    esperarMs: 30_000,
  },
  2: {
    classe: "transitoria",
    acao: "Erro temporário do serviço da Meta. A fila repesca sozinha.",
    esperarMs: 30_000,
  },
  4: {
    classe: "transitoria",
    acao: "Limite de chamadas da APLICAÇÃO estourado. Reduza a frequência; a cota volta por hora.",
    esperarMs: 60_000,
  },
  17: {
    classe: "transitoria",
    acao: "Limite de chamadas do USUÁRIO estourado. A cota volta por hora.",
    esperarMs: 60_000,
  },
  32: {
    classe: "transitoria",
    acao: "Limite de chamadas da PÁGINA estourado. A cota volta por hora.",
    esperarMs: 60_000,
  },
  10: {
    classe: "permanente",
    acao: "A aplicação não tem permissão para esta ação. Confira Advanced Access e App Review para a permissão que o produto exige.",
  },
  100: {
    classe: "permanente",
    acao: "Parâmetro inválido. Normalmente é destinatário fora de janela, id inexistente, ou campo que a versão da Graph não aceita mais.",
  },
  190: {
    classe: "permanente",
    acao: "Token inválido ou expirado. É preciso reconectar a conta — nenhuma retentativa resolve.",
    exigeReconexao: true,
  },
  102: {
    classe: "permanente",
    acao: "Sessão da API inválida. Reconecte a conta.",
    exigeReconexao: true,
  },
  200: {
    classe: "permanente",
    acao: "Permissão negada para este objeto. Confira se a Página/conta é a cadastrada e se o app tem acesso a ela.",
  },
  368: {
    classe: "permanente",
    acao: "A conta está temporariamente bloqueada por violação de política. NÃO insista: cada tentativa piora. Revise a política de mensageria do canal.",
  },
  551: {
    classe: "permanente",
    acao: "A pessoa não está disponível para receber mensagem — bloqueou a conta, ou a janela fechou. Não insista.",
  },
  2018001: {
    classe: "permanente",
    acao: "Destinatário não encontrado. O identificador não pertence a esta conta.",
  },
  /*
   * (#10900) e (#10903) — os erros específicos de private reply.
   *
   * Eles existem no catálogo por uma razão: são os ÚNICOS que dizem "você já
   * respondeu este comentário". Sem eles mapeados, a reserva do §17 ficaria
   * `FALHOU` e a próxima volta tentaria de novo — martelando um endpoint que
   * nunca vai aceitar, e gastando a cota de 750/hora.
   */
  10900: {
    classe: "permanente",
    acao: "Já existe uma resposta privada para este comentário. A Meta permite apenas uma.",
  },
  10903: {
    classe: "permanente",
    acao: "Comentário não elegível para resposta privada — passou dos 7 dias, ou é de conteúdo que não permite.",
  },
};

/* -------------------------------------------------------------------------- */

/**
 * Classifica a resposta de uma chamada à Graph.
 *
 * A ORDEM É: código da Meta primeiro, faixa de HTTP depois. O código é
 * específico e a faixa é palpite — e o palpite só vale quando não há o
 * específico.
 */
export function classificarRespostaDaGraph(p: {
  status: number;
  corpo: unknown;
  texto: string;
  cabecalhos?: Headers;
}): ErroDaGraph {
  const codigoNumerico = numeroOpcional(campo(p.corpo, "error.code"));
  const subcodigo = numeroOpcional(campo(p.corpo, "error.error_subcode"));
  const mensagem =
    textoOpcional(campo(p.corpo, "error.message")) ??
    textoOpcional(campo(p.corpo, "error.error_user_msg")) ??
    p.texto.slice(0, 300);

  /*
   * O SUBCÓDIGO É CONSULTADO PRIMEIRO quando existe.
   *
   * (#190) é "token inválido" genérico; o subcódigo diz se a pessoa trocou a
   * senha, se o app foi removido, ou se o token só venceu. Os três exigem
   * reconexão, mas o texto que a tela mostra é diferente — e para o runbook a
   * diferença é entre "renove" e "a clínica removeu o app do Facebook dela".
   */
  const daTabela =
    (subcodigo !== null ? POR_CODIGO[subcodigo] : undefined) ??
    (codigoNumerico !== null ? POR_CODIGO[codigoNumerico] : undefined);

  const codigo = codigoNumerico !== null ? `#${String(codigoNumerico)}` : String(p.status);

  if (daTabela !== undefined) {
    return {
      classe: daTabela.classe,
      codigo,
      detalhe: mensagem,
      acao: daTabela.acao,
      esperarMs: daTabela.esperarMs ?? null,
      exigeReconexao: daTabela.exigeReconexao === true,
    };
  }

  return porFaixaDeHttp(p.status, codigo, mensagem, p.cabecalhos);
}

/**
 * O 429 e o `Retry-After` — §38.
 *
 * ============================================================================
 *  A META NEM SEMPRE MANDA `Retry-After`, e é por isso que há um default alto.
 *
 *  A cota dela é por HORA e por conta. Reintentar em dois segundos não restaura
 *  cota: consome mais uma chamada do balde que acabou de estourar, e a Meta
 *  conta a recusa como uso. O custo de esperar um minuto a mais é um minuto; o
 *  de martelar é a conta bloqueada por (#368).
 * ============================================================================
 */
function porFaixaDeHttp(
  status: number,
  codigo: string,
  mensagem: string,
  cabecalhos?: Headers,
): ErroDaGraph {
  if (status === 429) {
    const cru = cabecalhos?.get("retry-after") ?? "";
    const segundos = Number.parseInt(cru, 10);
    const { ESPERA_PADRAO_429_MS } = pegarEsperaPadrao();

    return {
      classe: "transitoria",
      codigo,
      detalhe: mensagem,
      acao: "Cota da Meta estourada. A fila espera e repesca; não aumente a frequência.",
      esperarMs:
        Number.isFinite(segundos) && segundos > 0
          ? Math.min(segundos * 1000, 15 * 60_000)
          : ESPERA_PADRAO_429_MS,
      exigeReconexao: false,
    };
  }

  if (status === 401 || status === 403) {
    return {
      classe: "permanente",
      codigo,
      detalhe: mensagem,
      acao: "Autorização recusada. Confira o token e as permissões da conta.",
      esperarMs: null,
      exigeReconexao: status === 401,
    };
  }

  if (status >= 500) {
    return {
      classe: "transitoria",
      codigo,
      detalhe: mensagem,
      acao: "A Meta devolveu erro de servidor. A fila repesca sozinha.",
      esperarMs: 30_000,
      exigeReconexao: false,
    };
  }

  if (status >= 400) {
    return {
      classe: "permanente",
      codigo,
      detalhe: mensagem,
      acao: "A Meta recusou o pedido. Repetir não muda nada — confira os dados enviados.",
      esperarMs: null,
      exigeReconexao: false,
    };
  }

  /*
   * 2xx QUE CHEGA AQUI É RESPOSTA SEM O CAMPO ESPERADO.
   *
   * Acontece: a Graph devolve 200 com `{"data":[]}` quando o objeto não existe
   * mais. É PERMANENTE — o objeto não vai voltar a existir na próxima
   * tentativa.
   */
  return {
    classe: "permanente",
    codigo,
    detalhe: mensagem.length > 0 ? mensagem : "A Meta respondeu sem o campo esperado.",
    acao: "A resposta veio sem o dado que o CRC precisa. Confira a versão da Graph API em uso.",
    esperarMs: null,
    exigeReconexao: false,
  };
}

/**
 * A falha de REDE — onde vive a entrega incerta.
 *
 * ============================================================================
 *  ESTA É A FUNÇÃO QUE IMPEDE MENSAGEM DUPLICADA, e o raciocínio é o mesmo do
 *  `meta-cloud.ts`: um POST que deu timeout PODE ter sido entregue.
 *
 *  `entregaFicouIncerta` (em `servidor/http.ts`) separa "a conexão foi
 *  recusada, o pedido não saiu" de "o pedido saiu e a resposta não voltou". A
 *  primeira é segura de repetir. A segunda manda a mensagem duas vezes.
 *
 *  Reusar a função existente é deliberado: essa distinção é sutil o suficiente
 *  para ser reimplementada errado, e uma segunda implementação divergiria da
 *  primeira na primeira mudança de runtime.
 * ============================================================================
 */
export function classificarFalhaDeRede(erro: unknown): ErroDaGraph {
  const incerta = entregaFicouIncerta(erro);

  return {
    classe: incerta ? "incerta" : "transitoria",
    codigo: "REDE",
    detalhe: erro instanceof Error ? erro.message : String(erro),
    acao: incerta
      ? "O pedido saiu e a resposta não voltou. A Meta PODE ter aceitado — não reenvie automaticamente; reconcilie antes."
      : "A conexão não se estabeleceu. Repetir é seguro.",
    esperarMs: incerta ? null : 15_000,
    exigeReconexao: false,
  };
}

/**
 * `ESPERA_PADRAO_429_MS` sem import estático de `config.ts`.
 *
 * O import direto funcionaria e criaria um ciclo desnecessário entre
 * `erros.ts` e `config.ts` — os dois são folhas, e manter assim deixa
 * `erros.ts` importável de qualquer lugar sem arrastar a leitura de ambiente.
 */
function pegarEsperaPadrao(): { ESPERA_PADRAO_429_MS: number } {
  return { ESPERA_PADRAO_429_MS: 60_000 };
}
