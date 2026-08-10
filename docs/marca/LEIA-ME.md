# Marca JP Clínica Odontológica

Arquivos originais entregues pela clínica. Ficam aqui como fonte, não são
usados em build — o site usa `src/assets/logo-jp-official.webp`, que é a marca
recortada com fundo transparente.

| Arquivo                           | O que é                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `logo-jp.png`                     | Folha de marca: logo horizontal, as duas cores e as fontes |
| `logo-jp-1.eps` / `logo-jp-2.eps` | Vetores, para impresso e ampliações                        |

## Cores oficiais

Lidas dos pixels da folha. Os dois quadrados dela trazem rótulos idênticos
("RGB 9 89 2" nos dois), o que é erro de copy-paste no material original —
os pixels são a fonte confiável.

| Cor          | Valor     | Onde entra no site                                        |
| ------------ | --------- | --------------------------------------------------------- |
| Verde escuro | `#095902` | `--forest-2`: fundo das seções escuras, texto sobre claro |
| Verde claro  | `#56A805` | `--brand-green`: **só preenchimento**                     |

### Onde o verde claro entra, e onde não entra

Ele vale para **decoração sobre fundo claro**: círculos e traços das seções de
especialidades, equipe e avaliações, brilhos de hover, molduras de selo. São 14
usos.

Não entra em três situações, todas medidas:

| Situação                                 | `#56A805` | `#7BD51C` (o que o site usa) |
| ---------------------------------------- | --------- | ---------------------------- |
| Texto sobre o verde escuro               | 2,87:1 ✗  | 4,66:1 ✓                     |
| Borda de componente sobre o verde escuro | 2,87:1 ✗  | 4,66:1 ✓                     |
| Preenchimento com o verde escuro em cima | 2,87:1 ✗  | 4,66:1 ✓                     |
| Texto sobre o creme da página            | 2,81:1 ✗  | (também reprova)             |

O mínimo é 4,5:1 para texto e 3:1 para borda de componente.

**Por quê:** as duas cores da folha foram escolhidas para conviver lado a lado
num logotipo sobre branco, não para uma servir de texto sobre a outra. O
`#7BD51C` é uma extensão do sistema, criada porque o site tem superfícies
verde-escuras grandes que precisam de um acento legível. Está documentado aqui
justamente para não parecer descuido.

**Por que a rampa dos gradientes escuros termina em `#095902`:** acima disso o
lime deixa de funcionar como texto — já em `#0A6002` cai para 4,23:1.

## Fontes da marca

A folha indica **Bauhaus 93** e **Eras Bold ITC**. São as fontes do desenho da
logo, não do site: as duas são display e ilegíveis em texto corrido. O site usa
**Manrope** nos títulos e **Inter** no resto.
