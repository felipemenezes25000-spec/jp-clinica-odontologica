# Design system — JP Clínica Odontológica

> **Documento vivo. Redesenho de novembro de 2026.**
>
> Fonte executável: o bloco "SISTEMA JP 2026" no fim de `src/styles.css`, os componentes de
> `src/components/site/sistema/` e as peças de referência `src/components/site/Header.tsx` e
> `src/components/site/home/Abertura.tsx`. Dados públicos: `src/lib/jp.ts`. Marca: `docs/marca/LEIA-ME.md`.

## A ideia

**A coroa de dois lobos do dente da marca JP vira a forma única do site.**

O dente do símbolo da JP é desenhado por dois traços que se encontram numa covinha no alto; a maçã
verde do material impresso tem o mesmo topo de dois lobos. Esse topo — laterais retas, base cortada pela
moldura — é a única forma "com caráter" da página. Ela aparece em quatro escalas, e em nenhum outro
lugar se usa um retângulo arredondado genérico para dar personalidade:

1. **gigante** — a coroa chapada em verde-maçã do topo da home, o "eco" deslocado atrás da janela;
2. **máscara de toda fotografia** — `<MolduraCoroa>`;
3. **marcador de lista e item ativo** — `<MarcaCoroa>`, na altura da letra;
4. **faixa** — `<FaixaDeCoroas>`, uma arcada de coroas lado a lado que separa as duas metades da página e
   fecha o rodapé.

Direção de arte sorteada pela taste-skill: **One motif** (semente `2147397342`), paleta da marca mantida,
tipo Bricolage Grotesque. Folha completa: `node <taste-skill>/scripts/draw.mjs --show` (arquivo em
`.taste-skill/direction.json`, fora do Git).

## Regras da casa (valem em todas as páginas públicas)

| Não                                                                             | Em vez disso                                                           |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Rótulo miúdo em caixa-alta acima do título ("eyebrow"), pílula-selo acima do H1 | A informação vai no título ou na primeira frase                        |
| Numeração 01/02/03                                                              | Ordem pela posição; `<ol>` quando a ordem importa                      |
| Filete de 1px, caixa contornada, grade de linhas                                | Espaço, ou um degrau de tom (`chao` → `chao-2`)                        |
| Degradê em fundo, botão ou texto                                                | Cor chapada ou foto real. Única exceção: véu chapado sob texto em foto |
| Sombra em coisa parada, brilho, `blur` decorativo                               | Degrau de tom. Sombra só no que flutua de verdade (menu, diálogo)      |
| Vidro (`backdrop-filter`), pílula de navegação flutuante                        | Barra lisa                                                             |
| Card com ícone no topo, fileira de cards idênticos                              | O desenho da seção (ver "Seções")                                      |
| Palavra destacada no título (cor, itálico, sublinhado)                          | Uma cor, um peso: as palavras carregam a ênfase                        |
| Monoespaçada, emoji, bolha decorativa                                           | Nada                                                                   |
| Título com mais de duas linhas em qualquer largura                              | Cortar palavras, depois alargar a medida, por último reduzir           |

Também: um H1 por página dizendo o que é a página; título em toda seção; margens externas iguais nos
dois lados em toda largura; nenhum trecho vazio maior que meia tela; nenhuma metade de tela vazia ao
lado de texto.

## Cor

| Token (Tailwind)                    | Valor                 | Uso                                                                                      |
| ----------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `chao`                              | `#F4F5EC`             | fundo da página                                                                          |
| `chao-2` / `chao-3`                 | `#E9ECDF` / `#DCE3CE` | ladrilho, botão secundário, hover                                                        |
| `tinta`                             | `#032F01`             | todo texto corrido e títulos no chão                                                     |
| `tinta-suave`                       | `#3F523B`             | notas secundárias (7,7:1 no chão) — nunca o texto principal                              |
| `acento`                            | `#56A805`             | o botão principal, a forma gigante, os marcadores. **Nunca texto sobre o chão (2,73:1)** |
| `acento-claro`                      | `#6CC414`             | hover do botão principal                                                                 |
| `campo`                             | `#032F01`             | seção escura inteira (`.campo-escuro`)                                                   |
| `campo-marca`                       | `#095902`             | verde institucional, segundo campo escuro                                                |
| `sobre-campo` / `sobre-campo-suave` | `#F4F5EC` / `#C9D6C2` | texto sobre campo escuro                                                                 |

Pares de texto aprovados: tinta/chão 13,55:1 · tinta-suave/chão 7,7:1 · tinta-suave/chão-2 7,06:1 ·
tinta/acento 4,96:1 · sobre-campo/campo 13,55:1 · sobre-campo-suave/campo 9,84:1 · acento/campo 4,96:1 ·
sobre-campo/campo-marca 7,83:1. Qualquer outro par: medir antes.

## Tipo

Uma família: **Bricolage Grotesque** (variável, peso 200–800, tamanho óptico automático), hospedada em
`src/assets/fontes`. Cinco medidas, e não existe sexta:

