# Como anunciar — JP Clínica Odontológica

Guia operacional para Google Ads e Meta Ads da JP Clínica, com foco inicial em **implantes dentários**.

Este documento separa três coisas que não devem ser misturadas:

1. o que já está implementado no site;
2. o que precisa ser configurado nas plataformas de mídia;
3. o que depende da operação humana da clínica.

A campanha inicial **não depende do CRC**.

---

## 1. Fluxo inicial recomendado

### Google Search

```text
Google Ads
  → /implante-dentario
  → WhatsApp
  → recepção humana
  → avaliação
  → comparecimento
  → fechamento
```

### Meta / Instagram

```text
Instagram / Facebook
  → WhatsApp direto
```

ou, quando fizer sentido:

```text
Instagram / Facebook
  → /implante-dentario
  → WhatsApp
```

O CRC pode entrar depois para fechar comparecimento, fechamento, receita e CAC. Ele não é condição para começar mídia.

---

## 2. URLs de anúncio

Cada tratamento possui uma rota curta para mídia paga e uma rota orgânica.

| Tratamento | URL de anúncio | URL orgânica |
| --- | --- | --- |
| Implante | `/implante-dentario` | `/tratamentos/implantes-dentarios` |
| Clareamento | `/clareamento-dental` | `/tratamentos/clareamento-dental` |
| Ortodontia | `/ortodontia` | `/tratamentos/ortodontia` |
| Odontopediatria | `/odontopediatria` | `/tratamentos/odontopediatria` |
| Prótese | `/protese-dentaria` | `/tratamentos/proteses-dentarias` |
| Restauração | `/restauracao-dentaria` | `/tratamentos/restauracoes` |
| Limpeza | `/limpeza-dental` | `/tratamentos/limpeza-profilaxia` |
| Harmonização orofacial | `/harmonizacao-facial` | `/tratamentos/harmonizacao-orofacial` |

### Regra

**Anúncio de tratamento não deve mandar para a home.**

Quem pesquisou implante deve cair diretamente em `/implante-dentario`.

A rota paga reutiliza o mesmo conteúdo clínico da orgânica, mas entra em `modo="anuncio"`, com menos distrações e maior correspondência com a busca.

No modo anúncio:

- H1 contém procedimento + região;
- localização aparece na primeira dobra;
- CTA menciona o tratamento;
- não existe link “Todos os tratamentos” no hero;
- não existe cross-sell de outros tratamentos no fim;
- o cabeçalho desktop não monta a navegação da home;
- o menu móvel também não monta os links da home/carreiras;
- telefone e WhatsApp permanecem disponíveis;
- canonical continua apontando para a rota orgânica correspondente.

---

## 3. Landing page principal de implante

Destino inicial:

```text
https://www.jpclinicaodontologica.com.br/implante-dentario
```

A primeira dobra deve responder rapidamente:

- o que é: implantes dentários;
- onde: Freguesia do Ó / Vila Bruna;
- quem é a clínica;
- prova social real;
- como falar com a recepção;
- que a indicação depende de avaliação individual.

### CTA principal

```text
Agendar avaliação de implantes
```

O WhatsApp recebe o contexto do tratamento e, quando houver campanha, uma referência curta de atribuição.

Exemplo:

```text
Ref.: IMP-G-A01
```

IDs brutos como `gclid` e `fbclid` não devem aparecer na mensagem enviada pelo paciente.

---

## 4. Atribuição já implementada no site

A camada pública captura:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `gclid`
- `fbclid`
- `gbraid`
- `wbraid`
- página de entrada

A atribuição é mantida na sessão como **first-touch**.

Navegar para outra página do site não apaga a campanha que trouxe a pessoa.

### Exemplo de URL Google

```text
https://www.jpclinicaodontologica.com.br/implante-dentario?utm_source=google&utm_medium=cpc&utm_campaign=implante_search&utm_content=a01&utm_term={keyword}
```

### Exemplo Meta

