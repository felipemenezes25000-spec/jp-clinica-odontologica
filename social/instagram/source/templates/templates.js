/* ============================================================================
   REGISTRO DE TEMPLATES — JP Social
   ----------------------------------------------------------------------------
   Cada função aqui recebe um objeto de dados e devolve o HTML de UMA peça.
   Nenhuma delas conhece arquivo, tamanho de export ou nome de saída: isso é
   trabalho do `renderizar.mjs`. A separação é o que permite a mesma peça sair
   em 4:5 para o feed e em 9:16 para o Story sem duplicar layout.

   Por que um registro de funções e não 30 arquivos .html com placeholders:
   uma troca de regra de marca — a espessura do filete do rodapé, a ordem do
   chip — precisa acontecer em um lugar. Com 30 arquivos, ela acontece em 30,
   e na trigésima alguém esquece.
   ========================================================================== */

/* Escapa texto vindo dos manifests. As legendas têm aspas e "&", e um "&" cru
   no meio de um HTML montado por concatenação quebra silenciosamente. */
const e = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/* Marcação mínima permitida DENTRO de headline e corpo, escrita nos manifests
   como [[texto]] para verde vivo e **texto** para semibold. Deliberadamente
   pobre: quem precisa de mais formatação numa peça de Instagram está escrevendo
   um parágrafo onde cabia uma frase. */
