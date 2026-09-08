# Marcas, fotos e áudio

```
public/
  brands/
    jp/               ← REAL: a marca da clínica, vetorizada dos EPS
    dental-office/    ← só PLACEHOLDER.md
    whatsapp/         ← só PLACEHOLDER.md
    n8n/              ← só PLACEHOLDER.md
  fotos/              ← fotos reais da clínica, copiadas do site
  audio/
    narracao.mp3      ← gerado por `npm run narracao` (voz neural, ~3,3 MB)
```

## O que é real e o que não é

**Real:** a marca da JP. Os quatro SVGs em `public/brands/jp/` saem dos `.eps`
entregues pela clínica (via `scripts/gerar-marca.py` na raiz do site) e são os
mesmos arquivos que o site usa. As fotos em `public/fotos/` também são da
clínica.

**Não real:** Dental Office, WhatsApp e n8n. Não há arquivo desses logos neste
repositório, e a peça **não inventa um parecido** — o briefing proíbe, e um logo
aproximado é pior que nenhum. No lugar, o componente `<Marca>` desenha um
wordmark tipográfico do próprio design system: um glifo geométrico simples mais o
nome por extenso.

Cada pasta tem um `PLACEHOLDER.md` com o passo a passo. É sempre o mesmo:

1. Coloque o arquivo (SVG de preferência) na pasta.
2. Preencha `arquivo` e `proporcao` na entrada correspondente de
   `src/data/marcas.ts`.

```ts
whatsapp: {
  nome: "WhatsApp",
  arquivo: "brands/whatsapp/whatsapp.svg",
  proporcao: 1,          // largura ÷ altura do viewBox
  acento: cor.whatsapp,
  papel: "…",
},
```

**Nenhum componente muda.** Quem lê `arquivo` é o `<Marca>`, e ele troca o
wordmark pela imagem sozinho — no tour e no render do vídeo.

## As regras que continuam valendo

- **Não distorcer.** A largura é sempre derivada da altura pela `proporcao`
  declarada. Se ela não bater com o viewBox do arquivo, o logo estica.
- **Não recolorir marca de terceiro.** O azul, o verde e o coral da peça são
  acento de **conexão** — do fio superior do card, do ponto de status, da linha.
  O corpo do card é sempre branco.
- **Não referenciar arquivo de fora** (hotlink). O render do vídeo roda sem rede
  garantida e a imagem sairia em branco.
- **WhatsApp** tem diretrizes próprias no Brand Center da Meta. Respeite-as.

## Como os arquivos são resolvidos

O Vite serve `public/` na raiz; o Remotion serve pelo `staticFile()`, que resolve
para a origem do bundle no momento do render — diferente entre Studio, render
local e Lambda.

Em vez de espalhar `import { staticFile }` pelas cenas (o que arrastaria o
Remotion para dentro do bundle da web), existe um resolvedor único em
`src/utils/asset.ts`. A raiz do Remotion o registra; a web deixa o padrão. As
cenas só chamam:

```ts
asset("fotos/fachada-letreiro.webp")
```

## As cores das integrações

| Sistema       | Cor       | Onde aparece                          |
| ------------- | --------- | ------------------------------------- |
| JP            | `#095902` | Dominante. É a peça inteira.          |
| JP (claro)    | `#56A805` | Preenchimento e destaque              |
| Dental Office | `#2F6FEB` | Fio do card, ícone, badge             |
| WhatsApp      | `#25D366` | Fio do card, ponto de status, balão   |
| n8n           | `#EA4B71` | Fio do card                           |
| IA            | `#7C5CE6` | Fio do card, classificação            |

Uma regra de contraste herdada do site e que vale aqui: **superfície escura é
`#032F01`, nunca `#095902`.** O verde claro sobre o verde oficial mede 2,87:1 e
reprova; sobre `#032F01` mede 4,96:1. Ver `docs/marca/LEIA-ME.md` na raiz do
site.

## Áudio

`public/audio/narracao.mp3` é gerado — não edite à mão, e veja
[CONTENT.md](CONTENT.md) para trocar a voz ou usar locução profissional.

MP3 e não WAV porque a mesma trilha em WAV dá 12 MB contra 3,3 MB, e ela é
baixada por quem abre a página no celular. O Remotion e o `<audio>` do navegador
leem MP3 igual.

A trilha musical está **desligada** (`TRILHA = null` em `src/data/audio.ts`).
Isso é decisão, não esquecimento: embutir música protegida numa peça que vai ser
exportada em MP4 e mostrada a terceiros é problema de licença. Para colocar uma,
veja `public/audio/LEIA-ME.md`.
