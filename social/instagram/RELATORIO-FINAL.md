# Relatório final

> Reformulação do Instagram da JP Clínica Odontológica — o que foi construído, onde está, o que já dá para publicar e o que ainda depende de gente.

---

## 1. O que foi criado

**294 arquivos finais** — 260 imagens e 34 vídeos — mais o sistema que os gera.

| Entregável                                    | Quantidade                                 | Estado                   |
| --------------------------------------------- | ------------------------------------------ | ------------------------ |
| **Reels em vídeo** (1080×1920, H.264, ~21 s)  | **16**                                     | ✅ prontos para publicar |
| **Anúncios em vídeo** (6 conceitos × 3 hooks) | **18**                                     | ✅ prontos               |
| **Legendas `.srt`**                           | 34                                         | ✅ uma por vídeo         |
| **Capas de Reel**                             | 18 (16 + 2 com rosto real)                 | ✅                       |
| **Capas de Destaque**                         | 12                                         | ✅                       |
| **Cartões dentro dos Destaques**              | **95**                                     | ✅                       |
| **Slides de carrossel**                       | 75 (8 do ciclo + 2 fixados + 2 de anúncio) | ✅                       |
| **Posts estáticos de feed**                   | 12                                         | ✅                       |
| **Cards de equipe**                           | 8 (um por pessoa real)                     | ✅                       |
| **Templates de Story**                        | 16, renderizados preenchidos               | ✅                       |
| **Estáticos de anúncio**                      | 4                                          | ✅                       |
| **Prévias de avatar**                         | 4                                          | ✅                       |
| **Prévias de grid**                           | 3                                          | ✅                       |
| **Documentos operacionais**                   | 17 na raiz + 8 gerados em `content/`       | ✅                       |
| **Scripts do sistema**                        | 8                                          | ✅                       |

**O que não é arquivo, mas é a entrega principal:** um sistema em que trocar uma headline num JSON e rodar um comando produz a peça nova — e em que **nenhum número é digitado numa arte**.

---

## 2. Onde está cada coisa

```text
social/instagram/
├── README.md                 como operar o kit
├── PROFILE.md                bio, nome, avatar, Destaques
├── BRAND-SOCIAL.md           o sistema visual
├── ASSET-MANIFEST.md         o que pode e o que não pode usar  ⚠️ leia
├── CONTENT-STRATEGY.md       pilares, públicos, cadência
├── CALENDAR-30D.md           30 dias, dia a dia
├── CAPTIONS.md               legendas prontas
├── HASHTAGS-LOCAL.md         hashtags e SEO social
├── SHOT-LIST.md              a sessão de foto/vídeo
├── PAID-MEDIA.md             Meta Ads: UTM, campanha, copy
├── CREATIVE-TEST-MATRIX.md   como testar criativo
├── INSTAGRAM-CLEANUP.md      o que fazer com o conteúdo antigo
├── HOOKS-50.md               50 ganchos
├── IDEIAS-50.md              50 ideias evergreen
├── CTAS.md                   CTAs por intenção
├── QA.md                     conferência antes de publicar
├── RELATORIO-FINAL.md        este documento
│
├── ENTREGA/                  as 257 imagens em pastas numeradas, para zipar (gerada)
├── content/                  roteiros e textos em formato de leitura (gerados)
├── exports/                  os 294 arquivos finais
└── source/
    ├── dados-jp.json         derivado de src/lib/jp.ts
    ├── manifests/  (30)      o conteúdo de cada peça estática
    ├── roteiros/   (34)      o conteúdo de cada vídeo
    ├── templates/            o sistema visual executável
    ├── assets-derivados/     18 recortes e ampliações das fotos reais
    └── scripts/    (8)       os geradores
```

### Os exports, por pasta

| Pasta                      | Conteúdo                                                |
| -------------------------- | ------------------------------------------------------- |
| `exports/reels/`           | 16 MP4 + 16 `.srt`                                      |
| `exports/ads/`             | 18 MP4 + 18 `.srt` + 4 estáticos + 2 carrosséis         |
| `exports/reel-covers/`     | 18 capas                                                |
| `exports/highlights/`      | 12 capas + 10 subpastas com 95 cartões                  |
| `exports/carousel/`        | 10 subpastas, 75 slides                                 |
| `exports/feed/`            | 12 estáticos + 8 cards de equipe                        |
| `exports/story/templates/` | 16 templates                                            |
| `exports/avatar/`          | 4 prévias                                               |
| `exports/grid/`            | 3 prévias do perfil                                     |
| `exports/piloto/`          | 3 peças-piloto da Etapa B (conferência, não publicação) |

