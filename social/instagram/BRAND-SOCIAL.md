# Sistema visual social — JP

> A extensão do `DESIGN.md` para o Instagram. Onde este documento e o `DESIGN.md` discordarem sobre marca, o `DESIGN.md` vence. Onde ele e o `src/styles.css` discordarem sobre um valor, o CSS vence.

A fonte executável deste documento é [`source/templates/sistema.css`](source/templates/sistema.css). Cada token lá tem, ao lado, a razão de existir.

---

## 1. A ideia que organiza tudo

> **Uma peça = uma ideia = uma ação.**

Se a peça funciona removendo um elemento, o elemento sai. Toda peça responde quatro perguntas antes de existir:

1. o que a pessoa percebe primeiro?
2. o que ela entende em 2 segundos?
3. qual é a única ação desejada?
4. isto parece a JP, ou poderia ser qualquer clínica?

A quarta é a que mais reprova peça bonita.

---

## 2. Paleta

| Papel          | Token        | Valor     | Uso                                                                                               |
| -------------- | ------------ | --------- | ------------------------------------------------------------------------------------------------- |
| verde escuro   | `--forest`   | `#095902` | texto forte em fundo claro, ícone, marca                                                          |
| verde vivo     | `--lime`     | `#56A805` | **só preenchimento** — forma, ponto do chip, detalhe de ícone, palavra de destaque acima de 64 px |
| verde profundo | `--deep`     | `#032F01` | superfície escura                                                                                 |
| creme          | `--cream`    | `#F7F8F2` | fundo padrão                                                                                      |
| papel          | `--paper`    | `#FCFDF9` | cartão sobre o creme                                                                              |
| menta          | `--mint`     | `#EBF5E1` | chip, selo, forma do retrato                                                                      |
| tinta          | `--ink`      | `#172018` | texto de item de lista                                                                            |
| tinta suave    | `--ink-soft` | `#5A6B5C` | corpo e apoio — 5,33:1 no creme                                                                   |
| borda          | `--border`   | `#DCE4D6` | filete do rodapé, moldura de coluna                                                               |

### As três regras de contraste que o sistema aplica sozinho

1. **`#56A805` nunca é texto corrente em fundo claro.** Mede 2,81:1 sobre o creme e reprova até como texto grande, que exige 3:1. Ele é forma.
2. **O par que funciona no escuro é `--lime` sobre `--deep`** (4,96:1). Sobre `--forest` ele cai para 2,87:1 e reprova — por isso as superfícies escuras do kit são `#032F01`, e não o verde da marca.
3. **Texto sobre foto nunca depende do pixel de trás.** Toda peça com texto sobre imagem carrega um degradê de `--deep` cuja opacidade na faixa do texto fica acima de 0,7.

### Superfícies

| Classe     | Fundo          | Quando                                                 |
| ---------- | -------------- | ------------------------------------------------------ |
| `s-creme`  | creme          | o padrão                                               |
| `s-papel`  | papel          | cartão, coluna de comparativo                          |
| `s-menta`  | menta          | peça leve, odontopediatria                             |
| `s-escura` | verde profundo | implantes, prova social, o card de CTA de um carrossel |

Implantes e reabilitação pedem a superfície escura. Não é estética: é o tom do assunto. Procedimento invasivo, ticket alto, decisão pensada — o creme alegre lê como promoção.

---

## 3. Tipografia

| Papel         | Fonte   | Peso | Ajuste                                               |
| ------------- | ------- | ---- | ---------------------------------------------------- |
| headline      | Manrope | 800  | `letter-spacing: -0.022em`, `line-height: 0.98–1.06` |
| corpo         | Inter   | 450  | `line-height: 1.45`                                  |
| chip          | Inter   | 700  | `letter-spacing: 0.16em`, caixa alta                 |
| número grande | Manrope | 800  | `letter-spacing: -0.045em`                           |

### Escala de headline

| Classe | Tamanho | Para                             |
| ------ | ------- | -------------------------------- |
| `h-xg` | 124 px  | 2–3 palavras                     |
| `h-g`  | 100 px  | 3–5 palavras                     |
| `h-m`  | 82 px   | 5–8 palavras                     |
| `h-p`  | 66 px   | 8–12 palavras                    |
| `h-pp` | 54 px   | 12+ — e aqui já é hora de cortar |

