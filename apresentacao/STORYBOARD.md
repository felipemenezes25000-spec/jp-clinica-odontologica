# Storyboard — 51 cenas, 8:23

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

## Os nove capítulos

| Capítulo                | Cenas | Pergunta que responde |
| ----------------------- | ----- | --------------------- |
| Começo                  | 1–2   | Por que isso existe? |
| De onde vêm os dados    | 3–5   | O sistema inventa dado? Não. |
| Quem precisa de contato | 6–10  | Como ele escolhe quem chamar? |
| O que roda sozinho      | 11–16 | O que acontece sem ninguém mandar? |
| Anúncios e leads        | 17–18 | O que acontece com quem clica no anúncio? |
| A conversa              | 19–26 | O que o paciente vê, e quando entra gente |
| **O agente**            | 27–32 | A IA age sozinha? Quanto? E quem segura? |
| O dia da equipe         | 33–37 | Como fica o trabalho de quem usa |
| Resultados              | 38–51 | O que dá para medir, e o que não dá |

## As cenas

| #  | Cena                         |  s | O que precisa ficar claro |
| -- | ---------------------------- | -: | ------------------------- |
| 01 | Abertura                     | 11 | A marca, o nome e os seis assuntos — um de cada vez |
| 02 | O problema                   | 13 | Os sinais existem, espalhados. A ligação é a memória de alguém |
| 03 | Dental Office                |  8 | O sistema da clínica continua sendo o dono do dado |
| 04 | A ponte                      |  7 | A cada dez minutos ele pergunta o que mudou. Não é tempo real, e a cena diz isso |
| 05 | JP CRC                       |  9 | O núcleo ligando módulo a módulo — “um sistema ligando” |
| 06 | O que ele percebe            | 10 | Dez situações, inclusive a parcela vencida. Varredura contínua |
| 07 | Regras de contato            |  8 | Perceber ≠ mandar mensagem. Cinco checagens antes |
| 08 | Quem vem primeiro            |  8 | A fila é reordenada em tela, e o motivo aparece |
| 09 | **Quem está sumindo**        | 10 | Ninguém cancela um dentista. O risco é a ausência crescendo |
| 10 | Humano × automação           |  8 | O que a máquina faz e o que ela não faz. Mesmo peso visual |
| 11 | As rotinas do dia            |  9 | Sete rotinas, cada uma com o gatilho escrito em português |
| 12 | Pacientes antigos            |  9 | Milhares de pontos parados que se organizam. A cena-chave |
| 13 | Orçamentos parados           | 12 | A fila mais cara. O plano já foi apresentado e a conversa parou |
| 14 | Contato aos poucos           |  8 | Escala com limite: lote, descanso, quem pediu para parar, horário |
| 15 | Campanhas                    | 11 | Campanha não é disparo. Aniversariantes é a que não vende nada |
| 16 | Montar campanha              | 12 | Três passos, feitos pela clínica. O tamanho da lista aparece antes |
| 17 | Lead do anúncio              | 11 | O número grande é o TEMPO de resposta, não a quantidade de leads |
| 18 | Custo por paciente           | 12 | O funil termina em quem sentou na cadeira, não em cliques |
| 19 | WhatsApp                     |  9 | Sai do diagrama e vira conversa. A etiqueta diz quem escreveu |
| 20 | A leitura                    |  8 | A frase entra e sai como quatro campos. Não é “IA que conversa” |
| 21 | Outras respostas             |  8 | Seis respostas reais, inclusive duas que a máquina não resolve |
| 22 | Marcando a consulta          | 11 | A revalidação do horário. É o que separa demo de produção |
| 23 | Lembrete                     | 10 | Três avisos — e o horário que volta para a agenda |
| 24 | **A cadeira que vagou**      | 12 | O que já vagou e o que vai vagar, juntos. Convite de três em três |
| 25 | Cobrança                     | 15 | O tom primeiro, as regras depois. A política de pagamento, não um link |
| 26 | Quando a equipe entra        |  7 | Mesma tela da 19, decisão oposta. A etiqueta do balão muda |
| 27 | **O agente age**             | 12 | Ele AGE. Três grupos por risco, e o executor autoriza depois do modelo |
| 28 | **Os nove portões**          | 13 | Nove portões, e um deles barrando na tela sobre um caso concreto |
| 29 | **Centro de autonomia**      | 13 | Seis degraus × dez assuntos. A chave geral é o teto |
| 30 | **O que a clínica ensina**   | 11 | Ele só sabe o que a clínica escreveu — e dá para testar antes |
| 31 | **A prova do agente**        | 12 | O veredicto primeiro. Reprovado, o botão de ligar recusa |
| 32 | **O que ele pensou**         | 11 | “Nenhuma destas foi enviada”, com o portão e o custo de cada turno |
| 33 | A tela do dia                |  9 | “16 precisam de você / 82 já estão sendo cuidados” |
| 34 | As conversas                 |  8 | O histórico chega junto. Ninguém pergunta o que o sistema já sabe |
| 35 | A ficha do paciente          |  8 | Dental Office + automação + paciente na MESMA coluna |
| 36 | **O que ficou para trás**    | 10 | Mede o processo, não a pessoa. Cada linha termina em pergunta |
| 37 | **Mais de uma unidade**      |  9 | Nada se mistura, e cada pessoa vê só onde trabalha |
| 38 | O que se acumula             |  8 | Quatro números, com a proporção à vista |
| 39 | Etapa por etapa              |  8 | O funil com percentual — permite perguntar “por que caiu aqui?” |
| 40 | **Radar de receita**         | 12 | O esperado na frente, o potencial ao lado com a etiqueta “se tudo fechar” |
| 41 | **Orçamento → tratamento**   | 12 | Quase metade não vira tratamento — e POR QUÊ, em proporção |
| 42 | **O sistema aprende**        | 11 | Guarda a preferência, e se recusa a declarar vencedor sem evidência |
| 43 | **A meta com a régua**       | 11 | A régua aparece antes da meta. Rascunho até alguém aprovar |
| 44 | **A manhã do dono**          | 10 | O que mudou e onde tem cadeira vazia. Este painel não age |
| 45 | **Quanto a IA custa**        | 10 | O gasto dentro do teto. Passou, o sistema para |
| 46 | Antes e depois               |  7 | O “antes” é apagado, não ridicularizado |
| 47 | O caminho                    |  8 | A escada cresce e o eixo NÃO tem número. De propósito |
| 48 | A visão da gestão            |  8 | “Valor parado na fila”, não receita. A distinção está na tela |
| 49 | Tudo junto                   |  9 | A câmera se afasta e o ecossistema aparece montado |
| 50 | Em uma frase                 |  8 | Três linhas, uma de cada vez, no mesmo lugar |
| 51 | Final                        |  9 | A marca, as quatro promessas, a fachada da clínica ao fundo |

