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

```bash
node social/instagram/source/scripts/gerar-videos.mjs
```

Um Reel de 21 s leva cerca de 40 s para sair. Para testar um roteiro sem esperar, use a prévia em 6 fps:

```bash
node social/instagram/source/scripts/gerar-videos.mjs R01 --previa
```

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
node social/instagram/source/scripts/montar-entrega.mjs
```

Copia **as 257 imagens** para `ENTREGA/`, organizadas em pastas numeradas na ordem de uso — perfil, Destaques, fixados, feed, capas, Stories, anúncios. É a pasta que se compacta e manda para quem vai publicar.

Vídeo não entra: são 108 MB contra 77 MB de imagem. Os MP4 ficam em `exports/reels/` e `exports/ads/`.

A pasta é **descartável**: o script apaga e refaz do zero a cada execução, e confere no fim se a contagem bate com `exports/`. Rode de novo depois de qualquer re-render. Ela está no `.gitignore` — é cópia, não original.

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
