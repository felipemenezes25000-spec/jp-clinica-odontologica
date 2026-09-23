# Relatório final

> Reformulação do Instagram da JP Clínica Odontológica — o que foi construído, onde está, o que já dá para publicar e o que ainda depende de gente.

---

## 1. O que foi criado

**294 arquivos finais** — 260 imagens e 34 vídeos com trilha sonora — mais o sistema que os gera.

| Entregável                                                  | Quantidade                                 | Estado                   |
| ----------------------------------------------------------- | ------------------------------------------ | ------------------------ |
| **Reels em vídeo** (1080×1920, 30 fps, 22–30 s, com trilha) | **16**                                     | ✅ prontos para publicar |
| **Anúncios em vídeo** (6 conceitos × 3 hooks, com trilha)   | **18**                                     | ✅ prontos               |
| **Legendas `.srt`**                                         | 34                                         | ✅ uma por vídeo         |
| **Capas de Reel**                                           | 18 (16 + 2 com rosto real)                 | ✅                       |
| **Capas de Destaque**                                       | 12 (10 no plano + 2 de reserva)            | ✅                       |
| **Cartões dentro dos Destaques**                            | **95** (85 na entrega + 10 de abertura)    | ✅                       |
| **Slides de carrossel**                                     | 75 (8 do ciclo + 2 fixados + 2 de anúncio) | ✅                       |
| **Posts estáticos de feed**                                 | 12                                         | ✅                       |
| **Cards de equipe**                                         | 8 (um por pessoa real)                     | ✅                       |
| **Templates de Story**                                      | 16, renderizados preenchidos               | ✅                       |
| **Estáticos de anúncio**                                    | 4                                          | ✅                       |
| **Prévias de avatar**                                       | 4                                          | ✅                       |
| **Prévias de grid**                                         | 3                                          | ✅                       |
| **Documentos operacionais**                                 | 18 na raiz + 8 gerados em `content/`       | ✅                       |
| **Scripts do sistema**                                      | 9 (incluindo o compositor da trilha)       | ✅                       |
| **Pasta de publicação `ENTREGA/` + zip**                    | idêntica ao documento da clínica           | ✅                       |

**O que não é arquivo, mas é a entrega principal:** um sistema em que trocar uma headline num JSON e rodar um comando produz a peça nova — e em que **nenhum número é digitado numa arte**.

### Os vídeos: motor 3

Os 34 vídeos saem do terceiro motor (`source/templates/video.html`), feito para parar o polegar sem sair da marca:

- **o primeiro quadro é impacto**: a palavra-chave do gancho ocupa a tela ("dói?", "dentro.", "enxerto?"), segura meio segundo com um grave na trilha e voa para o lugar dela na frase, enquanto a câmera assenta sobre a foto;
- **32 cenas do meio viraram motion graphics editoriais**, que antes eram texto sobre verde liso: o implante descendo em rosca até a coroa assentar, o enxerto enchendo o osso grão a grão, o exame de imagem varrendo e mostrando o implante planejado, a prótese protocolo assentando sobre quatro pontos, a cicatrização como barra de tempo, o esmalte intacto no clareamento, o plano que vira dente, a linha do tempo de 2002 até hoje, a aspa e as estrelas dos depoimentos;
- **o sorriso da marca vira linguagem**: sublinha a palavra-chave e se desenha, enorme, no fundo das cenas lisas;
- **as cenas recuam como cartões** quando a próxima entra;
- **os números rolam como odômetro**;
- **o cartão final vende**: logo se montando, WhatsApp, a prova ("★ 4,6 no Google · 24 anos de história") e um toque pulsando no botão.