```text
https://www.jpclinicaodontologica.com.br/implante-dentario?utm_source=meta&utm_medium=cpc&utm_campaign=implante_meta&utm_content=video01
```

### Padrão recomendado de nomes

Use minúsculas, sem espaços e sem acentos.

```text
utm_source=google
utm_medium=cpc
utm_campaign=implante_freguesia_search
utm_content=a01
```

Não use variações como:

```text
Implante Dentário
implante-dentário
Implante_Search
```

se a mesma campanha também aparece como:

```text
implante_dentario
implante_search
```

Isso fragmenta relatórios.

---

## 5. Eventos válidos

### Regra absoluta

**`generate_lead` é a única conversão primária desta fase.**

| Evento | Uso | Conversão primária? |
| --- | --- | --- |
| `generate_lead` | agendamento/contato com intenção de avaliação | **SIM** |
| `contact_click` | contato genérico | não |
| `phone_click` | clique em telefone | não |
| `treatment_view` | visualização de tratamento | não |
| `form_start` | início do formulário | não |
| `form_submit` | envio do formulário | não |
| `map_click` | abertura do mapa | não |
| `review_click` | avaliações | não |
| eventos de carreira | recrutamento | não |

### Eventos antigos

Não configurar gatilhos, conversões ou públicos com:

```text
whatsapp_click
schedule_click
treatment_cta_click
```

Esses nomes pertencem à semântica antiga e não devem ser usados.

### Por que existe essa regra

Antes, uma única ação podia representar múltiplos sinais de conversão e inflar o aprendizado das plataformas.

Agora:

```text
1 clique de agendamento
  = 1 generate_lead
  = no máximo 1 Lead na Meta
```

`form_submit` pode existir junto de `generate_lead` apenas como leitura de funil. **Não transforme `form_submit` em conversão.**

---

## 6. Exemplo de evento

```json
{
  "event": "generate_lead",
  "treatment": "implantes-dentarios",
  "channel": "whatsapp",
  "origem": "hero",
  "pagina": "/implante-dentario",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "implante_search",
  "utm_content": "a01",
  "gclid": "...",
  "event_id": "..."
}
```

### Privacidade

Eventos de analytics não devem receber:

- nome;
- telefone;
- e-mail;
- mensagem livre;
- diagnóstico;
- sintomas;
- condição clínica;
- texto de prontuário.

`treatment="implantes-dentarios"` descreve o contexto da página/campanha. Não é diagnóstico do visitante.

---

## 7. GTM

O site aceita:

```text
VITE_GTM_ID=GTM-XXXXXXX
```

### Configuração

1. Criar container Web no Google Tag Manager.
2. Cadastrar `VITE_GTM_ID` na Vercel.
3. Fazer novo deploy.
4. Abrir GTM Preview.
5. Confirmar os eventos do `dataLayer`.

Não colocar IDs diretamente em componentes do React.

---

## 8. GA4

No GTM:

1. criar a Google Tag da propriedade GA4;
2. configurar os eventos necessários;
3. manter `generate_lead` como key event/conversão principal da aquisição;
4. usar os demais eventos apenas para análise de funil.

Dimensões úteis:

- `treatment`
- `channel`
- `origem`
- `pagina`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`

---

## 9. Google Ads

### Conversão

Criar uma ação de conversão para o lead digital e usar **somente `generate_lead` como primária**.

Não marcar como primária:

- `contact_click`;
- `phone_click`;
- `treatment_view`;
- `form_submit`;
- `page_view`.

Ativar o auto-tagging para preservar `gclid`.

### Primeira campanha

Começar com Search de alta intenção para implante.

Exemplos de termos iniciais em frase/exata:

```text
"implante dentário"
"implante dentário freguesia do ó"
"implante dentário zona norte sp"
"dentista implante freguesia do ó"
"clínica de implante dentário"
"implante dentário perto de mim"
"prótese sobre implante"
"dentadura fixa"
"protocolo dentário"
```

Usar “especialista em implante” somente se existir profissional cuja especialidade/titulação possa ser comprovada.

### Negativas iniciais

```text
grátis
gratuito
sus
curso
faculdade
apostila
emprego
vaga
salário
concurso
como fazer
caseiro
DIY
passo a passo
```

### Não negativar automaticamente

```text
preço
valor
quanto custa
parcelamento
barato
```

Esses termos podem carregar intenção comercial real.

A decisão deve vir de termos de pesquisa + geração de lead + comparecimento/fechamento.

---

## 10. Segmentação geográfica

Começar local.

Prioridade:

- Freguesia do Ó;
- Vila Bruna;
- Pirituba;
- Limão;
- Brasilândia;
- bairros próximos com deslocamento viável.

Uma referência inicial de teste é aproximadamente 4–6 km da clínica, ajustada conforme dados reais de lead, comparecimento e fechamento.

Não abrir São Paulo inteiro no início sem necessidade.

---

## 11. Meta / Instagram

Para a primeira fase, priorizar:

- geografia local;
- criativos reais da clínica;
- vídeos curtos da estrutura/equipe;
- convite para avaliação;
- WhatsApp humano.

Evitar texto que atribua uma condição pessoal ao usuário.

Ruim:

```text
Você perdeu dentes e está sofrendo para mastigar?
```

Preferível:

```text
Implantes dentários com planejamento individual na Freguesia do Ó.
Converse com a equipe da JP para entender como funciona a avaliação.
```

---

## 12. Remarketing e saúde — regra conservadora

Implantes envolvem tratamento odontológico e procedimento invasivo. Para mídia, trate esse contexto como **saúde/sensível**.

### Google Ads

A política de publicidade personalizada do Google restringe públicos organizados pelo anunciante em categorias de interesse sensíveis de saúde.

Portanto, **não crie segmento de dados/remarketing do Google baseado em pessoas que visitaram `/implante-dentario` ou outra página de tratamento**.

Não usar, para esse fim:

- Customer Match/lista de clientes;
- “seus segmentos de dados” baseados em visita a tratamento;
- públicos semelhantes/expansões que dependam desse sinal sensível.

Pode-se trabalhar com recursos permitidos pelo Google, como intenção/contexto, localização e públicos predefinidos elegíveis, sempre revisando a política atual da conta antes de ativar.

Fonte oficial:

- https://support.google.com/adspolicy/answer/16701855?hl=pt-BR

### Meta

Não transforme visita a uma página de tratamento em afirmação de diagnóstico ou condição clínica.

Na primeira fase, **não dependa de remarketing por página de tratamento**. Trabalhe com aquisição local ampla e intenção do anúncio. Qualquer estratégia de Custom Audience envolvendo comportamento em páginas clínicas deve ser validada contra a política vigente da Meta e a base legal aplicável antes de ser ativada.

Essa cautela evita que a campanha dependa de um mecanismo de público que possa ser incompatível com dados de saúde/sensíveis.

---

## 13. Consentimento — implementação correta

O site implementa Google Consent Mode v2 com estados iniciais negados e atualização após a escolha do visitante.

Os sinais relevantes são:

```text
ad_storage
ad_user_data
ad_personalization
analytics_storage
```

### Importante: é Consent Mode avançado

Como a Google Tag/GTM pode carregar com consentimento padrão `denied`, a implementação é do tipo **advanced consent mode**.

Quando armazenamento é negado:

- cookies de publicidade/analytics não são gravados/lidos de acordo com o sinal negado;
- personalização fica desativada quando `ad_personalization=denied`;
- dados pessoais para publicidade ficam desativados quando `ad_user_data=denied`;
- tags compatíveis podem enviar **pings/medições sem cookies** para modelagem.

Portanto, não documentar como “quem recusa não é medido de forma alguma”.

A formulação correta é:

> Quem recusa não recebe cookies de publicidade/analytics nem entra em personalização/remarketing permitido pelo consentimento; tags Google compatíveis podem enviar sinais sem cookies para modelagem agregada, conforme o Consent Mode avançado.

O WhatsApp deve continuar funcionando independentemente da escolha de consentimento.

Fontes oficiais:

- https://developers.google.com/tag-platform/security/concepts/consent-mode
- https://support.google.com/tagmanager/answer/13802165

---

## 14. Meta Pixel

O site aceita:

```text
VITE_META_PIXEL_ID=123456789012345
```

Configurar o Pixel e validar no Gerenciador de Eventos.

Mapeamento esperado:

```text
generate_lead  → Lead
contact_click   → Contact
treatment_view  → ViewContent
```

### Regra

Um CTA primário de agendamento não deve gerar simultaneamente:

```text
Lead + Lead
```

nem:

```text
Contact + Lead
```

como se fossem duas conversões primárias.

---

## 15. `event_id` e CAPI futura

Os eventos já carregam `event_id` para permitir deduplicação futura entre navegador e servidor.

Quando Conversion API for implementada:

```text
browser event_id = servidor event_id
```

A CAPI não deve ser adicionada apenas para “mandar tudo de novo”. Sem deduplicação, o mesmo lead pode ser contado duas vezes.

---

## 16. WhatsApp

A campanha inicial usa recepção humana.

Não existe exigência de chatbot para começar.

O contexto enviado ao WhatsApp deve informar o tratamento de origem, por exemplo:

```text
Olá! Vim pelo site da JP e gostaria de agendar uma avaliação de implantes.
Ref.: IMP-G-A01
```

A referência curta ajuda a operação sem expor IDs técnicos ao paciente.

---

## 17. Métricas

Não otimizar olhando CPC isoladamente.

Hierarquia de negócio:

```text
receita
  ↑
