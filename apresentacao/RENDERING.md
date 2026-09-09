# Gerar o vídeo

```bash
npm run video:preview            # Remotion Studio: navega frame a frame
npm run video:render             # out/jp-crc-1080p.mp4   (1920×1080, 30 fps)
npm run video:render:vertical    # out/jp-crc-vertical.mp4 (1080×1920)
npm run video:thumbnail          # out/jp-crc-capa.png    (capa)
npm run video:frame              # out/frame.png          (um frame, para conferir)
npm run video:leve               # out/jp-crc-leve.mp4    (~11 MB, para WhatsApp)
```

O render principal sai em CRF 18 e dá ~35 MB — bom para projetar numa reunião,
grande demais para o WhatsApp (que corta em 16 MB). O `video:leve` reempacota o
arquivo que já existe em segundos, sem re-renderizar: mesma imagem, mesmo áudio.

Na primeira vez o Remotion baixa o Chrome Headless Shell (~113 MB) para
`node_modules/.remotion/`. Para adiantar: `npx remotion browser ensure`.

## As três composições

| Id               | Tamanho     | O que é                                  |
| ---------------- | ----------- | ---------------------------------------- |
| `JPCRCMain`      | 1920×1080   | A entrega principal, com legenda gravada |
| `JPCRCVertical`  | 1080×1920   | Reenquadramento para Reels/Stories       |
| `JPCRCThumbnail` | 1920×1080   | Still de capa                            |

`JPCRCVertical` **reenquadra** o mesmo filme; não o reescreve. As 35 cenas são
compostas para 16:9, e recompor cada uma para 9:16 seria um segundo filme, com um
segundo conjunto de defeitos, divergindo do primeiro na alteração seguinte. O que
o vertical ganha em troca: a marca no topo e a legenda grande embaixo — que no
vertical é o que de fato se lê, já que o vídeo costuma rodar sem som.

Se um dia o vertical merecer composições próprias, o caminho é criar cenas
`*Vertical.tsx` e um segundo mapa em `scenes/`. A linha do tempo, o conteúdo e as
primitivas continuam servindo os dois.

## O áudio no MP4

A narração (`public/audio/narracao.mp3`, voz neural em português) é uma trilha
única alinhada ao frame 0 — a mesma que o tour toca. O Remotion a inclui com
`<Audio>`, então o arquivo sai com voz e legenda exatamente onde estão no site.

Os **efeitos** sintetizados (`src/audio/efeitos.ts`) **não** entram no render:
Web Audio depende do relógio do navegador e sairia dessincronizado do frame. Se
quiser efeitos no MP4, coloque-os na trilha durante a edição de áudio.

## Qualidade

`remotion.config.ts` fixa CRF 18 e JPEG como formato intermediário. CRF menor =
melhor imagem; 18 é praticamente sem perda visível para interface, que é o
conteúdo que mais sofre com compressão (texto fino e linhas de 1 px).

Para um arquivo menor, `--crf=23`. Para um master sem perda, `--crf=1` — o
arquivo fica grande e não vale para distribuição.

## Duas armadilhas que já foram resolvidas (não reintroduza)

**1. O alias `@/`.** O Vite lê `resolve.alias` do `vite.config.ts`; o Remotion
empacota com webpack e **não** lê os `paths` do `tsconfig.json`. A ponte está em
`remotion.config.ts`, em `overrideWebpackConfig`. Sem ela, `tsc` passa limpo e o
render quebra em `Can't resolve '@/components/Marca'` — na hora de gerar o MP4,
que é o pior momento para descobrir.

**2. As fontes.** O Remotion não usa o `index.html` do Vite. O `@import` do
Google Fonts está no topo do `src/styles.css`, que a raiz do Remotion importa, e
`useEsperarFontes()` segura o render com `delayRender` até
`document.fonts.ready`. Sem isso, os primeiros frames sairiam com fonte de
sistema e o vídeo teria um salto tipográfico no começo.

## Se o render falhar

| Sintoma                                  | Causa provável                                        |
| ---------------------------------------- | ----------------------------------------------------- |
| `Can't resolve '@/...'`                  | `overrideWebpackConfig` foi removido do config        |
| Texto com fonte errada nos primeiros frames | `useEsperarFontes()` não está sendo chamado        |
| Imagem faltando                          | Asset referenciado por caminho fixo em vez de `asset()` |
| Animação congelada                       | Alguma cena voltou a usar CSS `transition` ou `setTimeout` |
| Partícula tremendo entre frames          | Alguém usou `Math.random()` em vez de `aleatorio()`   |

Para investigar um frame específico:

```bash
npx remotion still src/remotion/index.ts JPCRCMain out/frame.png --frame=3210
```
