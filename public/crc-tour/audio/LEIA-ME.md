# Áudio

Dois arquivos, os dois **gerados** — não edite à mão.

| Arquivo        | O que é                          | Como regerar        |
| -------------- | -------------------------------- | ------------------- |
| `narracao.mp3` | A voz, alinhada ao frame 0       | `npm run narracao`  |
| `trilha.mp3`   | A música de fundo                | `npm run trilha`    |

## A trilha

Sintetizada por `scripts/gerar-trilha.mjs`. Não é uma faixa baixada: é um
colchão gerado por código, o que resolve a questão de licença de vez — a peça é
exportada em MP4 e mostrada a terceiros.

O que ela toca: Ré maior, 72 BPM, quatro acordes girando a cada 26 segundos
(Rémaj9 → Sim7 → Solmaj7 → Lá6), um sub grave sustentando e um arpejo esparso
marcando o tempo sem virar batida.

**Ela abaixa sozinha quando a voz fala.** O gerador lê os mesmos tempos de
narração que a legenda usa e derruba a música para 38% durante cada frase, com
rampa de 0,3 s. Como isso é feito no arquivo, vale igual no site e no vídeo, sem
depender de processamento em tempo real.

Se mudar a narração, rode `npm run narracao` **e depois** `npm run trilha` — o
recuo precisa dos tempos novos.

### Ajustar

| O quê                        | Onde                                            |
| ---------------------------- | ----------------------------------------------- |
| Volume na mistura            | `VOLUME_TRILHA` em `src/data/audio.ts`          |
| Quanto ela cede sob a voz    | `NIVEL_SOB_VOZ` em `scripts/gerar-trilha.mjs`   |
| Acordes, andamento, timbre   | `PROGRESSAO` e `BPM` no mesmo arquivo           |
| Desligar a música            | `TRILHA = null` em `src/data/audio.ts`          |

### Trocar por uma faixa sua

Coloque o arquivo aqui e aponte em `src/data/audio.ts`:

```ts
export const TRILHA: string | null = "audio/minha-trilha.mp3";
```

Use algo licenciado por você. Perfil que combina com a peça: minimal, moderno,
corporativo, sem batida marcada e sem crescendo dramático. Se a faixa não tiver o
recuo sob a voz, baixe `VOLUME_TRILHA` para algo em torno de 0,12.

## Efeitos

Os efeitos são **sintetizados em tempo real** pela Web Audio API
(`src/audio/efeitos.ts`) — não há arquivo. São quatro, todos abaixo de 200 ms.
Ficam desligados por padrão.

No render do Remotion eles **não** entram: Web Audio depende do relógio do
navegador e sairia dessincronizado do frame.
