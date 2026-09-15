# Sistema de design — JP Clínica Integrada Odontológica

Este documento descreve o que o site **já é**, não o que ele poderia ser. Cada
regra aqui está implementada em `src/styles.css` e vale para as **20 rotas
fixas** do site público: a home, as 8 páginas de tratamento, as 8 landing pages
de anúncio, `/carreiras`, `/trabalhe-conosco` e `/politica-de-privacidade` —
mais as páginas de vaga (`/carreiras/<slug>`), que nascem e morrem no painel de
RH.

Eram 12 quando este arquivo foi escrito, em 11/09/2026. As 8 LPs entraram no
mesmo dia e usam o **mesmo componente** das páginas de tratamento
(`PaginaDeTratamento`), então nenhuma regra daqui muda por causa delas — mas os
números de cobertura mudam, e este parágrafo existe para que a próxima pessoa
não leia "12" e ache que está tudo medido.

A pergunta que este arquivo responde: _"posso escrever um valor aqui ou já
existe um token para isso?"_ — quase sempre já existe.

> **Regra de ouro.** Um valor escrito à mão no JSX é uma decisão que ninguém
> mais vai encontrar. Quando a clínica pedir "deixa tudo um pouco mais espaçado",
> quem mexeu num token resolve em uma linha; quem espalhou `py-24` resolve em
> quarenta arquivos — e esquece três.

---

## 1. Cor

### A proporção

**60% claro · 30% verde profundo · 10% verde vivo.** O claro domina porque
clínica odontológica vende tranquilidade, não intensidade. O verde profundo
aparece em blocos inteiros (seções escuras), nunca como respingo. O verde vivo é
acento: botão, ícone, número grande — e nunca texto corrido.

### Os tokens

Valores lidos de `:root` no navegador em **14/09/2026**, não copiados de
lembrança.

| Token           | Valor     | Onde entra                                   |
| --------------- | --------- | -------------------------------------------- |
| `--background`  | `#f7f8f2` | o creme que é o fundo padrão do site         |
| `--paper`       | `#fcfdf9` | o claro um passo acima do creme              |
| `--card`        | `#ffffff` | superfície elevada sobre o creme             |
| `--ink`         | `#172018` | texto principal em fundo claro               |
| `--ink-soft`    | `#5a6b5c` | texto secundário em fundo claro              |
| `--brand-text`  | `#095902` | o verde da marca **quando é texto** no claro |
| `--brand-green` | `#56a805` | o verde vivo — acento, não texto             |
| `--brand-deep`  | `#032f01` | o verde profundo das seções escuras          |
| `--lime`        | `#56a805` | acento sobre fundo escuro                    |
| `--mint`        | `#ebf5e1` | superfície verde clara, selo e chip          |
| `--border-soft` | `#dce4d6` | divisores e bordas de card                   |
| `--destructive` | `#b42318` | erro de formulário                           |

> **Quatro tokens são a MESMA cor, e isso não é redundância — é história.**
>
> `--lime`, `--brand-green` e `--primary` valem todos `#56a805`; `--brand-text`,
> `--forest`, `--forest-2` e `--primary-ink` valem todos `#095902`. Os dois
> verdes vêm da folha de marca entregue pela clínica, e em 10/08/2026 a paleta
> passou a ser **100% derivada dela** (commit `72e2bfa`): o lime largou o
> `#7bd51c`, que não vinha de lugar nenhum, e assumiu o verde oficial.
>
> Os nomes sobreviveram porque estão escritos em centenas de classes. Escolha
> pelo **papel** — `--brand-text` quando é texto claro, `--lime` quando é acento
> sobre escuro —, não pelo valor: se um dia os dois verdes voltarem a divergir,
> quem escolheu pelo papel não precisa reler o site inteiro.

### As regras de contraste

Não são preferência. São WCAG 2.1 AA, com contraste **medido**, não estimado —
os números abaixo saíram de pintar as duas cores num canvas e ler o pixel, em
14/09/2026.

