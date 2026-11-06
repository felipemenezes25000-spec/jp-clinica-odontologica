# Design system — JP Clínica Odontológica

> **Documento vivo. Direção "Clínica luminosa", de 06/11/2026.**
>
> Fonte executável: o bloco "SISTEMA JP 2026" no fim de `src/styles.css`, as peças de
> `src/components/site/ui/` e `src/components/site/sistema/`, e a peça de referência
> `src/components/site/home/TopoHome.tsx`. Dados públicos: `src/lib/jp.ts`. Marca: `docs/marca/LEIA-ME.md`.

## A ideia

**Clínica de bairro com acabamento de clínica premium: clara, arejada, com gente de verdade e prova
social à vista.**

O primeiro lançamento de 11/2026 era chapado e escuro, com uma "coroa" de dois lobos em toda foto, e a
clínica o reprovou em 06/11/2026: pareceu amador e sem força para converter anúncio. A direção atual:

1. **fundo claro** (`chao`, quase branco) com seções alternando para `chao-2`; o verde profundo (`campo`)
   só no fechamento e no rodapé;
2. **cartões brancos** com borda fina e sombra suave (`.cartao`, `.cartao-vivo` sobe no hover);
3. **prova social em selo**: a nota do Google antes do H1, rostos reais da equipe, CRO à vista, número de
   convênios, horário de agora; sobre a foto, cartões de **vidro** com um depoimento real e a responsável
   técnica;
4. **o verde-maçã só na ação** (o botão principal, com relevo e reflexo no hover) e em pontos de realce;
5. **movimento de interação**: CSS (hover, acordeão), Embla (carrossel de avaliações), contador próprio
   (números que sobem), faixa rolante de convênios; entradas discretas ao rolar, sem GSAP.

Nenhuma forma com lobos, recortes ou silhueta figurativa em moldura de foto. Nada de bloco verde chapado
decorativo sem função.

## Regras da casa (valem em todas as páginas públicas)

| Não                                                     | Em vez disso                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Número, avaliação, prêmio, preço ou promessa inventados | Só o que está em `jp.ts`; o que faltar fica de fora            |
| Estrelas em depoimento individual                       | Estrelas só na nota geral do Google                            |
| Foto de celular esticada em tela cheia                  | Foto média, bem enquadrada, com selo ou cartão por cima        |
| Vidro em bloco de texto corrido                         | Vidro só no que flutua sobre foto                              |
| Mais de um botão principal por dobra                    | Um principal (WhatsApp) + um secundário (telefone ou ver mais) |
| Seção sem saída                                         | CTA a cada uma ou duas seções, sempre o mesmo destino          |
| Monoespaçada, emoji, bolha decorativa, degradê em texto | Nada                                                           |
| Título com mais de duas linhas em qualquer largura      | Cortar palavras, depois alargar a medida, por último reduzir   |

Também: um H1 por página dizendo o que é a página; sobretítulo curto (`.sobretitulo`) + título em toda
seção; margens externas iguais nos dois lados em toda largura; nenhum trecho vazio maior que meia tela.

## Cor

| Token (CSS)                     | Valor                 | Uso                                                                     |
| ------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| `--chao`                        | `#FBFCF8`             | fundo da página                                                         |
| `--chao-2` / `--chao-3`         | `#F1F5EA` / `#E2E9D6` | seção alternada (`.secao-clara`) / divisória, trilho                    |
| `--branco`                      | `#FFFFFF`             | cartão, botão secundário, selo                                          |
| `--menta`                       | `#E8F4DA`             | fundo de pastilha de ícone e de realce                                  |
| `--tinta`                       | `#032F01`             | texto corrido e títulos                                                 |
| `--tinta-suave`                 | `#44573F`             | notas secundárias                                                       |
| `--acento`                      | `#56A805`             | fundo do botão principal e realces. **Nunca texto sobre claro (2,9:1)** |
| `--acento-texto`                | `#2F6A00`             | verde de TEXTO sobre claro (CRO, sobretítulo, link de destaque)         |
| `--campo` / `--campo-marca`     | `#032F01` / `#095902` | fechamento e rodapé (`.campo-escuro`)                                   |
| `--sobre-campo` / `-suave`      | `#F4F5EC` / `#C9D6C2` | texto sobre campo escuro                                                |
| `--borda` / `--borda-forte`     | tinta a 9% / 16%      | borda de cartão e de botão secundário                                   |
| `--sombra-1` / `--sombra-2`     | —                     | cartão parado / cartão no hover, vidro, foto do topo                    |
| `--estrela` / `--estrela-vazia` | `#F2A516` / `#E3E6DC` | estrelas da nota geral                                                  |

