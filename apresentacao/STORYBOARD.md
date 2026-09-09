# Storyboard — 35 cenas, 5:24

A ordem e a duração vivem em [`src/data/cenas.json`](src/data/cenas.json). Mexer
lá move tudo: o início das cenas seguintes, a posição da voz na trilha e os
capítulos da barra. Depois de mexer, rode `npm run narracao` e depois
`npm run trilha` — nessa ordem, porque a música se abaixa nos pontos onde a voz
entra e precisa saber onde ela ficou.

Se a cena nova entrou no meio, rode também `npm run cenas:ordenar`: ele renumera
os arquivos para o nome bater com a posição no filme.

## A história em uma frase

> O Dental Office guarda os dados da clínica. O JP CRC transforma esses dados em
> conversa, agenda e resultado.

## Os oito capítulos

| Capítulo                | Cenas | Pergunta que responde                          |
| ----------------------- | ----- | ---------------------------------------------- |
| Começo                  | 1–2   | Por que isso existe?                           |
| De onde vêm os dados    | 3–5   | O sistema inventa dado? Não.                   |
| Quem precisa de contato | 6–9   | Como ele escolhe quem chamar?                  |
| O que roda sozinho      | 10–15 | O que acontece sem ninguém mandar?             |
| Anúncios e leads        | 16–17 | O que acontece com quem clica no anúncio?      |
| A conversa              | 18–24 | O que o paciente vê, e quando entra gente      |
| O dia da equipe         | 25–27 | Como fica o trabalho de quem usa               |
| Resultados              | 28–35 | O que dá para medir, e o que não dá            |

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
| 12 | **Orçamentos parados**| 12 | A fila mais cara. O plano já foi apresentado e a conversa parou          |
| 13 | Contato aos poucos    | 8  | Escala com limite: lote, descanso, quem pediu para parar, horário        |
| 14 | **Campanhas**         | 11 | Campanha não é disparo. Aniversariantes é a que não vende nada           |
| 15 | **Montar campanha**   | 12 | Três passos, feitos pela clínica. O tamanho da lista aparece antes       |
| 16 | **Lead do anúncio**   | 11 | O número grande é o TEMPO de resposta, não a quantidade de leads         |
| 17 | **Custo por paciente**| 12 | O funil termina em quem sentou na cadeira, não em cliques                |
| 18 | WhatsApp              | 9  | Sai do diagrama e vira conversa. A etiqueta diz quem escreveu            |
| 19 | A leitura             | 8  | A frase entra e sai como quatro campos. Não é "IA que conversa"          |
| 20 | Outras respostas      | 8  | Seis respostas reais, inclusive duas que a máquina não resolve           |
| 21 | Marcando a consulta   | 11 | A revalidação do horário. É o que separa demo de produção                |
| 22 | **Lembrete**          | 10 | Três avisos — e o horário que volta para a agenda quando alguém desiste  |
| 23 | **Cobrança**          | 15 | O tom primeiro, as regras depois, Pix/boleto/cartão, e o número no fim   |
| 24 | Quando a equipe entra | 7  | Mesma tela da 18, decisão oposta. A etiqueta do balão muda               |
| 25 | A tela do dia         | 9  | "16 precisam de você / 82 já estão sendo cuidados"                       |
| 26 | As conversas          | 8  | O histórico chega junto. Ninguém pergunta o que o sistema já sabe        |
| 27 | A ficha do paciente   | 8  | Dental Office + automação + paciente na MESMA coluna                     |
| 28 | O que se acumula      | 8  | Quatro números, com a proporção à vista                                  |
| 29 | Etapa por etapa       | 8  | O funil com percentual — permite perguntar "por que caiu aqui?"          |
| 30 | Antes e depois        | 7  | O "antes" é apagado, não ridicularizado                                  |
| 31 | O caminho             | 8  | A escada cresce e o eixo NÃO tem número. De propósito                    |
| 32 | A visão da gestão     | 8  | "Valor parado na fila", não receita. A distinção está na tela            |
| 33 | Tudo junto            | 9  | A câmera se afasta e o ecossistema aparece montado                       |
| 34 | Em uma frase          | 8  | Três linhas, uma de cada vez, no mesmo lugar                             |
| 35 | Final                 | 9  | A marca, as quatro promessas, a fachada da clínica ao fundo              |

## Onde cada assunto pedido aparece

| Assunto                | Onde aparece                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| **Campanhas**          | Cenas 14 e 15 · rotina na 10 · fluxo no modo Explorar                |
| **Aniversariantes**    | Cena 14 (cartão + a mensagem escrita no celular) · rotina na 10      |
| **Cobrança**           | Cena 23 inteira · cartão na 6 · rotina na 10 · painel na 32          |
| **Lembretes**          | Cena 22 inteira · rotina na 10 · lado "automação" da 9               |
| **Orçamento parado**   | Cena 12 inteira · cartão na 6 · fluxo no modo Explorar               |
| **Tráfego pago**       | Cenas 16 e 17 · fluxo no modo Explorar                               |

## O fio da inteligência

Seis cenas trazem no rodapé a linha **"Por que"** — o critério que o sistema usou
para decidir o que acabou de fazer (componente `Raciocinio`, textos em
`RACIOCINIO` no `conteudo.ts`). Estão nas cenas **6, 9, 12, 13, 15, 19, 20 e 22**.

A razão de existirem: uma tela que só mostra o resultado parece mágica, e mágica
não se compra. Mostrar o critério seis vezes convence mais do que afirmar uma vez
que o sistema é inteligente.

## As costuras

Cenas não cortam: elas se emendam. Meio segundo de sobreposição e um objeto que
atravessa.

- **1 → 2** um ponto verde sai andando para a direita
- **3 → 4 → 5** o mesmo barramento de dados sai de quadro e entra na cena seguinte
- **6 → 7** o cartão "Faltou" fica aceso e vira a Maria Souza da cena 7
- **11 → 12** a base parada da 11 vira a fila de orçamentos da 12
- **13 → 14** o selo "a próxima parada é a conversa"
- **14 → 15** a campanha pronta da 14 vira a campanha sendo montada na 15
- **16 → 17** o registro de origem da 16 é o que torna o custo da 17 possível
- **18 → 19** um selo violeta: "o sistema lê esta resposta →"
- **21 → 22** a consulta é criada; a cena seguinte cuida de ela acontecer
- **23 → 24** mesma composição, paciente diferente, decisão oposta

## Regra de composição que não se quebra

Nada de cena passa de **y = 890** (`TETO_DA_LEGENDA`, em `components/CenaBase.tsx`).
Dali para baixo a legenda desenha por cima — e como ela é opaca, o que cruzar
some da tela sem erro nenhum no build. Rodapé de uma linha começa em `RODAPE`
(858).

## Como cortar a peça

Se precisar de uma versão curta, o corte natural é: **1, 2, 5, 6, 11, 12, 14, 16,
18, 21, 23, 25, 33, 35** — dá cerca de 2min30 e preserva o arco inteiro. Não corte
a 7 e a 9 se o público tiver dúvidas sobre "o robô vai falar com meu paciente":
são elas que respondem.