| Combinação                    | Mede        | Serve para                  |
| ----------------------------- | ----------- | --------------------------- |
| `--ink` sobre creme           | **15,65:1** | qualquer texto              |
| `--brand-text` sobre creme    | **8,05:1**  | qualquer texto              |
| `--brand-text` sobre branco   | **8,60:1**  | qualquer texto              |
| `--ink-soft` sobre creme      | **5,33:1**  | qualquer texto              |
| `--ink-soft` sobre branco     | **5,69:1**  | qualquer texto              |
| branco sobre `--brand-deep`   | **14,88:1** | qualquer texto              |
| branco sobre `--forest-2`     | **8,60:1**  | qualquer texto              |
| `--lime` sobre `--brand-deep` | **4,96:1**  | qualquer texto              |
| `--brand-deep` sobre `--lime` | **4,96:1**  | qualquer texto              |
| branco sobre `--lime`         | **3,00:1**  | **só** texto grande e ícone |
| `--lime` sobre `--forest-2`   | **2,87:1**  | **nada** — reprova          |
| `--forest-2` sobre `--lime`   | **2,87:1**  | **nada** — reprova          |
| `--lime` sobre creme          | **2,81:1**  | **nada** — reprova          |

Daí saem quatro regras:

1. **`--lime` como texto só sobre `--brand-deep`** (4,96:1). Sobre o creme mede
   **2,81:1** e sobre `--forest-2` mede **2,87:1** — as duas reprovam até para
   texto grande, que exige 3:1. Em fundo claro, o verde de texto é
   `--brand-text`.
2. **Nunca `--forest` com opacidade para texto.** A faixa que existia (40% a
   70%) ia de 1,87:1 a 3,31:1 — toda ela reprovava. Use `--ink-soft` sólido.
3. **Sobre o lime, o texto é `--brand-deep`** (4,96:1). Branco ali dá
   **3,00:1**: serve a título grande e a ícone, não a texto corrido. `--forest-2`
   sobre lime dá 2,87:1 e **não serve a nada** — é a combinação que mais engana,
   porque parece a continuação natural do par verde-sobre-verde.
4. **Texto pequeno não fica direto no lime.** É o que
   `PaginaDeTratamento.tsx` já faz na seção "Um processo. Quatro momentos.": o
   corpo mora em cartões com `bg-brand-deep/45` por cima do lime, onde o branco
   volta a medir **5,93:1**.

> **Estes números foram remedidos em 14/09/2026, e mudaram.** A troca de paleta
> de 10/08/2026 mudou o valor de `--lime` e de `--brand-text` e **não mudou a
> prosa**: por um mês, `src/styles.css`, este documento, o README,
> `carreiras/index.tsx` e `rh/AbaTriagem.tsx` repetiam 1,73:1 · 5,13:1 · 5,48:1 ·
> 4,66:1 · 8,2:1 — contas feitas com `#7bd51c` e `#41761c`, que já não estavam
> lá.
>
> Todos foram corrigidos, e cada comentário do código agora traz o número de hoje
> **e uma linha dizendo o que ele era antes**. Apagar a conta velha em silêncio é
> como o erro entra de novo: alguém recalcula, encontra o mesmo valor e conclui
> que está certo.
>
> **A regra que fica:** quem trocar um token de cor remede o parágrafo junto,
> pintando a cor num canvas e lendo o pixel. O valor e a prosa envelhecem em
> ritmos diferentes, e é sempre a prosa que fica para trás.

