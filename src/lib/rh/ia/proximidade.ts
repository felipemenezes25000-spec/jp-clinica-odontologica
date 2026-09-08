/**
 * Quão longe da clínica a pessoa mora — calculado, não adivinhado.
 *
 * POR QUE ISTO NÃO É TRABALHO DA IA
 * Pedir ao modelo "calcule a distância até a Vila Bruna" devolve quilômetros
 * inventados com cara de precisão: ele não tem mapa, tem texto. É o mesmo
 * princípio que já rege `sinais.ts` — interpretação é trabalho do modelo, conta
 * é nosso. O que o modelo faz aqui é o que ele sabe fazer: LER do currículo o
 * bairro, a cidade e o CEP. A classificação abaixo é código determinístico, dá
 * o mesmo resultado toda vez e pode ser conferida à mão.
 *
 * POR QUE NÃO UM SERVIÇO DE MAPAS
 * Distância porta a porta exigiria geocodificar cada endereço num serviço
 * externo — chave de API, custo por consulta e o endereço residencial de
 * candidatas saindo do sistema. Para a decisão que a clínica toma ("dá para
 * essa pessoa vir todo dia?") a região resolve: quem mora na zona leste não
 * fica perto da Freguesia do Ó por causa de trezentos metros.
 *
 * O QUE ELE NUNCA FAZ
 * Não reprova ninguém e não entra na nota. Há quem faça uma hora e meia de
 * trajeto por anos sem reclamar, e isso é decisão da pessoa — não da clínica.
 * O resultado vira aviso e vira pergunta de entrevista, nada além disso.
 */
import { CLINICA } from "../../jp";
import { apenasDigitos } from "../formatar";

/**
 * Do mais perto ao mais longe.
 *
 * "capital" é o caso mais comum do acervo e merece nome próprio: a pessoa mora
 * em São Paulo e o currículo parou aí, sem bairro. Não é "desconhecida" — sabe-
 * se a cidade — e não dá para dizer perto nem longe, porque São Paulo tem 100km
 * de ponta a ponta. Separar os dois é o que faz a tela poder dizer "olhei, e o
 * currículo não informou o bairro" em vez de simplesmente não mostrar nada, que
 * se lê como sistema quebrado.
 *
 * "desconhecida" é quando não há endereço nenhum.
 */
export type BandaProximidade = "perto" | "media" | "longe" | "fora" | "capital" | "desconhecida";

export type Proximidade = {
  banda: BandaProximidade;
  /** Frase curta para pastilha e tabela. */
  rotulo: string;
  /** O que foi reconhecido — entra como evidência do sinal. */
  base: string;
};

/* -------------------------------------------------------------------------- */
/* Referência: a clínica                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Os dois primeiros dígitos do CEP da clínica (02934-201 → "02").
 *
 * Na capital, esse par identifica a região dos Correios de forma estável:
 * 01 centro, 02 zona norte, 03 zona leste, 04 zona sul, 05 zona oeste e 08
 * zona leste extrema. A clínica é 02 — zona norte, região da Freguesia do Ó.
 * Sai de `CLINICA` e não de uma constante escrita à mão porque o dia em que a
 * clínica mudar de endereço é o dia em que isto tem de mudar junto.
 */
const CEP_DA_CLINICA = apenasDigitos(CLINICA.local.cep).slice(0, 2);

/**
 * Regiões da capital, por par inicial de CEP, relativas à clínica.
 *
 * "media" não é meio-termo tímido: é o lado da cidade de onde se chega à
 * Freguesia do Ó por uma via só. "longe" é o outro lado — atravessar São Paulo
 * inteira duas vezes por dia é o que o cliente chamou de inviável.
 */
const REGIAO_POR_CEP: Record<string, { banda: BandaProximidade; nome: string }> = {
  "01": { banda: "media", nome: "Centro" },
  "02": { banda: "perto", nome: "Zona Norte" },
  "03": { banda: "longe", nome: "Zona Leste" },
  "04": { banda: "longe", nome: "Zona Sul" },
  "05": { banda: "media", nome: "Zona Oeste" },
  "08": { banda: "longe", nome: "Zona Leste (extremo)" },
};

