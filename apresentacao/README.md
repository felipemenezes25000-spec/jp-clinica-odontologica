# JP CRC — tour interativo e vídeo

Uma peça, dois destinos: um **tour interativo** publicado em
`/crc-institucional` no site da clínica e um **vídeo MP4** renderizável. Os dois
desenham exatamente o mesmo filme — o que muda é só quem conta o tempo.

**31 cenas · 4:33 · narração falada em português e legenda sincronizada.**

```bash
npm install

npm run dev              # tour           → http://localhost:5180/crc-tour/
npm run build            # publica em     ../public/crc-tour/
npm run narracao         # regera a voz e os tempos das legendas
npm run video:preview    # Remotion Studio
npm run video:render     # gera out/jp-crc-1080p.mp4
npm run check            # tipos + build
```

> **Sub-projeto isolado**, com o próprio `package.json`. Ele não é importado pelo
> bundle do site e não altera o build dele — decisão tomada por causa do
> `docs/INCIDENTE-BUILD-500.md`, que descreve como um ciclo entre chunks derrubou
> todas as rotas do site com o build passando limpo.

## Onde isso aparece para o público

| Onde                                   | O que é                                            |
| -------------------------------------- | -------------------------------------------------- |
| `jpclinicaodontologica.com.br/crc-institucional` | A página do site, com o caminho de volta  |
| `public/crc-tour/`                     | O app construído, servido como arquivo estático     |
| `out/jp-crc-1080p.mp4`                 | O vídeo, para WhatsApp, reunião e apresentação      |
| `out/jp-crc-capa.png`                  | A capa                                              |

Detalhes de publicação em [PUBLICACAO.md](PUBLICACAO.md).

## O que a pessoa vê

Ao abrir, três portas:

| Botão                     | O que faz                                                  |
| ------------------------- | ---------------------------------------------------------- |
| **Assistir com narração** | Toca o filme com voz e legenda                             |
| **Assistir sem som**      | O mesmo filme, só com legenda                              |
| **Explorar**              | Mapa clicável, fluxos por tipo de paciente, salto por cena |

Durante o filme: play/pause, avançar/voltar, arrastar a barra, sete capítulos,
ligar/desligar legenda e som, tela cheia, reiniciar.

Teclado: `espaço` pausa · `←` `→` movem 3 s (com `shift`, 10 s) · `F` tela cheia
· `M` mudo · `R` reinicia · `E` explorar · `Esc` fecha.

## O que o filme conta

Do dado ao resultado, em sete capítulos: de onde vêm os dados (Dental Office),
quem precisa de contato, o que roda sozinho — **faltas, retorno, pacientes
antigos, campanhas, aniversariantes** —, a conversa no WhatsApp com **IA,
agendamento, lembrete de consulta e cobrança de parcela em atraso**, o dia da
equipe e os resultados. Cena a cena em [STORYBOARD.md](STORYBOARD.md).

## Como está organizado

```
src/
  data/          conteúdo e tempos — é aqui que se edita a peça
  design-system/ cores, tipografia, blocos visuais
  motion/        a matemática do movimento (sem React, sem Remotion)
  components/    nós, conexões, celular, gráficos, janela do produto
  scenes/        as 31 cenas, na ordem do filme
  film/          o filme: dado um frame, desenha o quadro
  interactive/   player, controles, legenda, modo explorar
  remotion/      as composições de vídeo
  hooks/ utils/ audio/
scripts/         gerador de narração (voz neural + tempos das legendas)
```

A regra que sustenta tudo: **o filme é uma função pura do frame.** Nada de
`setTimeout`, `Date.now()` ou transição CSS dentro do palco. É isso que faz
pausar, arrastar a barra e renderizar um frame avulso serem o mesmo problema — e
o que garante que o MP4 seja idêntico ao que se vê no navegador.

## Tarefas comuns

| Quero…                        | Onde                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| Trocar um texto do vídeo      | `src/data/conteudo.ts`                                            |
| Trocar a narração/legenda     | `src/data/narracao.json`, depois `npm run narracao`                |
| Trocar a voz                  | `npm run narracao -- --voz pt-BR-AntonioNeural`                    |
| Trocar os números             | `src/data/metricas.ts`                                            |
| Alongar ou encurtar uma cena  | `src/data/cenas.json`, depois `npm run narracao`                   |
| Colocar um logo real          | `src/data/marcas.ts` + a pasta em `public/brands/`                 |
| Colocar música                | `public/audio/` + `src/data/audio.ts`                              |
| Regravar a locução com pessoa | `out/roteiro-narracao.txt` traz o texto com as marcações de tempo   |
| Publicar a versão nova        | `npm run build` (cai em `../public/crc-tour/`)                     |

Mais em [CONTENT.md](CONTENT.md), [ASSETS.md](ASSETS.md),
[RENDERING.md](RENDERING.md), [PUBLICACAO.md](PUBLICACAO.md),
[MOTION-SYSTEM.md](MOTION-SYSTEM.md) e [STORYBOARD.md](STORYBOARD.md).

## Três coisas que a peça se recusa a fazer

1. **Não promete percentual de receita.** Mostra o mecanismo (mais contato → mais
   resposta → mais agenda) e o valor que está parado na fila. O que vira caixa
   depende da clínica.
2. **Não passa número inventado por real.** Todos os dados são fictícios e a tela
   diz isso. Quando houver dado da clínica, troque em `metricas.ts` e vire
   `ILUSTRATIVO` para `false`: o carimbo some sozinho de todas as cenas.
3. **Não usa logo que não tem.** Só a marca da JP é real (vetorizada dos EPS da
   clínica). Dental Office, WhatsApp e n8n aparecem como wordmark do próprio
   design system até alguém colocar o arquivo oficial — ver [ASSETS.md](ASSETS.md).

## Linguagem

Quem assiste é dono de clínica, dentista, recepção e CRC — não gente de
tecnologia. Por isso não existe na tela nem na fala: *evento*, *webhook*,
*score*, *opt-out*, *job*, *lead*, *deduplicação*, `appointment.missed`. Cada uma
virou a frase que a explica. Se você for editar texto, mantenha a regra — ela
está escrita em [CONTENT.md](CONTENT.md).
