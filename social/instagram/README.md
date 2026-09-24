# Kit de Instagram — JP Clínica Odontológica

> Documento vivo. Última revisão: 15/09/2026.

Este não é um PDF de ideias. É um **kit operacional**: abre, troca a foto, troca a headline, roda um comando e publica.

Tudo o que está em `exports/` foi gerado a partir de `source/`. Se você precisa mudar alguma coisa, mude em `source/` e rode de novo — nunca edite o PNG.

---

## 1. Como isto funciona em 30 segundos

```text
src/lib/jp.ts                      ← a verdade sobre a clínica (nota, CRO, endereço)
        │  extrair-dados.mjs
        ▼
source/dados-jp.json               ← a mesma verdade, em JSON
        │
        ├── source/manifests/*.json     ← o que cada peça diz
        ├── source/roteiros/*.json      ← o que cada vídeo diz
        │
        │  renderizar.mjs  /  gerar-videos.mjs
        ▼
exports/                           ← PNG e MP4 prontos para publicar
```

A regra que sustenta tudo: **nenhum número é digitado numa peça.** A nota do Google, o total de avaliações, o CRO de cada profissional, o telefone e o endereço entram por `{{token}}` e saem de `src/lib/jp.ts`. Quando a clínica atualizar a nota, você roda dois comandos e todas as artes acompanham.

---

## 2. Os quatro comandos

Rode da **raiz do repositório**, não desta pasta.

### Atualizar os dados da clínica

```bash
node social/instagram/source/scripts/extrair-dados.mjs
```

Leia isto como "sincronizar com `src/lib/jp.ts`". Rode sempre que a clínica mudar nota, endereço, telefone, horário ou equipe.

### Gerar as imagens

```bash
node social/instagram/source/scripts/renderizar.mjs
```

Renderiza **todos** os manifests. Para renderizar só um grupo, passe um pedaço do nome do arquivo ou o `grupo` do manifest:

```bash
node social/instagram/source/scripts/renderizar.mjs 60-estaticos
```

```bash
node social/instagram/source/scripts/renderizar.mjs dst- car- ads-
```

Para ver as guias de safe area desenhadas por cima (vermelho = margem segura, azul = a faixa 4:5 que o grid mostra de uma capa de Reel):

```bash
node social/instagram/source/scripts/renderizar.mjs 45-reel --qa
```

> As guias saem **dentro** do PNG. Renderize sem `--qa` antes de publicar.

### Gerar os vídeos

> ⚠️ **Neste computador, use sempre `--leve`.** Em 18/09/2026 o render a toda velocidade prendeu a CPU em 100% e o PC deu tela azul.

```bash
node social/instagram/source/scripts/gerar-videos.mjs --leve --pular-prontos
```

O que o modo leve faz:

- **prioridade abaixo do normal**, herdada pelo Chromium, pelo ffmpeg e pelo Python;
- **ffmpeg em 2 threads** e Chromium com **1 thread de desenho**;
- **freio** que pausa a captura sempre que a CPU da máquina inteira passa de 60%;
- **um vídeo por vez**, com o Chromium fechado e 20 s de pausa entre um e outro.

Um Reel de 22 s leva cerca de 45 s. `--pular-prontos` não refaz o que já está atualizado, então dá para interromper e retomar.

Para conferir o tempo de leitura e as quebras de linha (viúvas) de todos os roteiros **sem renderizar nada** (leva um minuto):

```bash
node social/instagram/source/scripts/gerar-videos.mjs --conferir
```

Para revisar um efeito quadro a quadro sem gravar vídeo, fotografe o palco em instantes escolhidos (sai uma folha de contato em PNG na pasta temporária):

```bash
node social/instagram/source/scripts/gerar-videos.mjs R01 --quadros=0,0.8,1.3,4.4,6.8
```

Para testar um roteiro em prévia de 6 fps:

```bash
node social/instagram/source/scripts/gerar-videos.mjs R01 --previa
```

**Ilustrações.** Uma cena sem foto pode ganhar um motion graphic com `"grafico"`: `implante` (com `"modo": "anestesia"` ou `"juntos"`), `enxerto`, `tomografia`, `cicatrizacao`, `protocolo`, `plano`, `esmalte`, `linha-do-tempo` (com `"marcos"`) e `aspas`. `"alturaGrafico"` ajusta o tamanho quando a cena também tem lista. O `--conferir` avisa se o desenho ainda estiver acontecendo na hora do corte.

**Trilha sonora.** Cada vídeo sai com trilha composta por `trilha.py`, a partir da lista de eventos do vídeo: a bateria entra na virada do arco, cada item de lista tem uma nota e o cartão final resolve na tônica. É síntese pura, sem sample, e por isso pode ir para post e para anúncio. Os três ganchos de um mesmo anúncio têm a mesma música. Para gerar sem trilha, use `--mudo`.

### Preparar as fotos derivadas

```bash
python social/instagram/source/scripts/preparar-fotos.py
```

Recorta a fachada, amplia os interiores de baixa resolução e gera os fundos 9:16. Só precisa rodar de novo se `src/assets/` receber foto nova.

