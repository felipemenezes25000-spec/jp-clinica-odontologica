/**
 * Distância e tempo de trajeto até a clínica, por rua de verdade.
 *
 * O QUE MUDA EM RELAÇÃO A `ia/proximidade.ts`
 * Aquele módulo responde "que região é essa" com tabela local, sem sair do
 * sistema, e continua sendo o que aparece para todo mundo. Este responde
 * "quantos quilômetros e quantos minutos", e para isso precisa de mapa — coisa
 * que nem tabela nem modelo de linguagem têm. Um complementa o outro: quando
 * este falha (serviço fora do ar, endereço que ninguém reconhece), a região
 * continua lá.
 *
 * POR QUE OPENSTREETMAP
 * Escolha do cliente entre as opções que apresentei. É gratuito e sem chave de
 * API. O preço não é dinheiro: o bairro (ou o CEP) da candidata sai do sistema
 * e vai para um servidor público, e nenhum dos dois serviços promete estar no
 * ar. Por isso tudo aqui é opcional — nada nesta cadeia pode derrubar a ficha.
 *
 * O QUE SAI DAQUI, E O QUE NÃO SAI
 * Vai o bairro/CEP e a cidade. NÃO vai nome, telefone, e-mail nem protocolo:
 * a consulta é sobre um lugar, não sobre uma pessoa, e não há por que o
 * servidor do outro lado saber de quem é o endereço.
 *
 * EDUCAÇÃO COM SERVIDOR ALHEIO
 * O Nominatim pede no máximo uma consulta por segundo e um `User-Agent` que
 * identifique quem chama. As duas coisas estão cumpridas abaixo, e o resultado
 * é gravado na ficha: cada candidata é geocodificada UMA vez na vida. Com 69
 * fichas, isso é menos tráfego do que um único acesso ao site.
 */
import { apenasDigitos } from "../formatar";
import { GRANDE_SAO_PAULO } from "../ia/proximidade";
import type { Trajeto } from "../tipos";

/** Identifica a clínica para o servidor do outro lado, como a política pede. */
const AGENTE = "JPClinicaOdontologica-RH/1.0 (+https://jpclinicaodontologica.com.br)";

/**
 * A clínica, em coordenadas.
 *
 * Fixas, e não geocodificadas a cada uso: o endereço da clínica não muda, e
 * depender do Nominatim para saber onde a própria clínica fica deixaria o
 * recurso inteiro refém de um serviço externo estar no ar.
 *
 * Vieram da busca estruturada do Nominatim por "1029 Rua Rio Verde, São Paulo"
 * e foram conferidas: o resultado volta como "Rua Rio Verde, Freguesia do Ó,
 * São Paulo, 029…", o CEP batendo com o 02934-201 de `CLINICA.local`. Se a
 * clínica mudar de endereço, estes dois números mudam junto.
 */
const CLINICA = { lat: -23.4894077, lon: -46.7088327 };

/**
 * A caixa da Grande São Paulo. NADA fora dela é aceito como endereço.
 *
 * Sem isto o serviço devolvia bobagem com cara de precisão: "Vila Santa Maria"
 * virava um lugar de mesmo nome a 178km, "Parque dos Bancários" a 283km e
 * "Vila Terezinha" a 103km — todos bairros de São Paulo. Nome de vila se repete
 * às centenas no Brasil, e o geocodificador devolve o primeiro que encontra.
 *
 * Um trajeto de 283 minutos numa ficha não é só um número errado: é o tipo de
 * dado que faz descartar uma candidata que mora a vinte minutos. Fora da caixa,
 * a resposta certa é não ter resposta.
 */
const CAIXA_GRANDE_SP = { oeste: -47.4, leste: -45.7, sul: -24.2, norte: -23.1 };

function dentroDaGrandeSP(p: { lat: number; lon: number }): boolean {
  return (
    p.lat >= CAIXA_GRANDE_SP.sul &&
    p.lat <= CAIXA_GRANDE_SP.norte &&
    p.lon >= CAIXA_GRANDE_SP.oeste &&
    p.lon <= CAIXA_GRANDE_SP.leste
  );
}

