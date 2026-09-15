import type { ComponentType } from "react";
import type { IdCena } from "@/data/linhaDoTempo";

import { Cena01Abertura } from "./Cena01Abertura";
import { Cena02Problema } from "./Cena02Problema";
import { Cena03DentalOffice } from "./Cena03DentalOffice";
import { Cena04Integracao } from "./Cena04Integracao";
import { Cena05Nucleo } from "./Cena05Nucleo";
import { Cena06Eventos } from "./Cena06Eventos";
import { Cena07Elegibilidade } from "./Cena07Elegibilidade";
import { Cena08Prioridade } from "./Cena08Prioridade";
import { Cena09Risco } from "./Cena09Risco";
import { Cena10Divisao } from "./Cena10Divisao";
import { Cena11Automacoes } from "./Cena11Automacoes";
import { Cena12BaseAntiga } from "./Cena12BaseAntiga";
import { Cena13Orcamentos } from "./Cena13Orcamentos";
import { Cena14Reativacao } from "./Cena14Reativacao";
import { Cena15Campanhas } from "./Cena15Campanhas";
import { Cena16MontarCampanha } from "./Cena16MontarCampanha";
import { Cena17LeadPago } from "./Cena17LeadPago";
import { Cena18Midia } from "./Cena18Midia";
import { Cena19WhatsApp } from "./Cena19WhatsApp";
import { Cena20Ia } from "./Cena20Ia";
import { Cena21Intencoes } from "./Cena21Intencoes";
import { Cena22Agendamento } from "./Cena22Agendamento";
import { Cena23Lembretes } from "./Cena23Lembretes";
import { Cena24Encaixes } from "./Cena24Encaixes";
import { Cena25Cobranca } from "./Cena25Cobranca";
import { Cena26Humano } from "./Cena26Humano";
import { Cena27Agente } from "./Cena27Agente";
import { Cena28Portoes } from "./Cena28Portoes";
import { Cena29Autonomia } from "./Cena29Autonomia";
import { Cena30Conhecimento } from "./Cena30Conhecimento";
import { Cena31Prova } from "./Cena31Prova";
import { Cena32Sombra } from "./Cena32Sombra";
import { Cena33Home } from "./Cena33Home";
import { Cena34Inbox } from "./Cena34Inbox";
import { Cena35Paciente360 } from "./Cena35Paciente360";
import { Cena36Recepcao } from "./Cena36Recepcao";
import { Cena37Unidades } from "./Cena37Unidades";
import { Cena38Resultados } from "./Cena38Resultados";
import { Cena39Funil } from "./Cena39Funil";
import { Cena40Radar } from "./Cena40Radar";
import { Cena41Tratamentos } from "./Cena41Tratamentos";
import { Cena42Aprende } from "./Cena42Aprende";
import { Cena43Metas } from "./Cena43Metas";
import { Cena44Briefing } from "./Cena44Briefing";
import { Cena45CustoIa } from "./Cena45CustoIa";
import { Cena46AntesDepois } from "./Cena46AntesDepois";
import { Cena47Impacto } from "./Cena47Impacto";
import { Cena48Gestor } from "./Cena48Gestor";
import { Cena49Ecossistema } from "./Cena49Ecossistema";
import { Cena50Frase } from "./Cena50Frase";
import { Cena51Final } from "./Cena51Final";

/**
 * O índice das cenas. ARQUIVO GERADO por `npm run cenas:ordenar`.
 *
 * Um mapa estático, e não `lazy()`: o filme roda a 30 fps e a linha do tempo
 * pode saltar para qualquer frame (arrastar a barra, pular capítulo, render de
 * frame avulso no Remotion). Uma cena que chegasse por import dinâmico
 * apareceria em branco no primeiro frame depois do salto — e no render, em
 * branco de vez, já que ninguém espera a promessa resolver.
 *
 * O custo é o bundle inteiro no primeiro paint. A 51 cenas de componente
 * puro isso é pequeno; o que pesa em bundle de vídeo é asset, e os assets aqui
 * são SVG.
 *
 * A ordem abaixo é a ordem do filme, e os arquivos são numerados para bater com
 * ela. Para inserir uma cena no meio: crie o arquivo, some a linha em
 * `cenas.json`, acrescente aqui em qualquer posição, e rode
 * `npm run cenas:ordenar`.
 */
export const COMPONENTES: Readonly<Record<IdCena, ComponentType>> = {
  abertura: Cena01Abertura,
  problema: Cena02Problema,
  dentalOffice: Cena03DentalOffice,
  integracao: Cena04Integracao,
  nucleo: Cena05Nucleo,
  eventos: Cena06Eventos,
  elegibilidade: Cena07Elegibilidade,
  prioridade: Cena08Prioridade,
  risco: Cena09Risco,
  divisao: Cena10Divisao,
  automacoes: Cena11Automacoes,
  baseAntiga: Cena12BaseAntiga,
  orcamentos: Cena13Orcamentos,
  reativacao: Cena14Reativacao,
  campanhas: Cena15Campanhas,
  montarCampanha: Cena16MontarCampanha,
  leadPago: Cena17LeadPago,
  midia: Cena18Midia,
  whatsapp: Cena19WhatsApp,
  ia: Cena20Ia,
  intencoes: Cena21Intencoes,
  agendamento: Cena22Agendamento,
  lembretes: Cena23Lembretes,
  encaixes: Cena24Encaixes,
  cobranca: Cena25Cobranca,
  humano: Cena26Humano,
  agente: Cena27Agente,
  portoes: Cena28Portoes,
  autonomia: Cena29Autonomia,
  conhecimento: Cena30Conhecimento,
  prova: Cena31Prova,
  sombra: Cena32Sombra,
  home: Cena33Home,
  inbox: Cena34Inbox,
  paciente360: Cena35Paciente360,
  recepcao: Cena36Recepcao,
  unidades: Cena37Unidades,
  resultados: Cena38Resultados,
  funil: Cena39Funil,
  radar: Cena40Radar,
  tratamentos: Cena41Tratamentos,
  aprende: Cena42Aprende,
  metas: Cena43Metas,
  briefing: Cena44Briefing,
  custoIa: Cena45CustoIa,
  antesDepois: Cena46AntesDepois,
  impacto: Cena47Impacto,
  gestor: Cena48Gestor,
  ecossistema: Cena49Ecossistema,
  frase: Cena50Frase,
  final: Cena51Final,
};