### Conferir o grid

```bash
python social/instagram/source/scripts/montar-grid.py
```

Monta a prévia de como os 12 primeiros posts ficam no perfil.

### Montar a pasta para enviar

```bash
node social/instagram/source/scripts/montar-entrega.mjs --copiar-para "C:/Users/Felipe/Downloads"
```

Monta `ENTREGA/` e `ENTREGA-INSTAGRAM-JP.zip` seguindo **ao pé da letra** o documento da clínica, [`ORDEM_DE_PUBLICACAO_JP.md`](ORDEM_DE_PUBLICACAO_JP.md): nome de cada pasta, o que existe dentro dela, a ordem e o dia.

| Pasta            | O que tem                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTAR`         | `01_REEL_Conheca-a-JP` … `22_POST_Sorrir-muda-tudo`: Reel com `VIDEO.mp4` + `CAPA.png` + `LEGENDA.txt`; carrossel com `01.png`, `02.png`… + `LEGENDA.txt`; post com `POST.png` + `LEGENDA.txt` |
| `DESTAQUES`      | `01_A-Clinica` … `10_Onde-estamos`: `CAPA.png` (a capa da bolinha) + os cartões numerados                                                                                                      |
| `FOTO-DE-PERFIL` | a foto escolhida                                                                                                                                                                               |
| `STORIES`        | `01_Depois-de-publicar` (Novo Reel, Novo carrossel) e `02_Outros-dias`                                                                                                                         |
| `ANUNCIOS`       | os 6 conceitos com 3 ganchos cada, o link e a UTM de cada gancho, mais os estáticos e os carrosséis                                                                                            |
| `PROXIMO-MES`    | o banco para depois de 20/10                                                                                                                                                                   |

Na raiz: `LEIA-ME.txt` (passo a passo e calendário com as datas), o próprio `ORDEM_DE_PUBLICACAO_JP.md` e `PREVIA_como-o-perfil-fica.png`.

O script **confere a pasta contra o documento** depois de montar, lendo do disco, e falha se quebrar:

- `POSTAR` e `DESTAQUES` com exatamente as pastas e os arquivos que o documento pede, nem um a mais;
- slides de carrossel numerados sem buraco;
- nenhum arquivo vazio, nenhuma hashtag `[MARCA]` por resolver na legenda;
- no máximo 10 imagens por pasta, exceto Implantes e Dúvidas nos Destaques, onde o documento pede 14;
- nomes sem acento, porque o zip do Windows estraga acento em nome de arquivo;
- nenhum arquivo do plano faltando em `exports/`.

A procedência de cada arquivo fica em `ENTREGA-ORIGEM.txt`, fora da pasta de entrega. As legendas vêm de `CAPTIONS.md`, com as hashtags de `HASHTAGS-LOCAL.md` já montadas.

Para mudar a ordem ou o conteúdo, mude primeiro o documento e depois as listas no topo de `montar-entrega.mjs` (`POSTAR`, `DESTAQUES`, `STORIES_…`, `ANUNCIOS`, `MES2_…`). A pasta é **descartável**: o script apaga e refaz do zero a cada execução. Ela e o zip estão no `.gitignore`, porque são cópia e não original.

---

## 3. Como criar uma peça nova

1. abra o manifest do grupo em `source/manifests/`;
2. copie a peça mais parecida com a que você quer;
3. troque `arquivo`, `headline`, `corpo` e `foto`;
4. rode `renderizar.mjs` com o nome do manifest;
5. abra o PNG e confira.

### O que dá para escrever nos campos de texto

| Escrita                 | Vira                                  |
| ----------------------- | ------------------------------------- |
| `\n`                    | quebra de linha                       |
| `[[palavra]]`           | a palavra em verde vivo               |
| `**palavra**`           | a palavra em semibold (só no corpo)   |
| `{{avaliacoes.notaBR}}` | o valor real vindo de `src/lib/jp.ts` |

Os tokens disponíveis estão todos em `source/dados-jp.json`. Um token que não existe **derruba o render** — de propósito: melhor um erro no terminal do que `{{avaliacoes.nota}}` impresso numa arte publicada.

### O texto não coube?

Não mexa em tamanho de fonte à mão. O renderizador encaixa sozinho: encolhe primeiro a foto, depois o corpo, e só então a headline — nessa ordem, porque a headline é a mensagem. Se ele avisar no terminal que a peça transbordou mesmo depois do ajuste, o problema é a copy, não o layout. Corte palavras.

---

## 4. Os formatos

| Formato    | Medida      | Onde                                         |
| ---------- | ----------- | -------------------------------------------- |
| `feed`     | 1080 × 1350 | post de feed, carrossel, estático de anúncio |
| `quadrado` | 1080 × 1080 | avatar, peça que precisa de 1:1              |
| `story`    | 1080 × 1920 | Story, capa de Reel, capa de Destaque, vídeo |

### Safe areas que o sistema já respeita

- **feed** — 96 px em cima e embaixo, 84 px nas laterais;
- **story** — 250 px no topo (avatar + nome) e 270 px no pé (barra de resposta);
- **reel** — 290 px no topo e 470 px no pé, porque embaixo ficam legenda, curtida e navegação;
- **capa de Reel** — o que precisa ser lido no grid do perfil cabe na **faixa 4:5 central**, entre y=285 e y=1635;
- **capa de Destaque** — o ícone e o rótulo cabem num círculo central de 760 px, que é o que o Instagram recorta.

---

## 5. Nomenclatura dos arquivos

```text
jp_ig_<formato>_<assunto>_<variação>_v<versão>.png
```

```text
jp_ig_feed_s01_sorrir_muda_tudo_v01.png
jp_ig_reel_r01_cover_v01.png
jp_ig_dst_implantes_07_doi.png
jp_ig_ad_ad01_hooka_v01.mp4
```

Tudo minúsculo, sem acento, sem espaço. Versão nova = `v02`, nunca sobrescrever o `v01` que já foi ao ar.

---

## 6. Cores e fontes

Vêm de `src/styles.css` e estão copiadas em `source/templates/sistema.css`, com o papel de cada uma anotado ao lado.

| Papel                                     | Valor     |
| ----------------------------------------- | --------- |
| verde escuro — texto forte em fundo claro | `#095902` |
| verde vivo — só preenchimento e acento    | `#56A805` |
| verde profundo — superfície escura        | `#032F01` |
| creme — fundo padrão                      | `#F7F8F2` |
| menta — chip e faixa suave                | `#EBF5E1` |
| texto principal                           | `#172018` |
| texto secundário                          | `#5A6B5C` |

