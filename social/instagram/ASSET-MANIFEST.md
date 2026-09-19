# Inventário de imagens

> Auditoria de tudo o que existe em `src/assets/` — o que pode ir ao Instagram, o que não pode, e por quê.

Regenerar os derivados:

```bash
python social/instagram/source/scripts/preparar-fotos.py
```

---

## ⚠️ 1. Três achados que precisam de decisão da clínica

### 1.1 `capa-recepcao-1100.webp` e `capa-recepcao-1536.webp` — **não são a JP**

Estas duas imagens mostram uma recepcionista sorrindo ao telefone, num balcão com parede verde escrita "Seu sorriso é nossa prioridade" e "Pessoas que cuidam de pessoas". **Não é a recepção da JP** — a recepção real é o corredor de cadeiras verdes de `recepcao.webp`. É imagem de banco (ou gerada), e a pessoa da foto não trabalha na clínica.

**Decisão tomada neste kit: banidas.** Nenhuma peça as usa.

Publicá-las como se fossem a JP seria exatamente o que o §22 do briefing proíbe — e, pior, é o tipo de coisa que um paciente descobre ao entrar pela primeira vez.

> **Ação sugerida:** confirmar com a clínica se elas estão no site público hoje. Se estiverem sendo usadas como foto de recepção, é um problema de site, não só de Instagram.

### 1.2 A placa da fachada traz um WhatsApp diferente do de `src/lib/jp.ts`

| Onde                                   | Número                                               |
| -------------------------------------- | ---------------------------------------------------- |
| placa da fachada (foto `fachada.webp`) | telefone `3975-9902` ✅ · WhatsApp **`9 7169-4647`** |
| `src/lib/jp.ts` → `CLINICA.whatsapp`   | **`(11) 97616-5117`**                                |

O telefone bate. O WhatsApp **não**.

Publicar a placa inteira em tamanho legível é publicar dois números de contato na mesma conta: a pessoa salva o da foto, manda mensagem, e a clínica perde o lead sem nunca saber por quê.

**Decisão tomada neste kit:** todo recorte derivado da fachada para em `x = 638`, o que deixa de fora o bloco do WhatsApp e o @ do Instagram, e mantém o toldo, as especialidades, a marca, "Dra. Juliana Pelisser", o CRO da responsável técnica e o telefone correto.

> **Ação sugerida:** a clínica confirma qual número está em uso. Se for o do site, a placa precisa de correção; se for o da placa, `src/lib/jp.ts` precisa de correção. Enquanto os dois não baterem, este recorte fica.

### 1.3 Cinco retratos fictícios continuam no repositório

`public/images/equipe/` guarda cinco JPGs (`beatriz-lima`, `camila-rocha`, `felipe-nunes`, `mariana-costa`, `ricardo-almeida`) — os dentistas inventados que já saíram de `EQUIPE`, conforme o comentário em `src/lib/jp.ts`.

**Nunca use nenhum deles.** Não estão em peça alguma deste kit. Se ninguém mais os referencia, podem ser apagados do repositório.

---

## 2. Fotos reais, aprovadas para uso

### 2.1 Ambientes — resolução boa (usar à vontade)

| Arquivo                        | Medida    | O que é                        | Onde já é usado                       |
| ------------------------------ | --------- | ------------------------------ | ------------------------------------- |
| `fachada.webp`                 | 1150×1150 | fachada com a placa e o portão | base de todos os derivados de fachada |
| `consultorio-implantes-1.webp` | 1200×1500 | consultório, vertical          | S09, fundo 9:16 de implantes          |
| `consultorio-implantes-2.webp` | 1200×1500 | consultório, vertical          | S10, fundo 9:16                       |
| `consultorio-1.webp`           | 1400×1045 | consultório amplo              | S04 piloto, C08, AD10                 |
| `consultorio-2.webp`           | 1200×896  | consultório com TV e painel    | fundo 9:16 alternativo                |
| `consultorio-wide.webp`        | 1500×800  | consultório panorâmico         | disponível                            |
| `esterilizacao.webp`           | 1200×967  | sala de esterilização          | S05, C08, Destaque Clínica            |
| `equipamento.webp`             | 1200×967  | detalhe do equipo              | C08, fundo 9:16                       |

### 2.2 Ambientes — resolução baixa (665×480, ampliados 2×)

