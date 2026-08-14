# Marca JP Clínica Odontológica

Arquivos originais entregues pela clínica. Ficam aqui como fonte e não entram no
build — mas, diferente de antes, o site também não usa mais um recorte de imagem
deles: os `.eps` são vetor de verdade, e é deles que saem os SVGs servidos.

| Arquivo                           | O que é                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `logo-jp.png`                     | Folha de marca: logo horizontal, as duas cores e as fontes |
| `logo-jp-1.eps` / `logo-jp-2.eps` | Vetores, para impresso e ampliações                        |

## Como a marca chega ao site

```
python scripts/gerar-marca.py
```

O script lê os dois `.eps` e reescreve tudo que a marca produz. Nenhum desses
arquivos é editado à mão; se a clínica entregar um `.eps` novo, rode de novo.

| Sai em                                | O que é                                                       |
| ------------------------------------- | ------------------------------------------------------------- |
| `src/assets/marca/logo-jp.svg`        | Lockup horizontal, cores originais — superfícies claras       |
| `src/assets/marca/logo-jp-claro.svg`  | O mesmo lockup com o contorno em branco — superfícies escuras |
| `src/assets/marca/marca-jp.svg`       | Só o símbolo (dente + JP), para espaços pequenos              |
| `src/assets/marca/marca-jp-claro.svg` | O símbolo para fundo escuro                                   |
| `public/favicon.svg` + PNGs           | Ícones de aba e de app, o símbolo num ladrilho branco         |
| `public/og.png`                       | Cartão de compartilhamento, 1200×630                          |

O componente `Logo` (`src/components/site/Logo.tsx`) é o único lugar que importa
esses arquivos. Ele recebe `fundo="claro" | "escuro"` — a cor da **superfície**,
não da arte — e escolhe a variante certa.

### Duas coisas que o EPS dá e o recorte de imagem não dava

- **O vão do sorriso virou furo.** No PNG ele era um retângulo branco, o que
  prendia a marca a fundos brancos. No SVG o dente e o vão entram num caminho só
  com `fill-rule="evenodd"`: o fundo aparece por ele, seja qual for a cor.
- **A sombra é referência, não cópia.** No desenho original, a sombra escura de
  "Clínica Odontológica" e a do "JP" são as mesmas curvas deslocadas. O SVG
  guarda cada forma uma vez e repete com `<use>` — 21 KB em vez de 42 KB.

## As duas cores oficiais

Lidas dos pixels da folha. Os dois quadrados dela trazem rótulos idênticos
("RGB 9 89 2" nos dois), o que é erro de copy-paste no material original — os
pixels são a fonte confiável.

|              | Valor     | Token                                                     |
| ------------ | --------- | --------------------------------------------------------- |
| Verde escuro | `#095902` | `--forest-2`, `--forest`, `--brand-text`, `--primary-ink` |
| Verde claro  | `#56A805` | `--lime`, `--primary`, `--brand-green`                    |

## O tom derivado, e por que ele precisou existir

`#56A805` sobre `#095902` mede **2,87:1**. O mínimo para texto é 4,5:1. Ou seja:
**as duas cores da folha não se leem uma sobre a outra.** Foram escolhidas para
conviver lado a lado num logotipo sobre branco, não para formar par de
texto/fundo.

Como o site tem grandes superfícies verde-escuras, a saída foi escurecer o
próprio verde da marca até que o verde claro se leia em cima dele:

| Token          | Valor     | O que é                                                       |
| -------------- | --------- | ------------------------------------------------------------- |
| `--brand-deep` | `#032F01` | `#095902` a 28% da luminância. Superfície das seções escuras. |

Com ele, `#56A805` mede **4,96:1** — passa.

## Regras que decorrem disso

- **Superfície escura** → `--brand-deep`. Nunca `#095902`: ali o verde claro cai
  para 2,87:1.
- **Texto e borda sobre o escuro** → `#56A805` (4,96:1) ou branco (14,88:1).
- **Texto sobre fundo claro** → `#095902` (8,05:1 no creme). Nunca `#56A805`,
  que ali dá 2,81:1.
- **Preenchimento de `#56A805`** → conteúdo em `--brand-deep` (4,96:1). Não use
  `#095902` em cima: 2,87:1.
- **Rampa de gradiente** → só entre `#011600` e `#032F01`. Acima disso o verde
  claro deixa de funcionar como texto: já em `#0A6002` cai para 4,23:1.
- **Botão sobre superfície escura** → preenchimento `#095902` some no fundo
  (1,73:1). A borda `#56A805` é o que torna a aresta perceptível (4,96:1), e é
  por isso que ela não é decorativa.

## Inventário

O CSS servido tem 76 declarações de cor:

|                               |       |        |
| ----------------------------- | ----- | ------ |
| Cor da folha                  | 17    | 22%    |
| Derivada da folha             | 44    | 58%    |
| Neutro (branco, creme, tinta) | 15    | 20%    |
| **Fora do sistema**           | **0** | **0%** |

## Uma exceção consciente, isenta

- **Trilho da estrela vazia** (`#9FB396`, 2,24:1) — a nota aparece como texto
  ("4,5") e o grupo tem `role="img"` com `aria-label`. O gráfico é redundante.

A WCAG 1.4.11 se aplica a gráficos necessários para entender o conteúdo; aqui a
informação está disponível em texto.

> A segunda exceção que morava aqui era a borda do medalhão do cabeçalho
> (`#7FB16E`). Ela saiu junto com o medalhão — o cabeçalho agora mostra o lockup
> inteiro, sem disco em volta —, então o inventário acima está uma declaração
> acima do que o CSS servido tem hoje.

## Fontes da marca

A folha indica **Bauhaus 93** e **Eras Bold ITC**. São as fontes do desenho da
logo, não do site: as duas são display e ilegíveis em texto corrido. O site usa
**Manrope** nos títulos e **Inter** no resto.