const rico = (s) =>
  e(s)
    .replace(/\[\[([\s\S]+?)\]\]/g, '<span class="vivo">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");

const MARCA = {
  claro: "/src/assets/marca/marca-jp.svg", // símbolo para pousar em fundo CLARO
  escuro: "/src/assets/marca/marca-jp-claro.svg", // símbolo para fundo ESCURO
  lockupClaro: "/src/assets/marca/logo-jp.svg",
  lockupEscuro: "/src/assets/marca/logo-jp-claro.svg",
};

const ESCURAS = new Set(["escura", "floresta"]);
const simbolo = (sup) => (ESCURAS.has(sup) ? MARCA.escuro : MARCA.claro);

/** O rodapé que aparece em toda peça. Um só lugar para mudar. */
function rodape(d) {
  const local = d.rodapeLocal ?? d.regiao ?? "Freguesia do Ó · São Paulo";
  return `<div class="rodape">
    <img src="${simbolo(d.superficie)}" alt="">
    <span class="arroba">@jpclinicaodontologica</span>
    ${local ? `<span class="local">${rico(local)}</span>` : ""}
  </div>`;
}

const chip = (texto, extra = "") => (texto ? `<span class="chip ${extra}">${e(texto)}</span>` : "");

const SETA = `<svg class="seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12 5l7 7-7 7"/></svg>`;

function cta(d) {
  if (!d.cta) return "";
  const suave = d.ctaSuave ? " suave" : "";
  return `<div class="cta${suave}"><span>${rico(d.cta)}</span>${SETA}</div>`;
}

/** Estrela cheia, e a última parcial conforme a nota real. */
function estrelas(nota) {
  const cheias = Math.floor(nota);
  const resto = Math.round((nota % 1) * 100);
  let out = "";
  for (let i = 0; i < 5; i += 1) {
    const pct = i < cheias ? 100 : i === cheias ? resto : 0;
    const id = `g${String(i)}`;
    out += `<svg viewBox="0 0 24 24">
      <defs><linearGradient id="${id}"><stop offset="${String(pct)}%" stop-color="#56A805"/><stop offset="${String(pct)}%" stop-color="#DCE4D6"/></linearGradient></defs>
      <path fill="url(#${id})" d="M12 2.2l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.27l-5.9 3.1 1.13-6.57L2.45 9.14l6.6-.96z"/>
    </svg>`;
  }
  return `<div class="estrelas">${out}</div>`;
}

const foto = (src, cls = "r", alt = "") =>
  `<div class="foto ${cls}"><img src="${e(src)}" alt="${e(alt)}"></div>`;

/* ============================================================================
   ÍCONES DOS DESTAQUES
   Um traço só (3.2 num viewBox de 64), mesmas terminações arredondadas e mesma
   escala óptica. A regra existe porque capa de Destaque é vista em 60px de
   diâmetro, lado a lado: qualquer variação de peso entre elas lê como "foram
   feitas por pessoas diferentes", que é o oposto do que o Destaque comunica.
   O detalhe em verde vivo é o único elemento preenchido de cada ícone.
   ========================================================================== */
const T = `fill="none" stroke="#095902" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"`;
const DENTE = `M32 10c-5-3.5-11-3.4-14.6-.2C13 13.6 12.3 20 14 27c1.5 6.2 2.4 12 3.2 18.6.5 4 1.4 7.4 3.8 7.4 2.6 0 3.4-3.6 4.4-8.2.9-4.2 1.7-8.2 6.6-8.2s5.7 4 6.6 8.2c1 4.6 1.8 8.2 4.4 8.2 2.4 0 3.3-3.4 3.8-7.4.8-6.6 1.7-12.4 3.2-18.6 1.7-7 1-13.4-3.4-17.2C42.9 6.6 37 6.5 32 10z`;

export const ICONES = {
  implantes: `<svg viewBox="0 0 64 64"><path ${T} d="M32 6c-4.6-2.6-9.6-2.4-12.8.4-3.9 3.4-4.5 9-3 15.2 1 4.2 1.7 8 2.3 12"/><path ${T} d="M32 6c4.6-2.6 9.6-2.4 12.8.4 3.9 3.4 4.5 9 3 15.2-1 4.2-1.7 8-2.3 12"/><path ${T} d="M22 36h20"/><path ${T} d="M24.5 44h15"/><path ${T} d="M27 52h10"/><path ${T} d="M32 33v25"/><circle cx="32" cy="24" r="4" fill="#56A805" stroke="none"/></svg>`,
  proteses: `<svg viewBox="0 0 64 64"><path ${T} d="M9 24c0-8.8 10.3-14 23-14s23 5.2 23 14c0 12-6.6 24-13.4 24-3.6 0-4.6-4-9.6-4s-6 4-9.6 4C15.6 48 9 36 9 24z"/><path ${T} d="M17 26h30"/><path ${T} d="M25 17v9M32 15v11M39 17v9"/><path d="M32 39a5 5 0 0 1 5 5H27a5 5 0 0 1 5-5z" fill="#56A805" stroke="none"/></svg>`,
  ortodontia: `<svg viewBox="0 0 64 64"><path ${T} d="${DENTE}"/><path ${T} d="M10 30h44"/><rect x="24" y="23" width="16" height="14" rx="3" ${T}/><path d="M28 27h8v6h-8z" fill="#56A805" stroke="none"/></svg>`,
  estetica: `<svg viewBox="0 0 64 64"><path ${T} d="${DENTE}"/><path d="M47 8l1.9 4.6L53.5 14l-4.6 1.4L47 20l-1.9-4.6L40.5 14l4.6-1.4z" fill="#56A805" stroke="none"/><path d="M14.5 17l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#56A805" stroke="none"/></svg>`,
  criancas: `<svg viewBox="0 0 64 64"><path ${T} d="M25 14c-3.6-2.6-7.8-2.5-10.4 0-3.2 3-3.6 8-2.4 13.2 1.1 4.6 1.7 9 2.3 13.8.4 3 1 5.5 2.8 5.5 1.9 0 2.5-2.7 3.2-6.1.7-3.1 1.3-6.1 4.5-6.1s3.8 3 4.5 6.1c.7 3.4 1.3 6.1 3.2 6.1 1.8 0 2.4-2.5 2.8-5.5.6-4.8 1.2-9.2 2.3-13.8C39 22 38.6 17 35.4 14c-2.6-2.5-6.8-2.6-10.4 0z"/><path ${T} d="M47 26c-2.4-1.7-5.2-1.6-6.9 0-2.1 2-2.4 5.3-1.6 8.8.7 3 1.1 6 1.5 9.2.3 2 .7 3.7 1.9 3.7 1.3 0 1.7-1.8 2.1-4.1.5-2 .9-4 3-4s2.5 2 3 4c.5 2.3.9 4.1 2.1 4.1 1.2 0 1.6-1.7 1.9-3.7.4-3.2.8-6.2 1.5-9.2.8-3.5.5-6.8-1.6-8.8-1.7-1.6-4.5-1.7-6.9 0z"/><circle cx="25" cy="24" r="3.4" fill="#56A805" stroke="none"/></svg>`,
  clinica: `<svg viewBox="0 0 64 64"><path ${T} d="M10 26h44"/><path ${T} d="M12 26c0-6 9-10 20-10s20 4 20 10"/><path ${T} d="M14 26v28h36V26"/><path ${T} d="M26 54V40h12v14"/><path d="M28 31h8v5h-8z" fill="#56A805" stroke="none"/><path ${T} d="M20 31h4v5h-4zM40 31h4v5h-4z"/></svg>`,
  equipe: `<svg viewBox="0 0 64 64"><circle cx="24" cy="21" r="9" ${T}/><path ${T} d="M8 52c0-8.8 7.2-15 16-15s16 6.2 16 15"/><path ${T} d="M42 15.6a9 9 0 0 1 0 17.3"/><path ${T} d="M46 38.6c6 1.8 10 6.9 10 13.4"/><circle cx="24" cy="21" r="3.6" fill="#56A805" stroke="none"/></svg>`,
  avaliacoes: `<svg viewBox="0 0 64 64"><path ${T} d="M54 34c0 9.9-9.8 18-22 18-2.6 0-5.1-.4-7.4-1L10 55l3.4-8.6C11 43 9.6 38.7 9.6 34c0-9.9 9.9-18 22.1-18S54 24.1 54 34z"/><path d="M32 23.5l3.1 6.3 7 1-5 4.9 1.2 6.9-6.3-3.3-6.3 3.3 1.2-6.9-5-4.9 7-1z" fill="#56A805" stroke="none"/></svg>`,
  duvidas: `<svg viewBox="0 0 64 64"><path ${T} d="M55 30.5c0 10.2-10.3 18.5-23 18.5-2.4 0-4.8-.3-7-.9L9 54l3.6-9.2C10 41 8.5 36 8.5 30.5 8.5 20.3 19.3 12 32 12s23 8.3 23 18.5z"/><path ${T} d="M26.5 26.4c0-3.2 2.6-5.6 5.8-5.6s5.7 2.3 5.7 5.3c0 4.4-5.7 4.6-5.7 8.6"/><circle cx="32.2" cy="40.4" r="2.6" fill="#56A805" stroke="none"/></svg>`,
  localizacao: `<svg viewBox="0 0 64 64"><path ${T} d="M32 56s17-14.4 17-27a17 17 0 1 0-34 0c0 12.6 17 27 17 27z"/><circle cx="32" cy="28" r="6.6" fill="#56A805" stroke="none"/></svg>`,
  tecnologia: `<svg viewBox="0 0 64 64"><rect x="7" y="12" width="50" height="33" rx="5" ${T}/><path ${T} d="M24 53h16M32 45v8"/><path ${T} d="M26 21c-2.4-1.6-5-1.5-6.7.1-2 1.9-2.3 5-1.5 8.4.7 2.9 1.1 5.7 1.5 8.7.2 1.9.6 3.5 1.8 3.5 1.2 0 1.6-1.7 2-3.9.5-1.9.9-3.8 3.1-3.8s2.7 1.9 3.1 3.8c.5 2.2.9 3.9 2 3.9 1.2 0 1.6-1.6 1.8-3.5.4-3 .8-5.8 1.5-8.7.8-3.4.5-6.5-1.5-8.4-1.7-1.6-4.3-1.7-6.7-.1z"/><path d="M44 22h8v3h-8zM44 29h8v3h-8z" fill="#56A805" stroke="none"/></svg>`,
};

/* ============================================================================
   FEED — 1080×1350
   ========================================================================== */

/** feed-brand — só palavra. A peça mais silenciosa do sistema. */
export function feedBrand(d) {
  return `<div class="pad col">
    ${chip(d.chip)}
    <div class="espaco"></div>
    <h1 class="h ${d.escala ?? "h-xg"}">${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p grande larga" style="margin-top:38px">${rico(d.corpo)}</p>` : ""}
    <div class="espaco"></div>
    ${cta(d)}
    ${rodape(d)}
  </div>`;
}

/** feed-photo-copy — foto em janela com arco + frase curta. */
export function feedPhotoCopy(d) {
  return `<div class="pad col gap-m">
    ${chip(d.chip)}
    <div class="foto ${d.arco === false ? "r" : "arco"}" style="height:${String(d.alturaFoto ?? 640)}px;margin-top:${String(d.chip ? 34 : 0)}px">
      <img src="${e(d.foto)}" alt="">
    </div>
    <h1 class="h ${d.escala ?? "h-m"}">${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p larga">${rico(d.corpo)}</p>` : ""}
    <div class="espaco"></div>
    ${cta(d)}
    ${rodape(d)}
  </div>`;
}

/** feed-treatment — foto sangrada + headline sobre scrim. Sóbria, para implante. */
export function feedTreatment(d) {
  return `<div class="fundo-foto scrim"><img src="${e(d.foto)}" alt=""></div>
  <div class="pad col">
    ${chip(d.chip)}
    <div class="espaco"></div>
    <h1 class="h ${d.escala ?? "h-g"}" style="color:#F4F9EF">${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p larga" style="color:#D3E3CC;margin-top:30px">${rico(d.corpo)}</p>` : ""}
    ${d.cta ? `<div style="margin-top:44px">${cta({ ...d, ctaSuave: false })}</div>` : ""}
    <div class="rodape" style="border-top-color:rgba(255,255,255,.22)">
      <img src="${MARCA.escuro}" alt="">
      <span class="arroba" style="color:#DDEDD3">@jpclinicaodontologica</span>
      <span class="local" style="color:#AEC6A7">${rico(d.rodapeLocal ?? "Freguesia do Ó · São Paulo")}</span>
    </div>
  </div>`;
}

/** feed-quote — frase institucional grande, sem foto. */
export function feedQuote(d) {
  return `<div class="pad col">
    ${chip(d.chip)}
    <div class="espaco"></div>
    <div class="aspas">“</div>
    <h1 class="h ${d.escala ?? "h-m"}" style="margin-top:6px">${rico(d.headline)}</h1>
    ${d.assinatura ? `<p class="p" style="margin-top:40px;font-weight:600;color:var(--forest)">${rico(d.assinatura)}</p>` : ""}
    <div class="espaco"></div>
    ${cta(d)}
    ${rodape(d)}
  </div>`;
}

/** feed-proof — nota do Google. O número vem de dados-jp.json, nunca digitado. */
export function feedProof(d) {
  return `<div class="pad col">
    ${chip(d.chip ?? "AVALIAÇÕES")}
    <div class="espaco"></div>
    <div class="linha" style="gap:34px;align-items:flex-end">
      <span class="numerao">${e(d.nota)}</span>
      <div class="col" style="gap:16px;padding-bottom:26px">
        ${estrelas(Number(d.notaNum))}
        <span style="font-size:32px;font-weight:600;color:var(--ink-soft)">${e(d.total)} avaliações</span>
      </div>
    </div>
    <h1 class="h ${d.escala ?? "h-p"}" style="margin-top:48px">${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p larga" style="margin-top:26px">${rico(d.corpo)}</p>` : ""}
    <div class="espaco"></div>
    ${cta(d)}
    ${rodape(d)}
  </div>`;
}

/** feed-team — retrato recortado sobre forma de marca + nome, papel e CRO. */
export function feedTeam(d) {
  const opaco = d.opaco ? " opaco" : "";
  return `<div class="pad col">
    ${chip(d.chip ?? "EQUIPE")}
    <div class="retrato${opaco}" style="height:700px;margin-top:40px">
      <div class="forma" style="height:560px"></div>
      <img src="${e(d.foto)}" style="height:${String(d.alturaRetrato ?? 690)}px;${d.opaco ? "width:540px;height:660px" : ""}">
    </div>
    <h1 class="h h-p" style="margin-top:44px">${rico(d.nome)}</h1>
    <p class="p larga" style="margin-top:14px">${rico(d.papel)}</p>
    ${d.registro ? `<p style="margin-top:12px;font-size:29px;font-weight:600;letter-spacing:.04em;color:var(--forest)">${e(d.registro)}</p>` : ""}
    <div class="espaco"></div>
    ${rodape(d)}
  </div>`;
}

/** feed-local — localidade. Prova de que a clínica existe num lugar. */
export function feedLocal(d) {
  return `<div class="pad col gap-m">
    ${chip(d.chip ?? "ONDE ESTAMOS")}
    <h1 class="h ${d.escala ?? "h-m"}" style="margin-top:30px">${rico(d.headline)}</h1>
    <div class="foto r" style="height:560px">
      <img src="${e(d.foto)}" alt="">
    </div>
    <div class="col gap-s">
      <p class="p larga"><strong>${rico(d.endereco)}</strong></p>
      <p class="p larga">${rico(d.horario)}</p>
    </div>
    <div class="espaco"></div>
    ${cta(d)}
    ${rodape(d)}
  </div>`;
}

/* ============================================================================
   CARROSSEL
   ========================================================================== */

export function carouselCover(d) {
  const temFoto = Boolean(d.foto);
  const corpo = temFoto
    ? `<div class="fundo-foto scrim"><img src="${e(d.foto)}" alt=""></div>`
    : "";
  const claroSobreFoto = temFoto ? ' style="color:#F5FAF0"' : "";
  return `${corpo}<div class="pad col">
    ${chip(d.chip)}
    <div class="espaco"></div>
    <h1 class="h ${d.escala ?? "h-g"}"${claroSobreFoto}>${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p larga" style="margin-top:30px${temFoto ? ";color:#D3E3CC" : ""}">${rico(d.corpo)}</p>` : ""}
    ${
      /* "ARRASTE PARA VER" SÓ NO ORGÂNICO.
         Ele é um elemento de interface: pede uma ação que existe no feed e não
         existe num anúncio, onde vira ruído — e, em alguns formatos, motivo de
         reprovação na Meta. O problema é que ele nasce no TEMPLATE, não no
         manifest: os dois carrosséis de anúncio herdaram a frase sem ninguém
         escrever, e ela passou por uma revisão visual inteira porque estava
         num lugar em que se esperava ver exatamente isso.
         `anuncio: true` no manifest desliga. `conferir.mjs` cobra o campo em
         todo manifest que exporta para `exports/ads/`. */
      d.anuncio
        ? ""
        : `<div style="margin-top:46px" class="arraste"${temFoto ? ' data-claro="1"' : ""}>
      <span${temFoto ? ' style="color:#CDE7AC"' : ""}>Arraste para ver</span>
      <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="${temFoto ? "#CDE7AC" : "#095902"}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12 5l7 7-7 7"/></svg>
    </div>`
    }
    ${
      temFoto
        ? `<div class="rodape" style="border-top-color:rgba(255,255,255,.22)"><img src="${MARCA.escuro}" alt=""><span class="arroba" style="color:#DDEDD3">@jpclinicaodontologica</span><span class="local" style="color:#AEC6A7">${rico(d.rodapeLocal ?? "Freguesia do Ó · São Paulo")}</span></div>`
        : rodape(d)
    }
  </div>`;
}

export function carouselBody(d) {
  return `<span class="paginacao">${e(d.pagina)}</span>
  <div class="pad col">
    ${d.chip ? chip(d.chip) : ""}
    ${d.foto ? `<div class="foto r" style="height:${String(d.alturaFoto ?? 470)}px;margin:${String(d.chip ? 34 : 0)}px 0 40px"><img src="${e(d.foto)}" alt=""></div>` : `<div style="height:40px"></div>`}
    <h2 class="h ${d.escala ?? "h-p"}">${rico(d.headline)}</h2>
    ${d.corpo ? `<p class="p larga" style="margin-top:28px">${rico(d.corpo)}</p>` : ""}
    ${d.nota ? `<p style="margin-top:30px;font-size:27px;line-height:1.4;color:var(--ink-soft);opacity:.9">${rico(d.nota)}</p>` : ""}
    <div class="espaco"></div>
    ${rodape(d)}
  </div>`;
}

export function carouselChecklist(d) {
  const itens = (d.itens ?? [])
    .map(
      (it, i) =>
        `<div class="item"><span class="marca">${e(d.numerado === false ? "•" : String(i + 1))}</span><span class="texto">${rico(it)}</span></div>`,
    )
    .join("");
  return `<span class="paginacao">${e(d.pagina)}</span>
  <div class="pad col">
    ${d.chip ? chip(d.chip) : ""}
    <h2 class="h ${d.escala ?? "h-p"}" style="margin-top:${String(d.chip ? 36 : 0)}px">${rico(d.headline)}</h2>
    <div class="lista" style="margin-top:44px">${itens}</div>
    <div class="espaco"></div>
    ${rodape(d)}
  </div>`;
}

export function carouselComparison(d) {
  return `<span class="paginacao">${e(d.pagina)}</span>
  <div class="pad col">
    ${d.chip ? chip(d.chip) : ""}
    <h2 class="h ${d.escala ?? "h-p"}" style="margin-top:${String(d.chip ? 36 : 0)}px">${rico(d.headline)}</h2>
    <div class="colunas" style="margin-top:44px">
      <div class="coluna"><h4>${rico(d.aTitulo)}</h4><p>${rico(d.aTexto)}</p></div>
      <div class="coluna"><h4>${rico(d.bTitulo)}</h4><p>${rico(d.bTexto)}</p></div>
    </div>
    ${d.nota ? `<p style="margin-top:38px;font-size:29px;line-height:1.42;color:var(--ink-soft)">${rico(d.nota)}</p>` : ""}
    <div class="espaco"></div>
    ${rodape(d)}
  </div>`;
}

export function carouselCta(d) {
  return `<div class="pad col">
    ${chip(d.chip ?? "PRÓXIMO PASSO")}
    <div class="espaco"></div>
    <h2 class="h ${d.escala ?? "h-m"}">${rico(d.headline)}</h2>
    ${d.corpo ? `<p class="p larga" style="margin-top:30px">${rico(d.corpo)}</p>` : ""}
    <div style="margin-top:46px" class="col gap-s">
      ${cta(d)}
      ${d.contato ? `<p style="font-size:29px;line-height:1.5;color:var(--ink-soft)">${rico(d.contato)}</p>` : ""}
    </div>
    <div class="espaco"></div>
    ${rodape(d)}
  </div>`;
}

/* ============================================================================
   STORY — 1080×1920
   ========================================================================== */

function storyTopo(d) {
  return `<div class="story-topo">
    <img src="${simbolo(d.superficie)}" alt="">
    <span>${e(d.topo ?? "JP CLÍNICA ODONTOLÓGICA")}</span>
  </div>`;
}

export function storyTexto(d) {
  return `<div class="pad col gap-m">
    ${storyTopo(d)}
    <div class="espaco"></div>
    ${d.chip ? chip(d.chip) : ""}
    <h1 class="h ${d.escala ?? "h-m"}">${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p grande larga">${rico(d.corpo)}</p>` : ""}
    <div class="espaco"></div>
    ${d.adesivo ? `<div class="marca-adesivo">${rico(d.adesivo)}</div>` : ""}
    ${cta(d)}
  </div>`;
}

export function storyFoto(d) {
  return `<div class="fundo-foto scrim scrim-topo"><img src="${e(d.foto)}" alt=""></div>
  <div class="pad col gap-m">
    <div class="story-topo"><img src="${MARCA.escuro}" alt=""><span style="color:#D6E6CF">${e(d.topo ?? "JP CLÍNICA ODONTOLÓGICA")}</span></div>
    <div class="espaco"></div>
    ${d.chip ? chip(d.chip) : ""}
    <h1 class="h ${d.escala ?? "h-m"}" style="color:#F5FAF0">${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p grande larga" style="color:#D6E6CF">${rico(d.corpo)}</p>` : ""}
    ${d.adesivo ? `<div class="marca-adesivo" style="border-color:rgba(230,244,220,.5);color:#E6F4DC">${rico(d.adesivo)}</div>` : ""}
    ${d.cta ? cta(d) : ""}
  </div>`;
}

export function storyJanela(d) {
  return `<div class="pad col gap-m">
    ${storyTopo(d)}
    <div class="foto arco" style="height:780px;margin-top:16px"><img src="${e(d.foto)}" alt=""></div>
    ${d.chip ? chip(d.chip) : ""}
    <h1 class="h ${d.escala ?? "h-p"}">${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p larga">${rico(d.corpo)}</p>` : ""}
    <div class="espaco"></div>
    ${d.adesivo ? `<div class="marca-adesivo">${rico(d.adesivo)}</div>` : ""}
    ${cta(d)}
  </div>`;
}

export function storyProva(d) {
  return `<div class="pad col gap-m">
    ${storyTopo(d)}
    <div class="espaco"></div>
    ${chip(d.chip ?? "AVALIAÇÕES")}
    <div class="linha" style="gap:30px;align-items:flex-end">
      <span class="numerao" style="font-size:210px">${e(d.nota)}</span>
      <div class="col" style="gap:14px;padding-bottom:22px">
        ${estrelas(Number(d.notaNum))}
        <span style="font-size:30px;font-weight:600;color:var(--ink-soft)">${e(d.total)} avaliações</span>
      </div>
    </div>
    ${d.citacao ? `<p class="p grande larga" style="margin-top:20px">“${rico(d.citacao)}”</p>` : ""}
    ${d.autor ? `<p style="font-size:29px;font-weight:600;color:var(--forest)">${e(d.autor)} · Google</p>` : ""}
    <div class="espaco"></div>
    ${cta(d)}
  </div>`;
}

export function storyEquipe(d) {
  const opaco = d.opaco ? " opaco" : "";
  return `<div class="pad col gap-m">
    ${storyTopo(d)}
    ${chip(d.chip ?? "EQUIPE")}
    <div class="retrato${opaco}" style="height:820px">
      <div class="forma" style="height:650px"></div>
      <img src="${e(d.foto)}" style="${d.opaco ? "width:600px;height:740px" : `height:${String(d.alturaRetrato ?? 800)}px`}">
    </div>
    <h1 class="h h-p">${rico(d.nome)}</h1>
    <p class="p larga" style="margin-top:-18px">${rico(d.papel)}</p>
    ${d.registro ? `<p style="margin-top:-18px;font-size:28px;font-weight:600;letter-spacing:.04em;color:var(--forest)">${e(d.registro)}</p>` : ""}
    <div class="espaco"></div>
    ${cta(d)}
  </div>`;
}

/* ============================================================================
   CAPA DE REEL — 1080×1920, legível já no grid 4:5 central
   ========================================================================== */

export function reelCoverTratamento(d) {
  return `<div class="fundo-foto scrim scrim-topo"><img src="${e(d.foto)}" alt=""></div>
  <div class="pad col" style="padding-top:340px;padding-bottom:400px">
    ${chip(d.chip)}
    <div class="espaco"></div>
    <h1 class="h ${d.escala ?? "h-g"}" style="color:#F6FAF2">${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p grande larga" style="color:#D6E6CF;margin-top:26px">${rico(d.corpo)}</p>` : ""}
    <div class="linha" style="gap:20px;margin-top:44px">
      <img src="${MARCA.escuro}" style="height:54px" alt="">
      <span style="font-size:27px;font-weight:600;color:#D9EAD0">@jpclinicaodontologica</span>
    </div>
  </div>`;
}

export function reelCoverTipografica(d) {
  return `<div class="pad col" style="padding-top:340px;padding-bottom:400px">
    ${chip(d.chip)}
    <div class="espaco"></div>
    <h1 class="h ${d.escala ?? "h-g"}">${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p grande larga" style="margin-top:26px">${rico(d.corpo)}</p>` : ""}
    <div class="linha" style="gap:20px;margin-top:44px">
      <img src="${simbolo(d.superficie)}" style="height:54px" alt="">
      <span style="font-size:27px;font-weight:600;color:${ESCURAS.has(d.superficie) ? "#D9EAD0" : "var(--forest)"}">@jpclinicaodontologica</span>
    </div>
  </div>`;
}

export function reelCoverRosto(d) {
  const opaco = d.opaco ? " opaco" : "";
  return `<div class="pad col" style="padding-top:320px;padding-bottom:380px">
    ${chip(d.chip)}
    <div class="retrato${opaco}" style="height:760px;margin-top:30px">
      <div class="forma" style="height:600px"></div>
      <img src="${e(d.foto)}" style="${d.opaco ? "width:560px;height:690px" : `height:${String(d.alturaRetrato ?? 750)}px`}">
    </div>
    <h1 class="h ${d.escala ?? "h-m"}" style="margin-top:36px">${rico(d.headline)}</h1>
    <div class="espaco"></div>
    <div class="linha" style="gap:20px">
      <img src="${simbolo(d.superficie)}" style="height:54px" alt="">
      <span style="font-size:27px;font-weight:600;color:var(--forest)">@jpclinicaodontologica</span>
    </div>
  </div>`;
}

/* ============================================================================
   CAPA DE DESTAQUE — 1080×1920, lida dentro de um círculo de 60px
   ========================================================================== */

export function highlightCover(d) {
  const icone = d.numero
    ? `<span style="font-family:var(--display);font-weight:800;font-size:250px;line-height:.8;letter-spacing:-.05em;color:var(--forest)">${e(d.numero)}</span>`
    : (ICONES[d.icone] ?? ICONES.clinica);
  return `<div class="destaque-fundo">
    <div class="circulo" style="background:${d.fundoCirculo ?? "transparent"}">
      ${icone}
      <span class="rotulo">${e(d.rotulo)}</span>
    </div>
  </div>`;
}

/* ============================================================================
   ANÚNCIOS — mesma linguagem, sem elemento de interface orgânica
   (nada de "arraste", "salve", "link na bio": em anúncio isso é ruído).
   ========================================================================== */

export function adEstatico(d) {
  const temFoto = Boolean(d.foto);
  return `${temFoto ? `<div class="fundo-foto scrim"><img src="${e(d.foto)}" alt=""></div>` : ""}
  <div class="pad col">
    ${chip(d.chip)}
    <div class="espaco"></div>
    <h1 class="h ${d.escala ?? "h-g"}"${temFoto ? ' style="color:#F5FAF0"' : ""}>${rico(d.headline)}</h1>
    ${d.corpo ? `<p class="p grande larga" style="margin-top:28px${temFoto ? ";color:#D6E6CF" : ""}">${rico(d.corpo)}</p>` : ""}
    <div style="margin-top:44px">${cta(d)}</div>
    <div class="rodape"${temFoto ? ' style="border-top-color:rgba(255,255,255,.22)"' : ""}>
      <img src="${temFoto ? MARCA.escuro : simbolo(d.superficie)}" alt="">
      <span class="arroba"${temFoto ? ' style="color:#DDEDD3"' : ""}>${e(d.assinatura ?? "JP Clínica Odontológica")}</span>
      <span class="local"${temFoto ? ' style="color:#AEC6A7"' : ""}>${rico(d.rodapeLocal ?? "Freguesia do Ó · São Paulo")}</span>
    </div>
  </div>`;
}

/** Placa de segurança: usada em peças que dependem de gravação humana. */
export function placeholderProducao(d) {
  return `<div class="pad col" style="justify-content:center;align-items:center;text-align:center;gap:40px">
    <span class="chip">PENDÊNCIA DE PRODUÇÃO</span>
    <h1 class="h h-m" style="max-width:20ch">${rico(d.headline)}</h1>
    <p class="p larga" style="text-align:center;max-width:26ch">${rico(d.corpo)}</p>
    <p style="font-size:27px;color:var(--ink-soft)">${e(d.arquivo ?? "")}</p>
  </div>`;
}

/* ============================================================================
   PRÉVIAS — não são peças de publicar, são conferência
   ========================================================================== */

/** Avatar: o símbolo dentro do círculo que o Instagram recorta. */
export function avatarPreview(d) {
  return `<div style="width:1080px;height:1080px;display:flex;align-items:center;justify-content:center;background:${d.fundo ?? "#F7F8F2"}">
    <div style="width:${String(d.diametro ?? 1080)}px;height:${String(d.diametro ?? 1080)}px;border-radius:999px;background:${d.fundoCirculo ?? "#FCFDF9"};display:flex;align-items:center;justify-content:center;overflow:hidden">
      <img src="${e(d.arte ?? MARCA.claro)}" style="width:${String(d.escalaArte ?? 560)}px">
    </div>
  </div>`;
}

export const TEMPLATES = {
  "feed-brand": feedBrand,
  "feed-photo-copy": feedPhotoCopy,
  "feed-treatment": feedTreatment,
  "feed-quote": feedQuote,
  "feed-proof": feedProof,
  "feed-team": feedTeam,
  "feed-local": feedLocal,
  "carousel-cover": carouselCover,
  "carousel-body": carouselBody,
  "carousel-checklist": carouselChecklist,
  "carousel-comparison": carouselComparison,
  "carousel-cta": carouselCta,
  "story-texto": storyTexto,
  "story-foto": storyFoto,
  "story-janela": storyJanela,
  "story-prova": storyProva,
  "story-equipe": storyEquipe,
  "reel-cover-tratamento": reelCoverTratamento,
  "reel-cover-tipografica": reelCoverTipografica,
  "reel-cover-rosto": reelCoverRosto,
  "highlight-cover": highlightCover,
  "ad-estatico": adEstatico,
  "placeholder-producao": placeholderProducao,
  "avatar-preview": avatarPreview,
};