> **Como conferir de verdade.** O parser de cor por expressão regular **mente**
> com `oklch()` e `oklab()`, que é o que o Tailwind v4 emite: ele lê
> `oklab(0.999 …)` como RGB `(0.999, 0, 0)` — preto — quando o valor é branco.
> Isso me fez reportar 18 falhas de contraste que não existiam. O jeito certo é
> pintar a cor num canvas 1×1 e **ler o pixel**: o navegador converte, você lê o
> resultado, e nenhuma sintaxe nova quebra a conta.
>
> Vale o mesmo para o fundo: seções escuras usam `background` com gradiente, e
> quem só lê `background-color` encontra `transparent` e cai no fundo do body.
> Texto sobre gradiente precisa passar em **todas** as paradas de cor.
>
> **E vale para o alfa.** Um varredor que sobe a árvore procurando o primeiro
> `background-color` opaco pula as camadas translúcidas do caminho — foi assim
> que uma varredura feita hoje reprovou o rodapé inteiro, que é escuro, achando
> que o texto branco estava sobre o creme. Ou se compõe a pilha de fundos com o
> alfa de cada camada, ou não se afirma nada sobre aquele elemento.

**A varredura de 112 elementos que deu zero falhas foi feita em 11/09/2026, no
site publicado, com o lime ainda descrito como `#7bd51c`.** Ela continua valendo
para tudo o que não encosta no lime. O que encosta está reaberto — ver §9.

### As superfícies escuras

| Classe           | Gradiente                     | Papel                        | Em uso                       |
| ---------------- | ----------------------------- | ---------------------------- | ---------------------------- |
| `.section-light` | `--paper` com dois halos      | seção clara padrão           | home (contato), `/carreiras` |
| `.section-mid`   | `#0b5a02 → #053901 → #032f01` | verde médio, transição       | **nenhum lugar hoje**        |
| `.section-deep`  | `#011600 → #022400 → #032f01` | o mais escuro — rodapé, hero | rodapé, `/carreiras`, vaga   |

As três carregam ainda um `radial-gradient` de lime a 8–18% de opacidade no
canto superior esquerdo. Ele é decoração, mas entra na conta de contraste: é
uma parada de cor a mais que o texto por cima precisa passar.

`.section-mid` está definida e **não é usada por nenhum `.tsx`**. Fica porque
custa 4 linhas e porque a escala de três degraus é a que este documento
descreve; se alguém for cortar CSS morto, é a primeira candidata — e cortá-la
significa que a escala vira de dois degraus, o que é uma decisão de desenho, não
de limpeza.

**O ritmo importa.** A home alterna `C e C C C e C e C` (claro/escuro) e **não
tem nenhum par de seções escuras coladas** — conferido em 14/09/2026, na ordem
atual: capa, A Clínica, Tratamentos, Equipe, Avaliações, História, Estrutura,
FAQ, Contato, rodapé. Ao inserir ou mover uma seção, confira isso — duas escuras
seguidas achatam a leitura.

> Os comentários numerados em `routes/index.tsx` ainda são os da ordem antiga
> (`01 … 02 … 03 … 06 … 04 … 05 …`). O número é rótulo de origem, não posição:
> Tratamentos subiu e História desceu em 11/09/2026, e renumerar apagaria o
> rastro de por quê.

---

## 2. Tipografia

Duas famílias, **hospedadas neste repositório** (`src/assets/fontes/`):

| Família     | Token            | Onde                     |
| ----------- | ---------------- | ------------------------ |
| **Manrope** | `--font-display` | títulos, números, botões |
| **Inter**   | `--font-sans`    | corpo de texto, rótulos  |

São arquivos variáveis: um por família e subconjunto cobre toda a faixa de peso.
Só `latin` e `latin-ext` entram — o `unicode-range` faz o navegador baixar só o
que a página precisa (em português, **72 KB no total**).

> **Por que não vêm do Google.** Medido: o pedido ao `fonts.googleapis.com`
> bloqueava **835 ms** de renderização no Lighthouse móvel — não pelo peso, mas
> pela ida a um terceiro (DNS, TLS e um round-trip de CSS antes de descobrir
> qual `.woff2` buscar). E toda visita mandava o IP do paciente ao Google, o que
> num site com política de privacidade própria é um terceiro a mais para
> justificar.
>
> Pela mesma razão, **fonte nunca entra por `@import` no CSS**: um `@import` só
> é descoberto depois que o navegador baixou e parseou aquele arquivo, o que põe
> a fonte no terceiro nível da cadeia crítica. O `<link>` vai no `<head>`.

