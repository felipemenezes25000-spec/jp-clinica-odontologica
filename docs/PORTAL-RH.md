# Portal de RH — JP Clínica Integrada Odontológica

Sistema de vagas e triagem de currículos, embutido no site da clínica.

> Escrito para quem pegar isto daqui a um ano — inclusive para você mesmo.
> Onde uma decisão parecer estranha, o motivo está escrito junto.

---

## O que ele faz

**Para o candidato**, no site público:

| Rota                            | O quê                                                                      |
| ------------------------------- | -------------------------------------------------------------------------- |
| `/carreiras`                    | Vitrine das vagas abertas, com filtro por área, vínculo e turno            |
| `/carreiras/<slug>`             | A página da vaga, com JSON-LD de `JobPosting` (aparece no Google for Jobs) |
| `/trabalhe-conosco?vaga=<slug>` | Candidatura em passo único, com anexo de currículo                        |

**Para a coordenação**, em `/rh` (senha única, `noindex`):

| Aba            | O quê                                                      |
| -------------- | ---------------------------------------------------------- |
| Resumo         | Indicadores e três gráficos SVG feitos à mão               |
| Candidaturas   | Kanban de 8 colunas e tabela, com gaveta de detalhe        |
| Triagem por IA | Análise em lote, ranking e importação em massa             |
| Entrevistas    | O guia da clínica, o modo entrevista e o comparativo final |
| Vagas          | Criar, publicar, pausar e encerrar                         |
| Configurações  | Textos do portal, assinatura e estado da IA                |

---

## As três decisões que sustentam o resto

### 1. A IA lê e julga. O código calcula.

Toda a aritmética de permanência — tempo em cada emprego, média, mediana,
lacunas, **sobreposições de data**, meses em odontologia — é TypeScript
determinístico (`src/lib/rh/ia/metricas.ts`) e desce **pronta** para o modelo,
com a instrução explícita de não recalcular.

Modelo de linguagem erra conta de data com facilidade constrangedora, e _"quanto
tempo ela ficou no último emprego"_ é justamente a pergunta que a clínica não
pode errar. O que o modelo faz é o que só ele faz: ler um PDF torto e julgar.

Pela mesma razão, a **nota**, a **estrela** e a **recomendação** também são
calculadas em código (`ia/rubricas.ts` e `ia/veredito.ts`), a partir das notas de
0 a 10 que o modelo dá aos seis critérios. Antes disso a estrela vinha do modelo
e cruzava com a nota calculada — 4 estrelas iam de 63 a 90, 3 estrelas de 36 a
68, e a tela podia mostrar duas coisas que se contradiziam.

### 2. Sinal é fato; alerta é leitura.

`ia/sinais.ts` produz sinais **determinísticos**: sem datas, datas sobrepostas,
último emprego curto, rotatividade, lacuna, sem registro no conselho, possível
duplicado, idade incompatível com a experiência. Cada um é conferível na mão.

O modelo acrescenta os dele, marcados com `origem: "ia"`. A tela mostra a
diferença entre _"o código provou"_ e _"quem leu achou"_.

Um sinal é diferente de todos: `dado-sensivel` nasce com `contaNaNota: false` e
aparece na tela dizendo que **não influenciou a nota**. Se o currículo trouxer
estado civil, filhos ou foto, o sistema registra que viu e que ignorou.

### 3. Perguntar não basta; é preciso saber ler a resposta.

`src/lib/rh/duvidas.ts` consolida triagem, sinais e perguntas da IA num roteiro
sem repetição, e cada dúvida carrega os **dois lados**: o que faz sentido e o que
não faz. Isso é catálogo em código, não prompt — a leitura de "lacuna" é sempre a
mesma, então não precisa de modelo, precisa de tabela. Sai de graça, é
determinístico, e o RH pode discordar por escrito.

---

## O guia de entrevista é da clínica, não nosso

`src/lib/rh/guia.ts` traz, transcrito com fidelidade, o método real da JP escrito
pela Dra. Ana Beatriz e pelo Jefferson: **10 critérios** de 0 a 5 (total 50) em
`CRITERIOS_JP`, e **8 fichas** de área em `FICHAS_DA_CLINICA`, cada uma com as
perguntas daquele cargo.

O campo `derivado` existe e a tela sabe avisar quando um guia foi copiado de
outro — mas **hoje nenhum está ligado**: todas as fichas são transcrição direta
do método da clínica.

> Este parágrafo dizia "15 perguntas gerais" e descrevia os guias de outras áreas
> como já derivados. Conferido contra o código: as perguntas vivem dentro de cada
> ficha de área, não numa lista geral, e nenhuma ficha carrega `derivado: true`.
> A diferença importa: quem lesse o texto antigo procuraria revisar guias
> derivados que não existem.

Dos 10 critérios, cinco são `soNaEntrevista: true` e **a IA não opina neles**:
comunicação e postura, organização, disponibilidade, compatibilidade com a equipe
e perspectiva de permanência. Nenhum currículo prova isso. O schema enviado ao
modelo nem sequer aceita esses valores — a trava é estrutural, não uma regra em
texto que ele possa desobedecer.

---

## Onde os dados moram

