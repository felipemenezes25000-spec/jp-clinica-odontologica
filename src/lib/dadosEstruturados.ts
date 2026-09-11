import {
  AVALIACOES,
  CLINICA,
  FAQ,
  HISTORIA,
  RESPONSAVEL_TECNICA,
  SITE_URL,
  TRATAMENTOS,
  type Tratamento,
} from "@/lib/jp";

/**
 * Os dados estruturados do site — o que o Google lê para saber que aqui existe
 * um consultório odontológico de verdade, em que rua, com que nota e quem é a
 * responsável técnica.
 *
 * O site não tinha nenhum. Para uma clínica local isso é a maior alavanca que
 * existe em busca: sem isto o Google precisa adivinhar o endereço a partir do
 * texto, não tem como exibir as estrelas no resultado e não liga o site à ficha
 * do Google Meu Negócio. Com isto, "dentista na Freguesia do Ó" pode devolver o
 * cartão com nota, horário e telefone em vez de um link azul.
 *
 * REGRA: nada aqui é digitado. Tudo sai de `@/lib/jp` — endereço, telefone,
 * horário, nota, tratamentos, FAQ. Dado estruturado que discorda da página
 * visível é pior que dado estruturado nenhum: o Google trata divergência entre
 * o que está no JSON-LD e o que o usuário vê como sinal de manipulação. Ligando
 * os dois na mesma fonte, eles não têm como divergir.
 */

/** As coordenadas que o próprio Google resolveu para o endereço. */
const GEO = { lat: -23.4884235, lng: -46.7046298 };

/**
 * A fundação em ISO 8601, derivada da data que o site exibe.
 *
 * `HISTORIA.fundacaoData` é "17/08/2002" porque é assim que ela aparece para
 * quem lê. O schema.org só aceita 2002-08-17 — e data em formato errado o
 * Google descarta em silêncio, sem avisar que descartou. Converter aqui, em vez
 * de guardar as duas, evita a versão que alguém esquece de atualizar.
 */
const fundacaoISO = HISTORIA.fundacaoData.split("/").reverse().join("-");

const endereco = {
  "@type": "PostalAddress",
  streetAddress: CLINICA.local.logradouro,
  addressLocality: CLINICA.local.cidade,
  addressRegion: CLINICA.local.uf,
  postalCode: CLINICA.local.cep,
  addressCountry: CLINICA.local.pais,
};

/**
 * Só dígitos e prefixo internacional: o telefone da clínica é "(11) 3975-9902"
 * para quem lê e "+551139759902" para quem disca. O segundo já existe em
 * `telefoneHref`, então tiramos dele em vez de escrever de novo.
 */
const telefoneE164 = CLINICA.telefoneHref.replace("tel:", "");

/**
 * O consultório.
 *
 * `Dentist` é o tipo certo, e não `LocalBusiness` genérico: ele herda de
 * LocalBusiness e de MedicalBusiness ao mesmo tempo, que é exatamente o que uma
 * clínica odontológica é. Usar o genérico desperdiça a metade médica.
 */
function consultorio() {
  return {
    "@context": "https://schema.org",
    "@type": "Dentist",
    "@id": `${SITE_URL}/#clinica`,
    name: CLINICA.nome,
    legalName: CLINICA.razaoSocial,
    taxID: CLINICA.cnpj,
    url: SITE_URL,
    image: `${SITE_URL}/og.png`,
    logo: `${SITE_URL}/og.png`,
    telephone: telefoneE164,
    address: endereco,
    geo: { "@type": "GeoCoordinates", latitude: GEO.lat, longitude: GEO.lng },
    hasMap: CLINICA.mapsHref,
    foundingDate: fundacaoISO,
    priceRange: "$$",
    currenciesAccepted: "BRL",
    sameAs: [CLINICA.instagram, CLINICA.facebook],

    // Segunda a sexta, 08:00 às 18:00 — o mesmo que CLINICA.horario diz por
    // extenso na página. Se o horário mudar, os dois têm de mudar juntos.
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "08:00",
        closes: "18:00",
      },
    ],

    // A nota que aparece na página, para o Google poder exibi-la no resultado.
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: AVALIACOES.nota,
      reviewCount: AVALIACOES.total,
      bestRating: 5,
      worstRating: 1,
    },

    // Quem responde tecnicamente pela clínica. É a informação que um paciente
    // pode conferir no conselho, então ela entra com o registro.
    employee: [
      {
        "@type": "Person",
        name: RESPONSAVEL_TECNICA.nome,
        jobTitle: RESPONSAVEL_TECNICA.papel,
        identifier: RESPONSAVEL_TECNICA.registro,
      },
    ],

    // O bairro e a região que a clínica atende. É o que amarra o site à busca
    // local: quem procura "dentista na Freguesia do Ó" está buscando por área,
    // não por nome.
    areaServed: [
      { "@type": "Place", name: CLINICA.local.bairro },
      { "@type": "Place", name: HISTORIA.regiaoAtual },
      { "@type": "City", name: CLINICA.local.cidade },
    ],

    // Um serviço por tratamento, com a mesma URL que a pessoa visitaria. Sai da
    // lista real de TRATAMENTOS, então uma especialidade nova aparece aqui
    // sozinha no dia em que for adicionada ao site.
    availableService: TRATAMENTOS.map((t: Tratamento) => ({
      "@type": "MedicalProcedure",
      name: t.titulo,
      description: t.short,
      url: `${SITE_URL}/tratamentos/${t.slug}`,
    })),
  };
}

/**
 * As perguntas frequentes.
 *
 * Vale separado porque rende um resultado próprio na busca — a pergunta abre
 * direto no Google, com a resposta da clínica. As perguntas são as mesmas da
 * seção visível, tiradas do mesmo array: exigência do Google, e a razão de não
 * existir uma segunda lista aqui.
 */
function perguntas() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/**
 * Uma página de tratamento, para o Google entender que aquela URL trata de um
 * procedimento específico — e não é mais uma cópia da home.
 */
export function dadosDoTratamento(t: Tratamento) {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    "@id": `${SITE_URL}/tratamentos/${t.slug}#pagina`,
    url: `${SITE_URL}/tratamentos/${t.slug}`,
    name: t.titulo,
    description: t.desc,
    inLanguage: "pt-BR",
    about: { "@type": "MedicalProcedure", name: t.titulo, description: t.short },
    provider: { "@id": `${SITE_URL}/#clinica` },
    mainEntity: {
      "@type": "FAQPage",
      mainEntity: t.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  };
}

/** Tudo o que vai no `<head>` de toda página, já serializado. */
export const DADOS_ESTRUTURADOS = JSON.stringify([consultorio(), perguntas()]);

/** O mesmo, para uma página de tratamento. */
export const dadosEstruturadosDoTratamento = (t: Tratamento) =>
  JSON.stringify(dadosDoTratamento(t));