/** Nada aqui pode travar a página: toda chamada tem teto de espera. */
const TEMPO_LIMITE_MS = 7000;

/* -------------------------------------------------------------------------- */
/* Educação: uma consulta por segundo, em fila                                */
/* -------------------------------------------------------------------------- */

let fila: Promise<unknown> = Promise.resolve();
let ultimaChamada = 0;

/**
 * Serializa as chamadas e garante 1,1s entre elas.
 *
 * Duas fichas abertas ao mesmo tempo em duas abas dispararariam duas consultas
 * no mesmo instante — e é exatamente isso que a política do Nominatim proíbe.
 * A fila é de processo: não protege contra duas instâncias do servidor, mas o
 * volume aqui (uma consulta por candidata, uma vez na vida) não chega perto do
 * limite nem no pior caso.
 */
function emFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const proxima = fila.then(async () => {
    const espera = Math.max(0, 1100 - (Date.now() - ultimaChamada));
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaChamada = Date.now();
    return tarefa();
  });
  // A fila não pode morrer com uma falha: sem isto, o primeiro erro deixaria
  // todas as consultas seguintes penduradas na promessa rejeitada.
  fila = proxima.catch(() => undefined);
  return proxima;
}

async function buscarJson(url: string): Promise<unknown | null> {
  try {
    const resposta = await fetch(url, {
      headers: { "User-Agent": AGENTE, "Accept-Language": "pt-BR", accept: "application/json" },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!resposta.ok) return null;
    return (await resposta.json()) as unknown;
  } catch {
    // Serviço fora do ar, DNS, tempo esgotado: o trajeto simplesmente não sai,
    // e a ficha continua mostrando a região. Nunca lança.
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Endereço -> coordenadas                                                    */
/* -------------------------------------------------------------------------- */

/** Geocodificações já feitas nesta instância, por consulta normalizada. */
const memoria = new Map<string, { lat: number; lon: number } | null>();

/** Minúsculo e sem acento, para "São Paulo" casar com "Sao Paulo". */
function normalizarCidade(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function numero(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Geocodifica exigindo que o MUNICÍPIO do resultado seja o informado.
 *
 * É a trava que faltava, e faltava caro. Nome de bairro se repete às centenas
 * no Brasil: "Vila Terezinha, São Paulo" devolvia um bairro de mesmo nome em
 * São José dos Campos, "Parque dos Bancários" um a 283km e "Pedra Branca" um em
 * Juquitiba. A ficha então anunciava "283 km · 205 min de carro" sobre alguém
 * que mora a vinte minutos — e isso não é um número errado qualquer, é o número
 * que faz descartar a candidata certa.
 *
 * Caixa geográfica não resolve: São José dos Campos e Bertioga cabem dentro de
 * qualquer retângulo generoso da Grande São Paulo. O que resolve é comparar a
 * cidade que o currículo diz com a cidade que o mapa devolveu. Não batendo,
 * a resposta certa é NÃO TER resposta.
 *
 * TENTATIVAS EM ORDEM, e não uma pergunta só. Uma única consulta em texto
 * corrido ("Rua X, Bairro Y, São Paulo, SP") falhava muito: medindo os
 * currículos guardados, nove endereços em dez não achavam nada assim, e a ficha
 * ficava sem trajeto tendo o CEP escrito no documento. A busca ESTRUTURADA do
 * Nominatim (`street=` com `city=` e `state=`) acerta esses mesmos nove.
 *
 * A ordem é a da precisão, e para na primeira que passar na validação de
 * município. O que NÃO entra na lista é o centro da cidade: para quem mora em
 * São Paulo isso devolve o mesmo ponto para todo mundo — 15 km medidos para
 * quem mora a 7 e para quem mora a 40. Número inventado com cara de medido é
 * pior que número nenhum.
 */
type Tentativa = { rotulo: string; params: string };

async function geocodificar(
  tentativas: Tentativa[],
  cidadeEsperada: string,
): Promise<{ lat: number; lon: number; rotulo: string } | null> {
  /* A cidade que o resultado do mapa TEM de ter. Se o que veio como "cidade"
     não é município nenhum que a gente conheça, é porque a extração guardou um
     BAIRRO ali ("Jaraguá", "Cidade Líder"); nesse caso o município esperado
     passa a ser a capital, que é onde esses bairros ficam — senão a validação
     recusaria o resultado certo. */
  const informada = normalizarCidade(cidadeEsperada);
  const alvo = informada === "" || GRANDE_SAO_PAULO.includes(informada) ? informada : "sao paulo";

  for (const tentativa of tentativas) {
    const chave = `${tentativa.params}|${alvo}`;
    const guardado = memoria.get(chave);
    const ponto =
      guardado !== undefined ? guardado : await consultarNominatim(tentativa.params, alvo);
    if (guardado === undefined) memoria.set(chave, ponto);
    if (ponto !== null) return { ...ponto, rotulo: tentativa.rotulo };
  }
  return null;
}

/** Uma consulta ao Nominatim, já filtrada pelo município esperado. */
async function consultarNominatim(
  params: string,
  alvo: string,
): Promise<{ lat: number; lon: number } | null> {
  /* Cinco resultados e `addressdetails`: o primeiro pode ser de outra cidade, e
     é preciso ver a cidade de cada um para escolher. */
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br" +
    `&addressdetails=1&${params}`;
  const bruto = await emFila(() => buscarJson(url));
  if (!Array.isArray(bruto)) return null;

  for (const cru of bruto) {
    const item = cru as Record<string, unknown>;
    const lat = numero(item["lat"]);
    const lon = numero(item["lon"]);
    if (lat === null || lon === null || !dentroDaGrandeSP({ lat, lon })) continue;

    const endereco = (item["address"] ?? {}) as Record<string, unknown>;
    const municipio = normalizarCidade(
      [endereco["city"], endereco["town"], endereco["municipality"], endereco["village"]]
        .map((v) => (typeof v === "string" ? v : ""))
        .find((v) => v !== "") ?? "",
    );
    // Cidade esperada vazia só acontece quando nem o currículo diz: aí o
    // recorte geográfico é tudo o que se tem, e já é melhor que nada.
    if (alvo !== "" && municipio !== alvo) continue;

    return { lat, lon };
  }
  return null;
}

/**
 * O CEP passa pelo ViaCEP antes de virar coordenada.
 *
 * Mandar o CEP cru para o Nominatim devolve bobagem: "02934-201" volta como
 * "201, Chácara das Rosas, Três Corações, Minas Gerais" — ele lê os oito
 * dígitos como número de porta em qualquer lugar do Brasil. O ViaCEP, que é
 * gratuito e sem chave, devolve rua e bairro certos, e É ISSO que geocodifica
 * bem. É também o que dá o endereço mais preciso que este módulo consegue:
 * rua, e não centro de bairro.
 */
type EnderecoDoCep = { logradouro: string; bairro: string; cidade: string; uf: string };

async function porCep(cep: string): Promise<EnderecoDoCep | null> {
  const digitos = apenasDigitos(cep);
  if (digitos.length !== 8) return null;

  const bruto = await buscarJson(`https://viacep.com.br/ws/${digitos}/json/`);
  if (bruto === null || typeof bruto !== "object") return null;
  const dados = bruto as Record<string, unknown>;
  if (dados["erro"] !== undefined) return null;

  const texto = (chave: string): string =>
    typeof dados[chave] === "string" ? (dados[chave] as string).trim() : "";
  const cidade = texto("localidade");
  if (cidade === "") return null;
  return { logradouro: texto("logradouro"), bairro: texto("bairro"), cidade, uf: texto("uf") };
}

/* -------------------------------------------------------------------------- */
/* Coordenadas -> rota                                                        */
/* -------------------------------------------------------------------------- */

async function rotaDeCarro(destino: {
  lat: number;
  lon: number;
}): Promise<{ km: number; minutos: number } | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${String(CLINICA.lon)},${String(CLINICA.lat)};${String(destino.lon)},${String(destino.lat)}` +
    `?overview=false&alternatives=false`;
  const bruto = await emFila(() => buscarJson(url));
  if (bruto === null || typeof bruto !== "object") return null;

  const dados = bruto as Record<string, unknown>;
  if (dados["code"] !== "Ok") return null;
  const rotas = dados["routes"];
  if (!Array.isArray(rotas) || rotas.length === 0) return null;

  const primeira = rotas[0] as Record<string, unknown>;
  const metros = numero(primeira["distance"]);
  const segundos = numero(primeira["duration"]);
  if (metros === null || segundos === null) return null;

  return {
    km: Math.round(metros / 100) / 10,
    minutos: Math.round(segundos / 60),
  };
}

/* -------------------------------------------------------------------------- */
/* A porta de entrada                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Calcula o trajeto da clínica até onde a pessoa mora. `null` quando não dá.
 *
 * A ORDEM É A DA PRECISÃO, e a última linha é uma recusa deliberada:
 *
 * 1. CEP → rua exata (via ViaCEP). É o melhor caso.
 * 2. Bairro → centro do bairro. Erra por quadras, não por quilômetros.
 * 3. Cidade que NÃO é São Paulo → centro da cidade. Para quem mora em
 *    Caieiras, "de Caieiras até a clínica" é uma resposta útil.
 * 4. Só "São Paulo" → NÃO CALCULA. Rotear até o centro da capital produziria
 *    "12 km, 20 min" para alguém que talvez more em Cidade Tiradentes, a 35km.
 *    Um número inventado com cara de medido é pior que número nenhum — e é a
 *    ficha que diz, com todas as letras, que falta o bairro.
 */
export async function calcularTrajeto(entrada: {
  cep: string;
  bairro: string;
  cidade: string;
  uf: string;
}): Promise<Trajeto | null> {
  const cidade = (entrada.cidade ?? "").trim();
  const bairro = (entrada.bairro ?? "").trim();
  const uf = (entrada.uf ?? "").trim() || "SP";

  const tentativas: Tentativa[] = [];
  /* A cidade que o resultado do mapa TEM de ter. Sai do CEP quando ele existe
     (é a fonte mais confiável) e do que o currículo informou nos outros casos. */
  let cidadeDoResultado = cidade || "São Paulo";

  const doCep = await porCep(entrada.cep ?? "");
  if (doCep) {
    cidadeDoResultado = doCep.cidade;
    const uf2 = doCep.uf || uf;
    if (doCep.logradouro !== "") {
      tentativas.push({
        rotulo: `${doCep.logradouro}, ${doCep.bairro || doCep.cidade}`,
        params:
          `street=${encodeURIComponent(doCep.logradouro)}` +
          `&city=${encodeURIComponent(doCep.cidade)}&state=${encodeURIComponent(uf2)}`,
      });
    }
    if (doCep.bairro !== "") {
      tentativas.push({
        rotulo: `${doCep.bairro}, ${doCep.cidade}`,
        params: `q=${encodeURIComponent([doCep.bairro, doCep.cidade, uf2].join(", "))}`,
      });
    }
  }

  if (bairro !== "") {
    const alvoCidade = cidade || "São Paulo";
    tentativas.push({
      rotulo: `${bairro}, ${alvoCidade}`,
      params: `q=${encodeURIComponent([bairro, alvoCidade, uf].join(", "))}`,
    });
  }

  /* Cidade do interior ou da Grande SP entra como último recurso: "de Caieiras
     até a clínica" é resposta útil. A capital NÃO entra — ver o comentário de
     `geocodificar` sobre o centro da cidade. */
  if (tentativas.length === 0) {
    if (cidade === "" || normalizarCidade(cidade) === "sao paulo") return null;
    cidadeDoResultado = cidade;
    tentativas.push({
      rotulo: `${cidade}, ${uf}`,
      params: `q=${encodeURIComponent([cidade, uf].join(", "))}`,
    });
  }

  const ponto = await geocodificar(tentativas, cidadeDoResultado);
  if (ponto === null) return null;

  const rota = await rotaDeCarro(ponto);
  if (rota === null) return null;

  return {
    km: rota.km,
    minutos: rota.minutos,
    origem: ponto.rotulo,
    calculadoEm: new Date().toISOString(),
  };
}