## Onde cada assunto pedido aparece

| Assunto              | Onde aparece                                                |
| -------------------- | ----------------------------------------------------------- |
| **Campanhas**        | Cenas 15 e 16 · rotina na 11 · fluxo no modo Explorar        |
| **Aniversariantes**  | Cena 15 (cartão + a mensagem no celular) · rotina na 11      |
| **Cobrança**         | Cena 25 inteira · cartão na 6 · rotina na 11 · painel na 48  |
| **Lembretes**        | Cena 23 inteira · rotina na 11 · lado "automação" da 10      |
| **Orçamento parado** | Cena 13 inteira · cena 41 (a conversão) · fluxo no Explorar  |
| **Tráfego pago**     | Cenas 17 e 18 · fluxo no modo Explorar                       |
| **O agente de IA**   | O capítulo 7 inteiro — cenas 27 a 32                         |
| **Agenda cheia**     | Cena 24 (a cadeira que vagou) · cena 9 (quem está sumindo)   |
| **Gestão**           | Cenas 40 a 45 · cena 48                                      |

## O fio da inteligência

Vinte cenas trazem no rodapé a linha **"Por que"** — o critério que o sistema
usou para decidir o que acabou de fazer (componente `Raciocinio`; os textos vivem
em `RACIOCINIO` e no campo `raciocinio` de cada bloco do `conteudo.ts`).

A razão de existirem: uma tela que só mostra o resultado parece mágica, e mágica
não se compra. Mostrar o critério vinte vezes convence mais do que afirmar uma
vez que o sistema é inteligente.

Para conferir quais cenas o trazem:

```bash
grep -l "<Raciocinio" apresentacao/src/scenes/*.tsx
```

## As costuras

Cenas não cortam: elas se emendam. Meio segundo de sobreposição e um objeto que
atravessa.

- **1 → 2** um ponto verde sai andando para a direita
- **3 → 4 → 5** o mesmo barramento de dados sai de quadro e entra na cena seguinte
- **6 → 7** o cartão "Faltou" fica aceso e vira a Maria Souza da cena 7
- **12 → 13** a base parada da 12 vira a fila de orçamentos da 13
- **14 → 15** o selo "a próxima parada é a conversa"
- **15 → 16** a campanha pronta da 15 vira a campanha sendo montada na 16
- **17 → 18** o registro de origem da 17 é o que torna o custo da 18 possível
- **19 → 20** um selo violeta: "o sistema lê esta resposta →"
- **22 → 23** a consulta é criada; a cena seguinte cuida de ela acontecer
- **25 → 26** mesma composição, paciente diferente, decisão oposta
- **26 → 27** a equipe assume na 26; a 27 explica o que a máquina podia ter feito
- **27 → 28** a cena mostra o agente agindo; a seguinte mostra o que o impede —
  e a ordem é regra, não gosto: invertida, a plateia sai assustada do primeiro corte

## Regra de composição que não se quebra

Nada de cena passa de **y = 890** (`TETO_DA_LEGENDA`, em `components/CenaBase.tsx`).
Dali para baixo a legenda desenha por cima — e como ela é opaca, o que cruzar
some da tela sem erro nenhum no build. Rodapé de uma linha começa em `RODAPE`
(858).

## Como cortar a peça

Oito minutos é longo para mandar por WhatsApp. Dois cortes que funcionam:

**O comercial, ~3 minutos** — 1, 2, 5, 6, 12, 13, 17, 19, 22, 25, 33, 40, 49, 51.
Preserva o arco inteiro e termina no número honesto.

**O da IA, ~2 minutos** — 1, 5, 19, 20, 27, 28, 29, 31, 51. É o corte para quem
pergunta "então a inteligência artificial vai falar com meu paciente?" — e a
resposta está nas cenas 28 e 29, não na 27.

Não corte a 7 nem a 10 se o público tiver dúvida sobre assédio ao paciente: são
elas que respondem, e sem elas o resto soa agressivo.