**A regra que mais se quebra:** `#56A805` não serve como texto em fundo claro — mede 2,81:1 e reprova. Ele entra como forma, ícone, ponto do chip, ou como palavra de destaque em corpo grande (acima de ~64 px). Para texto verde em fundo claro, use `#095902`.

Fontes: **Manrope** nos títulos, **Inter** no corpo. As duas são servidas do próprio repositório (`src/assets/fontes/`) — nada vem do Google Fonts.

---

## 7. O que está em cada pasta

```text
source/
  dados-jp.json          derivado de src/lib/jp.ts — NÃO editar à mão
  manifests/             o conteúdo de cada peça estática
  roteiros/              o conteúdo de cada vídeo
  templates/             o sistema visual (CSS + funções de layout)
  assets-derivados/      recortes e ampliações das fotos reais
  scripts/               os geradores

content/                 roteiros e legendas em formato de leitura
exports/                 os arquivos finais
```

---

## 8. Antes de publicar qualquer coisa

O checklist completo está em [`QA.md`](QA.md). Os cinco que mais pegam:

- [ ] nenhum dado inventado — CRO, nota e endereço vieram do extrator;
- [ ] nenhuma promessa de resultado, nenhum "sem dor", nenhum antes/depois;
- [ ] a foto é real da JP (e não a `capa-recepcao-*.webp`, que é banco de imagem);
- [ ] o texto cabe na safe area;
- [ ] o WhatsApp da peça é o de `src/lib/jp.ts`.

---

## 9. Cuidados éticos — o resumo

Odontologia é publicidade regulada. A Resolução CFO 196/2019 e o Código de Ética Odontológica valem para o Instagram do mesmo jeito que valem para a placa da fachada.

**Nunca publique:**

- promessa ou garantia de resultado;
- "sem dor", "indolor", "100% seguro";
- antes e depois em nome da pessoa jurídica;
- diagnóstico ou indicação por mensagem;
- preço como chamariz, desconto fictício, urgência artificial;
- depoimento que a clínica escreveu;
- foto de paciente sem autorização por escrito;
- título de especialista que não esteja documentado;
- número de CRO que não tenha sido conferido.

**Sempre:**

- termine em "depende de avaliação individual" quando falar de indicação;
- identifique quem fala, com nome e CRO;
- mantenha a responsável técnica identificável: Dra. Juliana Pelisser Barbosa — CROSP 75.159, conforme `RESPONSAVEL_TECNICA` em `src/lib/jp.ts`.

---

## 10. Onde continuar

| Você quer...                     | Leia                                       |
| -------------------------------- | ------------------------------------------ |
| decidir bio, nome e avatar       | [`PROFILE.md`](PROFILE.md)                 |
| entender o sistema visual        | [`BRAND-SOCIAL.md`](BRAND-SOCIAL.md)       |
| saber que foto pode usar         | [`ASSET-MANIFEST.md`](ASSET-MANIFEST.md)   |
| saber o que postar em 30 dias    | [`CALENDAR-30D.md`](CALENDAR-30D.md)       |
| copiar as legendas prontas       | [`CAPTIONS.md`](CAPTIONS.md)               |
| subir a primeira campanha        | [`PAID-MEDIA.md`](PAID-MEDIA.md)           |
| gravar a próxima sessão de fotos | [`SHOT-LIST.md`](SHOT-LIST.md)             |
| saber o que foi entregue         | [`RELATORIO-FINAL.md`](RELATORIO-FINAL.md) |