/* -------------------------------------------------------------------------- */
/* Bairros — o caminho de reserva                                             */
/* -------------------------------------------------------------------------- */

/**
 * A maioria dos currículos não traz CEP; traz bairro. As listas abaixo cobrem o
 * que dá para afirmar sem chutar, e QUEM NÃO ESTIVER NELAS não vira sinal
 * nenhum — silêncio é melhor que um palpite sobre onde alguém mora.
 *
 * PERTO é o miolo noroeste da zona norte, o pedaço em que a clínica está: dá
 * para chegar de ônibus direto ou a pé de algumas partes.
 */
const BAIRROS_PERTO: string[] = [
  "vila bruna",
  "freguesia do o",
  "freguesia",
  "brasilandia",
  "vila brasilandia",
  "cachoeirinha",
  "vila nova cachoeirinha",
  "casa verde",
  "casa verde alta",
  "limao",
  "vila baruel",
  "jardim sao bento",
  "jardim sao bento novo",
  "lauzane paulista",
  "parada de taipas",
  "pirituba",
  "vila pereira barreto",
  "vila pereira cerca",
  "jaragua",
  "perus",
  "vila iorio",
  "jardim peri",
  "jardim peri novo",
  "vila zatt",
  "vila santa maria",
  "vila terezinha",
  "vila clarice",
  "jardim das laranjeiras",
  "city america",
  "vila mangalot",
  "jardim maria luiza",
  "vila hungareza",
  "morro grande",
  "taipas",
  "jardim vista alegre",
];

/**
 * MÉDIA é o resto da zona norte e o eixo centro/oeste: mesma metade da cidade,
 * trajeto que existe, mas já não é a esquina.
 */
const BAIRROS_MEDIA: string[] = [
  "santana",
  "carandiru",
  "tucuruvi",
  "jacana",
  "mandaqui",
  "imirim",
  "agua fria",
  "vila guilherme",
  "vila maria",
  "vila medeiros",
  "parque novo mundo",
  "horto florestal",
  "trememb",
  "tremembe",
  "vila gustavo",
  "barra funda",
  "agua branca",
  "lapa",
  "vila leopoldina",
  "perdizes",
  "pompeia",
  "santa cecilia",
  "bom retiro",
  "campos eliseos",
  "republica",
  "se",
  "luz",
  "bras",
  "pacaembu",
  "sumare",
  "vila romana",
  "alto da lapa",
  "vila anastacio",
  "osasco",
];

/**
 * LONGE é o outro lado: zona leste, zona sul e o ABC. Não é julgamento sobre o
 * bairro — é o mapa. Quem mora em Cidade Tiradentes e trabalha na Freguesia do
 * Ó passa parte grande do dia em condução, e o cliente quer saber disso ANTES
 * de marcar entrevista às sete da manhã.
 */
const BAIRROS_LONGE: string[] = [
  "itaquera",
  "cidade lider",
  "jose bonifacio",
  "parque do carmo",
  "artur alvim",
  "vila matilde",
  "carrao",
  "agua rasa",
  "vila curuca",
  "jardim helena",
  "iguatemi",
  "sao rafael",
  "jardim iguatemi",
  "vila jacui",
  "lajeado",
  "vila esperanca",
  "belem",
  "pari",
  "caninde",
  "cidade patriarca",
  "vila carrao",
  "jardim sao paulo",
  "cidade tiradentes",
  "sao mateus",
  "guaianases",
  "itaim paulista",
  "sao miguel paulista",
  "ermelino matarazzo",
  "penha",
  "tatuape",
  "vila prudente",
  "sapopemba",
  "aricanduva",
  "cangaiba",
  "vila formosa",
  "mooca",
  "ipiranga",
  "sacoma",
  "cursino",
  "vila mariana",
  "saude",
  "jabaquara",
  "cidade ademar",
  "pedreira",
  "grajau",
  "parelheiros",
  "capao redondo",
  "campo limpo",
  "jardim angela",
  "jardim sao luis",
  "santo amaro",
  "socorro",
  "cidade dutra",
  "interlagos",
  "campo grande",
  "morumbi",
  "butanta",
  "raposo tavares",
  "rio pequeno",
  "vila sonia",
  "itaim bibi",
  "moema",
  "brooklin",
  "campo belo",
  "santo andre",
  "sao bernardo",
  "sao caetano",
  "diadema",
  "maua",
];