---

## 3. O que já está 100% publicável

**Tudo em `exports/`.** Nenhuma peça depende de gravação nova.

Concretamente, isto já pode ir ao ar hoje:

- o perfil inteiro: nome, bio, avatar, categoria, endereço, links;
- os **12 Destaques com os 95 cartões dentro**;
- os **3 posts fixados**;
- **21 publicações de feed** para os primeiros 30 dias;
- **16 Reels** em vídeo;
- os **16 templates de Story**, preenchidos;
- a **campanha inicial de Meta Ads** completa: 18 vídeos, 4 estáticos, 2 carrosséis, copies, headlines e tabela de UTM.

---

## 4. O que depende de gravação humana

Nada está bloqueado — mas três coisas ficam **melhores** com gente na frente da câmera:

| O que                            | Por quê                                       | Onde está o roteiro                                                                  |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| **A versão falada dos Reels**    | rosto retém mais que texto                    | [`SHOT-LIST.md`](SHOT-LIST.md) §8 — a fala de cada profissional, palavra por palavra |
| **Recepção em alta resolução**   | a foto mais usada do kit só existe em 665×480 | [`SHOT-LIST.md`](SHOT-LIST.md) §4 — prioridade máxima                                |
| **40 clipes de B-roll vertical** | abastece Stories e cobre cortes de fala       | [`SHOT-LIST.md`](SHOT-LIST.md) §9                                                    |

As duas capas de Reel com rosto real (`*_cover_rosto_alt_*`) já estão renderizadas, esperando a versão gravada.

---

## 5. Os 12 posts que devem sair primeiro

Nesta ordem de publicação. A prévia de como fica no perfil está em `exports/grid/jp_ig_grid_como_fica_no_perfil.png`.

| #   | Peça                              | Arquivo                                                  |
| --- | --------------------------------- | -------------------------------------------------------- |
| 1   | Reel — Implante dói?              | `exports/reels/jp_ig_reel_r01_implante_doi_v01.mp4`      |
| 2   | Foto real da recepção             | `exports/feed/jp_ig_feed_s04_recepcao_v01.png`           |
| 3   | Sorrir muda tudo.                 | `exports/feed/jp_ig_feed_s01_sorrir_muda_tudo_v01.png`   |
| 4   | Implantes dentários               | `exports/feed/jp_ig_feed_s09_implantes_v01.png`          |
| 5   | Dra. Ana Beatriz (equipe)         | `exports/feed/jp_ig_feed_s06_atendimento_humano_v01.png` |
| 6   | 4,6 no Google                     | `exports/feed/jp_ig_feed_s03_google_v01.png`             |
| 7   | Reel — Dentadura é a única opção? | `exports/reels/jp_ig_reel_r02_dentadura_opcoes_v01.mp4`  |
| 8   | 24 anos. Hoje, na Freguesia do Ó  | `exports/feed/jp_ig_feed_s08_freguesia_v01.png`          |
| 9   | Reel — Precisa de enxerto?        | `exports/reels/jp_ig_reel_r03_enxerto_v01.mp4`           |
| 10  | 24 anos cuidando de sorrisos      | `exports/feed/jp_ig_feed_s02_24_anos_v01.png`            |
| 11  | A sala que ninguém mostra         | `exports/feed/jp_ig_feed_s05_estrutura_v01.png`          |
| 12  | Reel — Conheça a JP por dentro    | `exports/reels/jp_ig_reel_r11_conheca_a_jp_v01.mp4`      |

A alternância foi montada para que nenhuma trinca do grid fique com três peças da mesma superfície.

---

## 6. Os 6 criativos que entram primeiro no Meta Ads

