# Publicar no site

O tour é servido pelo site da clínica em:

```
https://www.jpclinicaodontologica.com.br/crc-institucional
```

## As três peças

```
apresentacao/                     o código (este sub-projeto)
   ↓  npm run build
public/crc-tour/                  o app construído, arquivo estático
   ↑  <iframe>
src/routes/crc-institucional.tsx  a página do site
```

## Como atualizar

```bash
npm --prefix apresentacao run build     # ou: npm run tour:build, na raiz do site
```

O resultado cai direto em `public/crc-tour/`. **Comite essa pasta**: o build do
site na Vercel roda só o `vite build` da raiz e não constrói o sub-projeto — se o
`public/crc-tour/` não estiver no repositório, a página sobe vazia.

Depois é o deploy normal do site.

## Por que a pasta se chama `crc-tour` e não `crc-institucional`

Porque uma pasta em `public/` com o mesmo nome da rota **a sombreia**: o servidor
de arquivos estáticos responde antes do roteador, `/crc-institucional` devolvia o
`index.html` do tour, e a página do site — com o caminho de volta e as metatags —
nunca chegava a rodar. Aconteceu; o nome diferente é a correção.

## Por que a página usa `<iframe>`

Três razões, em ordem de peso:

1. **O incidente do build.** `docs/INCIDENTE-BUILD-500.md` conta como um ciclo
   entre chunks derrubou todas as rotas do site com o build passando limpo, e por
   isso `vite.config.ts` ainda força `inlineDynamicImports` no ambiente SSR.
   Somar meio megabyte de JavaScript de animação àquele bundle é exatamente o
   tipo de mudança que reabre o problema — e o sintoma apareceria nas páginas de
   tratamento, não aqui.
2. **O tour tem o próprio pipeline.** Ele é renderizado em vídeo pelo Remotion a
   partir dos MESMOS componentes. Trazê-lo para `src/` obrigaria a manter duas
   cópias, e a primeira alteração de texto já as separaria.
3. **Isolamento de verdade.** O tour desliga a rolagem, captura o teclado e
   reescala um palco de 1920×1080. Dentro do documento do site isso brigaria com
   o `scroll-behavior` global e com o `overflow-x: hidden` do `body`.

O `<iframe>` leva `allow="fullscreen; autoplay"` — sem isso o botão de tela cheia
e a narração viram enfeite.

## Peso da página

| Arquivo                | Tamanho |
| ---------------------- | ------- |
| JavaScript (gzip)      | ~150 KB |
| CSS (gzip)             | ~2 KB   |
| Narração (MP3)         | ~3,3 MB |
| Logos e fotos          | ~500 KB |

A narração é o item pesado, e ela só é baixada quando a pessoa aperta
"Assistir" — o `<audio>` tem `preload="auto"`, mas o navegador só busca o
arquivo inteiro depois do gesto. Se isso vier a incomodar, o caminho é gerar a
narração em `--bitrate 64k` no gerador.

## SEO

A rota é `noindex, follow`: é uma página de apresentação interna, não deve
competir com as páginas de tratamento na busca, mas os links dentro dela
continuam valendo. Título, descrição e `og:image` estão no `head()` da rota.