/**
 * Municípios da Região Metropolitana de São Paulo, normalizados. Morou aqui
 * porque geografia da clínica agora tem UM dono: `sinais.ts` importa desta
 * lista em vez de manter a própria cópia, que era o caminho garantido para as
 * duas divergirem na primeira correção.
 */
export const GRANDE_SAO_PAULO: string[] = [
  "sao paulo",
  "aruja",
  "barueri",
  "biritiba mirim",
  "caieiras",
  "cajamar",
  "carapicuiba",
  "cotia",
  "diadema",
  "embu das artes",
  "embu guacu",
  "ferraz de vasconcelos",
  "francisco morato",
  "franco da rocha",
  "guararema",
  "guarulhos",
  "itapevi",
  "itapecerica da serra",
  "itaquaquecetuba",
  "jandira",
  "juquitiba",
  "mairipora",
  "maua",
  "moji das cruzes",
  "mogi das cruzes",
  "osasco",
  "pirapora do bom jesus",
  "poa",
  "ribeirao pires",
  "rio grande da serra",
  "salesopolis",
  "santa isabel",
  "santana de parnaiba",
  "santo andre",
  "sao bernardo do campo",
  "sao caetano do sul",
  "sao lourenco da serra",
  "suzano",
  "taboao da serra",
  "vargem grande paulista",
];

/**
 * Municípios vizinhos pelo lado NORTE/OESTE, de onde se chega à clínica sem
 * atravessar a cidade inteira.
 */
const MUNICIPIOS_MEDIA: string[] = [
  "osasco",
  "caieiras",
  "franco da rocha",
  "francisco morato",
  "cajamar",
  "santana de parnaiba",
  "barueri",
  "carapicuiba",
  "taboao da serra",
  "guarulhos",
  "mairipora",
  "jandira",
  "itapevi",
];

/**
 * A região escrita por extenso, que é como muita gente resume o endereço no
 * currículo ("Zona Norte, SP"). Vale a mesma régua do CEP.
 */
const REGIOES_ESCRITAS: { termo: string; banda: BandaProximidade; nome: string }[] = [
  { termo: "zona norte", banda: "perto", nome: "Zona Norte" },
  { termo: "zona oeste", banda: "media", nome: "Zona Oeste" },
  { termo: "centro", banda: "media", nome: "Centro" },
  { termo: "zona leste", banda: "longe", nome: "Zona Leste" },
  { termo: "zona sul", banda: "longe", nome: "Zona Sul" },
];

/**
 * Cidades de São Paulo FORA da região metropolitana, das que aparecem em
 * currículo de gente que se candidata na capital.
 *
 * Existe por um motivo defensivo: sem ela, o passo final teria de escolher
 * entre chamar de "fora da Grande São Paulo" qualquer nome que não reconheça —
 * e foi assim que "Cidade Líder", bairro da zona leste, virou cidade do
 * interior — ou calar sobre quem realmente mora longe. Com a lista, "Jundiaí" e
 * "Leme" são afirmados porque são conhecidos, e o que sobra é declarado como
 * não reconhecido, sem inventar banda nenhuma.
 */
const CIDADES_DE_FORA: string[] = [
  "campinas",
  "jundiai",
  "sorocaba",
  "santos",
  "guaruja",
  "praia grande",
  "sao vicente",
  "itanhaem",
  "peruibe",
  "sao jose dos campos",
  "jacarei",
  "taubate",
  "caraguatatuba",
  "ubatuba",
  "sao sebastiao",
  "ribeirao preto",
  "piracicaba",
  "limeira",
  "americana",
  "indaiatuba",
  "itu",
  "salto",
  "braganca paulista",
  "atibaia",
  "sao carlos",
  "araraquara",
  "bauru",
  "marilia",
  "presidente prudente",
  "sao jose do rio preto",
  "franca",
  "botucatu",
  "registro",
  "rio claro",
  "araras",
  "leme",
  "mogi guacu",
  "vinhedo",
  "valinhos",
  "cabreuva",
  "campo limpo paulista",
  "varzea paulista",
  "louveira",
  "jarinu",
  "sumare",
  "hortolandia",
  "paulinia",
];