Cada movimento tem som próprio na trilha: o grave do impacto, os cliques da rosca, o encaixe da coroa, os grãos, o toque no botão. Todo efeito foi revisado quadro a quadro (`--quadros`) antes do render, e o `--conferir` passou nos 34 roteiros com zero aviso de leitura, área segura ou ilustração cortada.

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
├── ORDEM_DE_PUBLICACAO_JP.md o documento da clínica: pastas, ordem e datas
├── ENTREGA/                  a pasta de publicação, idêntica ao documento (gerada)
├── ENTREGA-INSTAGRAM-JP.zip  a mesma pasta, zipada (gerada)
├── content/                  roteiros e textos em formato de leitura (gerados)
├── exports/                  os 294 arquivos finais
└── source/
    ├── dados-jp.json         derivado de src/lib/jp.ts
    ├── manifests/  (30)      o conteúdo de cada peça estática
    ├── roteiros/   (34)      o conteúdo de cada vídeo
    ├── templates/            o sistema visual executável (inclui o motor de vídeo)
    ├── assets-derivados/     18 recortes e ampliações das fotos reais
    └── scripts/    (9)       os geradores, incluindo trilha.py
```

### A pasta `ENTREGA/`, que é o que a clínica abre

Ela segue ao pé da letra o documento da clínica, [`ORDEM_DE_PUBLICACAO_JP.md`](ORDEM_DE_PUBLICACAO_JP.md) (18/09/2026): nome de cada pasta, o que existe dentro dela, a ordem e o dia.

```text
ENTREGA-INSTAGRAM-JP/
├── LEIA-ME.txt                      o passo a passo e o calendário com as datas
├── ORDEM_DE_PUBLICACAO_JP.md        o documento da clínica
├── PREVIA_como-o-perfil-fica.png    o grid depois das 22 publicações
├── POSTAR/
│   ├── 01_REEL_Conheca-a-JP/        VIDEO.mp4 · CAPA.png · LEGENDA.txt
│   ├── 02_CARROSSEL_Implantes-na-JP/  01.png … 07.png · LEGENDA.txt
│   ├── 05_POST_Aqui-comeca-o-cuidado/ POST.png · LEGENDA.txt
│   └── …  até 22_POST_Sorrir-muda-tudo/
├── DESTAQUES/
│   ├── 01_A-Clinica/                CAPA.png · 01_Fachada.png … 09_CTA.png
│   └── …  até 10_Onde-estamos/
├── FOTO-DE-PERFIL/                  só a versão escolhida (papel)
├── STORIES/
│   ├── 01_Depois-de-publicar/       Novo Reel, Novo carrossel
│   └── 02_Outros-dias/              bastidor, avaliação, equipe, localização, dica…
├── ANUNCIOS/                        só quando for impulsionar
└── PROXIMO-MES/                     o banco para depois de 20/10
```

O que o documento manda **não** publicar como post separado (capa de Reel, capa de Destaque) nunca tem pasta própria: a `CAPA.png` do Reel mora na pasta do Reel, e a do Destaque, na pasta do Destaque. Depois de montar, o script lê `POSTAR/` e `DESTAQUES/` do disco e compara com a lista exata de arquivos do documento. Arquivo sobrando ou faltando derruba a execução.

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
- os **10 Destaques**, com a capa e 85 cartões dentro;
- os **3 posts fixados**;
- as **22 publicações de feed** do plano, na ordem, cada uma com a legenda pronta;
- **16 Reels** em vídeo, com trilha sonora (8 no plano do mês, 8 para o mês seguinte);
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

## 5. As 22 publicações do feed, na ordem da clínica

A ordem, os nomes e as datas são os do documento da clínica. Um conteúdo por dia útil, de segunda, 21/09, a terça, 20/10/2026. Os Stories de cada dia estão em [`CALENDAR-30D.md`](CALENDAR-30D.md). A prévia do perfil pronto é `ENTREGA/PREVIA_como-o-perfil-fica.png`.

| #   | Data      | Pasta em `ENTREGA/POSTAR`                | Publicação                                          |
| --- | --------- | ---------------------------------------- | --------------------------------------------------- |
| 01  | seg 21/09 | `01_REEL_Conheca-a-JP`                   | Reel — Conheça a JP por dentro — **fixar**          |
| 02  | ter 22/09 | `02_CARROSSEL_Implantes-na-JP`           | Implantes na JP: começa pela avaliação — **fixar**  |
| 03  | qua 23/09 | `03_CARROSSEL_24-anos`                   | 24 anos / prova de confiança — **fixar**            |
| 04  | qui 24/09 | `04_REEL_Implante-doi`                   | Reel — Implante dói?                                |
| 05  | sex 25/09 | `05_POST_Aqui-comeca-o-cuidado`          | Post da recepção                                    |
| 06  | seg 28/09 | `06_REEL_Perdeu-um-dente`                | Reel — Perdeu um dente. E agora?                    |
| 07  | ter 29/09 | `07_POST_Avaliacoes-Google`              | Post — A nota é pública. E é deles.                 |
| 08  | qua 30/09 | `08_POST_Todas-as-fases-da-vida`         | Post — Odontologia para todas as fases da vida      |
| 09  | qui 01/10 | `09_CARROSSEL_5-duvidas-sobre-implantes` | Carrossel — 5 dúvidas sobre implantes               |
| 10  | sex 02/10 | `10_POST_Equipe-Ana-Beatriz`             | Card — Dra. Ana Beatriz                             |
| 11  | seg 05/10 | `11_REEL_Implante-precisa-de-enxerto`    | Reel — Todo implante precisa de enxerto?            |
| 12  | ter 06/10 | `12_POST_Implantes-dentarios`            | Post — Implantes dentários                          |
| 13  | qua 07/10 | `13_REEL_Primeira-avaliacao`             | Reel — Como é a primeira avaliação?                 |
| 14  | qui 08/10 | `14_CARROSSEL_Como-funciona-a-avaliacao` | Carrossel — Como funciona a avaliação               |
| 15  | sex 09/10 | `15_POST_24-anos-na-Freguesia`           | Post — 24 anos de história. Hoje, na Freguesia do Ó |
| 16  | seg 12/10 | `16_REEL_Dentadura-e-a-unica-opcao`      | Reel — Dentadura é a única opção? (**feriado**)     |
| 17  | ter 13/10 | `17_POST_Equipe-Matheus-Fraga`           | Card — Dr. Matheus Fraga                            |
| 18  | qua 14/10 | `18_REEL_Aparelho-ou-alinhador`          | Reel — Aparelho ou alinhador?                       |
| 19  | qui 15/10 | `19_CARROSSEL_Dentadura-x-protocolo`     | Carrossel — Dentadura x protocolo                   |
| 20  | sex 16/10 | `20_POST_Esterilizacao`                  | Post — A sala que ninguém mostra                    |
| 21  | seg 19/10 | `21_REEL_24-anos-em-30-segundos`         | Reel — 24 anos em 30 segundos                       |
| 22  | ter 20/10 | `22_POST_Sorrir-muda-tudo`               | Post — Sorrir muda tudo                             |

Cada pasta traz os arquivos da publicação e o `LEGENDA.txt`, com a legenda e as hashtags. **12/10 é feriado nacional.** O documento mantém o Reel nº 16 nesse dia; a alternativa está em [`CALENDAR-30D.md`](CALENDAR-30D.md).

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

## 7. Os Destaques, na ordem da clínica

| #   | Pasta em `ENTREGA/DESTAQUES` | Stories dentro |
| --- | ---------------------------- | -------------- |
| 1   | `01_A-Clinica`               | 9              |
| 2   | `02_Implantes`               | 13             |
| 3   | `03_Proteses`                | 8              |
| 4   | `04_Ortodontia`              | 7              |
| 5   | `05_Estetica`                | 7              |
| 6   | `06_Criancas`                | 7              |
| 7   | `07_Avaliacoes`              | 7              |
| 8   | `08_Equipe`                  | 9              |
| 9   | `09_Duvidas`                 | 13             |
| 10  | `10_Onde-estamos`            | 5              |

Cada pasta tem ainda a `CAPA.png`, a capa da bolinha. **Crie do 10 para o 01.** O Instagram joga para a frente o Destaque atualizado por último, então Onde estamos sobe primeiro e A Clínica por último.

Implantes e Dúvidas ficam com 13 Stories cada, como o documento pede. O cartão de abertura de cada Destaque (`*_01_capa.png`) ficou fora da entrega, porque o documento não tem posição para ele. As capas **Estrutura** e **24 anos** continuam em `exports/highlights/` como reserva.

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

### ⚠️ Pendência física: a placa da fachada

**A placa traz um WhatsApp antigo.** A clínica confirmou em 18/09/2026 que o correto é o do site, **(11) 97616-5117**.

| Onde             | Telefone            | WhatsApp              |
| ---------------- | ------------------- | --------------------- |
| placa da fachada | `3975-9902` ✅      | **`9 7169-4647`**     |
| `src/lib/jp.ts`  | `(11) 3975-9902` ✅ | **`(11) 97616-5117`** |

Todo recorte de fachada deste kit para em `x = 638`, o que deixa o bloco do número antigo fora de qualquer peça. **O que falta é físico: corrigir a placa**, ou cobrir o número antigo, porque quem passa na rua salva o da placa.

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

# 4. renderizar vídeos — SEMPRE com --leve (ver §12)
node social/instagram/source/scripts/gerar-videos.mjs --leve --pular-prontos
node social/instagram/source/scripts/gerar-videos.mjs R01 --previa  # teste rápido
node social/instagram/source/scripts/gerar-videos.mjs R01 --conferir  # mede o tempo de leitura, sem gravar

# 5. montar a prévia do grid
python social/instagram/source/scripts/montar-grid.py

# 5b. montar a pasta de publicação e o zip (e, se quiser, copiar para outro lugar)
node social/instagram/source/scripts/montar-entrega.mjs
node social/instagram/source/scripts/montar-entrega.mjs --copiar-para "C:/Users/<você>/Downloads"

# 6. regerar os documentos de leitura
node social/instagram/source/scripts/gerar-docs.mjs

# 7. conferir antes de publicar
node social/instagram/source/scripts/conferir.mjs
```

