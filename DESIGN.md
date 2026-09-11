# Sistema de design — JP Clínica Integrada Odontológica

Este documento descreve o que o site **já é**, não o que ele poderia ser. Cada
regra aqui está implementada em `src/styles.css` e vale para as 12 rotas.

A pergunta que este arquivo responde: *"posso escrever um valor aqui ou já
existe um token para isso?"* — quase sempre já existe.

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

| Token           | Valor     | Onde entra                                   |
| --------------- | --------- | -------------------------------------------- |
| `--background`  | `#f7f8f2` | o creme que é o fundo padrão do site          |
| `--card`        | `#ffffff` | superfície elevada sobre o creme              |
| `--ink`         | `#172018` | texto principal em fundo claro                |
| `--ink-soft`    | `#5a6b5c` | texto secundário em fundo claro               |
| `--brand-text`  | `#095902` | o verde da marca **quando é texto** no claro  |
| `--brand-green` | `#56a805` | o verde vivo — acento, não texto              |
| `--brand-deep`  | `#032f01` | o verde profundo das seções escuras           |
| `--lime`        | `#7bd51c` | acento sobre fundo escuro                     |
| `--border-soft` | `#dce4d6` | divisores e bordas de card                    |
| `--destructive` | `#b42318` | erro de formulário                            |

### As três regras de contraste

Não são preferência. São WCAG 2.1 AA, com contraste **calculado**, não estimado.

1. **`--lime` só como texto sobre fundo escuro** (8,2:1 ali). Sobre o creme mede
   **1,73:1** — reprova até para texto grande, que exige só 3:1. Em fundo claro,
   o verde de texto é `--brand-text` (5,13:1 no creme, 5,48:1 no branco).
2. **Nunca `--forest` com opacidade para texto.** A faixa que existia (40% a
   70%) ia de 1,87:1 a 3,31:1 — toda ela reprovava. Use `--ink-soft` sólido.
3. **Sobre o lime, o texto é `--forest-2`** (8,2:1). `--ink-soft` ali dá 3,08:1.

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

**Medido no site publicado: 0 falhas de contraste em 112 elementos.**

### As superfícies escuras

| Classe           | Gradiente                       | Papel                      |
| ---------------- | ------------------------------- | -------------------------- |
| `.section-light` | creme                           | seção clara padrão         |
| `.section-mid`   | `#0b5a02 → #053901 → #032f01`   | verde médio, transição     |
| `.section-deep`  | `#011600 → #022400 → #032f01`   | o mais escuro — rodapé, hero |

**O ritmo importa.** A home alterna `C e C C C e C e C` (claro/escuro) e **não
tem nenhum par de seções escuras coladas**. Ao inserir ou mover uma seção,
confira isso — duas escuras seguidas achatam a leitura.

---

## 2. Tipografia

Duas famílias, **hospedadas neste repositório** (`src/assets/fontes/`):

| Família      | Token            | Onde                          |
| ------------ | ---------------- | ----------------------------- |
| **Manrope**  | `--font-display` | títulos, números, botões      |
| **Inter**    | `--font-sans`    | corpo de texto, rótulos       |

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

| Breakpoint | Calha  |
| ---------- | ------ |
| base       | 1,25rem (20px) |
| ≥ 768px    | 2rem (32px)    |
| ≥ 1280px   | 2,5rem (40px)  |

| Classe               | Largura                                       |
| -------------------- | --------------------------------------------- |
| `.jp-container`      | `min(1320px, 100% − calha × 2)` — o padrão    |
| `.jp-container-wide` | `min(1400px, 100% − calha × 2)` — só o header |

Nenhuma seção repete `mx-auto max-w-[1320px] px-5 md:px-8 xl:px-10`. Se alguma
repetir, **é regressão**: mudar a calha passa a exigir uma edição por arquivo.

### O intervalo entre seções é uma soma

O espaço que se vê entre duas seções é o `padding-bottom` de uma **mais** o
`padding-top` da seguinte. `.jp-section` vale 4,5rem de cada lado, então o
intervalo real é **144px**, não 72px.

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

| Token          | Valor  | Uso                                       |
| -------------- | ------ | ----------------------------------------- |
| `--radius-sm`  | `10px` | selo, pílula pequena, detalhe             |
| `--radius-md`  | `14px` | campo de formulário, chip                 |
| `--radius-lg`  | `18px` | card pequeno                              |
| `--radius-xl`  | `22px` | **card padrão — o tier mais usado**       |
| `--radius-2xl` | `26px` | card elevado, bloco de destaque           |
| `--radius-3xl` | `32px` | bloco de seção, moldura de mídia          |
| `--radius-4xl` | `40px` | moldura grande                            |
| `--radius-5xl` | `48px` | moldura do hero                           |

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

| Classe                | Fundo        | Texto  | Papel                        |
| --------------------- | ------------ | ------ | ---------------------------- |
| `.button-primary`     | `--forest`   | branco | **CTA principal**            |
| `.button-secondary`   | branco       | escuro | ao lado do principal, claro  |
| `.button-dark`        | `--forest-2` | branco | CTA sobre fundo claro        |
| `.button-ghost-light` | transparente | branco | secundário sobre fundo escuro |

Todos medem **exatamente 52px** de altura e `border-radius: 999px`.

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

---

## 5. Acessibilidade

Não é uma camada aplicada no fim. É parte do sistema.

| Regra                    | Implementação                                          |
| ------------------------ | ------------------------------------------------------ |
| **Alvo de toque ≥ 44px** | `.alvo-toque` — `inline-flex` + `min-height: 44px`     |
| **Foco visível**         | `:focus-visible` global, contorno 3px, `offset` 3px    |
| **Foco no escuro**       | o contorno vira `--lime` sobre `.section-deep` e afins |
| **Movimento reduzido**   | `prefers-reduced-motion` zera transição e animação      |
| **Um H1 por página**     | verificado nas 12 rotas                                 |
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

| Constante    | O que guarda                        | Quem consome                        |
| ------------ | ----------------------------------- | ----------------------------------- |
| `CLINICA`    | contato, endereço, redes            | cabeçalho, rodapé, contato, JSON-LD |
| `AVALIACOES` | `nota` e `total`                    | `<GoogleRating/>` e o JSON-LD       |
| `HISTORIA`   | fundação, anos, bairros             | história, rodapé, carreiras         |
| `TRATAMENTOS`| as 8 páginas                        | home, `$slug`, JSON-LD, sitemap     |

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
100 em 11 das 12 rotas — a exceção é `/trabalhe-conosco`, `noindex` deliberado.
Desempenho 100 no desktop e 91 no celular. LCP 0,7 s no desktop, CLS 0,001.