| #   | Criativo                      | `utm_content` | Por quê                           |
| --- | ----------------------------- | ------------- | --------------------------------- |
| 1   | `jp_ig_ad_ad01_hooka_v01.mp4` | `ad01_hooka`  | a objeção nº 1, pergunta direta   |
| 2   | `jp_ig_ad_ad01_hookc_v01.mp4` | `ad01_hookc`  | a mesma, com o bairro no gancho   |
| 3   | `jp_ig_ad_ad05_hooka_v01.mp4` | `ad05_hooka`  | local + intenção                  |
| 4   | `jp_ig_ad_ad05_hookb_v01.mp4` | `ad05_hookb`  | local, formulado como busca       |
| 5   | `jp_ig_ad_ad03_hooka_v01.mp4` | `ad03_hooka`  | a objeção do enxerto              |
| 6   | `jp_ig_ad_ad04_hooka_v01.mp4` | `ad04_hooka`  | confiança, para quem nunca entrou |

Dois conjuntos de anúncio, não seis. Destino: `/implante-dentario`. Conversão primária: `generate_lead`. Detalhes em [`PAID-MEDIA.md`](PAID-MEDIA.md).

---

## 7. Os Destaques que devem subir primeiro

| #   | Destaque         | Cartões |
| --- | ---------------- | ------- |
| 1   | **Implantes**    | 14      |
| 2   | **A clínica**    | 10      |
| 3   | **Avaliações**   | 8       |
| 4   | **Equipe**       | 10      |
| 5   | **Onde estamos** | 6       |

Os outros sete entram na sequência. O Instagram mostra ~5 sem rolagem — a ordem é decisão comercial, e esta prioriza o produto de aquisição e a redução de incerteza.

---

## 8. A bio recomendada

```text
Odontologia para todas as fases da vida.
24 anos de história • Hoje na Freguesia do Ó
Implantes, próteses, ortodontia e odontopediatria
↓ Agende sua avaliação
```

E o campo Nome:

```text
JP Clínica | Dentista Freguesia do Ó
```

As três versões de bio e o raciocínio de cada uma estão em [`PROFILE.md`](PROFILE.md).

> **A frase que não pode ser escrita:** "24 anos na Freguesia do Ó". A clínica foi fundada em 2002 **em Pirituba** e mudou para a Vila Bruna em 2024. A formulação correta separa as duas coisas. Há uma checagem automática que barra isso.

---

## 9. Ativos antigos inadequados

| Ativo                                                     | Problema                                                                                          | Decisão                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `capa-recepcao-1100.webp` e `-1536.webp`                  | **não é a recepção da JP** — é banco de imagem, com uma recepcionista que não trabalha na clínica | banidos do kit; conferir se estão no site   |
| Nove arquivos `*-completa.webp` e `fachada-letreiro.webp` | arte de 2019, com moldura verde em forma de maçã e letreiro "NOSSA CLÍNICA!"                      | não entram                                  |
| `public/images/equipe/*.jpg` (5 arquivos)                 | retratos de dentistas fictícios que já saíram de `EQUIPE`                                         | nunca usar; podem ser apagados              |
| `sala-espera-ortodontia.webp`                             | banner com rostos de terceiros ao fundo                                                           | usar só com enquadramento que não os mostre |
| `src/assets/video-*.mp4` (8 arquivos)                     | 600×600 e procedência não documentada                                                             | fora do kit até a licença ser confirmada    |

Critérios para revisar o que já está publicado no perfil: [`INSTAGRAM-CLEANUP.md`](INSTAGRAM-CLEANUP.md).

---

## 10. Dados que precisam de revisão

### ⚠️ Pendência que exige decisão da clínica

**A placa da fachada traz um WhatsApp diferente do de `src/lib/jp.ts`.**

| Onde             | Telefone            | WhatsApp              |
| ---------------- | ------------------- | --------------------- |
| placa da fachada | `3975-9902` ✅      | **`9 7169-4647`**     |
| `src/lib/jp.ts`  | `(11) 3975-9902` ✅ | **`(11) 97616-5117`** |

Enquanto os dois não baterem, todo recorte de fachada deste kit para em `x = 638`, o que deixa o bloco do WhatsApp fora de qualquer peça. **A clínica precisa dizer qual número está em uso** — se for o do site, a placa precisa de correção; se for o da placa, `src/lib/jp.ts` precisa de correção.

### Revisão periódica