Para criar uma peça: copie a mais parecida no manifest, troque `arquivo`, `headline`, `corpo` e `foto`, rode o passo 3. O texto se encaixa sozinho.

---

## 12. Desempenho do sistema

| Operação                                   | Tempo                 |
| ------------------------------------------ | --------------------- |
| 260 imagens, do zero                       | ~55 s                 |
| um grupo de 12 peças                       | ~3 s                  |
| um Reel de 24 s com trilha, `--leve`       | ~45 s + 20 s de pausa |
| os 34 vídeos, `--leve`, 2 filas            | ~30 min               |
| folha de quadros de um vídeo (`--quadros`) | ~15 s                 |
| a pasta `ENTREGA/` + zip                   | ~1 min                |
| conferência completa                       | < 5 s                 |

### O modo `--leve` existe por causa de uma tela azul

A primeira rodada de vídeos, sem freio, derrubou o computador da clínica. Chromium, Node e ffmpeg disputavam todos os núcleos. Desde então, **vídeo só se gera com `--leve`**, que:

- baixa a prioridade de todos os processos (Windows: abaixo do normal), então o resto da máquina sempre passa na frente;
- limita o ffmpeg a 2 threads e o Chromium a 1 thread de rasterização;
- mede o uso de CPU **do sistema inteiro** e pausa a captura quando passa de 60%;
- abre um navegador novo por vídeo e espera 20 s entre um e outro.