| Classe         | Faixa      | Uso                                                                     |
| -------------- | ---------- | ----------------------------------------------------------------------- |
| `text-display` | 44 → 116px | o H1 do topo                                                            |
| `text-titulo`  | 40 → 76px  | título de seção (H2)                                                    |
| `text-frase`   | 24 → 36px  | frase de efeito, citação, subtítulo grande. Teto de 36px e ~25 palavras |
| `text-corpo`   | 17 → 19px  | texto corrido, botões, links do menu                                    |
| `text-pequeno` | 14 → 15px  | nota, legenda, rodapé. Nunca abaixo de 13px                             |

Títulos: peso 600, entrelinha 0,92–0,96, `letter-spacing` já vem da classe. Corpo: peso 400 (500 para
ênfase), entrelinha 1,5. Sentença, nunca caixa-alta espaçada.

Uma exceção, e só uma: o **H1 das landings pagas** (LPs de implante e clareamento e o modo anúncio das
páginas de tratamento) tem escala própria, entre `text-titulo` e `text-display`, porque precisa levar o
termo buscado + o bairro em até duas linhas a 390px, e o `text-display` não cabe. Quem precisa de tamanho
próprio não usa a classe de texto: as utilitárias vencem o CSS de componente na cascata.

## Forma e componentes

- **Quadro**: `.quadro` — largura `min(100% − 2×margem, 1680px)`, margem de 16→32px. Uma só para o site.
- **Ritmo**: `.secao` (88→200px de respiro vertical) e `.secao-curta`.
- **Raio**: `var(--raio)` = 20px para ladrilho e campo de formulário. Fotos usam a coroa, não raio.
- **Botões**: pílula cheia, um formato. `botao botao-acento` (ação principal), `botao botao-tinta`,
  `botao botao-chao` (secundária), `botao botao-claro` (sobre campo escuro). Do nome antigo sobrou só
  `button-primary` (= acento) — **o E2E procura `main a.button-primary[href*="wa.me"]` no topo das LPs**.
- **Chamada fixa** (`FloatingCTA`): no celular, barra embaixo (`#cta-mobile`); a partir de 768px, pílula
  no canto que só existe com o cabeçalho escondido. A pílula sai sempre que a página já mostra um botão
  de ação seu; a barra do celular só sai diante do que tem `data-cede-cta` (o formulário de `#fale`).
  Nas LPs pagas a barra do celular fica sempre (invariante do E2E). As duas sobem pela faixa de cookies
  (`--altura-aviso`) e somem antes do rodapé.
- **Link de texto**: `.link` (o sublinhado acende no hover; o peso não muda).
- **Ladrilho**: `.ladrilho` — um degrau de tom, sem borda, sem sombra.
- **Coroa**: `<MolduraCoroa proporcao={4/5}>` (ou `medir` quando a caixa não tem proporção fixa),
  `<FormaCoroa>`, `<MarcaCoroa>`, `<FaixaDeCoroas>` — em `sistema/Coroa.tsx`. Geometria pura em
  `sistema/geometria.ts` (`caminhoCoroa`, `caminhoCoroaPx` para animar quadro a quadro).

## Movimento

O site se move muito, e com regra. Tudo em `transform`, `opacity` e `clip-path`; tudo com versão parada
para `prefers-reduced-motion`; nada escondido se o JavaScript falhar.

**Camada quieta, declarada por atributo** (o motor `sistema/movimento.tsx`, montado pelo `<Header>`):

| Atributo                           | Efeito                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `data-entra` + filhos `data-item`  | o grupo entra ao aparecer; itens sobem 28px em cascata de 80ms. Não aninhar |
| `data-linhas`                      | as linhas do título sobem de trás da própria linha de base (SplitText)      |
| `data-tinta`                       | a frase acende palavra por palavra com a rolagem — **uma por página**       |
| `data-numero="210" data-casas="0"` | o número rola até o valor ao aparecer                                       |
| `data-obturador`                   | a moldura abre de baixo para cima e a foto assenta                          |
| `data-deriva`                      | a foto anda até 5% dentro da moldura (a moldura corta)                      |
| `data-ima`                         | botão puxa levemente na direção do mouse                                    |

Hover/press: botões escalam 0,97 ao apertar; a seta do botão anda 2px no hover; hover só em
`(hover: hover) and (pointer: fine)`.

**Cenas** (o que muda a tela inteira): no máximo três na home, com uma seção quieta entre elas. Feitas
com `carregarGsap()` + `gsap.matchMedia("(min-width: 1024px)")`, rolagem nativa (Lenis só suaviza no
desktop com mouse), palco `position: sticky` numa seção mais alta que a tela. No celular e com
"reduzir movimento" a seção é a **composição final, parada**, desenhada com o mesmo cuidado. Modelo:
`home/Abertura.tsx`.

1. **Topo da home** — a janela em coroa cresce até a tela inteira.
2. **História** — os anos passam numa coroa parada: 2002 (Sempre Sorrindo) → 2020 (JP) → 2024 (a
   fachada abre) → hoje. A altura da cena vem do CSS servido, para não haver salto quando o JS chega.