`armazenamento.ts` não guarda nada: escolhe quem guarda, por `RH_STORAGE`.

```
armazenamento.ts   despachante (import dinâmico e memoizado)
├── arquivo.ts     disco local, .data/rh — padrão
├── supabase.ts    Postgres + Storage, via REST com fetch
└── comum.ts       o que os dois compartilham
```

`comum.ts` existe por um motivo concreto: `nomeArquivoSeguro` gerou o nome dos
currículos já salvos. Duas implementações "equivalentes" de normalização nunca
são equivalentes de verdade — é sempre o acento que denuncia — e aí o registro
aponta para um arquivo que o outro driver não encontra.

O contrato entre os dois é testado:

```bash
node scripts/conferir-drivers.mjs
```

Ele compara nomes exportados, quantidade de parâmetros e a saída de
`nomeArquivoSeguro`. Pegou uma divergência real na primeira execução.

**Na Vercel, use `supabase`.** Disco de função serverless é apagado a cada deploy
e não é compartilhado entre instâncias.

### Supabase

Rode `supabase/01-schema.sql` uma vez no SQL Editor (é idempotente). Ele cria as
tabelas, a função atômica de protocolo e liga **RLS sem nenhuma policy** — o que
não é esquecimento: sem policy ninguém passa, exceto a `service_role`, que só
existe no servidor. A chave `anon` que vai ao navegador não lê currículo nenhum.

Confirmado em teste: `anon` recebe `401` ao consultar `rh_candidaturas`.

---

## Comandos

```bash
npm run dev                                    # sobe em :8080
node scripts/conferir-drivers.mjs              # contrato entre os drivers
node --env-file=.env scripts/importar-curriculos.mjs "<pasta>" [--sem-ia] [--forcar]
node --env-file=.env scripts/migrar-para-supabase.mjs [--conferir] [--forcar]
```

O importador mapeia subpasta para área (`ASB`, `Dentistas`, `Estagiario`,
`Recepcionista-ADM`) e reconhece `Favoritos` e `Não aceitou` como triagem prévia
do RH — que vira calibragem do prompt. Deduplica por sha-256 do conteúdo, então
dois arquivos com nomes diferentes e conteúdo igual não viram duas fichas. É
retomável: rodar de novo não duplica ninguém.

---

## Custo da IA

Cerca de **US$ 0,005 por currículo** com `gpt-5.6-luna`. Os 53 do acervo inicial
saíram por US$ 0,31.

Duas proteções, escritas depois de um susto real na conta:

- `analisarAoReceber` nasce **desligado**. Com ele ligado, divulgar a vaga e
  receber 200 currículos dispararia 200 análises sem ninguém autorizar.
- O botão de analisar em lote mostra a estimativa em dólar **antes** de rodar e
  pede confirmação (`ia/precos.ts`).

---

## Direção visual do painel administrativo

O painel interno em `/rh` usa **tema claro como base**: fundo branco/off-white,
cartões brancos, tipografia preta e verde concentrado em ações, seleção, ícones,
progresso e estados importantes. A intenção é reduzir peso visual para quem passa
horas no painel e deixar a hierarquia mais próxima de um produto SaaS moderno.

Regras práticas:

- fundo branco ou claro → texto preto / cinza-escuro;
- fundo verde sólido → texto branco;
- verde claro/mint é superfície de apoio, não fundo para texto branco;
- cabeçalho e filtros são claros; a aba ativa e ações primárias usam verde sólido;
- KPIs, gráficos, Kanban, tabelas, gaveta de candidatura, triagem, entrevistas, vagas
  e configurações compartilham os mesmos tokens e superfícies;
- o modo entrevista pode manter blocos verdes de foco, sempre com texto branco.

A classe `rh-admin` na raiz de `/rh` ativa os ajustes do tema administrativo sem
interferir no site institucional ou no fluxo público de candidatura.

## Acessibilidade e contraste

Regra dura, definida pela clínica: **fundo verde leva letra branca; fundo branco
leva letra preta.** Ícone, borda, ponto e barra de gráfico podem continuar lime —
não são letra.

Vale para o portal de RH, `/carreiras` e `/trabalhe-conosco`. **O site de
marketing (home, tratamentos, rodapé) está fora dessa regra por decisão do
cliente** — não altere sem perguntar.

Conferência rápida:

```bash
grep -rn "text-lime" src/components/rh src/routes/rh.tsx src/routes/carreiras
```

Toda ocorrência precisa ser ícone, borda ou marcador — nunca letra.

Estado nunca é comunicado só por cor: toda pílula leva ponto ou ícone mais o
rótulo escrito.

---

## O que este sistema não faz, de propósito

- **Não decide.** Toda análise termina com o aviso de que é apoio à decisão
  humana. As nove candidatas que a clínica já tinha favoritado ficaram bem
  colocadas, mas duas caíram no meio da lista porque o currículo delas não tem
  datas — a IA não enxerga o que vocês viram na conversa.
- **Não usa idade, aparência, estado civil, maternidade ou religião.** Está
  proibido no prompt, e o guia da clínica diz o mesmo.
- **Não conta à candidata o que a IA achou dela.** O modelo de recusa nunca cita
  nota nem sinal. É a diferença entre recusar com respeito e humilhar alguém.