**Headline que precisa de quatro linhas num feed já é legenda.** Devolva para a legenda.

Piso de texto: nada abaixo de 25 px numa peça de 1080. É o equivalente aos 12 px que o site define como chão de leitura.

---

## 4. O rodapé de marca

Aparece em **100% das peças estáticas**, sempre igual:

```text
[símbolo]  @jpclinicaodontologica  ·············  Freguesia do Ó · São Paulo
────────────────────────────────────────────────────────────────────────────
```

É ele, mais do que a cor, que faz trinta peças diferentes parecerem de uma clínica só. Não remova para "limpar" a peça: uma peça sem assinatura viaja no print de alguém e chega em outro perfil sem dono.

Nos vídeos, a assinatura fica fixa no canto inferior esquerdo **em todas as cenas** — Reel é consumido em rolagem, e quem entra no meio precisa saber de quem é aquilo sem esperar o card final.

---

## 5. A única forma de marca: o arco

O símbolo da JP tem uma curva de sorriso. O sistema deriva dela **um** elemento estrutural: um arco raso no topo das janelas de foto (`border-radius: 999px 999px 34px 34px`).

Usado com parcimônia: janela de foto em peça institucional, capa de Destaque, retrato de equipe. **Não** em peça de implante (ali a foto é reta, sóbria) e **não** duas vezes na mesma peça.

Nada além disso. Sem padrão de fundo, sem textura, sem carimbo, sem marca d'água.

---

## 6. Fotografia

**Sem filtro.** O sistema acrescenta duas coisas e só: o recorte e, quando há texto por cima, o degradê de contraste.

O que a JP mostra:

- ambiente real, com a luz que ele tem;
- pessoas da equipe, em retrato recortado sobre a forma de marca;
- estrutura — inclusive a esterilização, que é o que ninguém mostra e o que mais transmite seriedade.

O que a JP **não** mostra:

- imagem de banco que finja ser o interior da clínica;
- pessoa gerada por IA como se fosse da equipe;
- boca aberta em close, sangue, cirurgia;
- antes e depois;
- jaleco estourado, luz clínica lavada, sorriso artificial.

O inventário completo, com o que pode e o que não pode, está em [`ASSET-MANIFEST.md`](ASSET-MANIFEST.md).

---

## 7. Movimento

Traduzido em números, que é a única forma de uma regra de motion sobreviver a trinta cenas:

| Parâmetro                  | Valor                                             |
| -------------------------- | ------------------------------------------------- |
| entrada de texto           | 460 ms, sobe 26 px, opacidade 0→1, `easeOutCubic` |
| saída de texto             | 300 ms, sobe 14 px, `easeInCubic`                 |
| escalonamento entre linhas | 130 ms                                            |
| zoom de foto               | 8% ao longo da cena, direção alternada            |
| corte entre cenas          | 260 ms de dissolução                              |

Nenhuma curva é linear: movimento linear é o que faz um Reel parecer apresentação de slides.

Proibido: glitch, neon, explosão, letra pulando, zoom que "estoura", transição com giro, contagem regressiva piscando.

---

## 8. Os templates

### Feed — 1080×1350

| Template          | Para                                               |
| ----------------- | -------------------------------------------------- |
| `feed-brand`      | frase institucional, sem foto                      |
| `feed-quote`      | citação grande com aspa                            |
| `feed-photo-copy` | foto em janela com arco + frase                    |
| `feed-treatment`  | foto sangrada + headline sobre degradê (implantes) |
| `feed-proof`      | nota do Google                                     |
| `feed-team`       | retrato recortado + nome, função e CRO             |
| `feed-local`      | localidade, endereço e horário                     |

### Carrossel — 1080×1350

`carousel-cover` · `carousel-body` · `carousel-checklist` · `carousel-comparison` · `carousel-cta`

A capa carrega o peso: 80% de quem vê o carrossel vê só o slide 1. A paginação (`3/7`) no canto superior direito é o que segura o deslize — ela diz que existe um fim.

### Story / Reel — 1080×1920

