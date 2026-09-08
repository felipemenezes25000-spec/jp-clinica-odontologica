# Storyboard — 31 cenas, 4:33

A ordem e a duração vivem em [`src/data/cenas.json`](src/data/cenas.json). Mexer
lá move tudo: o início das cenas seguintes, a posição da voz na trilha e os
capítulos da barra. Depois de mexer, rode `npm run narracao`.

## A história em uma frase

> O Dental Office guarda os dados da clínica. O JP CRC transforma esses dados em
> conversa, agenda e resultado.

## Os sete capítulos

| Capítulo                | Cenas | Pergunta que responde                     |
| ----------------------- | ----- | ----------------------------------------- |
| Começo                  | 1–2   | Por que isso existe?                      |
| De onde vêm os dados    | 3–5   | O sistema inventa dado? Não.              |
| Quem precisa de contato | 6–9   | Como ele escolhe quem chamar?             |
| O que roda sozinho      | 10–13 | O que acontece sem ninguém mandar?        |
| A conversa              | 14–20 | O que o paciente vê, e quando entra gente |
| O dia da equipe         | 21–23 | Como fica o trabalho de quem usa          |
| Resultados              | 24–31 | O que dá para medir, e o que não dá       |

## As cenas

| #  | Cena                  | s  | O que precisa ficar claro                                                |
| -- | --------------------- | -- | ------------------------------------------------------------------------ |
| 01 | Abertura              | 11 | A marca, o nome e os seis assuntos — um de cada vez                      |
| 02 | O problema            | 13 | Os sinais existem, espalhados. A ligação é a memória de alguém           |
| 03 | Dental Office         | 8  | O sistema da clínica continua sendo o dono do dado                       |
| 04 | A ponte               | 7  | Existe uma camada cuidando disso, e ela é robusta                        |
| 05 | JP CRC                | 9  | O núcleo ligando módulo a módulo — "um sistema ligando"                  |
| 06 | O que ele percebe     | 10 | Dez situações, inclusive a parcela vencida. Varredura contínua           |
| 07 | Regras de contato     | 8  | Perceber ≠ mandar mensagem. Cinco checagens antes                        |
| 08 | Quem vem primeiro     | 8  | A fila é reordenada em tela, e o motivo aparece                          |
| 09 | Humano × automação    | 8  | O que a máquina faz e o que ela não faz. Mesmo peso visual               |
| 10 | As rotinas do dia     | 9  | Sete rotinas, cada uma com o gatilho escrito em português                |
| 11 | Pacientes antigos     | 9  | Milhares de pontos parados que se organizam. A cena-chave                |
| 12 | Contato aos poucos    | 8  | Escala com limite: lote, descanso, opt-out, horário                      |
| 13 | **Campanhas**         | 11 | Campanha não é disparo. Aniversariantes é a que não vende nada           |
| 14 | WhatsApp              | 9  | Sai do diagrama e vira conversa. A etiqueta diz quem escreveu            |
| 15 | A leitura             | 8  | A frase entra e sai como quatro campos. Não é "IA que conversa"          |
| 16 | Outras respostas      | 8  | Seis respostas reais, inclusive duas que a máquina não resolve           |
| 17 | Marcando a consulta   | 11 | A revalidação do horário. É o que separa demo de produção                |
| 18 | **Lembrete**          | 10 | Três avisos — e o horário que volta para a agenda quando alguém desiste  |
| 19 | **Cobrança**          | 11 | O tom primeiro, as quatro regras depois, o número por último             |
| 20 | Quando a equipe entra | 7  | Mesma tela da 14, decisão oposta. A etiqueta do balão muda               |
| 21 | A tela do dia         | 9  | "16 precisam de você / 82 já estão sendo cuidados"                       |
| 22 | As conversas          | 8  | O histórico chega junto. Ninguém pergunta o que o sistema já sabe        |
| 23 | A ficha do paciente   | 8  | Dental Office + automação + paciente na MESMA coluna                     |
| 24 | O que se acumula      | 8  | Quatro números, com a proporção à vista                                  |
| 25 | Etapa por etapa       | 8  | O funil com percentual — permite perguntar "por que caiu aqui?"          |
| 26 | Antes e depois        | 7  | O "antes" é apagado, não ridicularizado                                  |
| 27 | O caminho             | 8  | A escada cresce e o eixo NÃO tem número. De propósito                    |
| 28 | A visão da gestão     | 8  | "Valor parado na fila", não receita. A distinção está na tela            |
| 29 | Tudo junto            | 9  | A câmera se afasta e o ecossistema aparece montado                       |
| 30 | Em uma frase          | 8  | Três linhas, uma de cada vez, no mesmo lugar                             |
| 31 | Final                 | 9  | A marca, as quatro promessas, a fachada da clínica ao fundo              |

## As quatro rotinas que o cliente pediu por nome

| Assunto              | Onde aparece                                                    |
| -------------------- | --------------------------------------------------------------- |
| **Campanhas**        | Cena 13 inteira · rotina na 10 · fluxo no modo Explorar          |
| **Aniversariantes**  | Cena 13 (cartão + a mensagem escrita no celular) · rotina na 10  |
| **Cobrança**         | Cena 19 inteira · cartão na 6 · rotina na 10 · painel na 28      |
| **Lembretes**        | Cena 18 inteira · rotina na 10 · lado "automação" da 9           |

## As costuras

Cenas não cortam: elas se emendam. Meio segundo de sobreposição e um objeto que
atravessa.

- **1 → 2** um ponto verde sai andando para a direita
- **3 → 4 → 5** o mesmo barramento de dados sai de quadro e entra na cena seguinte
- **6 → 7** o cartão "Faltou" fica aceso e vira a Maria Souza da cena 7
- **12 → 13** o selo "a próxima parada é a conversa"
- **14 → 15** um selo violeta: "é esta resposta que o sistema lê →"
- **17 → 18** a consulta é criada; a cena seguinte cuida de ela acontecer
- **19 → 20** mesma composição, paciente diferente, decisão oposta

## Como cortar a peça

Se precisar de uma versão curta, o corte natural é: **1, 2, 5, 6, 11, 13, 14,
17, 19, 21, 29, 31** — dá cerca de 2 minutos e preserva o arco inteiro. Não corte
a 7 e a 9 se o público tiver dúvidas sobre "o robô vai falar com meu paciente":
são elas que respondem.