3. **Estrutura** — galeria de lado: a rolagem atravessa as salas da clínica. Só liga com tela de pelo
   menos 700px de altura; abaixo disso é a fileira nativa com setas.

Fora da home, as LPs têm uma cena só (o Fechamento: a coroa gigante cresce com a rolagem).

**Troca de página**: View Transition só quando o caminho muda (filtro, aba e busca não esmaecem a página)
e nunca dentro de `/rh` e `/crc`. Com "reduzir movimento" a troca é seca.

## Fotografia

Só fotos reais da clínica e retratos reais da equipe (`src/assets`). Nada de imagem de gerador com
pessoa, nada de banco de imagem no lugar da clínica. Toda foto dentro da coroa; `width`/`height`
sempre; `loading="lazy"` fora da primeira dobra; `alt` que diz o que é.

Código de Ética do CFO e Resolução 196/2019 (ver memória do projeto): nenhuma imagem de procedimento
sendo feito; imagem de profissional com nome + CRO; nada de "antes e depois" (escolha da JP); nada de
promessa de resultado, desconto artificial ou "últimas vagas".

Fora do site por enquanto: o banner de ortodontia da sala de espera (`sala-espera-ortodontia*`: rostos
de crianças e marca comercial) e a animação da harmonização (rosto de pessoa gerada). Os arquivos ficam
em `src/assets` porque o kit do Instagram ainda os cita. Os retratos da equipe ficam na coroa sem
filtro; "Dentistas com nome e CRO" só lista quem tem CRO, e a recepção vai em bloco próprio.

## Seções da home (ordem e composição)

1. **Topo** (`#inicio`) — texto à esquerda, janela em coroa à direita com eco verde; cena 1.
2. **A clínica** (`#clinica`) — frase de efeito com miniaturas de foto em coroa dentro da linha;
   `data-tinta`.
3. **Tratamentos** (`#tratamentos`) — cardápio em duas colunas, cada item com miniatura em coroa no lugar
   do marcador; no desktop, a prévia grande segue o mouse sobre a lista.
4. **Convênios** (`#convenios`) — quadro de ladrilhos, um ladrilho em acento com o título.
5. **Equipe** (`#equipe`) — painel escuro recuado, retratos em coroa, nome e CRO.
6. **História** (`#historia`) — campo escuro; cena 2.
7. **Avaliações** (`#depoimentos`) — foto em coroa e citação deslocada; nota que rola.
8. **Faixa de coroas** — divide a página em duas metades.
9. **Estrutura** (`#estrutura`) — cena 3; clique abre a foto inteira.
10. **Atendimento** (`#atendimento`) — foto grande em coroa cortada pela borda + pontos marcados pela coroa.
11. **Perguntas** (`#faq`) — título grudado à esquerda, acordeão de ladrilhos à direita (`<details name>`).
12. **Contato** (`#fale`) — o cupom: monte a mensagem e abra o WhatsApp já escrita; mapa e pontos de
    referência.
13. **Rodapé** — a marca construída grande, em blocos de coroa.

## Landing pages pagas

`PaginaDeTratamento` com `modo="anuncio"`, `PaginaImplanteAds` e `PaginaClareamentoAds` seguem o mesmo
sistema, com o cabeçalho enxuto. Invariantes cobertas pelo E2E (`npm run e2e:site`) que **não podem
quebrar**: um H1 por página no HTML servido, com procedimento + bairro na LP; `#hero-implantes` e
`#hero-clareamento` com link `wa.me`; `#video-implante`/`#video-clareamento` com um `<video>` e o texto
"animação ilustrativa"; `#cta-mobile` com link `wa.me`; nenhum "Outros caminhos de cuidado" nem link
"Todos os tratamentos" na LP (e presentes na orgânica); `nav[aria-label="Navegação principal"]` ausente na
LP e presente na home/orgânica; telefone e WhatsApp dentro do `<header>`; "Vila Bruna", "Freguesia do Ó",
a nota ("4,6") e "N avaliações" visíveis na primeira dobra da LP; nenhuma promessa de resultado.

## RH e CRC

`/rh` é tela de trabalho: segue o mesmo tipo e a mesma paleta, com as regras de tela de aplicativo
(bordas discretas e painéis repetidos são normais lá). O CSS do painel está em
`src/components/rh/painel.css`, fora de `@layer` de propósito (precisa vencer o bloco antigo "PORTAL DE RH"
de `styles.css`, que ainda veste as telas não migradas: triagem, modo entrevista, central de contato e o
interior do editor de vaga). Piso de 13px para qualquer texto do painel. Pares de aviso e erro aprovados:
`--rh-aviso-texto` sobre `--rh-aviso-fundo` 6,84:1; `--rh-erro-texto` sobre `--rh-erro-fundo` 8,63:1.

`/crc` tem tokens próprios e não é tocado por este sistema. Mudança de token global é conferida nos três.

## Manutenção

Mude este arquivo quando mudar uma **regra**. Medidas exatas, contagens e detalhes efêmeros pertencem ao
código e aos testes.
