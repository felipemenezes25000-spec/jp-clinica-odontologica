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

**Por que o verde claro não vira texto:** mede 2,81:1 sobre o creme da página
e 2,87:1 sobre o verde escuro da própria marca. O mínimo é 4,5:1. Para texto
sobre fundo escuro o site usa `--lime` (`#7BD51C`), que ali dá 4,66:1.

**Por que a rampa dos gradientes escuros termina em `#095902`:** acima disso o
lime deixa de funcionar como texto — já em `#0A6002` cai para 4,23:1.

## Fontes da marca

A folha indica **Bauhaus 93** e **Eras Bold ITC**. São as fontes do desenho da
logo, não do site: as duas são display e ilegíveis em texto corrido. O site usa
**Manrope** nos títulos e **Inter** no resto.