### O piso é 12px

`--text-micro: 0.75rem` é o menor tamanho do site, e é chão, não sugestão.

Havia 44 valores escritos à mão (`text-[11px]` em 43 lugares, `text-[10px]` em
um) espalhados por nove arquivos — valor mágico repetido **e** abaixo do
confortável de ler no celular. Rótulo que precisa ser discreto fica discreto por
caixa-alta, peso e espaçamento entre letras; não por encolher abaixo do legível.

`.eyebrow` (o rótulo pequeno em caixa-alta acima dos títulos) usa esse token.

**Medido: 0 elementos abaixo de 12px em 320, 390 e 1440.**

---

## 3. Espaço

### A calha é uma variável

`--jp-gutter` troca em dois breakpoints e **as duas larguras acompanham**:

| Breakpoint | Calha          |
| ---------- | -------------- |
| base       | 1,25rem (20px) |
| ≥ 768px    | 2rem (32px)    |
| ≥ 1280px   | 2,5rem (40px)  |

| Classe          | Largura                                    |
| --------------- | ------------------------------------------ |
| `.jp-container` | `min(1320px, 100% − calha × 2)` — o padrão |

**É uma coluna só, e isso foi uma correção.** Havia uma segunda,
`.jp-container-wide` de 1400px, usada apenas pelo cabeçalho — e era ela que
jogava a logo 40px à esquerda de todo o conteúdo abaixo. A classe **não existe
mais**; se aparecer numa busca, é código que não recebeu estilo nenhum.

Nenhuma seção repete `mx-auto max-w-[1320px] px-5 md:px-8 xl:px-10`. Se alguma
repetir, **é regressão**: mudar a calha passa a exigir uma edição por arquivo.

### O intervalo entre seções é uma soma

O espaço que se vê entre duas seções é o `padding-bottom` de uma **mais** o
`padding-top` da seguinte. `.jp-section` vale 4,5rem de cada lado, então o
intervalo real é **144px**, não 72px.

E a classe encolhe sozinha, porque 144px de respiro num celular é meia tela:

| Largura  | `.jp-section` | Intervalo real | `.jp-section-large` |
| -------- | ------------- | -------------- | ------------------- |
| ≥ 1025px | 4,5rem        | **144px**      | 6rem                |
| 641–1024 | 3,5rem        | **112px**      | 4,5rem              |
| ≤ 640px  | 3rem          | **96px**       | 3rem                |

Quem for apertar ou afrouxar a respiração do site mexe **só nessa classe**.
Antes havia três escalas convivendo (`py-20/28/36`, `py-24/32` e `.jp-section`),
o intervalo variava de 240 a 288px, e cada seção tinha a régua do dia em que foi
escrita. **Se aparecer um `py-*` num `<section>`, é regressão.**

### A rolagem por âncora tem de limpar o cabeçalho

`scroll-padding-top: 8.5rem` (136px) = os **127px** que o cabeçalho grudado
ocupa, mais 9px de respiro.

Era 5.75rem (92px), e a conta não fechava: clicar em "Tratamentos" parava a
seção 35px **atrás** do próprio cabeçalho, engolindo o começo do título. O
cabeçalho mede 127px em 390, 768 e 1440, e nos dois estados de rolagem — por
isso um valor só resolve. **Se a altura do cabeçalho mudar, este número muda
junto.**

---

## 4. Forma

### Raio

Oito degraus, em números redondos:

| Token          | Valor  | Uso                                 |
| -------------- | ------ | ----------------------------------- |
| `--radius-sm`  | `10px` | selo, pílula pequena, detalhe       |
| `--radius-md`  | `14px` | campo de formulário, chip           |
| `--radius-lg`  | `18px` | card pequeno                        |
| `--radius-xl`  | `22px` | **card padrão — o tier mais usado** |
| `--radius-2xl` | `26px` | card elevado, bloco de destaque     |
| `--radius-3xl` | `32px` | bloco de seção, moldura de mídia    |
| `--radius-4xl` | `40px` | moldura grande                      |
| `--radius-5xl` | `48px` | moldura do hero                     |

> **Por que números redondos, e não uma fórmula.** A escala era derivada de
> `--radius` com somas em px: 1.15rem dava 18.4, e os degraus saíam 12.4, 14.4,
> 16.4, 24.4, 32.4, 40.4. Ninguém digita 24.4 — então ninguém usava a escala.
>
> Medido no site publicado antes da correção: **52 raios escritos à mão em 30
> valores distintos**, e nove deles caíam entre 18,4 e 26px. Diferenças que o
> olho não vê e que a manutenção paga. Depois: **10 valores em uso**, e dois são
> intencionais (a curva de 90px do card de equipe e os 999px das cápsulas).
>
> Quem precisar de um raio escolhe o tier. Se nenhum servir, o problema é a
> escala, não o caso — discuta antes de escrever `rounded-[23px]`.

Botões fogem da escala de propósito: são `999px` (cápsula), que é o que os
distingue de qualquer superfície.

### Botões

| Classe                | Fundo                    | Texto        | Borda            | Papel                         |
| --------------------- | ------------------------ | ------------ | ---------------- | ----------------------------- |
| `.button-primary`     | `--forest` (`#095902`)   | branco       | 1,5px `--lime`   | **CTA principal**             |
| `.button-secondary`   | branco                   | `--forest-2` | 1px verde a 14%  | ao lado do principal, claro   |
| `.button-dark`        | `--forest-2` (`#095902`) | branco       | nenhuma          | CTA sobre fundo claro         |
| `.button-ghost-light` | branco a 6%              | branco       | 1px branco a 26% | secundário sobre fundo escuro |

Todos medem **exatamente 52px** de altura (`min-height: 3.25rem`) e
`border-radius: 999px`. O branco mede **8,60:1** sobre os dois verdes cheios.

> **Hoje `--forest` e `--forest-2` são a mesma cor** (`#095902`), então o que
> separa o primário do escuro é a **borda lime de 1,5px** e o peso (850 contra 800) — não o fundo. Vale saber antes de "simplificar" um no outro: a borda é o
> que faz o primário existir sobre o próprio verde da marca, e ela desaparece
> num `.button-dark`.

> **O `min-height` manda, não o conteúdo.** Antes o padding vertical era grande
> e o `line-height` variava entre as variantes, então o **ícone** decidia a
> altura: o mesmo `.button-primary` media 52px no hero e 55px no rodapé, e o
> `.button-dark` media 53. Um ícone de 16px ao lado de outro de 18px bastava
> para desalinhar dois botões da mesma fileira.
>
> Agora o padding vertical é pequeno e a altura mínima é fixa. Um botão de uma
> linha mede 52px com ícone, sem ícone, com ícone de qualquer tamanho. O padding
> segue existindo para o caso de o texto quebrar.
>
> `.button-secondary` nasceu desta auditoria: o visual já existia — cápsula
> branca de borda fina ao lado do CTA principal — mas escrito à mão, em cadeias
> de sessenta caracteres de Tailwind repetidas a cada uso. E divergindo: um par
> vinha com 14px de fonte ao lado de um primário de 16px, na mesma fileira.

**Medido depois da correção, em 320, 390, 768 e 1440px:** as três variantes em
52px, todas com 16px de fonte. Antes havia cinco alturas (44, 48, 52, 55, 79) e
quatro tamanhos de fonte. Os de 79px eram três botões lado a lado numa grade de
três colunas estreitas demais, com o texto quebrando em duas linhas em cada um.

**Hierarquia de CTA**, e ela é uma só no site inteiro:

