# Trilha e efeitos

Vazio de propósito. A peça **não embute música protegida**.

## Trilha

Coloque aqui o arquivo (`trilha.mp3` ou `.m4a`) e aponte em
`src/data/audio.ts`:

```ts
export const TRILHA: string | null = "/audio/trilha.mp3";
```

Com `null` (o padrão) o tour e o render funcionam em silêncio — nada quebra.

Perfil que combina com a peça: minimal, moderno, corporativo, tecnológico,
positivo; sem batida marcada e sem crescendo dramático. Use algo licenciado por
você ou royalty-free.

## Efeitos

Os efeitos são **sintetizados em tempo real** pela Web Audio API
(`src/audio/efeitos.ts`) — não há arquivo para baixar. São quatro, todos abaixo
de 200 ms: `whoosh` de transição, `click` de nó, `pulso` de dado e `sucesso` de
agendamento. Ficam desligados por padrão; o botão de som no player liga.

No render do Remotion os efeitos **não** entram: Web Audio depende do relógio do
navegador e sairia dessincronizado do frame. Se quiser efeitos no MP4, coloque-os
na trilha durante a edição de áudio.