| Dado                          | Valor atual  | Quando revisar                                                 |
| ----------------------------- | ------------ | -------------------------------------------------------------- |
| nota do Google                | 4,6          | trimestral                                                     |
| total de avaliações           | 192          | trimestral                                                     |
| anos de história              | 24           | **17/08/2027** → 25                                            |
| CRO do Dr. Hugo Leonardo      | CROSP 75.157 | vale reconferir: fica a dois dígitos do 75.159 da Dra. Juliana |
| sobrenome da Dra. Ana Beatriz | ausente      | quando a clínica informar                                      |

### Divergência já conhecida e documentada

O Perfil da Empresa no Google diz "Há 25 anos"; `src/lib/jp.ts` diz 24, confirmado pela clínica em 11/09/2026. **O perfil do Google é que está desatualizado.** Enquanto os dois não baterem, a divergência reaparece a cada pessoa que comparar.

---

## 11. Como gerar peças novas

```bash
# 1. sincronizar com src/lib/jp.ts (sempre que a clínica mudar um dado)
node social/instagram/source/scripts/extrair-dados.mjs

# 2. preparar recortes de foto (só quando entrar foto nova em src/assets/)
python social/instagram/source/scripts/preparar-fotos.py

# 3. renderizar imagens — tudo, ou só um grupo
node social/instagram/source/scripts/renderizar.mjs
node social/instagram/source/scripts/renderizar.mjs 60-estaticos
node social/instagram/source/scripts/renderizar.mjs 45-reel --qa   # com guias

# 4. renderizar vídeos
node social/instagram/source/scripts/gerar-videos.mjs
node social/instagram/source/scripts/gerar-videos.mjs R01 --previa  # teste rápido

# 5. montar a prévia do grid
python social/instagram/source/scripts/montar-grid.py

# 5b. montar a pasta de imagens para enviar (ENTREGA/, pronta para zipar)
node social/instagram/source/scripts/montar-entrega.mjs

# 6. regerar os documentos de leitura
node social/instagram/source/scripts/gerar-docs.mjs

# 7. conferir antes de publicar
node social/instagram/source/scripts/conferir.mjs
```

Para criar uma peça: copie a mais parecida no manifest, troque `arquivo`, `headline`, `corpo` e `foto`, rode o passo 3. O texto se encaixa sozinho.

---

## 12. Desempenho do sistema

| Operação             | Tempo   |
| -------------------- | ------- |
| 260 imagens, do zero | ~55 s   |
| um grupo de 12 peças | ~3 s    |
| um Reel de 21 s      | ~40 s   |
| os 34 vídeos         | ~22 min |
| conferência completa | < 2 s   |

---

## 12b. Defeitos encontrados na revisão — e corrigidos

A varredura final achou três coisas. Duas eram falso positivo do próprio verificador; uma era real e teria ido ao ar.

| O que                                                           | Como apareceu                                                                                                               | Correção                                                                                                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Arraste para ver" nas capas dos dois carrosséis de anúncio** | a frase nascia dentro do template `carousel-cover`, não em manifest nenhum — por isso passou por uma revisão visual inteira | o template só injeta o elemento quando o manifest não declara `anuncio: true`; `conferir.mjs` ganhou uma checagem que cobra o campo em toda peça que exporta para `exports/ads/` |
| **Chip "SEM DOR TAMBÉM CONTA"** (carrossel C06)                 | a intenção era o contrário de promessa, mas a expressão recortada num print vira a promessa vedada                          | virou "QUANDO NADA DÓI"                                                                                                                                                          |
| **Duas capas de Reel com `_ALT_` em caixa alta**                | violavam a própria regra de nomenclatura do kit                                                                             | renomeadas para `_alt_`                                                                                                                                                          |

O verificador também acusou `capa-recepcao` e `promoção` dentro do campo `descricao` de dois manifests — texto de documentação que existe justamente para dizer "aqui isso não se usa". A checagem passou a olhar só o que vira pixel.

---

## 13. Limitações encontradas

**1. Resolução do acervo.** Sete ambientes reais da clínica só existem em 665×480. Eles são usados em janela (onde a ampliação de 2× aguenta) e evitados em fundo sangrado. É a limitação mais visível do kit, e a única resposta correta é o [`SHOT-LIST.md`](SHOT-LIST.md) — não mais filtro.

**2. Nenhuma imagem de pessoa falando.** Os 16 Reels são motion + texto. Funcionam, e são a metade do conteúdo que não depende de agenda. A outra metade depende, e está roteirizada palavra por palavra.

