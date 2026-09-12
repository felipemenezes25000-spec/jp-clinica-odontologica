# Avisos de terceiros

## Fontes — Inter e Manrope

O site **distribui** os arquivos das duas famílias, em `src/assets/fontes/`.
Antes elas vinham do Google Fonts; passaram a ser servidas da própria origem
para tirar um terceiro do caminho crítico de renderização e parar de enviar o IP
de cada visitante ao Google.

Distribuir o arquivo, e não apenas referenciá-lo, é o que faz este aviso ser
**obrigatório**: as duas são licenciadas sob a **SIL Open Font License 1.1**, que
exige o aviso de copyright e a licença acompanharem os arquivos.

| Família     | Copyright                                      | Licença     |
| ----------- | ---------------------------------------------- | ----------- |
| **Inter**   | Copyright (c) 2016 The Inter Project Authors   | SIL OFL 1.1 |
| **Manrope** | Copyright (c) 2018 The Manrope Project Authors | SIL OFL 1.1 |

- Inter — https://github.com/rsms/inter
- Manrope — https://github.com/sharanda/manrope
- Texto da licença — https://openfontlicense.org

A OFL permite uso comercial, incorporação e redistribuição. Ela **proíbe** vender
as fontes isoladamente e exige que um trabalho derivado não use o nome original
(Reserved Font Name). Nenhuma das duas situações se aplica aqui: os arquivos são
os originais, sem modificação.

---

## DeskcommCRM

Partes do runtime agentic do JP CRC foram adaptadas do **DeskcommCRM**, em
particular o contrato da cadeia de portões de `lib/agent-engine/guardrails/
before-send.ts` — a forma `Portao → Veredicto`, com veto no primeiro que barra.

A implementação de cada portão é do JP CRC e é odontológica. O que veio de lá é
o contrato, e a doutrina de porte registrada no `PORT-NOTES.md` deles.

```
MIT License

Copyright (c) 2026 Rafael Melgaço

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

https://github.com/melgarafael/DeskcommCRM
