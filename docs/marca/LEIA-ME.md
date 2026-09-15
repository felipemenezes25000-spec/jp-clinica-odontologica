# Marca — JP Clínica Odontológica

> **Documento vivo, revisado em 15/09/2026.**

Os arquivos nesta pasta são fontes entregues pela clínica. Não edite os vetores originais para “corrigir” o site: regenere os derivados pelo processo do repositório.

## Fontes

| Arquivo | Papel |
| --- | --- |
| `logo-jp.png` | referência visual/folha de marca |
| `logo-jp-1.eps` / `logo-jp-2.eps` | vetores originais |

## Geração dos ativos

```bash
python scripts/gerar-marca.py
```

O script gera os SVGs/ícones derivados usados pelo site. O componente `Logo` decide a variante apropriada à superfície.

Ativos derivados esperados incluem as variantes de lockup/símbolo em `src/assets/marca/` e ícones/OG em `public/` conforme o script atual.

Não mantenha neste documento uma contagem manual de bytes, declarações CSS ou número de arquivos gerados: o script e a árvore do repositório são a fonte.

## Cores oficiais

| Cor | Valor | Papel |
| --- | --- | --- |
| verde escuro | `#095902` | marca e texto forte em fundo claro |
| verde claro | `#56A805` | acento/elementos da marca |

O site também usa `#032F01` como superfície escura **derivada** para que o verde claro possa funcionar com contraste adequado em determinadas combinações.

## Regras de uso

- não usar `#56A805` como texto corrente sobre fundo claro;
- usar o verde escuro/token semântico para texto em superfícies claras;
- em superfície escura, conferir contraste da combinação real;
- em botão/estado, não depender só de cor;
- evitar hexadecimal espalhado quando existe token em `src/styles.css`;
- logo não deve ganhar fundo/disco arbitrário para resolver contraste: use a variante correta do ativo.

Os números exatos de contraste e os tokens vigentes devem ser verificados em `DESIGN.md` + `src/styles.css`, pois podem mudar junto com a implementação.

## Fontes tipográficas

A folha de marca cita Bauhaus 93 e Eras Bold ITC como parte do desenho da identidade. Elas não são as fontes de interface do site.

No site:

- Manrope — títulos;
- Inter — corpo/interface.

## Fonte de verdade

- materiais originais: esta pasta;
- geração: `scripts/gerar-marca.py`;
- tokens: `src/styles.css`;
- regras de interface: [`../../DESIGN.md`](../../DESIGN.md).

Se a clínica fornecer uma nova versão oficial do EPS/folha de marca, substitua a fonte, regenere os derivados e valide visualmente site, RH e CRC antes de publicar.