1. **Primário — "Agendar avaliação"**. É o funil. Um por dobra, no máximo.
2. **Secundário — "Conhecer tratamentos"**. Para quem ainda não decidiu.
3. **Contextual — "Tirar dúvidas" / "Falar com a equipe"**. Onde a dúvida nasce.

O rótulo do primário é **um só** em todo o site. Quatro variações conviviam
("Agendar avaliação", "Agendar pelo WhatsApp", "Agendar avaliação agora",
"Fale no WhatsApp") — e CTA que muda de nome a cada seção não parece opção, e
sim insistência.

> **A única exceção, e ela é do hero da landing paga.** Em `modo="anuncio"`, o
> CTA do hero é `Agendar avaliação de <tratamento>` — "Agendar avaliação de
> implantes". Fora dali, inclusive no cabeçalho e no CTA flutuante da mesma
> página, continua "Agendar avaliação".
>
> **Por que isso não reabre o defeito que a regra fechou.** O problema eram
> quatro rótulos ARBITRÁRIOS disputando a mesma navegação. Aqui é um padrão só,
> derivado de `TRATAMENTOS[].short`, idêntico nas oito LPs, e num lugar só da
> página. Ninguém digita a variação: ela sai do dado.
>
> **O que ela compra.** Quem pesquisou "implante dentário" reencontra a palavra
> no botão — é a mesma correspondência de mensagem que o `<h1>` e o `<title>` da
> LP já fazem, e que o Índice de Qualidade do Google cobra no custo por clique.
> Coberto por E2E: `e2e/publico/trafego-pago.spec.ts`, "o CTA do hero é
> específico do tratamento".

---

## 5. Acessibilidade

Não é uma camada aplicada no fim. É parte do sistema.

| Regra                    | Implementação                                           |
| ------------------------ | ------------------------------------------------------- |
| **Alvo de toque ≥ 44px** | `.alvo-toque` — `inline-flex` + `min-height: 44px`      |
| **Foco visível**         | `:focus-visible` global, contorno 3px, `offset` 3px     |
| **Foco no escuro**       | o contorno vira `--lime` sobre `.section-deep` e afins  |
| **Movimento reduzido**   | `prefers-reduced-motion` zera transição e animação      |
| **Um H1 por página**     | verificado nas 20 rotas fixas em 14/09/2026             |
| **Landmarks**            | 1 `header`, 1 `main`, 1 `footer`, `nav` sempre rotulada |

`.alvo-toque` cresce a área clicável **sem mexer na letra nem no espaçamento
visual** da lista — por isso `inline-flex` com `align-items: center`, e não
`padding`.

> **Duas armadilhas que custaram iteração.**
>
> `min-height` num `<a>` que é `display: inline` **não faz nada**. Os itens do
> menu de desktop continuaram em 40px até ganharem `inline-flex items-center`.
>
> O JSX **apaga a quebra de linha entre texto e elemento**. Com um separador
> `aria-hidden` no meio, o leitor de tela anuncia "Vila BrunaFreguesia do Ó"
> numa palavra só. Onde houver separador inline, ponha `{" "}` explícito.

**Uma exceção deliberada:** o link da Política de Privacidade dentro do
parágrafo de consentimento **não** tem alvo de 44px. A WCAG 2.5.8 abre exceção
para link embutido numa frase, e esticar a caixa quebraria o parágrafo. O mesmo
destino tem link próprio no rodapé, com área cheia.

---

## 6. Movimento

Discreto por decisão. O site é de uma clínica, não de uma agência.

- Entrada de conteúdo por `Reveal` — opacidade e deslocamento curto, uma vez.
- Hover de card: elevação de 2px e sombra um pouco mais funda.
- Cabeçalho encolhe de 92px para 78px ao rolar.
- Vídeo de tratamento: `preload="none"` e poster; só baixa ao chegar nele.

