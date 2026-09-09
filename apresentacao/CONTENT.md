# Editar o conteúdo

Nenhum texto, número ou tempo mora dentro de componente. Tudo está em
`src/data/`. Dá para revisar a peça inteira sem abrir um `.tsx`.

| Arquivo                 | O que é                                             | Formato |
| ----------------------- | --------------------------------------------------- | ------- |
| `cenas.json`            | Ordem e duração das cenas                           | JSON    |
| `narracao.json`         | A fala e a legenda (é o mesmo texto)                | JSON    |
| `narracao.duracoes.json`| **Gerado.** Duração medida de cada fala             | JSON    |
| `conteudo.ts`           | Títulos, listas, frases de cada cena                | TS      |
| `conteudo.ts` → `RACIOCINIO` | As linhas "Por que" do rodapé                  | TS      |
| `metricas.ts`           | Todos os números                                    | TS      |
| `explorar.ts`           | Textos do modo explorar                             | TS      |
| `marcas.ts`             | Registro de logos                                   | TS      |
| `audio.ts`              | Caminhos e volumes de narração e trilha             | TS      |

Os dois primeiros são JSON, e não TypeScript, por um motivo: o gerador de
narração roda em Node puro e precisa ler exatamente os mesmos números que a tela
usa. Duas cópias divergiriam na primeira alteração — e o áudio sairia fora de
lugar sem ninguém perceber até assistir.

## A regra de linguagem

Quem assiste **não é da área de tecnologia**. Não entra na tela nem na fala:

| Nunca                    | Sempre                                        |
| ------------------------ | --------------------------------------------- |
| evento                   | "quando o paciente falta"                     |
| `appointment.missed`     | "não veio na consulta de ontem"               |
| webhook                  | "mudou lá, chega aqui na hora"                |
| job / cron               | "uma varredura diária"                        |
| score                    | "nota de prioridade" — e o motivo do lado     |
| opt-out                  | "quem pede para parar nunca mais recebe"      |
| cooldown                 | "um tempo de descanso entre campanhas"        |
| lead                     | "quem pediu informação agora"                 |
| deduplicação             | "o mesmo paciente nunca vira dois cadastros"  |
| jornada                  | "rotina", "fila"                              |
| CRC (sozinho)            | "a equipe"                                    |

Frases curtas. Uma ideia por frase. Se precisar de vírgula para caber, provavelmente
cabem duas frases.

## Mudar a narração e a legenda

1. Edite o texto em `src/data/narracao.json`. `inicio` é o **segundo dentro da
   cena** — não do filme inteiro.
2. Rode `npm run narracao`.
3. Leia o relatório. Se alguma fala não couber, ele diz exatamente qual e
   quanto falta:

```
1 ajuste(s) de tempo recomendados:
  · A fala "Confere de novo e cria a consulta…" passa 0.4s do fim da cena
    "agendamento" (10s). Encurte a frase ou alongue a cena em cenas.json.
```

**Você não escreve a duração da legenda.** Ela é medida do áudio gerado, com o
silêncio das pontas já cortado, e gravada em `narracao.duracoes.json`. É por isso
que a legenda entra quando a voz começa e sai quando ela termina — por
construção, não por tentativa e erro.

4. Rode `npm run trilha` **depois**. A música se abaixa nos trechos falados, e
   para isso lê as durações que o passo anterior acabou de medir. Na ordem
   invertida, ela fica alta por cima da voz.
5. Rode `npm run audio:conferir`. Ele decodifica os dois arquivos e mede bloco a
   bloco; se algum trecho ficou mudo, ele falha dizendo em que minuto.

O passo 5 não é zelo excessivo: a trilha já saiu uma vez com três minutos de
silêncio no meio — um `NaN` de arredondamento entrou num filtro com estado e
zerou tudo dali para a frente. O arquivo tinha o tamanho certo e o build passou
limpo. Quem descobriu foi o cliente assistindo.

## A linha "Por que"

Em oito cenas aparece um rodapé com o critério que o sistema usou para decidir o
que acabou de fazer. Os textos ficam em `RACIOCINIO`, em `conteudo.ts`, e o
componente é o `Raciocinio` de `components/CenaBase.tsx`.

Duas regras ao editar: **uma linha só** (duas encostam na legenda) e **responder
por que, não o quê** — "junta todos e começa pelo maior" descreve; "orçamento
parado quase nunca é não, é depois" explica.

## A voz

O gerador tem dois motores:

| Motor                | Como soa                    | Precisa de internet |
| -------------------- | --------------------------- | ------------------- |
| `neural` **(padrão)** | Como gente                  | Sim                 |
| `windows`            | Robótica                    | Não                 |

O padrão é a voz neural `pt-BR-FranciscaNeural`. Se a rede falhar, o script cai
sozinho para a voz do Windows e avisa — nunca existe um estado em que a peça
fica sem áudio.

```bash
npm run narracao                                  # Francisca, ritmo −4%
npm run narracao -- --voz pt-BR-AntonioNeural     # voz masculina
npm run narracao -- --voz pt-BR-ThalitaNeural     # mais jovem
npm run narracao -- --ritmo -8%                   # mais devagar
npm run narracao -- --motor windows               # offline
```

### Trocar por locução humana

1. Abra `out/roteiro-narracao.txt` — sai pronto do `npm run narracao`, com a
   marcação de tempo de cada linha.
2. Grave seguindo as marcações.
3. Substitua `public/audio/narracao.mp3` pela gravação (mesma duração total,
   alinhada ao início do filme).
4. **Não** rode `npm run narracao` depois: ele sobrescreveria o arquivo. Se a
   locução tiver tempos diferentes dos medidos, ajuste
   `src/data/narracao.duracoes.json` à mão para as legendas acompanharem.

## Números

`metricas.ts` tem uma constante no topo:

```ts
export const ILUSTRATIVO = true;
```

Enquanto for `true`, as cenas de resultado carimbam "Exemplo ilustrativo". Quando
os números forem da clínica, troque os valores e vire para `false`: o carimbo
some sozinho de todas as cenas.

**O que a peça nunca afirma**, e não deve passar a afirmar:

- percentual de aumento de receita;
- que o valor na fila é dinheiro que entrou (é orçamento em aberto);
- que a automação substitui a equipe.

## Pacientes

Todos fictícios: Maria Souza, João Lima, Ana Costa, Carlos Antunes. Telefones
mascarados. Nenhuma correspondência com paciente real — e assim precisa
continuar.