Estes sete só existem em 665×480, abaixo do 1080 que o Instagram pede. O preparo os amplia com Lanczos + máscara de nitidez para `-2x.webp` (1330×960).

| Arquivo                          | O que é                               | Como usar                                  |
| -------------------------------- | ------------------------------------- | ------------------------------------------ |
| `recepcao.webp`                  | corredor da recepção, cadeiras verdes | **em janela**, nunca sangrado              |
| `entrada-clinica.webp`           | portão visto de fora                  | janela                                     |
| `consultorio-janela.webp`        | consultório com luz natural           | janela                                     |
| `consultorio-bancada.webp`       | bancada e equipo                      | janela                                     |
| `consultorio-cadeira-lilas.webp` | cadeira lilás                         | janela                                     |
| `cantinho-cafe.webp`             | o cantinho do café                    | janela — é a foto mais simpática do acervo |
| `escritorio.webp`                | mesa da recepção/escritório           | janela                                     |

> **A regra:** ampliação de 2× aguenta uma janela de 1080×720. Não aguenta um fundo sangrado de 1080×1920. Onde eles aparecem full-bleed, a foto fica leitosa — e a resposta certa é o [`SHOT-LIST.md`](SHOT-LIST.md), não mais filtro.

### 2.3 Fotos com a moldura antiga — **preferir o original limpo**

Os arquivos terminados em `-completa.webp` (1080×1080) **não** são a versão em alta das anteriores: são a arte antiga, com a moldura verde em forma de maçã e o letreiro "NOSSA CLÍNICA!" / "RECEPÇÃO" / "CANTINHO DO CAFÉ" desenhado por cima.

`cantinho-cafe-completa` · `consultorio-bancada-completa` · `consultorio-cadeira-lilas-completa` · `consultorio-janela-completa` · `entrada-clinica-completa` · `escritorio-completa` · `recepcao-completa` · `sala-espera-ortodontia-completa` · `fachada-letreiro.webp`

**Nenhuma entra no kit.** Moldura de 2019 num feed de 2026 é exatamente o que esta reformulação existe para tirar do ar.

### 2.4 Uma foto com ressalva

`sala-espera-ortodontia.webp` — a sala tem um banner de aparelhos ortodônticos com **rostos de terceiros** impressos. Não use enquadrada de forma que os rostos apareçam legíveis: são pessoas que não autorizaram nada à JP.

---

## 3. Retratos da equipe

Oito retratos reais, todos enviados pela clínica.

| Arquivo                  | Pessoa                                       | Medida  | Fundo            | Tratamento                      |
| ------------------------ | -------------------------------------------- | ------- | ---------------- | ------------------------------- |
| `ana-beatriz.webp`       | Dra. Ana Beatriz — CROSP 177.801             | 600×728 | transparente     | silhueta sobre a forma de marca |
| `matheus-fraga.webp`     | Dr. Matheus Fraga — CROSP 168.512            | 600×728 | transparente     | silhueta                        |
| `hugo-leonardo.webp`     | Dr. Hugo Leonardo — CROSP 75.157             | 600×728 | transparente     | silhueta                        |
| `sabrina-vamszer.webp`   | Dra. Sabrina Vamszer Flaquer — CROSP 162.394 | 600×728 | transparente     | silhueta                        |
| `juliana-pelisser.webp`  | Dra. Juliana Pelisser Barbosa — CROSP 75.159 | 560×683 | **branco opaco** | moldura reta                    |
| `jeferson-barbosa.webp`  | Jeferson Barbosa — Gestor e fundador         | 318×336 | **cinza opaco**  | moldura reta                    |

**Por que dois recebem moldura reta.** A silhueta só funciona com PNG vazado. Forçar recorte em foto de fundo opaco inventaria um contorno que a foto não tem — e recorte mal feito em retrato de pessoa real é pior do que moldura honesta.

**Quem não é do conselho não tem campo de registro, e isso é regra, não esquecimento.** CRO é dado regulado pela Resolução CFO 196/2019; atribuí-lo a quem não é do conselho seria afirmação falsa sobre uma pessoa que existe.

> Pendência cosmética anotada em `src/lib/jp.ts`: falta o sobrenome da Dra. Ana Beatriz. O registro do Dr. Hugo Leonardo (75.157), a dois dígitos do da Dra. Juliana (75.159), foi reconfirmado pela clínica em 15/09/2026.