paciente fechado
  ↑
comparecimento
  ↑
agendamento
  ↑
generate_lead
  ↑
visualização da LP
  ↑
clique
```

### Enquanto o CRC não estiver operacional

Principal métrica digital:

```text
custo por generate_lead
```

A recepção precisa registrar manualmente:

- origem/ref.;
- tratamento;
- agendou?;
- compareceu?;
- fechou?;
- receita, quando aplicável.

### Quando o CRC entrar

Subir a otimização para:

```text
custo por comparecimento
custo por paciente fechado
CAC
receita
ROAS real
```

---

## 18. Operação da recepção

A mídia perde valor se ninguém responder rápido.

Antes de aumentar orçamento, definir:

- quem atende o WhatsApp;
- horário de cobertura;
- tempo-alvo de primeira resposta;
- como identificar a referência da campanha;
- como registrar agendamento;
- como registrar comparecimento;
- como registrar fechamento.

No começo, não é necessário automatizar isso.

---

## 19. Publicidade odontológica

Usar comunicação informativa, verificável e prudente.

Evitar:

- promessa de resultado;
- “resultado garantido”;
- “sem dor” / “indolor”;
- “melhor clínica” / “a mais moderna”;
- preço como chamariz;
- promoções agressivas;
- antes/depois da clínica como mecanismo de anúncio sem revisão específica das regras aplicáveis;
- profissional, CRO ou especialidade inventados.

Pode usar:

- endereço;
- horário;
- estrutura real;
- avaliações reais;
- tempo de atuação correto;
- profissionais reais e identificados;
- convite para avaliação individual.

O site mantém a responsável técnica em `src/lib/jp.ts`.

Não inventar profissional responsável por implantes. Só publicar nome, CRO, foto e qualificação depois de confirmação documental.

---

## 20. O que já está protegido pelo CI

O workflow de qualidade executa, entre outras verificações:

- lint;
- typecheck;
- testes de unidade;
- build de produção;
- varredura do bundle;
- Playwright público;
- E2E de tráfego pago em desktop e mobile.

A suíte pública cobre o caminho real da aquisição sem exigir banco, CRC, GTM ou Pixel.

Ela verifica, entre outros:

- SSR da LP;
- H1 de anúncio;
- contexto do implante;
- localização;
- prova social;
- ausência de cross-sell na LP paga;
- ausência da navegação desktop da home;
- ausência dos links de fuga também no menu móvel pago;
- preservação de telefone e WhatsApp;
- UTM + `gclid`;
- first-touch;
- referência curta no WhatsApp;
- ausência de IDs brutos na mensagem;
- um único `generate_lead` por ação;
- `treatment_view` na rota paga;
- ausência de PII no evento;
- funcionamento com consentimento recusado;
- funcionamento sem CRC;
- as oito rotas pagas.

**Não colocar números fixos de testes neste documento.** A suíte cresce e o CI é a fonte atual do total.

---

## 21. Checklist antes de gastar o primeiro real

### Site

- [x] LP de implante dedicada
- [x] modo anúncio
- [x] CTA específico
- [x] tracking sem dupla contagem
- [x] atribuição UTM/click IDs
- [x] consentimento
- [x] funcionamento sem CRC
- [x] E2E desktop/mobile no CI
- [x] menu mobile pago sem links de fuga

### Google

- [ ] criar GTM
- [ ] criar GA4
- [ ] cadastrar `VITE_GTM_ID`
- [ ] vincular GA4 e Google Ads
- [ ] ativar auto-tagging
- [ ] configurar somente `generate_lead` como conversão primária
- [ ] validar no GTM Preview
- [ ] validar no GA4 DebugView
- [ ] criar campanha Search de implante
- [ ] configurar negativas iniciais
- [ ] revisar termos de pesquisa continuamente
- [ ] não criar remarketing Google baseado em visita a páginas de tratamento

### Meta

- [ ] criar Pixel
- [ ] cadastrar `VITE_META_PIXEL_ID`
- [ ] validar `Lead` no Gerenciador de Eventos
- [ ] começar por aquisição local ampla/WhatsApp
- [ ] revisar qualquer Custom Audience clínica contra a política vigente antes de ativar

### Clínica

- [ ] confirmar profissional responsável por implantes, se for publicado
- [ ] definir orçamento
- [ ] definir responsável pelo WhatsApp
- [ ] definir SLA de resposta
- [ ] registrar agendamento, comparecimento e fechamento
- [ ] manter dados do Perfil da Empresa consistentes com o site

---

## 22. Prioridade de lançamento

Se o orçamento ainda é limitado, não pulverizar em oito tratamentos.

Começar por:

```text
1. Google Search — Implantes
2. Meta/Instagram — Implantes / WhatsApp
3. Ajuste de LP, termos e criativos com dados reais
4. Prótese como segunda frente
5. Outros tratamentos depois
```

Implante é o produto principal de aquisição desta fase.

---

## 23. Arquivos importantes

```text
src/components/site/PaginaDeTratamento.tsx
src/components/site/Header.tsx
src/components/site/FloatingCTA.tsx
src/components/site/RastreioDeContato.tsx
src/components/site/useContatoWhatsApp.ts
src/lib/analytics/eventos.ts
src/lib/analytics/atribuicao.ts
src/lib/analytics/rotas.ts
src/lib/contato.ts
src/lib/jp.ts
src/lib/seo.ts
e2e/publico/trafego-pago.spec.ts
e2e/publico/lp-mobile-enxuta.spec.ts
.github/workflows/quality.yml
```

---

## 24. Regra final

A campanha não deve ser julgada por “quantos cliques baratos conseguiu”.

Ela deve caminhar para responder:

```text
Quanto custou colocar um paciente de implante na cadeira?
Quanto custou fechar um paciente?
Quanto de receita voltou por real investido?
```

Até essa maturidade chegar, `generate_lead` é o proxy digital — não o objetivo final do negócio.

---

_Última revisão técnica: 15/09/2026. Conferido contra a arquitetura atual do repositório e políticas oficiais do Google consultadas na mesma data._