Na rodada final, com duas filas em paralelo, o pico ficou entre 43% e 78% e a média perto de 60%, sem nenhuma queda. `--pular-prontos` retoma de onde parou: só refaz o vídeo cujo roteiro, motor ou trilha mudou depois do MP4.

---

## 12b. Defeitos encontrados na revisão — e corrigidos

A varredura final achou quatro coisas reais, que teriam ido ao ar, além de dois falsos positivos do próprio verificador.

| O que                                                           | Como apareceu                                                                                                                                                                 | Correção                                                                                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Arraste para ver" nas capas dos dois carrosséis de anúncio** | a frase nascia dentro do template `carousel-cover`, não em manifest nenhum — por isso passou por uma revisão visual inteira                                                   | o template só injeta o elemento quando o manifest não declara `anuncio: true`; `conferir.mjs` ganhou uma checagem que cobra o campo em toda peça que exporta para `exports/ads/`              |
| **Chip "SEM DOR TAMBÉM CONTA"** (carrossel C06)                 | a intenção era o contrário de promessa, mas a expressão recortada num print vira a promessa vedada                                                                            | virou "QUANDO NADA DÓI"                                                                                                                                                                       |
| **Duas capas de Reel com `_ALT_` em caixa alta**                | violavam a própria regra de nomenclatura do kit                                                                                                                               | renomeadas para `_alt_`                                                                                                                                                                       |
| **Palavra sozinha na última linha em 5 vídeos**                 | "Freguesia do / Ó." em dois anúncios, "osso.”" num terceiro, "com" no Reel "Implante dói?" e "caso." no R09 — achados depois da revisão visual, com os vídeos já renderizados | os títulos foram quebrados à mão e os 5 vídeos refeitos; `gerar-videos.mjs --conferir` passou a acusar viúva e "do / Ó" partido nos 34 roteiros, e o nome do bairro nunca mais quebra no meio |

