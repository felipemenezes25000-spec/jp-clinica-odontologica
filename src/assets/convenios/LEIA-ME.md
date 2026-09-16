# Logos dos convênios

Esta pasta está vazia de propósito, e a seção de convênios funciona sem ela.

## Como um logo entra no site

Coloque o arquivo aqui com **exatamente** o `slug` que está em `CONVENIOS`, em
`src/lib/jp.ts`:

| Convênio           | Nome do arquivo                                     |
| ------------------ | --------------------------------------------------- |
| SulAmérica         | `sulamerica.svg`                                    |
| Porto Seguro       | `porto-seguro.svg`                                  |
| Bradesco           | `bradesco.svg`                                      |
| OdontoPrev         | `odontoprev.svg`                                    |
| Dental Par         | `dental-par.svg`                                    |
| Rede Brazil Dental | `rede-brazil-dental.svg`                            |

`.png` e `.webp` também funcionam. Não é preciso mexer em código nenhum:
`ConveniosSection` varre esta pasta com `import.meta.glob` e troca a placa
tipográfica pelo arquivo assim que ele existe.

## De onde tirar os arquivos

**Não baixe do Google Imagens.** Logo de operadora é marca registrada de
terceiro. A JP é credenciada, o que normalmente dá direito de uso — mas quem
autoriza é cada operadora, e o material certo é o **kit de marca / manual de
identidade para credenciados** que elas entregam. Peça pelo canal do
credenciado de cada uma.

Enquanto o kit não chega, a seção mostra o nome em tipografia. Informa a mesma
coisa e não usa marca de ninguém.

## O que o arquivo precisa ter

- **Fundo transparente.** A placa já é branca; um retângulo branco dentro dela
  cria uma borda visível.
- **Versão colorida**, não a monocromática. A placa é branca justamente para
  qualquer logo colorido funcionar sobre o verde escuro da faixa.
- **SVG de preferência.** A faixa desliza e o logo é renderizado em tamanhos
  diferentes conforme a tela; PNG abaixo de 2x fica serrilhado.
- **Margem interna zerada.** O espaçamento é da placa, não do arquivo — SVG com
  respiro embutido aparece menor que os vizinhos.

O componente limita a altura a 36px e a largura a 170px, preservando a
proporção. Um arquivo muito largo (assinatura horizontal longa) encolhe até
caber na largura e fica menor que os outros: prefira a versão compacta da marca
quando a operadora oferecer as duas.