Nada pulsa, nada faz parallax, nada entra em loop. **`prefers-reduced-motion`
desliga tudo** — inclusive o autoplay dos vídeos, que passam a mostrar o poster
e um botão.

---

## 7. Dados são design

Número que aparece em duas telas com dois valores não é detalhe de
implementação: é a clínica dizendo duas coisas diferentes sobre si mesma.

**Tudo que é institucional vive em `src/lib/jp.ts`** — telefone, WhatsApp,
endereço, horário, CNPJ, CRO da responsável técnica, nota do Google, volume de
avaliações, tratamentos, FAQ, equipe e depoimentos.

| Constante             | O que guarda                    | Quem consome                                    |
| --------------------- | ------------------------------- | ----------------------------------------------- |
| `CLINICA`             | contato, endereço, redes        | cabeçalho, rodapé, contato, FAQ, JSON-LD        |
| `AVALIACOES`          | `nota` e `total`                | `<GoogleRating/>`, prova social                 |
| `HISTORIA`            | fundação, anos, bairros         | história, rodapé, carreiras, `seo.ts`           |
| `TRATAMENTOS`         | as 8 páginas                    | home, `$slug`, as 8 LPs, JSON-LD, sitemap       |
| `RESPONSAVEL_TECNICA` | nome e CROSP                    | rodapé (exigência do CFO) e o bloco de história |
| `EQUIPE`              | quem aparece na grade           | `TeamSection`, depois do filtro de publicáveis  |
| `FAQ`                 | 8 perguntas, respostas montadas | home e o `FAQPage` do JSON-LD                   |

`AVALIACOES` **não** entra no JSON-LD: a nota aparece na página para o
visitante, e o schema do `Dentist` fica sem `aggregateRating` de propósito — a
razão está no README, em SEO.

**O componente `<GoogleRating/>` não aceita número por prop.** Essa é a regra
inteira: se aceitasse, alguém passaria um valor diferente, e o site voltaria a
dizer 192 numa página e 176 noutra — que foi exatamente o defeito que existia.

Dois valores são **derivados**, e é isso que evita a próxima divergência:
`notaBR` formata a vírgula decimal, e a fatia da quinta estrela sai de
`(nota % 1)`. Antes o `w-[60%]` era escrito à mão ao lado do "4,6" — bastava
atualizar a nota e esquecer a largura para o desenho mentir sobre o número
impresso do lado.

---

## 8. A armadilha que não se vê lendo o código

**`calc()` sem espaço em volta do operador é CSS inválido**, e o Tailwind
**não gera a classe** — silenciosamente.

```
w-[calc(50%-10px)]      ← inválido. A classe não existe no CSS.
w-[calc(50%_-_10px)]    ← certo. O Tailwind troca `_` por espaço.
```

Isso aconteceu de verdade, em sete larguras da grade de equipe. Nenhuma das
classes foi gerada, o `w-full` da base passou a valer sozinho, e os seis cards
desciam **um por linha** em tablet e desktop: card de 1320×1756, seção de
**11.086 pixels**. Doze telas de rolagem para ver seis pessoas. Depois da
correção: 6 por linha, seção de **932px** — 92% menor.

> **O que pega um defeito assim não é ler o JSX.** As classes estavam lá,
> literais, exatamente como o comentário do arquivo exigia. É conferir se elas
> **chegaram ao CSS que o navegador baixa**:
>
> ```bash
> npm run build
> grep -F "calc(33.333% - 14px)" .vercel/output/static/assets/*.css
> ```

**A largura de `xl` é escolhida pelo tamanho da lista, em tempo de módulo.**
`TeamSection` tem uma tabela de 4 a 8 pessoas (`LARGURA_XL`) e lê a entrada do
tamanho da equipe **publicável**, não da lista inteira. Hoje ela publica
**4 cartões** — `xl:w-[calc(25%_-_15px)]` —, e a tabela existe para que entrar ou
sair alguém não vire uma linha órfã de um cartão só. Fora da faixa 4–8, a chave
não existe e a classe sai vazia: os cartões caem para a largura de `md`, sem
quebrar nada e sem avisar.