Pares de texto aprovados: tinta/chão 14,45:1 · tinta-suave/chão 7,6:1 · tinta-suave/menta 6,86:1 ·
acento-texto/chão 6,4:1 · acento-texto/menta 5,78:1 · tinta/acento 4,96:1 · sobre-campo/campo 13,55:1 ·
sobre-campo-suave/campo 9,84:1 · acento/campo 4,96:1. Qualquer outro par: medir antes.

## Tipo

Uma família: **Bricolage Grotesque** (variável, peso 200–800, tamanho óptico automático), hospedada em
`src/assets/fontes`. Medidas:

| Classe         | Faixa      | Uso                                                   |
| -------------- | ---------- | ----------------------------------------------------- |
| `text-display` | 44 → 116px | H1 de página com espaço; o topo da home usa 44 → 88px |
| `text-titulo`  | 40 → 76px  | título de seção (H2)                                  |
| `text-frase`   | 24 → 36px  | frase de efeito, citação, subtítulo grande            |
| `text-corpo`   | 17 → 19px  | texto corrido, botões, links do menu                  |
| `text-pequeno` | 14 → 15px  | nota, legenda, rodapé. Nunca abaixo de 13px           |

Títulos: peso 600, entrelinha justa, `letter-spacing` negativo. Corpo: peso 400 (500–650 para ênfase),
entrelinha 1,5. Sentença, nunca caixa-alta espaçada. O H1 das landings pagas tem escala própria para
caber termo + bairro em duas linhas a 390px.

## Forma e componentes

- **Quadro**: `.quadro` — largura `min(100% − 2×margem, 1680px)`, margem de 16→32px.
- **Ritmo**: `.secao` (72→136px de respiro vertical), `.secao-curta`, `.secao-clara` (fundo `chao-2`).
- **Raio**: `--raio-sm` 12px, `--raio` 20px (cartão, campo, foto — na foto limitado a 10% da peça),
  `--raio-lg` 28px (foto grande do topo).
- **Botões**: pílula. `button-primary`/`botao botao-acento` (principal, com relevo e reflexo no hover),
  `botao botao-chao` (secundário branco com borda), `botao botao-tinta`, `botao botao-claro` (sobre escuro),
  `botao-grande` (topo). **O E2E procura `main a.button-primary[href*="wa.me"]` no topo das LPs.**
- **Cartão**: `.cartao` / `.ladrilho` (branco, borda, sombra 1), `.cartao-vivo` (sobe 4px no hover).
- **Vidro**: `.vidro` — só sobre foto. **Selo**: `.selo` (pílula de prova social). **Sobretítulo**:
  `.sobretitulo`. **Pastilha**: `.pastilha` (ícone lucide em quadrado menta). **Fundo**: `.fundo-brilho`.
- **Peças** (`src/components/site/ui/`): `Estrelas`, `Contador` (sobe o número por requestAnimationFrame; o HTML do servidor já traz o
  valor real; nunca na primeira dobra das LPs), `CarrosselAvaliacoes` (Embla), `FaixaRolante` (marquee),
  `AvataresEquipe` (miniaturas reais de 112px).
- **Moldura**: `<MolduraCoroa proporcao={4/5}>` (nome histórico; hoje é só o canto arredondado).
- **Chamada fixa** (`FloatingCTA`): no celular, barra embaixo (`#cta-mobile`); a partir de 768px, pílula
  no canto que só existe com o cabeçalho escondido. Some diante do que tem `data-cede-cta`; nas LPs pagas a
  barra do celular fica sempre (invariante do E2E).
- **Link de texto**: `.link`.

## Movimento

Tudo em `transform`/`opacity`; tudo com versão parada para `prefers-reduced-motion`; nada escondido se o
JavaScript falhar. Entradas ao rolar pelo motor `sistema/movimento.tsx` (montado pelo `<Header>`, sem
GSAP): `data-entra` no grupo + `data-item` nos filhos (cascata), `data-ima` no botão. Interação em CSS. Sem
cena de rolagem que segure a página: o topo carrega parado e inteiro.

**Troca de página**: View Transition só quando o caminho muda e nunca dentro de `/rh` e `/crc`.

## Fotografia