---

## 4. Derivados gerados

Todos em `source/assets-derivados/`, produzidos por `preparar-fotos.py`. Nenhum sobrescreve o original.

| Arquivo                                | Medida    | Origem e recorte                                                 |
| -------------------------------------- | --------- | ---------------------------------------------------------------- |
| `fundo-fachada-9x16.webp`              | 1080×1920 | `fachada` (26,62)–(638,1150) — metade esquerda da placa + portão |
| `fachada-placa-4x5.webp`               | 1080×1350 | `fachada` (26,62)–(638,827)                                      |
| `fachada-faixa.webp`                   | 1080×600  | `fachada` (26,188)–(638,528) — a faixa do toldo e da marca       |
| `fachada-entrada-1x1.webp`             | 1080×1080 | `fachada` (26,330)–(638,942)                                     |
| `fachada-portao-9x16.webp`             | 1080×1606 | só o portão, sem texto                                           |
| `recepcao-2x.webp` e outros seis `-2x` | 1330×960  | ampliação 2× com Lanczos + nitidez                               |
| `fundo-implantes-9x16.webp`            | 1080×1920 | `consultorio-implantes-1`, recorte central, −10% de brilho       |
| `fundo-implantes-b-9x16.webp`          | 1080×1920 | `consultorio-implantes-2`                                        |
| `fundo-consultorio-9x16.webp`          | 1080×1920 | `consultorio-1`                                                  |
| `fundo-consultorio-b-9x16.webp`        | 1080×1920 | `consultorio-2`                                                  |
| `fundo-esterilizacao-9x16.webp`        | 1080×1920 | `esterilizacao`                                                  |
| `fundo-equipamento-9x16.webp`          | 1080×1920 | `equipamento`                                                    |

O escurecimento de 10% e a dessaturação de 8% dos fundos não são filtro de estilo: são o que faz o branco do texto passar de ~3:1 para acima de 7:1 sobre a parede clara de um consultório.

---

## 5. Marca

| Arquivo                               | Uso                                    |
| ------------------------------------- | -------------------------------------- |
| `src/assets/marca/marca-jp.svg`       | símbolo para pousar em fundo **claro** |
| `src/assets/marca/marca-jp-claro.svg` | símbolo para fundo **escuro**          |
| `src/assets/marca/logo-jp.svg`        | lockup para fundo claro                |
| `src/assets/marca/logo-jp-claro.svg`  | lockup para fundo escuro               |

A semântica é a de `src/components/site/Logo.tsx`: o nome da variante descreve **a superfície**, não a arte. O sistema escolhe sozinho pela classe de superfície da peça.

O vão do sorriso é **furo**, não retângulo branco — as artes usam `fill-rule="evenodd"`. Por isso a marca pousa em qualquer cor sem arrastar fundo, e por isso **não se acrescenta disco ou moldura** a ela.

---

## 6. Vídeos existentes — não reaproveitados

`src/assets/video-*.mp4` (oito arquivos, 600×600, 10–15 s). Ficaram de fora por dois motivos:

1. **600×600** num Reel de 1080×1920 é ampliação de 1,8× em movimento — visível;
2. **procedência não documentada** no repositório. Se forem licenciados de banco, a licença precisa cobrir mídia paga antes de virarem anúncio.

> **Ação sugerida:** confirmar a origem e a licença. Se forem da clínica e existir o original em resolução maior, eles viram B-roll excelente.

---

## 7. O que falta — prioridade de nova sessão

| Prioridade | O que                                         | Por quê                                      |
| ---------- | --------------------------------------------- | -------------------------------------------- |
| **1**      | recepção em alta, vertical e horizontal       | a foto mais usada do kit está em 665×480     |
| **1**      | retrato + fala de cada dentista, vertical     | destrava 8 dos 16 Reels na versão com gente  |
| **2**      | fachada em plano aberto, com pessoas entrando | a única foto de fachada é estática e frontal |
| **2**      | sala de espera e cantinho do café em alta     | conteúdo de acolhimento                      |
| **3**      | 40 clipes de B-roll vertical, 3–6 s           | abastece um mês de Stories e Reels           |
| **3**      | detalhes de esterilização em macro            | é o conteúdo que mais transmite seriedade    |

O roteiro completo da sessão está em [`SHOT-LIST.md`](SHOT-LIST.md).