/** Minúsculo, sem acento, sem pontuação e sem espaço duplo. */
function normalizar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Casa por bairro INTEIRO ou por prefixo de palavra, nunca por pedaço solto.
 *
 * O `includes` cru transformava "Vila Mariana" (zona sul) em acerto de "vila
 * maria" (zona norte) — dois bairros a vinte quilômetros um do outro, com a
 * banda trocada. Aqui "vila maria" só casa se o texto tiver essas duas
 * palavras seguidas e terminar ali ou virar outra palavra inteira.
 */
function contem(texto: string, lista: string[]): boolean {
  return lista.some((alvo) => {
    const i = texto.indexOf(alvo);
    if (i < 0) return false;
    const antes = i === 0 ? " " : texto[i - 1];
    const depois = texto[i + alvo.length] ?? " ";
    return antes === " " && depois === " ";
  });
}

/** Só para exibir: "vila nova cachoeirinha" → "Vila Nova Cachoeirinha". */
function comIniciais(v: string): string {
  return v.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* A classificação                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A ordem é a da confiança: CEP primeiro (é código dos Correios, não opinião),
 * depois bairro, depois município. Nada reconhecido devolve "desconhecida", e
 * "desconhecida" não vira aviso na ficha — vira, no máximo, a pergunta de onde
 * a pessoa mora.
 */
/**
 * Há endereço suficiente para pedir uma ROTA de verdade?
 *
 * Mesma cascata de `servidor/rotas.ts`, e mora aqui para o painel poder decidir
 * sem chamar o servidor: sem isto, abrir a ficha de qualquer uma das 39 pessoas
 * cujo currículo só diz "São Paulo" dispararia uma consulta que já se sabe que
 * vai voltar vazia.
 *
 * "São Paulo" sozinho é NÃO de propósito: rotear até o centro da capital daria
 * um número medido para um lugar adivinhado.
 */
export function temEnderecoParaRota(entrada: {
  cep: string;
  bairro: string;
  cidade: string;
}): boolean {
  const cep = apenasDigitos(typeof entrada.cep === "string" ? entrada.cep : "");
  if (cep.length === 8) return true;
  if (typeof entrada.bairro === "string" && entrada.bairro.trim() !== "") return true;
  const cidade = normalizar(typeof entrada.cidade === "string" ? entrada.cidade : "");
  return cidade.length > 2 && cidade !== "sao paulo";
}

export function classificarProximidade(entrada: {
  cep: string;
  bairro: string;
  cidade: string;
  uf: string;
}): Proximidade {
  /* Os quatro campos chegam de JSON gravado — e as análises feitas ANTES de
     `bairro` e `cep` existirem não os têm. O tipo promete `string`, o banco não:
     ler `.trim()` de `undefined` derrubaria a ficha inteira de quem foi
     analisado no mês passado. Normalizar na entrada é mais barato que uma
     migração de todos os registros. */
  const bairroCru = typeof entrada.bairro === "string" ? entrada.bairro : "";
  const cepCru = typeof entrada.cep === "string" ? entrada.cep : "";
  const cidadeCrua = typeof entrada.cidade === "string" ? entrada.cidade : "";
  const ufCru = typeof entrada.uf === "string" ? entrada.uf : "";

  const uf = ufCru.trim().toUpperCase();
  const cidade = normalizar(cidadeCrua);

  /* 1. CEP — o dado mais confiável, quando existe. */
  const cep = apenasDigitos(cepCru);
  if (cep.length === 8 && (cidade === "sao paulo" || cidade === "") && (uf === "SP" || uf === "")) {
    const regiao = REGIAO_POR_CEP[cep.slice(0, 2)];
    if (regiao) {
      return {
        banda: regiao.banda,
        rotulo: cep.slice(0, 2) === CEP_DA_CLINICA ? "Mesma região da clínica" : regiao.nome,
        base: `CEP ${cep.slice(0, 5)}-${cep.slice(5)} (${regiao.nome})`,
      };
    }
  }

  /* 2. Outro estado encerra a conversa antes de qualquer tabela de bairro. */
  if (uf.length === 2 && uf !== "SP") {
    return {
      banda: "fora",
      rotulo: "Fora do estado",
      base: `Cidade informada: ${[cidadeCrua.trim(), uf].filter(Boolean).join("/")}`,
    };
  }

  /* 3. MUNICÍPIO ANTES DE BAIRRO, e a ordem importa.
     "Santana de Parnaíba" é município a 40km; "Santana" é bairro da zona norte.
     Testando bairro primeiro, o município viraria o bairro e a ficha diria
     "mesmo lado da cidade" para quem mora em outra cidade. */
  if (cidade.length > 2 && cidade !== "sao paulo") {
    const base = `Cidade informada: ${cidadeCrua.trim()}`;
    if (contem(cidade, MUNICIPIOS_MEDIA)) {
      return { banda: "media", rotulo: "Município vizinho", base };
    }
    if (GRANDE_SAO_PAULO.includes(cidade)) {
      return { banda: "longe", rotulo: "Outro extremo da Grande São Paulo", base };
    }
  }

  /* 4. O LOCAL. Sai do campo `bairro` OU do campo `cidade` — a extração antiga
     só tinha "cidade", e o modelo escrevia ali o que achasse ("Jaraguá",
     "Cidade Líder", "Zona norte, SP"). Ignorar isso seria jogar fora o bairro de
     metade do acervo por causa do nome do campo em que ele foi parar. */
  const local = normalizar(bairroCru) || cidade;
  const textoDoLocal = bairroCru.trim() || cidadeCrua.trim();
  if (local.length > 2 && local !== "sao paulo") {
    const base = `Local informado: ${textoDoLocal}`;

    const regiao = REGIOES_ESCRITAS.find((r) => local.includes(r.termo));
    if (regiao) {
      return {
        banda: regiao.banda,
        rotulo: regiao.banda === "perto" ? "Mesma região da clínica" : regiao.nome,
        base,
      };
    }
    if (contem(local, BAIRROS_PERTO)) {
      return { banda: "perto", rotulo: "Mesma região da clínica", base };
    }
    if (contem(local, BAIRROS_MEDIA)) {
      return { banda: "media", rotulo: "Mesmo lado da cidade", base };
    }
    if (contem(local, BAIRROS_LONGE)) {
      return { banda: "longe", rotulo: "Outro lado da cidade", base };
    }
  }

  /* 5. Cidade conhecida do interior ou do litoral: aí sim, é fora. */
  if (cidade.length > 2 && cidade !== "sao paulo" && contem(cidade, CIDADES_DE_FORA)) {
    return {
      banda: "fora",
      rotulo: "Fora da Grande São Paulo",
      base: `Cidade informada: ${cidadeCrua.trim()}`,
    };
  }

  /* 6. NÃO RECONHECIDO — e é isso que a tela vai dizer.
     Aqui estava o pior erro possível deste arquivo: chamar de "fora da Grande
     São Paulo" tudo o que as tabelas não conheciam. "Cidade Líder" é bairro da
     zona leste e era anunciado como cidade do interior — o RH leria "mora
     longe demais" sobre alguém que mora na própria capital.
     Um nome que não bateu com nada continua aparecendo na tela, escrito como
     veio, com a banda em branco: quem lê "Jardim Aurora" decide melhor que
     qualquer chute nosso. */
  if (local.length > 2 && local !== "sao paulo") {
    return {
      banda: "capital",
      rotulo: "confira o endereço",
      base: `Local informado: ${textoDoLocal}`,
    };
  }

  /* 7. São Paulo e ponto final — o caso mais comum do acervo. */
  if (cidade === "sao paulo") {
    return {
      banda: "capital",
      rotulo: "bairro não informado",
      base: "O currículo diz São Paulo, mas não diz o bairro.",
    };
  }

  return { banda: "desconhecida", rotulo: "Não informado", base: "" };
}
