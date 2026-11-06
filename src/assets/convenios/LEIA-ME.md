# Logos dos convênios

O site usa os arquivos desta pasta automaticamente: `convenios-do-site.ts` varre
a pasta com `import.meta.glob` e a seção de convênios troca o nome escrito pela
logo assim que existe um arquivo com o `slug` do convênio (`.svg`, `.png` ou
`.webp`). Sem arquivo, o cartão mostra o nome em tipo forte.

## Origem dos arquivos atuais (baixados em 06/11/2026, a pedido do Felipe)

Todos tirados do site OFICIAL de cada operadora, sem alteração de desenho:

| Arquivo                  | Origem                                                            | Ajuste feito                                          |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `sulamerica.webp`        | portal.sulamericaseguros.com.br (`assets/logo-sula130.png`)       | recorte só da marca, sem o selo "130 anos" e o slogan |
| `porto-seguro.svg`       | portoseguro.com.br (CDN prismic, `porto-logo.svg`)                | nenhum                                                |
| `bradesco.svg`           | bradescoseguros.com.br, página do plano dental (SVG do cabeçalho) | nenhum (marca Bradesco Seguros)                       |
| `odontoprev.svg`         | odontoprev.com.br (SVG do cabeçalho)                              | largura/altura fixas em vez de 100%                   |
| `dental-par.webp`        | dentalpar.com.br (`logo-dentalpar.png`, 168×33)                   | convertido para WebP sem perda                        |
| `rede-brazil-dental.svg` | brazildental.com.br (`LOgo BD.svg`)                               | nenhum                                                |
| `sempre-odonto.webp`     | sempreodonto.com.br (`logo_colorida_V2.png`)                      | reduzido para 120px de altura                         |
| `odonto-empresas.svg`    | odontoempresas.com.br (ícone "ODONTO" do cabeçalho)               | nenhum                                                |

Logo de operadora é marca registrada de terceiro; a clínica é credenciada e a
logo aparece só para indicar o convênio aceito. Se uma operadora mandar o kit de
marca para credenciados, troque o arquivo pelo do kit (mesmo nome).

## O que o arquivo precisa ter

- Fundo transparente e versão colorida (o cartão é branco).
- SVG de preferência; PNG/WebP com pelo menos 2x a altura exibida (36px; 52px
  para as logos empilhadas listadas em `LOGO_ALTA` no `ConveniosSection.tsx`).
- Sem margem interna embutida.
