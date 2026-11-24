# Avisos de terceiros

## Fontes — Inter, Manrope e Bricolage Grotesque

O site **distribui** os arquivos das três famílias, em `src/assets/fontes/`.
Antes elas vinham do Google Fonts; passaram a ser servidas da própria origem
para tirar um terceiro do caminho crítico de renderização e parar de enviar o IP
de cada visitante ao Google.

Distribuir o arquivo, e não apenas referenciá-lo, é o que faz este aviso ser
**obrigatório**: as três são licenciadas sob a **SIL Open Font License 1.1**, que
exige o aviso de copyright e a licença acompanharem os arquivos.

| Família                 | Copyright                                              | Licença     |
| ----------------------- | ------------------------------------------------------ | ----------- |
| **Inter**               | Copyright (c) 2016 The Inter Project Authors           | SIL OFL 1.1 |
| **Manrope**             | Copyright (c) 2018 The Manrope Project Authors         | SIL OFL 1.1 |
| **Bricolage Grotesque** | Copyright 2022 The Bricolage Grotesque Project Authors | SIL OFL 1.1 |

- Inter — https://github.com/rsms/inter
- Manrope — https://github.com/sharanda/manrope
- Bricolage Grotesque — https://github.com/ateliertriay/bricolage (a fonte do site desde o
  redesenho de 11/2026; Inter e Manrope seguem no CRC)
- Texto da licença — https://openfontlicense.org

A OFL permite uso comercial, incorporação e redistribuição. Ela **proíbe** vender
as fontes isoladamente e exige que um trabalho derivado não use o nome original
(Reserved Font Name). Nenhuma das situações se aplica aqui: os arquivos são os
originais, só recortados por alfabeto (latin e latin-ext), como o Google Fonts
os entrega.

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


---

## Escopo da licença raiz e materiais não relicenciados

A licença MIT na raiz cobre somente o código-fonte original e a documentação
técnica de autoria do projeto, conforme delimitado em LICENSE e README.md.
Ela não substitui licenças ou direitos de terceiros.

### Especificação oficial do Dental Office

Os arquivos em docs/crc/dental-office-api/ são uma cópia da especificação
OpenAPI 3.0.3 publicada pelo Dental Office, baixada em 09/09/2026, conforme
registrado em docs/crc/dental-office-api/LEIA-ME.md. O conteúdo não é
relicenciado por este repositório; os direitos e termos do publicador original
permanecem aplicáveis.

### Marca e materiais da JP Clínica

Os materiais de marca descritos em docs/marca/LEIA-ME.md, incluindo os
arquivos originais entregues pela clínica, bem como logotipos, retratos da
equipe, fotografias das instalações, vídeos e peças de marketing em public/,
apresentacao/ e social/, não são abrangidos pela licença MIT deste
repositório. Direitos autorais, marca, imagem e demais direitos permanecem com
a JP Clínica, os autores e as pessoas retratadas, conforme aplicável. A
redistribuição ou reutilização exige autorização dos respectivos titulares.

### Fontes e código de terceiros

- Inter, Manrope e Bricolage Grotesque: SIL Open Font License 1.1, conforme
  os avisos e titulares listados acima.
- Trechos adaptados do DeskcommCRM: manter o aviso de copyright e a licença
  MIT original de Rafael Melgaço, reproduzidos nesta página.

A licença raiz não altera essas condições nem concede direitos sobre marcas,
imagens, dados pessoais ou outros materiais de terceiros.