Só fotos reais da clínica e retratos reais da equipe (`src/assets`). Nada de imagem de gerador com
pessoa, nada de banco de imagem no lugar da clínica. Toda foto dentro da moldura; `width`/`height`
sempre; `loading="lazy"` fora da primeira dobra; `alt` que diz o que é.

Código de Ética do CFO e Resolução 196/2019 (ver memória do projeto): nenhuma imagem de procedimento
sendo feito; imagem de profissional com nome + CRO; nada de "antes e depois" (escolha da JP); nada de
promessa de resultado, desconto artificial ou "últimas vagas".

Fora do site por enquanto: o banner de ortodontia da sala de espera (`sala-espera-ortodontia*`: rostos
de crianças e marca comercial) e a animação da harmonização (rosto de pessoa gerada). Os arquivos ficam
em `src/assets` porque o kit do Instagram ainda os cita. Os retratos da equipe ficam na moldura sem
filtro; "Dentistas com nome e CRO" só lista quem tem CRO, e a recepção vai em bloco próprio. Miniaturas
de 112px dos retratos (para pilhas de rostos) ficam em `src/assets/avatares` e são recortes dos originais.
Logos de convênio: `src/assets/convenios` (origem de cada arquivo no LEIA-ME da pasta).

## Seções da home (ordem e composição)

A ordem segue a pergunta de quem procura dentista, e cada uma ou duas seções devolvem para o WhatsApp.

1. **Topo** (`#inicio`, `home/TopoHome.tsx`) — selo da nota do Google, H1, frase com rua e bairro,
   WhatsApp + telefone, faixa de confiança (rostos e nº de dentistas com CRO, nº de convênios, horário de
   agora); foto real com dois cartões de vidro (depoimento real e responsável técnica).
2. **Convênios** (`#convenios`) — faixa rolante com as logos oficiais (ou o nome, sem arquivo) e o
   cartão "Sem convênio? Atendimento particular".
3. **Tratamentos** (`#tratamentos`) — grade de cartões com foto, frase e link para a página de cada um;
   "Também atendemos" em chips; CTA "a avaliação indica".
4. **A clínica** (`#clinica`) — foto com selos e os quatro princípios em cartões com ícone.
5. **Avaliações** (`#depoimentos`) — cartão da nota (Contador) e carrossel de depoimentos reais.
6. **Equipe** (`#equipe`) — responsável técnica em destaque, dentistas em cartões com CRO, recepção à
   parte.
7. **Como funciona** (`#como-funciona`) — três passos até a consulta.
8. **História** (`#historia`) — linha do tempo 2002 → 2020 → 2024 → hoje, missão, gestão e fundação.
9. **Estrutura** (`#estrutura`) — galeria em grade com visor; só a clínica por dentro.
10. **Atendimento** (`#atendimento`) — pilares em cartões e a fachada acessível.
11. **Perguntas** (`#faq`) — acordeão de cartões.
12. **Contato** (`#fale`) — o cupom que monta a mensagem do WhatsApp, onde estamos, mapa e a faixa verde
    de fechamento. Na home o rodapé entra sem a chamada própria (`<Footer chamada={false} />`).

## Landing pages pagas

`PaginaDeTratamento` com `modo="anuncio"`, `PaginaImplanteAds` e `PaginaClareamentoAds` seguem o mesmo
sistema, com o cabeçalho enxuto e a mesma lógica de conversão: topo no padrão do `TopoHome`, faixa de
convênios, por que fazer na JP, passos, animação ilustrativa (quando existe), equipe com CRO, avaliações,
perguntas que derrubam objeções e fechamento verde, com CTA a cada uma ou duas seções. Invariantes cobertas pelo E2E (`npm run e2e:site`) que **não podem
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
de `styles.css`); triagem e central de contato têm `triagem.css`, modo entrevista e ficha `entrevista.css`, e
o editor de vaga `editor-vaga.css`. Piso de 13px para qualquer texto do painel. Pares de aviso e erro aprovados:
`--rh-aviso-texto` sobre `--rh-aviso-fundo` 6,84:1; `--rh-erro-texto` sobre `--rh-erro-fundo` 8,63:1.

`/crc` tem tokens próprios e não é tocado por este sistema. Mudança de token global é conferida nos três.

## Manutenção

Mude este arquivo quando mudar uma **regra**. Medidas exatas, contagens e detalhes efêmeros pertencem ao
código e aos testes.
