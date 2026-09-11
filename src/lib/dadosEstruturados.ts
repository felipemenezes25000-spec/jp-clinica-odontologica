import {
  CLINICA,
  FAQ,
  HISTORIA,
  RESPONSAVEL_TECNICA,
  SITE_URL,
  TRATAMENTOS,
  type Tratamento,
} from "@/lib/jp";

/**
 * Dados estruturados da clínica.
 *
 * A página pode e deve exibir a nota da ficha do Google para o visitante, mas
 * ela não entra como `aggregateRating` do próprio `Dentist`: as diretrizes do
 * Google para LocalBusiness/Organization não recomendam agregar avaliações de
 * outro site e não tornam avaliações self-serving elegíveis ao rich result de
 * estrelas. O schema fica restrito ao que a própria clínica pode declarar de
 * forma factual e verificável.
 */

/** As coordenadas que o próprio Google resolveu para o endereço. */
const GEO = { lat: -23.4884235, lng: -46.7046298 };

/**
 * A fundação em ISO 8601, derivada da data que o site exibe.
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

const telefoneE164 = CLINICA.telefoneHref.replace("tel:", "");

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
    currenciesAccepted: "BRL",
    sameAs: [CLINICA.instagram, CLINICA.facebook],

    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "08:00",
        closes: "18:00",
      },
    ],

    employee: [
      {
        "@type": "Person",
        name: RESPONSAVEL_TECNICA.nome,
        jobTitle: RESPONSAVEL_TECNICA.papel,
        identifier: RESPONSAVEL_TECNICA.registro,
      },
    ],

    areaServed: [
      { "@type": "Place", name: CLINICA.local.bairro },
      { "@type": "Place", name: HISTORIA.regiaoAtual },
      { "@type": "City", name: CLINICA.local.cidade },
    ],

    availableService: TRATAMENTOS.map((t: Tratamento) => ({
      "@type": "MedicalProcedure",
      name: t.titulo,
      description: t.desc,
      url: `${SITE_URL}/tratamentos/${t.slug}`,
    })),
  };
}

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
    about: { "@type": "MedicalProcedure", name: t.titulo, description: t.desc },
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

/** Tudo o que vai no `<head>` da home, já serializado. */
export const DADOS_ESTRUTURADOS = JSON.stringify([consultorio(), perguntas()]);

/** O mesmo, para uma página de tratamento. */
export const dadosEstruturadosDoTratamento = (t: Tratamento) =>
  JSON.stringify(dadosDoTratamento(t));