`story-texto` · `story-foto` · `story-janela` · `story-prova` · `story-equipe`
`reel-cover-tratamento` · `reel-cover-tipografica` · `reel-cover-rosto`
`highlight-cover`

### Anúncio

`ad-estatico` — mesma linguagem, **sem elemento de interface orgânica**. Nada de "salve", "arraste", "link na bio": em anúncio isso é ruído, e em alguns formatos é motivo de reprovação.

O desligamento é por campo, não por disciplina: `anuncio: true` no manifest suprime os elementos orgânicos que o template injetaria, e `conferir.mjs` cobra esse campo em toda peça que exporta para `exports/ads/`.

### De onde vem cada nome

O briefing pediu uma lista de templates com nomes próprios. Alguns viraram um template com parâmetro, em vez de dois arquivos quase iguais — a tabela abaixo diz onde cada um foi parar.

| Nome no briefing (§37)                      | Onde está no kit                                          |
| ------------------------------------------- | --------------------------------------------------------- |
| `feed-photo-copy` … `feed-brand` (7)        | os sete, com o mesmo nome                                 |
| `carousel-cover` … `carousel-cta` (5)       | os cinco, com o mesmo nome                                |
| `story-question`                            | `story-texto` + campo `adesivo` → template **ST03**       |
| `story-poll`                                | `story-texto` + `adesivo` → **ST04**                      |
| `story-proof`                               | `story-prova` → **ST07**                                  |
| `story-photo`                               | `story-foto` e `story-janela` → **ST02, ST09, ST11**      |
| `story-cta`                                 | `story-texto` + `cta` → **ST12**                          |
| `story-treatment`                           | `story-texto` → **ST08**                                  |
| `story-team`                                | `story-equipe` → **ST06, ST10**                           |
| `reel-cover-face`                           | `reel-cover-rosto`                                        |
| `reel-cover-treatment`                      | `reel-cover-tratamento`                                   |
| `reel-cover-clinic`                         | `reel-cover-tratamento` com foto de ambiente (capa R11)   |
| `highlight-cover`                           | mesmo nome                                                |
| `ad-video-overlay`                          | o motor de vídeo (`source/templates/video.html`)          |
| `ad-static-treatment` / `-proof` / `-local` | `ad-estatico` — um template, três usos (AD07, AD09, AD08) |

**Por que menos arquivos.** Três templates que diferem só na foto e no chip não são três templates: são um, e mantê-los separados significa corrigir a espessura do filete do rodapé em três lugares — e esquecer o terceiro.

---

## 9. Capas de Destaque

Um traço só — 3,2 num viewBox de 64 —, mesmas terminações arredondadas, mesma escala óptica, e exatamente **um** detalhe preenchido em `--lime` por ícone.

A regra existe porque capa de Destaque é vista **em fila, a 60 px de diâmetro**. Qualquer variação de peso entre vizinhas lê como "foram feitas por pessoas diferentes" — que é o oposto do que um Destaque comunica.

Não misture: foto numa capa, emoji em outra, outline numa terceira. Onze das doze capas são ícone; a décima segunda é o numeral "24", e essa é a única exceção deliberada.

---

## 10. Como o feed respira

Não existe puzzle. Cada post funciona sozinho. Mas o conjunto precisa alternar:

- rosto → ambiente → peça tipográfica → tratamento → prova → capa de Reel;
- nunca três peças escuras seguidas;
- nunca três cards tipográficos seguidos;
- nunca duas fotos do mesmo ambiente na mesma trinca.

A prévia que mostra isso é `exports/grid/jp_ig_grid_como_fica_no_perfil.png` — e ela é montada **na ordem invertida**, porque o Instagram mostra o mais novo primeiro. Planejar o xadrez na ordem de publicação produz exatamente o desenho espelhado do que se planejou.

---

## 11. O que este sistema recusa

- estética "Canva genérico";
- serifa de luxo, dourado, preto + dourado;
- gradiente decorativo, brilho, holografia, neon;
- excesso de ícones de dente (o sistema usa um, e ele é a marca);
- sombra pesada, 3D aleatório, mockup irreal;
- feed em puzzle;
- microtexto;
- oito fontes numa peça;
- doze elementos disputando atenção.
