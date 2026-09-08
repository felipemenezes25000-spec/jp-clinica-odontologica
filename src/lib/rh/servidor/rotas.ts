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

function numero(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

async function geocodificar(consulta: string): Promise<{ lat: number; lon: number } | null> {
  const chave = consulta.trim().toLowerCase();
  if (chave === "") return null;
  const guardado = memoria.get(chave);
  if (guardado !== undefined) return guardado;

  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=" +
    encodeURIComponent(consulta);
  const bruto = await emFila(() => buscarJson(url));

  let ponto: { lat: number; lon: number } | null = null;
  if (Array.isArray(bruto) && bruto.length > 0) {
    const primeiro = bruto[0] as Record<string, unknown>;
    const lat = numero(primeiro["lat"]);
    const lon = numero(primeiro["lon"]);
    if (lat !== null && lon !== null) ponto = { lat, lon };
  }
  memoria.set(chave, ponto);
  return ponto;
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
async function porCep(cep: string): Promise<{ consulta: string } | null> {
  const digitos = apenasDigitos(cep);
  if (digitos.length !== 8) return null;

  const bruto = await buscarJson(`https://viacep.com.br/ws/${digitos}/json/`);
  if (bruto === null || typeof bruto !== "object") return null;
  const dados = bruto as Record<string, unknown>;
  if (dados["erro"] !== undefined) return null;

  const logradouro = typeof dados["logradouro"] === "string" ? dados["logradouro"] : "";
  const bairro = typeof dados["bairro"] === "string" ? dados["bairro"] : "";
  const cidade = typeof dados["localidade"] === "string" ? dados["localidade"] : "";
  const uf = typeof dados["uf"] === "string" ? dados["uf"] : "";
  const partes = [logradouro, bairro, cidade, uf].filter((p) => p.trim() !== "");
  if (partes.length < 2) return null;
  return { consulta: partes.join(", ") };
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

  let consulta = "";
  const porCepAchado = await porCep(entrada.cep ?? "");
  if (porCepAchado) {
    consulta = porCepAchado.consulta;
  } else if (bairro !== "") {
    consulta = [bairro, cidade || "São Paulo", uf].join(", ");
  } else if (cidade !== "" && cidade.toLowerCase().replace(/\s+/g, " ") !== "são paulo") {
    consulta = [cidade, uf].join(", ");
  } else {
    return null;
  }

  const ponto = await geocodificar(consulta);
  if (ponto === null) return null;

  const rota = await rotaDeCarro(ponto);
  if (rota === null) return null;

  return {
    km: rota.km,
    minutos: rota.minutos,
    origem: consulta,
    calculadoEm: new Date().toISOString(),
  };
}