---

## 9. Antes de dar por pronto

Nenhum destes é opinião — todos são verificáveis por comando.

- [ ] `npm run build` sem erro
- [ ] `npx tsc --noEmit` limpo
- [ ] `npm run lint` limpo
- [ ] Zero rolagem horizontal em **320, 390, 768 e 1440**
- [ ] Zero alvo interativo abaixo de 44px (fora link inline em frase)
- [ ] Zero texto abaixo de 12px
- [ ] Zero falha de contraste — medindo **pixel**, não expressão regular
- [ ] Um H1 por rota, sem pulo de nível de cabeçalho
- [ ] Console de produção limpo
- [ ] Toda classe `calc()` presente no CSS compilado
- [ ] Lighthouse: acessibilidade, boas práticas e SEO em **100**

**Estado publicado em 11/09/2026:** acessibilidade 100, boas práticas 100 e SEO
100 em 11 das 12 rotas que existiam então — a exceção é `/trabalhe-conosco`,
`noindex` deliberado. Desempenho 100 no desktop e 91 no celular. LCP 0,7 s no
desktop, CLS 0,001.

**As 8 LPs de anúncio não estavam nessa medição.** Elas entraram no mesmo dia e
renderizam `PaginaDeTratamento`, o mesmo componente já medido — o que herda a
estrutura, não o resultado. Ninguém rodou Lighthouse nelas ainda.

### O que foi fechado em 14/09/2026

Os três itens que a troca de paleta de 10/08 tinha deixado abertos. Todos
medidos antes e depois, nenhum deles opinião.

- [x] ~~**Texto pequeno branco direto sobre o lime.**~~ Em
      `PaginaDeTratamento.tsx`, a seção "Um processo. Quatro momentos." abria com
      `<span className="eyebrow text-white">` sobre `bg-lime`: 12px, peso 800,
      **3,00:1** contra os 4,5:1 que a WCAG pede nesse tamanho. Agora é
      `text-brand-deep` — **4,96:1**, conferido no navegador. O título de 47px ao
      lado continua branco, e continua em 3,00:1: é texto grande, e 3:1 é o piso
      dele. O corpo já estava certo, em cartões `bg-brand-deep/45` (5,93:1).
      Valia para as **16 URLs** de tratamento.
- [x] ~~**`--forest-2` sobre `--lime` em três estados.**~~ O `SkipLink` focado, o
      hover dos ícones sociais do rodapé e o hover das 8 setas de
      `SpecialtiesSection` — todos em **2,87:1**, todos agora em
      `text-brand-deep` (**4,96:1**). O do skip link era o que mais pesava: é
      recurso de acessibilidade, e o único estado em que ele aparece era o que
      reprovava. Conferido no DOM: **zero** elementos restantes combinando
      `bg-lime` com `text-forest-2` em hover ou foco.
- [x] ~~**Os comentários de contraste do código citavam o lime antigo.**~~
      Remedidos em `styles.css` (paleta, `--brand-green`, `--forest-2`, botão
      primário e `.rh-rotulo`), em `carreiras/index.tsx` e em
      `rh/AbaTriagem.tsx`. Cada um traz agora o número medido e uma linha
      dizendo o que ele era antes — apagar a conta antiga sem dizer que existiu
      é como o erro entra de novo.

**A regra que os três compartilham, e que vale escrever uma vez:** sobre o
limão, verde escuro é `--brand-deep`, nunca `--forest-2`. Os dois parecem a
mesma decisão e diferem por 2 pontos de contraste.

### O que segue aberto

- [ ] **Rodar Lighthouse nas 8 LPs.** Elas entraram depois da última medição.
- [x] ~~`/carreiras` e `/politica-de-privacidade` fora do `seo.ts`.~~ Corrigido
      em 15/09/2026: **60/121** e **59/149**, medido no HTML servido.