**3. Sem trilha sonora.** Os MP4 saem mudos de propósito: trilha licenciada não pode ser embutida num arquivo que a clínica distribui. O áudio deve ser escolhido dentro do Instagram, onde a licença é da plataforma. Os arquivos de anúncio levam uma faixa AAC silenciosa por compatibilidade com o player do Gerenciador.

**4. A placa da fachada.** Ver §10. Resolvido por recorte, mas é uma pendência da clínica, não do kit.

**5. Nenhuma especialidade em implantodontia documentada.** Nenhum profissional em `src/lib/jp.ts` traz essa titulação. Por isso **nenhuma peça diz "especialista em implantes"** — o kit anuncia o procedimento e o método. Se a titulação existir e for comprovável, ela abre um ângulo de copy que hoje está fechado, e vale documentar no repositório.

**6. Nenhum antes/depois.** Decisão deliberada, não limitação técnica: antes/depois em nome da pessoa jurídica é vedado.

**7. As legendas `.srt` são derivadas do texto de tela.** Se a versão falada for gravada com outras palavras, o `.srt` precisa ser refeito a partir do áudio real.

---

## 14. O que mudou no repositório fora de `social/`

**Um arquivo, de uma linha.** Nenhum código, nenhum componente, nenhum ativo do site foi tocado. O kit **lê** `src/lib/jp.ts`, `src/styles.css`, `src/assets/` e `src/assets/marca/` — e só lê.

A exceção, declarada aqui porque o §60 do briefing pede:

```diff
  .prettierignore
+ social/instagram/content

  .gitignore
+ social/instagram/ENTREGA/
```

**Por quê.** `social/instagram/content/*.md` é gerado por `gerar-docs.mjs`, que monta tabelas a partir dos manifests. O Prettier alinha coluna de tabela por largura de célula: cada execução do gerador desformata o arquivo, e cada `npm run format` o formata de volta — dois diffs enormes por rodada, num arquivo que ninguém edita à mão. É o mesmo princípio das entradas que já estavam lá (`apresentacao`, `public/crc-tour`, `.agents/skills`): o que é gerado ou não é nosso, não formatamos.

A **fonte** (`source/manifests`, `source/roteiros`, `source/templates`, `source/scripts`) continua fora do ignore.

E `social/instagram/ENTREGA/` entrou no `.gitignore` pelo mesmo raciocínio: ela é uma cópia reorganizada de `exports/`, 77 MB de PNG que já existem ali. Versionar de novo dobraria o peso do repositório para guardar o mesmo pixel duas vezes. Quem precisar dela roda `montar-entrega.mjs`.

### Estado do `npm run check` depois do trabalho

| Etapa                        | Resultado                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `eslint social`              | limpo                                                                                                   |
| `eslint .`                   | 1 erro e 7 avisos — **todos pré-existentes**, em `src/`                                                 |
| `tsc --noEmit`               | limpo                                                                                                   |
| `prettier --check social/**` | limpo                                                                                                   |
| `prettier --check .`         | 18 arquivos — **todos pré-existentes** (`README.md`, `DESIGN.md`, `docs/*`, `src/components/crc/*.css`) |

Nenhum dos problemas apontados está em arquivo criado por este trabalho. Eles já existiam e foram deixados como estavam, porque corrigi-los seria mexer no site sem pedido.

---

## 15. Critério de conclusão

O briefing define que a tarefa só está pronta quando existir estrutura utilizável com documentação, templates, conteúdo, roteiros, copies, assets, exports, organização e QA.

| Requisito    | Estado                                  |
| ------------ | --------------------------------------- |
| documentação | 17 documentos + 8 gerados               |
| templates    | 24 templates de layout, parametrizáveis |
| conteúdo     | 294 arquivos finais                     |
| roteiros     | 34, palavra por palavra                 |
| copies       | legenda pronta para cada peça           |
| assets       | 18 derivados + inventário auditado      |
| exports      | PNG e MP4 gerados e conferidos          |
| organização  | `source/` e `exports/` separados        |
| QA           | automático (10 checagens) + visual      |

O que falta é o que só a clínica pode fazer: publicar, gravar a sessão de fotos e responder a pendência da placa.
