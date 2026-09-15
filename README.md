# JP Clínica Odontológica

Site institucional da **JP Clínica Integrada Odontológica** — Rua Rio Verde, 1029, Vila Bruna, região da Freguesia do Ó, São Paulo.

🔗 **[www.jpclinicaodontologica.com.br](https://www.jpclinicaodontologica.com.br)**

O objetivo do site é um só: fazer a pessoa agendar pelo WhatsApp. Toda decisão de conteúdo, peso e acessibilidade foi tomada com esse funil em vista.

---

## Rodando

```bash
npm install
npm run dev
```

Sobe em `http://localhost:8080`.

| Comando                   | O que faz                                                  |
| ------------------------- | ---------------------------------------------------------- |
| `npm run dev`             | Servidor de desenvolvimento com HMR                        |
| `npm run build`           | Build de produção (Nitro → `.vercel/output`)               |
| `npm run preview`         | Serve o build localmente                                   |
| `npm run lint`            | ESLint + Prettier                                          |
| `npm run format`          | Aplica a formatação                                        |
| `npm run typecheck`       | `tsc --noEmit`                                             |
| `npm test`                | Vitest — **2.040 testes em 115 arquivos**, sem banco       |
| `npm run test:integracao` | Os testes que **exigem** um Postgres de verdade            |
| `npm run e2e`             | Playwright nas telas do CRC (exige Postgres de teste)      |
| `npm run e2e:site`        | Playwright no site público — o funil pago, **sem banco**   |
| `npm run check`           | lint + typecheck + test + build, na ordem em que o CI roda |

`npm run check` é o portão. O CI (`.github/workflows/quality.yml`) roda os
mesmos quatro passos e, depois do build, `scripts/conferir-bundle.mjs` — que
pergunta o que **foi parar no navegador**, não o que está no código-fonte: o
Vite troca `import.meta.env.X` por literal em tempo de build, e uma variável
renomeada para `VITE_…` viaja para dentro do JavaScript publicado sem nada mudar
na tela.

> **Os testes de integração ficam fora do `npm test` de propósito**, e não por
> serem lentos: eles falham alto quando não encontram Postgres, porque um teste
> de integração que passa sem integração é a pior linha verde do repositório.
> Quem os roda tem a config própria, `vitest.integracao.config.ts`.

---

## Stack

- **React 19** + **TanStack Start** — SSR de verdade, não hidratação de casca vazia
- **TanStack Router** — rotas por arquivo em `src/routes/`
- **Tailwind CSS v4** via `@tailwindcss/vite`
- **Vite 8** + **Nitro** para o build do servidor
- `lucide-react` para ícones de interface

Sem biblioteca de componentes. Os componentes são próprios, em `src/components/site/`.

---

## Onde as coisas ficam

```
src/
├── lib/
│   ├── jp.ts                    ← FONTE ÚNICA DE VERDADE (contato, avaliação, tratamentos, equipe)
│   ├── seo.ts                   título e descrição dentro do que o Google mostra
│   ├── dadosEstruturados.ts     o JSON-LD, montado a partir de jp.ts
│   ├── contato.ts               a mensagem de WhatsApp — só ela
│   ├── analytics/              rotas pagas, atribuição, eventos, consentimento
│   ├── error-capture.ts         erro de cliente que vira log, sem derrubar a página
│   ├── error-page.ts            a página de erro servida quando o SSR falha
│   ├── rh/                      o portal de vagas — ver docs/PORTAL-RH.md
│   └── crc/                     o JP CRC OS — ver docs/crc/
├── routes/
│   ├── __root.tsx               shell, metatags globais, 404 e erro
│   ├── index.tsx                home (9 seções)
│   ├── tratamentos/$slug.tsx    as 8 páginas de tratamento
│   ├── implante-dentario.tsx …  as 8 LPs de anúncio (rotas finas)
│   ├── politica-de-privacidade.tsx
│   ├── carreiras/               vitrine de vagas e a página de cada uma
│   ├── trabalhe-conosco.tsx     o formulário de candidatura (noindex)
│   └── api/                     endpoints de servidor do CRC e do RH
├── components/site/             componentes próprios
├── assets/
│   ├── fontes/                  Inter e Manrope, hospedadas aqui
│   └── …                        fotos e vídeos
├── router.tsx  server.ts  start.ts
└── styles.css                   tokens e classes de sistema — ver DESIGN.md
```

`routeTree.gen.ts` é gerado. Não editar à mão — as convenções de arquivo estão
em [src/routes/README.md](src/routes/README.md).

**O sistema visual tem documento próprio: [DESIGN.md](DESIGN.md)** — paleta com
razões de contraste medidas, escala tipográfica, calha, raio, botões, hierarquia
de CTA, regras de acessibilidade e as armadilhas que custaram iteração.

### Os três sistemas que moram neste repo

| Rota   | O que é                                              | Documentação                           |
| ------ | ---------------------------------------------------- | -------------------------------------- |
| `/`    | O site institucional. É o que este README descreve.  | aqui                                   |
| `/rh`  | Portal de RH: vagas, candidaturas, triagem por IA.   | [docs/PORTAL-RH.md](docs/PORTAL-RH.md) |
| `/crc` | JP CRC OS: CRM, automação de recuperação e cobrança. | [docs/crc/](docs/crc/)                 |

O CRC tem mais duas portas, e as duas são públicas no sentido de responderem
200 — o que elas **mostram** é que é diferente:

| Rota                 | O que responde                                                                                                                                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/crc-vitrine`       | As telas do CRC com dados de mentira, sem sessão e sem senha — **só em desenvolvimento**. Em produção a rota existe e devolve o aviso de indisponível; o corpo dela sai no tree-shaking (`import.meta.env.DEV` vira literal no build), então nenhuma tela do painel entra no pacote que o paciente baixa. |
| `/crc-institucional` | O tour de cinco minutos, em `<iframe>`, servido de `public/crc-tour/`. `noindex, follow`. A peça é construída no sub-projeto `apresentacao/` (`npm run tour:build`).                                                                                                                                      |

**Para anunciar** (Google Ads e Meta), comece por
[docs/ANUNCIAR.md](docs/ANUNCIAR.md) — para onde mandar cada campanha, os
eventos que o site já dispara, o que ainda falta instalar e o que a publicidade
odontológica não permite.

As **oito** rotas curtas de anúncio (`/implante-dentario`, `/ortodontia`, …) são
a **mesma página** do tratamento correspondente, sob a URL que casa com o termo
pesquisado, com `canonical` apontando para a orgânica — e em `modo="anuncio"`,
que é a mesma página lida com outra intenção.

| O que muda no `modo="anuncio"`                       | Por quê                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| H1 vira `<tratamento>` + `na Freguesia do Ó`         | as duas coisas que a pessoa digitou na busca                            |
| CTA do hero vira `Agendar avaliação de <tratamento>` | a palavra pesquisada reaparece no botão — ver [DESIGN.md](DESIGN.md) §4 |
| A localização abre a página                          | quem pesquisou o bairro precisa reencontrá-lo sem rolar                 |
| Sai o cross-sell "Outros caminhos de cuidado"        | a maior saída de uma LP paga                                            |
| Sai o link "Todos os tratamentos" do hero            | a primeira saída, no canto superior esquerdo                            |
| Sai a navegação do cabeçalho                         | seis âncoras da home, antes do primeiro parágrafo                       |

**O que o modo NÃO muda**, e a lista é a parte que importa: marca, telefone,
endereço, horário, rodapé, CRO da responsável técnica, prova social, política de
privacidade, `SkipLink` e o menu do celular — que abaixo de `xl` é o único
caminho para telefone e WhatsApp. Nada que sirva à confiança ou à conformidade
com o CFO sai por causa de conversão. O conteúdo vive em
`components/site/PaginaDeTratamento.tsx`, e as rotas são finas — uma correção de
conteúdo vale para as **16 URLs** (8 orgânicas + 8 LPs) de uma vez.

> **Foram oito desde o primeiro dia**, mas o commit que as criou (`d34e383`) e o
> cabeçalho de `PaginaDeTratamento.tsx` diziam sete — a harmonização entrou junto
> e ficou fora da conta por quatro dias. O cabeçalho está corrigido.

Os três compartilham build, domínio e Supabase, e nada mais: as tabelas do CRC
têm prefixo `crc_`, o CSS dele vive inteiro sob `.crc-app`, e nenhum arquivo do
site foi alterado para ele existir.

**Para colocar o CRC no ar**, comece por
[docs/crc/ATIVACAO-EM-PRODUCAO.md](docs/crc/ATIVACAO-EM-PRODUCAO.md) — o passo a
passo de SQL, variáveis, credenciais e ordem de ativação. Os outros
documentos são
[ROTEIRO-DA-EQUIPE](docs/crc/ROTEIRO-DA-EQUIPE.md) (**a rotina de quem opera** —
cinco minutos, para a recepção ler no primeiro dia),
[CUSTO-DAS-MENSAGENS](docs/crc/CUSTO-DAS-MENSAGENS.md) (**quanto a Meta cobra e
por quê** — marketing custa 9× utilidade, e é isso que decide a fatura),
[CAPACIDADES-DENTAL-OFFICE](docs/crc/CAPACIDADES-DENTAL-OFFICE.md) (**o que dá e
o que não dá para fazer com a API deles** — leia antes de planejar qualquer
funcionalidade nova), [ARCHITECTURE](docs/crc/ARCHITECTURE.md) (como funciona),
[RUNBOOK](docs/crc/RUNBOOK.md) (quando algo dá errado) e
[FINAL-ACCEPTANCE](docs/crc/FINAL-ACCEPTANCE.md) (o que existe e o que não
existe).

### `src/lib/jp.ts` é o arquivo que importa

Telefone, WhatsApp, endereço, horário, avaliação do Google, tratamentos, FAQ, equipe e depoimentos vivem **só ali**. Trocar o telefone nesse arquivo atualiza o cabeçalho, o rodapé, todos os links de WhatsApp (catorze só na home), o formulário, os cards de contato, as respostas da FAQ e o JSON-LD de uma vez.

E a **mensagem** desses links também é montada, não digitada: `src/lib/contato.ts`
compõe a frase a partir de `CLINICA.nome` e da intenção (`agendar`, `duvida`,
`orientacao`). Havia seis mensagens escritas à mão em seis arquivos, e elas
discordavam entre si sobre o nome da própria clínica — na primeira frase que o
paciente manda, que é onde a marca precisa chegar inteira.

Nada de dado de contato está escrito direto no JSX. Se você encontrar algum, é bug.

---

## Decisões que não são óbvias

Cada uma dessas custou tempo para descobrir. Estão documentadas no código também, mas ficam aqui para quem chega agora.

### O ano é um número fixo, não `new Date()`

`HISTORIA.anos` e `HISTORIA.anoCopyright` são literais. Calcular a partir da data atual faria o **servidor e o navegador renderizarem valores diferentes na virada do ano** — erro de hidratação do React. Custo: uma edição por ano.

### Tailwind v4 não passa por PostCSS aqui

`vite.config.ts` fixa `css: { postcss: {} }` de propósito. Sem isso, o Vite **sobe a árvore de diretórios procurando um `postcss.config.js`** — e um arquivo perdido numa pasta pai (por exemplo, na pasta do usuário) carrega o plugin PostCSS do Tailwind v3 em cima do v4 e quebra o build com uma mensagem que não aponta para lugar nenhum.

### O preset do Nitro

`nitro({ defaultPreset: "vercel" })` é **fallback**, não trava. O Nitro detecta a plataforma por variável de ambiente (`VERCEL=1`). Para outro alvo:

```bash
NITRO_PRESET=node-server npm run build
```

### O verde da marca não serve como texto sobre fundo claro

`--primary` / `--lime` (`#56a805`) mede **2,81:1 sobre o creme da página**. Isso
reprova até para texto grande, que exige apenas 3:1 — e reprova por pouco, que é
a pior forma de reprovar: passa despercebido.

A revisão de contraste criou dois tokens para resolver isso de uma vez:

| Token          | Valor     | Sobre creme | Sobre branco | Para quê                                     |
| -------------- | --------- | ----------- | ------------ | -------------------------------------------- |
| `--brand-text` | `#095902` | 8,05:1      | 8,60:1       | verde da marca **como texto** em fundo claro |
| `--ink-soft`   | `#5a6b5c` | 5,33:1      | 5,69:1       | texto secundário em fundo claro              |

Regras que decorrem daí:

- **`--lime` como texto só sobre `--brand-deep`**, onde mede 4,96:1. Sobre
  `--forest-2` ele cai para 2,87:1 e reprova. Em fundo claro, use `--brand-text`.
- **Nunca `--forest` com opacidade para texto.** A faixa que existia (40% a 70%) ia de 1,87:1 a 3,31:1 — toda ela reprovava. Use `--ink-soft` sólido.
- **Sobre o lime**, texto tem de ser `--brand-deep` (4,96:1). Branco ali dá
  3,00:1, que serve a título grande e a ícone, não a texto corrido — e
  `--forest-2`, que parece a escolha natural, dá 2,87:1 e não serve a nada.

> **Estes números foram remedidos em 14/09/2026, e mudaram.** Em 10/08/2026 a
> paleta passou a ser derivada da folha de marca (commit `72e2bfa`): o lime
> largou o `#7bd51c` e o `--brand-text` largou o `#41761c`. A prosa de contraste
> não acompanhou — nem aqui, nem no DESIGN.md, nem nos comentários de
> `src/styles.css`, que ainda falam em 1,73:1 e 8,2:1. As duas documentações
> estão corrigidas; os comentários do código estão listados como pendência em
> [DESIGN.md](DESIGN.md), §9.

### Piso de 12px na tipografia

`--text-micro` (0.75rem) é o menor tamanho do site. Havia **44 valores escritos à mão** — `text-[11px]` em 43 lugares e um `text-[10px]` — espalhados por nove arquivos: valor mágico repetido **e** abaixo do confortável de ler no celular. Rótulo discreto fica discreto por caixa-alta, peso e espaçamento entre letras, não por encolher abaixo do legível.

O site usa duas famílias, **hospedadas neste repositório** (`src/assets/fontes/`): **Manrope** nos títulos (`font-display`) e **Inter** no resto. Vinham do Google e bloqueavam 835 ms de renderização no celular — além de mandar o IP de cada visitante a um terceiro. Detalhes em [DESIGN.md](DESIGN.md).

### O menu mobile é a navegação do celular

A nav horizontal só aparece em `xl` (≥1280px). Abaixo disso, **o painel do menu é o único caminho** para telefone e WhatsApp. Ele é um painel de revelação (não um modal): `aria-expanded` + `aria-controls`, Escape fecha e devolve o foco ao botão, `overflow-y-auto` para caber em tela baixa. Mexer nisso sem cuidado derruba a conversão no celular inteiro.

Fechado, ele leva **`invisible`** junto com `max-h-0`. Só altura zero não basta: o conteúdo continua no fluxo de foco e a pessoa que navega por Tab passa por nove links que não consegue ver.

### A calha é uma variável, não uma classe por seção

`--jp-gutter` muda em dois breakpoints (20px → 32px → 40px) e a largura global acompanha:

| Classe                              | Largura                                                         |
| ----------------------------------- | --------------------------------------------------------------- |
| `.jp-container`                     | `min(1320px, 100% - calha × 2)` — a coluna do site inteiro      |
| `.jp-section` / `.jp-section-large` | espaçamento vertical (4,5rem / 6rem, reduzindo nos breakpoints) |

**É uma coluna só.** Havia uma segunda, `.jp-container-wide` de 1400px, usada
apenas pelo cabeçalho — e era ela que jogava a logo 40px à esquerda de todo o
conteúdo abaixo. A classe não existe mais no CSS.

Nenhuma seção repete `mx-auto max-w-[1320px] px-5 md:px-8 xl:px-10`. Se alguma repetir, é regressão: mudar a calha do site passa a exigir uma edição por arquivo.

### `calc()` sem espaço não gera classe nenhuma

`w-[calc(50%-10px)]` é **CSS inválido** — dentro de `calc()` o operador precisa
de espaço dos dois lados. O Tailwind simplesmente **não gera a classe**, sem
avisar. Escreve-se com sublinhado, que ele converte em espaço:

```
w-[calc(50%-10px)]      ← a classe não existe no CSS
w-[calc(50%_-_10px)]    ← certo
```

Aconteceu em sete larguras da grade de equipe. Nenhuma foi gerada, o `w-full` da
base passou a valer sozinho, e os seis cards desciam **um por linha** em tablet e
desktop: seção de **11.086 pixels**, doze telas para ver seis pessoas. Depois:
**932px**.

O que pega isso não é ler o JSX — as classes estavam lá, literais. É conferir se
chegaram ao CSS que o navegador baixa:

```bash
npm run build && grep -F "calc(33.333% - 14px)" .vercel/output/static/assets/*.css
```

### A âncora precisa limpar o cabeçalho grudado

`scroll-padding-top` tem de ser **maior que a altura do header sticky**. Era
92px contra um cabeçalho de 127px: clicar em "Tratamentos" parava a seção 35px
atrás dele, engolindo o começo do título. Hoje são 136px. **Se a altura do
cabeçalho mudar, esse número muda junto.**

### O intervalo entre seções é uma soma, não um valor

O espaço que se vê entre duas seções é o `padding-bottom` de uma **mais** o `padding-top` da seguinte. `.jp-section` vale 4,5rem de cada lado, então o intervalo real é **144px**, não 72px.

Quem for apertar ou afrouxar a respiração do site mexe só nessa classe. Antes havia três escalas convivendo (`py-20/28/36`, `py-24/32` e `.jp-section`), o intervalo variava de 240 a 288px e cada seção tinha a régua do dia em que foi escrita. Se aparecer um `py-*` num `<section>`, é regressão.

---

## Conteúdo: o que é real e o que não é

Isto não é detalhe de implementação. É uma clínica de saúde real e a publicidade odontológica é regulada (**Resolução CFO 196/2019**).

| Elemento                | Origem                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| Imagens dos ambientes   | **Versões geradas por IA** a partir das fotos reais da clínica — ver abaixo  |
| Texto dos depoimentos   | **Avaliações reais do Google**, com o nome como aparece lá                   |
| Nota e volume           | **4,6★ · 192 avaliações** — vive em `AVALIACOES`, ver [DESIGN.md](DESIGN.md) |
| Missão                  | **Transcrita do quadro** afixado na parede da clínica                        |
| 7 dos 8 vídeos          | Acervo da própria clínica                                                    |
| Vídeo de clareamento    | Pexels (licença livre para uso comercial)                                    |
| **Retratos de pessoas** | **Fictícios** — ver abaixo                                                   |

### As imagens dos ambientes são recriações por IA

A clínica optou por substituir as 6 fotos reais por versões geradas por IA das **mesmas cenas** — mesma fachada, mesmos consultórios, mesmo equipo, mesma sala de esterilização. O que muda é a limpeza da imagem: sumiram a fiação da rua, o céu ficou uniforme, a iluminação ficou homogênea.

| Arquivo                 | Recriação de                    |
| ----------------------- | ------------------------------- |
| `fachada.webp`          | `jp-clinica-odontologica-6.jpg` |
| `consultorio-1.webp`    | `jp-clinica-odontologica-5.jpg` |
| `consultorio-wide.webp` | `jp-clinica-odontologica-5.jpg` |
| `consultorio-2.webp`    | `jp-clinica-odontologica.jpg`   |
| `esterilizacao.webp`    | `jp-clinica-odontologica-3.jpg` |
| `equipamento.webp`      | `jp-clinica-odontologica-2.jpg` |

As fotos originais em 3024×4032 estão preservadas fora do repositório (`Downloads/imagens-reais-jp-clinica.zip`).

> **Leia a placa com zoom antes de subir qualquer fachada nova.** A primeira geração da fachada trazia, sob o nome da responsável técnica, um registro inventado: **"CRO/PI 1002 3889"** — UF de outro estado e número inexistente. Foi descartada. A que está no ar traz `Responsavel Tecnica CROSP 75.159`, igual à placa real, conferido com ampliação de 8×.
>
> Modelos de imagem erram texto com naturalidade, e um CRO falso na publicidade de uma clínica é infração ao CFO. Placa, letreiro, diploma ou qualquer documento legível numa imagem gerada tem de ser lido caractere a caractere.

### As pessoas do site são reais

Já não são. Este bloco existiu por meses avisando o contrário, e o aviso ficou
para trás quando os dados chegaram — registro aqui o estado de hoje para ninguém
"corrigir" de volta.

| Onde          | Situação                                                                |
| ------------- | ----------------------------------------------------------------------- |
| `EQUIPE`      | **6 pessoas reais** no arquivo — **4 no ar**, todas com CROSP conferido |
| `DEPOIMENTOS` | **5 avaliações reais**, transcritas da ficha do Google                  |
| Fundação      | Jeferson Barbosa e **Dra. Juliana Pelisser Barbosa — CROSP 75.159**     |

Os CROs no ar: **177.801, 168.512, 75.157, 162.394** e, na responsável técnica,
**75.159**. A carteira traz o número sem ponto (`SP-162394`); o ponto é só de
exibição.

### A grade publica menos gente do que a lista tem, e isso é a trava

`TeamSection` filtra `EQUIPE` por três condições antes de desenhar: sai quem é
`ficticio`, quem é `placeholder` e quem está em `MEMBROS_INATIVOS` — um conjunto
de nomes no próprio componente. Em 13/09/2026 entraram ali **Dra. Júlia Vargas**
e **Raphaela** (recepção), que deixaram a equipe; a home passou de 6 para
**4 cartões**, todos de dentistas com registro.

**A trava fica no ponto de exibição de propósito.** Os dados continuam em
`jp.ts` porque tirá-los de lá apagaria o registro de que aquelas pessoas
existiram e de onde vieram os números; o que não pode é um dado histórico
voltar ao ar porque alguém reordenou a lista. Quem sair da clínica entra em
`MEMBROS_INATIVOS` — uma linha — e some das 20 rotas de uma vez.

> Consequência de layout: a largura de cada cartão em `xl` sai de uma tabela
> indexada pelo **tamanho da lista publicável** (4 → `calc(25% - 15px)`). É o
> que impede a última pessoa de descer sozinha para uma linha só. A tabela cobre
> de 4 a 8; fora disso a classe sai vazia e os cartões caem para a largura de
> `md`, sem erro e sem aviso.

> **Duas armadilhas neste assunto, as duas já cometidas aqui.**
>
> Havia um aviso `⚠️ FICTÍCIOS` sobre dois depoimentos que a clínica depois
> confirmou serem reais. A marcação estava errada, não o site — e ela me levou a
> remover duas avaliações verdadeiras do site publicado. Marcação de conteúdo
> falso tem de sair no instante em que o dado real chega; enquanto fica, ela
> mente para a próxima pessoa que abrir o arquivo.
>
> `Profissional.ficticio` **continua existindo e é lógica viva**: o
> `TeamSection` filtra a equipe por ele. Se um dia entrar alguém sem dado
> confirmado, é essa a marcação que mantém a pessoa fora do ar.

### Regras que o site precisa manter

- **CRO do responsável técnico no rodapé** — obrigatório. Conferido em
  14/09/2026 no HTML servido: a linha `CROSP 75.159` sai nas **20 rotas fixas**,
  porque todas renderizam `<Footer/>`. A fonte é `RESPONSAVEL_TECNICA`, e ela
  fica **fora** de `EQUIPE` justamente para não depender de quem é o primeiro da
  lista — já dependeu, e foi assim que um CRO inventado chegou ao rodapé.
- **Sem "antes e depois"** — vedado na publicidade odontológica
- **Sem promessa de resultado** — todo bloco lembra que a indicação depende de avaliação profissional
- **Sem preço nem promoção** como atrativo

---

## Vídeos

Os 8 tratamentos têm animação explicativa. Cada uma é MP4 H.264 600×600, entre 30 KB e 280 KB.

O componente `TreatmentVideo` resolve três coisas:

1. **`preload="none"` + poster** — o arquivo só baixa quando o visitante rola até ele. Nenhum vídeo entra no carregamento inicial.
2. **`prefers-reduced-motion`** desliga o autoplay. Quem pediu menos movimento recebe o poster e decide.
3. **Botão de pausa** (WCAG 2.2.2) — em repouso cobre o vídeo convidando a tocar; tocando, encolhe para um canto.

Os clipes são mudos por natureza, então não há o que legendar. O que existe é `descricao`, que aparece ao lado do vídeo **e** serve de rótulo acessível.

---

## Deploy

```bash
npm run build
vercel deploy --prebuilt --prod
```

O build gera `.vercel/output` no formato Build Output API v3. `.vercel/` está no `.gitignore` — nunca versione, contém os IDs do projeto.

Na prática o projeto é publicado com `npx vercel --prod --yes`, que faz o build
na Vercel em vez de subir o `--prebuilt`. Os dois chegam ao mesmo lugar; o de
cima é o que economiza minuto de build remoto.

`vercel.json` fixa a região em **`gru1`** (São Paulo) e declara dois `crons`
diários — `/api/rh/varrer` às 04:00 e `/api/crc/motor` às 09:00. **Diários por
imposição do plano:** no Hobby, uma frequência maior que uma vez por dia é
recusada e derruba o deploy inteiro, não só o cron.

---

## Rotas

**20 rotas fixas**, mais as páginas de vaga, que nascem e morrem no painel de RH.

| Grupo                 | URLs                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home                  | `/`                                                                                                                                                                     |
| Tratamento (orgânica) | `/tratamentos/{limpeza-profilaxia, clareamento-dental, restauracoes, implantes-dentarios, proteses-dentarias, ortodontia, odontopediatria, harmonizacao-orofacial}`     |
| Tratamento (anúncio)  | `/limpeza-dental`, `/clareamento-dental`, `/restauracao-dentaria`, `/implante-dentario`, `/protese-dentaria`, `/ortodontia`, `/odontopediatria`, `/harmonizacao-facial` |
| Carreiras             | `/carreiras`, `/carreiras/<slug>`, `/trabalhe-conosco` (`noindex`)                                                                                                      |
| Institucional         | `/politica-de-privacidade`                                                                                                                                              |
| Internas              | `/rh` e `/crc` (`noindex, nofollow`, e `Disallow` no robots), `/crc-institucional` (`noindex, follow`), `/crc-vitrine` (só em desenvolvimento), `/api/*`                |

Slug inexistente em `/tratamentos/` devolve **404 de verdade**, não 200 com tela
de erro — o `loader` faz `throw notFound()`. Cada rota emite `title`,
`description`, `og:*` e `canonical` próprios **no HTML servido** — o robô de
preview do WhatsApp não roda JavaScript, e o WhatsApp é o canal de conversão.

---

## Conversão: o que o site mede, e o que ele já guarda

Duas coisas diferentes, e é comum confundi-las.

### A camada — `src/lib/analytics/`

| Arquivo            | O que faz                                                                            |
| ------------------ | ------------------------------------------------------------------------------------ |
| `rotas.ts`         | Fonte única: qual tratamento está nesta URL — orgânica **ou** de anúncio             |
| `atribuicao.ts`    | Lê UTM/`gclid`/`fbclid`/`gbraid`/`wbraid`, guarda pela sessão, monta a `Ref.:`       |
| `eventos.ts`       | Decide qual evento **único** cada ação produz, e despacha                            |
| `consentimento.ts` | O estado da escolha e os quatro sinais do Consent Mode v2                            |
| `scripts.ts`       | Os `<script>` do `<head>`, montados a partir de `VITE_GTM_ID` e `VITE_META_PIXEL_ID` |

**`generate_lead` é a única conversão.** Um clique em "Agendar avaliação" produz
exatamente um evento — antes produzia três (`whatsapp_click` + `schedule_click`

- `treatment_cta_click`), que na Meta viravam um `Contact` e **dois** `Lead`.
  Isso não era erro de relatório: era o Google Ads e a Meta aprendendo que aquele
  clique valeu três conversões e subindo o lance por causa disso.

A decisão é uma **função pura** (`decidirEventoDeClique`), e é por isso que "um
clique, um evento" é um teste e não uma intenção.

### O rastreio de clique — `RastreioDeContato`

Um ouvinte só, na raiz, em fase de **captura**. Não há `onClick` em botão nenhum:
são catorze links de WhatsApp só na home, e cada link novo nasceria sem rastreio
até alguém lembrar. A captura importa porque um botão que chama
`stopPropagation` sumiria do relatório na fase de bolha — e é justamente o botão
com comportamento próprio que mais interessa medir.

Os eventos vão para `window.dataLayer` (o formato que GTM, GA4 e Google Ads leem)
e, quando o Pixel existir, também para `fbq` com o vocabulário da Meta. **Hoje
não há container instalado** — conferido. Sem ele a função não faz nada, não
lança, e nunca impede um clique de acontecer.

A tabela de eventos, quando cada um dispara e o que ainda falta instalar estão
em **[docs/ANUNCIAR.md](docs/ANUNCIAR.md)**.

### A atribuição, e a referência que a recepção lê

A campanha é capturada **na primeira entrada** e guardada em `sessionStorage`:
first-touch, porque o último clique de uma visita é quase sempre interno, e
sobrescrever a cada navegação faria toda conversão parecer orgânica.

Dela sai a **referência curta** que vai na mensagem do WhatsApp:

```
Olá! Vi a página sobre Implantes dentários no site da JP Clínica Integrada
Odontológica e gostaria de agendar uma avaliação.

Ref.: IMP-G-A01
```

`IMP` implante · `G` Google · `A01` o criativo de `utm_content`. Sem campanha,
**a linha não aparece** — a maioria das conversas é orgânica e não devia mudar
por causa de uma minoria paga. E o `gclid` nunca entra: são 90 caracteres de
ruído que o paciente lê antes da recepção.

Essa ponte é o que permite responder "qual anúncio gerou esta conversa?" **sem
CRC, sem GTM, sem GA4 e sem Pixel** — que é o estado da primeira fase de
campanha.

> **O `sessionStorage` não pode ser lido durante o render.** O servidor não o
> tem, e um `href` diferente entre o HTML servido e a hidratação é erro de
> hidratação do React — num CTA. Por isso `contatoWhatsApp` é pura e a
> referência entra depois de montar, via `useContatoWhatsApp`.

### O lead no CRC — `/api/crc/lead`, e ele é opcional

O formulário de contato **registra o lead no CRC antes** de abrir o WhatsApp, e
manda junto a URL da página; `lerAtribuicao` do CRC decompõe os mesmos campos no
servidor. Com o CRC no ar, a tela de Investimento divide o gasto lançado por essa
cadeia e entrega custo por paciente que **compareceu**, não por clique.

**Isso é um ganho, não um pré-requisito.** Com o CRC desligado o endpoint responde
503, o formulário pede para tentar de novo — e o WhatsApp abre do mesmo jeito. O
E2E de tráfego pago roda contra um servidor **sem banco, sem CRC, sem GTM e sem
Pixel** justamente para que isso pare de ser promessa e vire regressão vermelha.

> Três decisões que parecem detalhe e não são: a requisição vai **antes** do
> `window.open` (depois dele a aba perde foco e o navegador pode cancelá-la), com
> `keepalive`, e **sem esperar resposta** — o lead é problema nosso, a conversa é
> do visitante. Se o banco não estiver configurado, o endpoint responde **503**
> e o formulário pede para tentar de novo: já respondeu "recebemos" sem ter
> recebido, e perder um lead em silêncio é mais caro do que um erro honesto.
>
> A querystring **não** é guardada inteira — só os campos decompostos e o
> `pathname`. Guardá-la de novo duplicaria dado pessoal no dia em que alguém
> puser um telefone num parâmetro.

O `sitemap.xml` lista **11 URLs**: a home, as 8 orgânicas, a política e
`/carreiras`. As LPs ficam **fora** de propósito — o `canonical` delas aponta
para a orgânica, e listá-las seria pedir ao Google que indexasse as duas. As
páginas de vaga também ficam de fora: uma lista fixa num XML estático viraria
mentira no dia seguinte, com o robô seguindo links para vagas encerradas. Quem
leva o robô até elas são os links da própria `/carreiras`.

---

## SEO

Cada rota emite `title`, `description`, `og:*` e `canonical` próprios **no HTML
servido** — o robô de preview do WhatsApp não roda JavaScript, e o WhatsApp é o
canal de conversão.

### O título começa pela busca, não pela marca

`src/lib/seo.ts` monta título e descrição dentro do que o Google **mostra** (60 e
155 caracteres). Antes todo título tinha 65 a 75 e toda descrição 164 a 228 — a
clínica escrevia um fim de frase que ninguém lia, e o corte caía dentro do nome
dela.

A ordem é a decisão: quem procura dentista digita _"implante dentário na
Freguesia do Ó"_, não o nome de uma clínica que ainda não conhece. O
procedimento e o bairro ocupam o começo; a marca fecha, e **encolhe até caber** —
"Prótese dentária" sobra espaço e leva o nome inteiro (60 caracteres cravados),
"Implante dentário" leva o médio (48).

**Medido em 14/09/2026, no HTML servido das 17 rotas que passam por `seo.ts`**
(home + 8 orgânicas + 8 LPs): título entre 48 e 60, descrição entre 114 e 155.
Nenhuma estoura.

> **Duas rotas não passam por `seo.ts`, e elas estouram.** `/carreiras` publica
> título de **75** e descrição de **228** caracteres; `/politica-de-privacidade`,
> descrição de **164**. As duas escrevem `TITULO` e `DESCRICAO` à mão no próprio
> arquivo. Não é urgente — nenhuma das duas é página de aquisição de paciente —
> mas é exatamente o defeito que `seo.ts` existe para não deixar acontecer, e
> some passando as duas por `tituloLocal` / `descricaoLocal`.

### Dados estruturados

`src/lib/dadosEstruturados.ts` monta o JSON-LD **a partir de `jp.ts`**, nunca
digitado:

| Onde                       | Tipo                         |
| -------------------------- | ---------------------------- |
| Home                       | `Dentist` + `FAQPage`        |
| Cada tratamento, e cada LP | `MedicalWebPage` + `FAQPage` |
| Cada vaga                  | `JobPosting`                 |

O `Dentist` traz endereço, coordenadas, horário, CNPJ, a responsável técnica com
CRO e os 8 tratamentos.

O `MedicalWebPage` das LPs é o **mesmo** da página orgânica, com o `@id` e a
`url` da orgânica — o que é coerente com o `canonical` e evita declarar duas
páginas distintas para o mesmo procedimento. O `provider` aponta por `@id` para
o consultório declarado na home, em vez de repetir endereço e telefone: o Google
junta os dois sozinho, e não existe a cópia que envelhece.

**Não traz `aggregateRating`, e é decisão consciente.** A nota do Google aparece
para o visitante na página — é prova social legítima — mas não entra no schema
do próprio `Dentist`: as diretrizes do Google para LocalBusiness desaconselham
agregar avaliação de outro site, e avaliação sobre si mesmo não é elegível ao
rich result de estrelas. O schema fica no que a clínica pode declarar de forma
factual e verificável.

> Dado estruturado que **discorda** da página visível é pior que dado nenhum: o
> Google trata divergência como sinal de manipulação. Por isso sai tudo da mesma
> fonte — não há como divergir. E `foundingDate` vai em ISO 8601 (`2002-08-17`),
> não no formato que a página exibe: data errada o Google descarta em silêncio.

**Lighthouse de SEO: 100** em 11 das 12 rotas que existiam em 11/09/2026. A
exceção é `/trabalhe-conosco`, que é `noindex` de propósito — quem procura
emprego deve cair em `/carreiras`. As 8 LPs entraram no mesmo dia e **não foram
medidas**: elas renderizam o mesmo componente já medido, o que herda a
estrutura, não o resultado.

---

## Acessibilidade

O site passou por auditoria WCAG 2.1 AA com contraste calculado, não estimado.

- Contorno de foco muda de cor conforme a superfície (escuro no claro, lime no escuro)
- Menu mobile com Escape, retorno de foco e `invisible` quando fechado
- Skip link em todas as rotas
- **Alvo de toque de 44px no site inteiro** via `.alvo-toque`, não só no cabeçalho
- **Piso de 12px em todo texto** (`--text-micro`)
- Vídeos com rótulo acessível e controle de pausa
- `prefers-reduced-motion` zera transição e animação, e desliga o autoplay
- Decoração de fundo é `aria-hidden` e `pointer-events-none` — nada disso chega ao leitor de tela

**Medido no site publicado em 11/09/2026, em 320, 390 e 1440px:** zero alvo
abaixo de 44px, zero texto abaixo de 12px, zero rolagem horizontal e **zero
falha de contraste em 112 elementos**. Lighthouse de acessibilidade **100** nas
12 rotas de então.

**Conferido no HTML servido em 14/09/2026, nas 20 rotas fixas:** exatamente um
`h1`, um `header`, um `main` e um `footer` em cada uma.

**Corrigido em 14/09/2026:** as duas combinações que a troca de paleta de 10/08
tinha deixado reprovando sobre o limão — o rótulo branco de 12px na seção "Um
processo" das páginas de tratamento (3,00:1) e `--forest-2` no skip link focado,
nas redes do rodapé e nas setas dos tratamentos (2,87:1). Todas em
`--brand-deep` agora, **4,96:1**. Conferido no DOM: zero elementos restantes com
`bg-lime` + `text-forest-2`.

> Contraste se mede pintando a cor num canvas e **lendo o pixel**. Parser por
> expressão regular mente com `oklch()`/`oklab()`, que é o que o Tailwind v4
> emite — cheguei a reportar 18 falhas que não existiam. E quem compõe o fundo
> tem de considerar gradiente **e** alfa: um varredor que procura o primeiro
> `background-color` opaco reprova o rodapé escuro achando que o texto branco
> está sobre o creme. Está detalhado em [DESIGN.md](DESIGN.md).

---

## Pendências

- [x] ~~Trocar as pessoas fictícias.~~ **Feito.** Equipe, fundação e depoimentos são reais; `grep -rn "ficticio: true" src` não devolve nada. A marcação `Profissional.ficticio` segue disponível para quem entrar sem dado confirmado.
- [x] ~~Confirmar a idade da clínica.~~ **Confirmado pela clínica em 14/08/2026: 24 anos, fundada em 17/08/2002.** O CNPJ de 2021 é da pessoa jurídica atual, não o início da clínica — está documentado em `HISTORIA` para ninguém "corrigir" o número achando que é erro.
- [ ] **Vincular o site à ficha do Google.** Hoje o Google mostra "Adicionar website" — é tráfego direto e gratuito sendo perdido.
- [x] ~~Trocar o domínio.~~ **Feito.** O site responde em `www.jpclinicaodontologica.com.br`; `SITE_URL` e o sitemap já apontam para lá.
- [ ] Páginas de **facetas**, **endodontia** e **periodontia** — os dois últimos estão na placa da clínica mas não no site, e há bom material de vídeo para os três.
- [x] ~~Duas falhas de contraste sobre o lime.~~ **Corrigidas em 14/09/2026.** O rótulo de 12px das páginas de tratamento e os três estados de `--forest-2` sobre lime (skip link, redes do rodapé, setas dos tratamentos) foram para `text-brand-deep`: de **2,87/3,00:1** para **4,96:1**, conferido no navegador. Detalhe em [DESIGN.md](DESIGN.md), §9.
- [x] ~~Os comentários de contraste em `src/styles.css`.~~ **Remedidos**, junto com os de `carreiras/index.tsx` e `rh/AbaTriagem.tsx`. Cada um diz o número de hoje e o que ele era antes.
- [x] ~~`treatment_view` e `treatment_cta_click` não disparam nas 8 LPs.~~ **Corrigido em 15/09/2026**, junto com a dupla contagem. O reconhecimento de tratamento ganhou fonte única (`src/lib/analytics/rotas.ts`) que responde pelas duas famílias de URL, e um clique em "Agendar avaliação" passou a produzir **um** `generate_lead` em vez de três eventos (que viravam um `Contact` e dois `Lead` na Meta). Coberto por 58 testes de unidade e 48 E2E. Ver [docs/ANUNCIAR.md](docs/ANUNCIAR.md), seção 3.
- [ ] **Confirmar o profissional responsável por implantes.** A LP não nomeia dentista responsável pelo procedimento, e o repositório não tem esse dado. Só entra com nome, CRO conferido e retrato real — ver a regra de `EQUIPE`.
- [x] ~~`/carreiras` e `/politica-de-privacidade` fora do `seo.ts`.~~ **Corrigido em 15/09/2026.** As duas passaram a montar título e descrição pelo helper. Medido no HTML servido: `/carreiras` saiu de **75/228** para **60/121**, e a política de **164** para **149** de descrição. As 19 rotas fixas com `<title>` próprio agora cabem no que o Google mostra.
- [ ] **Rodar Lighthouse nas 8 LPs.** Elas entraram depois da última medição.