O verificador também acusou `capa-recepcao` e `promoção` dentro do campo `descricao` de dois manifests — texto de documentação que existe justamente para dizer "aqui isso não se usa". A checagem passou a olhar só o que vira pixel.

---

## 13. Limitações encontradas

**1. Resolução do acervo.** Sete ambientes reais da clínica só existem em 665×480. Eles são usados em janela (onde a ampliação de 2× aguenta) e evitados em fundo sangrado. É a limitação mais visível do kit, e a única resposta correta é o [`SHOT-LIST.md`](SHOT-LIST.md) — não mais filtro.

**2. Nenhuma imagem de pessoa falando.** Os 16 Reels são motion + texto. Funcionam, e são a metade do conteúdo que não depende de agenda. A outra metade depende, e está roteirizada palavra por palavra.

**3. A trilha é sintetizada, não gravada.** Trilha licenciada não pode ir embutida num arquivo que a clínica distribui. Por isso cada vídeo leva uma trilha **composta por código** (`source/scripts/trilha.py`): pad, dedilhado, baixo, bateria e efeitos sincronizados com os cortes. Sem sample de terceiros, ela pode ir até para anúncio. O limite é de gosto, não de licença: é uma trilha limpa de marca, não uma música que alguém reconheça. Se preferir um áudio em alta no Reel orgânico, é só baixar o volume do som original no editor do Instagram e escolher outro. **Em anúncio, nunca use áudio em alta do Instagram.**

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
+ social/instagram/ENTREGA.zip
+ social/instagram/ENTREGA-INSTAGRAM-JP.zip
+ social/instagram/ENTREGA-ORIGEM.txt
```

**Por quê.** `social/instagram/content/*.md` é gerado por `gerar-docs.mjs`, que monta tabelas a partir dos manifests. O Prettier alinha coluna de tabela por largura de célula: cada execução do gerador desformata o arquivo, e cada `npm run format` o formata de volta — dois diffs enormes por rodada, num arquivo que ninguém edita à mão. É o mesmo princípio das entradas que já estavam lá (`apresentacao`, `public/crc-tour`, `.agents/skills`): o que é gerado ou não é nosso, não formatamos.

A **fonte** (`source/manifests`, `source/roteiros`, `source/templates`, `source/scripts`) continua fora do ignore.

E `social/instagram/ENTREGA/` e o zip entraram no `.gitignore` pelo mesmo raciocínio: são uma cópia reorganizada de `exports/`, arquivos que já existem ali. Versionar de novo dobraria o peso do repositório para guardar o mesmo pixel duas vezes. Quem precisar dela roda `montar-entrega.mjs`.

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

| Requisito    | Estado                                                             |
| ------------ | ------------------------------------------------------------------ |
| documentação | 18 documentos + 8 gerados                                          |
| templates    | 24 templates de layout, parametrizáveis                            |
| conteúdo     | 294 arquivos finais                                                |
| roteiros     | 34, palavra por palavra                                            |
| copies       | legenda pronta para cada peça                                      |
| assets       | 18 derivados + inventário auditado                                 |
| exports      | PNG e MP4 com trilha, gerados e conferidos                         |
| organização  | `source/` e `exports/` separados; `ENTREGA/` idêntica ao documento |
| QA           | automático (11 checagens) + visual                                 |

O que falta é o que só a clínica pode fazer: publicar, gravar a sessão de fotos e responder a pendência da placa.
