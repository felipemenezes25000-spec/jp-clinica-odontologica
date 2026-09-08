# O sistema de movimento

## A regra única

**O filme é uma função pura do frame.**

```tsx
<Filme frame={1234} />   // sempre desenha exatamente o mesmo quadro
```

Quem chama muda conforme o destino:

| Destino  | Quem conta o tempo                            |
| -------- | --------------------------------------------- |
| Tour web | `useRelogio()` — `requestAnimationFrame`      |
| MP4      | `useCurrentFrame()` do Remotion               |

As cenas não sabem em qual dos dois estão. Elas pedem `useFrame()` e recebem um
número.

### O que isso proíbe

Dentro do palco, nada de:

- `setTimeout` / `setInterval`
- `transition` ou `@keyframes` em CSS
- `Date.now()`, `performance.now()`
- `Math.random()`

Os três primeiros dependem do relógio do navegador; o Remotion desenha um frame
avulso e eles sairiam congelados no primeiro estado. O quarto poria a partícula
num lugar no preview e em outro no render — e a nuvem tremeria.

Para aleatoriedade estável existe `aleatorio(semente)` em `motion/timing.ts`: a
posição do ponto 417 é uma função do número 417, então é a mesma para sempre.

### Onde o movimento com relógio é permitido

No **chrome**: capa, controles, tooltips, modo explorar. Ali o Framer Motion
entra à vontade — nada disso vai para o MP4.

## As camadas

```
motion/timing.ts      matemática pura. Zero imports.
motion/frame.tsx      o relógio (contexto) + frame local da cena
motion/primitivas.tsx Entrar, Crescer, Contador, Camera, Traço, Pulsos, Holofote…
```

`timing.ts` não importa nem React nem Remotion **de propósito**: é o que impede
o bundle da web de arrastar o Remotion junto.

## Vocabulário

| Primitiva     | Para quê                                                    |
| ------------- | ------------------------------------------------------------ |
| `Surgir`      | só opacidade                                                 |
| `Entrar`      | opacidade + deslocamento (o mais usado)                      |
| `Crescer`     | opacidade + escala. Nunca abaixo de 0,94 — abaixo vira "pop" |
| `Escalonado`  | lista com atraso por índice                                  |
| `Contador`    | número que sobe; `casas` para decimal ("3,4 min")            |
| `Barra`       | proporção que cresce                                         |
| `Camera`      | transforma o palco inteiro — enquadramento, não zoom de card |
| `Plano`       | paralaxe muito discreta                                      |
| `Traco`       | desenha um `<path>` progressivamente                         |
| `Pulsos`      | pontos de dado correndo por um caminho                       |
| `Holofote`    | escurece tudo menos um retângulo                             |
| `Respirar`    | 1,2% de escala em ciclo lento. **Um por filme** (o núcleo)   |

### Curvas

`easeOut` para entradas, `easeOutQuint` para deslocamentos, `cinema` (potência
4) para a câmera, `assentar` para o card que pousa. Nada de mola exagerada:
câmera boa não tem repique.

## O comprimento do traço

`Traco` precisa saber o comprimento do caminho porque `strokeDasharray` pede um
número. O caminho óbvio seria `path.getTotalLength()`, mas ele exige o elemento
já no DOM — e o Remotion pinta o frame antes de qualquer efeito rodar, então o
primeiro frame de cada cena sairia com a linha inteira desenhada.

Por isso `utils/caminho.ts` devolve `{ d, comprimento }` juntos, calculando o
comprimento por amostragem da curva (64 amostras, erro < 0,1%).

## A câmera

```tsx
<Camera chaves={[
  { frame: 0,  posicao: { x: 0, y: 40, escala: 1.14 } },
  { frame: 76, posicao: { x: 0, y: 0,  escala: 1 } },
]}>
```

Transforma o **palco**, não os elementos. É o que dá a sensação de "a câmera se
afastou" em vez de "os cards ficaram menores": o enquadramento muda junto, e o
que sai de quadro sai de verdade.

Com `prefers-reduced-motion`, `Camera` devolve os filhos sem transformação
nenhuma.

## Transições entre cenas

Meio segundo de sobreposição (`SOBREPOSICAO` em `cenas.json`). Durante ela o
palco desenha **duas** cenas ao mesmo tempo, a que sai perdendo opacidade e a que
entra ganhando. Não é fade-to-black: é emenda.

A última cena não desce — não há sucessora para cobrir o vão, e sem essa exceção
o filme terminaria desaparecendo antes do fim.

## A área segura da legenda

A legenda ocupa a faixa de **y ≥ 915** do palco. **Nenhuma cena põe conteúdo
abaixo disso.** É a regra que fez a legenda parar de cobrir texto — e vale para
os dois destinos, porque a legenda queimada no MP4
(`remotion/LegendaGravada.tsx`) mora na mesma faixa.

O número da cena no canto (`SeloDeCena`) também vem da linha do tempo, não de um
argumento: escrito à mão em cada arquivo, ele ficava errado toda vez que uma
cena entrava no meio do filme.

## Movimento reduzido

`prefers-reduced-motion` **não congela o filme** — a informação está no
movimento. O que ele faz: zera deslocamentos, desliga paralaxe, partículas e
câmera. O conteúdo continua aparecendo, só que sem viagem.

O render do Remotion nunca herda a preferência da máquina que renderiza.
