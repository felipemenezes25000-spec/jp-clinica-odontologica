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
import { Cena09Divisao } from "./Cena09Divisao";
import { Cena10Automacoes } from "./Cena10Automacoes";
import { Cena11BaseAntiga } from "./Cena11BaseAntiga";
import { Cena12Orcamentos } from "./Cena12Orcamentos";
import { Cena13Reativacao } from "./Cena13Reativacao";
import { Cena14Campanhas } from "./Cena14Campanhas";
import { Cena15MontarCampanha } from "./Cena15MontarCampanha";
import { Cena16LeadPago } from "./Cena16LeadPago";
import { Cena17Midia } from "./Cena17Midia";
import { Cena18WhatsApp } from "./Cena18WhatsApp";
import { Cena19Ia } from "./Cena19Ia";
import { Cena20Intencoes } from "./Cena20Intencoes";
import { Cena21Agendamento } from "./Cena21Agendamento";
import { Cena22Lembretes } from "./Cena22Lembretes";
import { Cena23Cobranca } from "./Cena23Cobranca";
import { Cena24Humano } from "./Cena24Humano";
import { Cena25Home } from "./Cena25Home";
import { Cena26Inbox } from "./Cena26Inbox";
import { Cena27Paciente360 } from "./Cena27Paciente360";
import { Cena28Resultados } from "./Cena28Resultados";
import { Cena29Funil } from "./Cena29Funil";
import { Cena30AntesDepois } from "./Cena30AntesDepois";
import { Cena31Impacto } from "./Cena31Impacto";
import { Cena32Gestor } from "./Cena32Gestor";
import { Cena33Ecossistema } from "./Cena33Ecossistema";
import { Cena34Frase } from "./Cena34Frase";
import { Cena35Final } from "./Cena35Final";

/**
 * O índice das cenas. ARQUIVO GERADO por `npm run cenas:ordenar`.
 *
 * Um mapa estático, e não `lazy()`: o filme roda a 30 fps e a linha do tempo
 * pode saltar para qualquer frame (arrastar a barra, pular capítulo, render de
 * frame avulso no Remotion). Uma cena que chegasse por import dinâmico
 * apareceria em branco no primeiro frame depois do salto — e no render, em
 * branco de vez, já que ninguém espera a promessa resolver.
 *
 * O custo é o bundle inteiro no primeiro paint. A 35 cenas de componente
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
  divisao: Cena09Divisao,
  automacoes: Cena10Automacoes,
  baseAntiga: Cena11BaseAntiga,
  orcamentos: Cena12Orcamentos,
  reativacao: Cena13Reativacao,
  campanhas: Cena14Campanhas,
  montarCampanha: Cena15MontarCampanha,
  leadPago: Cena16LeadPago,
  midia: Cena17Midia,
  whatsapp: Cena18WhatsApp,
  ia: Cena19Ia,
  intencoes: Cena20Intencoes,
  agendamento: Cena21Agendamento,
  lembretes: Cena22Lembretes,
  cobranca: Cena23Cobranca,
  humano: Cena24Humano,
  home: Cena25Home,
  inbox: Cena26Inbox,
  paciente360: Cena27Paciente360,
  resultados: Cena28Resultados,
  funil: Cena29Funil,
  antesDepois: Cena30AntesDepois,
  impacto: Cena31Impacto,
  gestor: Cena32Gestor,
  ecossistema: Cena33Ecossistema,
  frase: Cena34Frase,
  final: Cena35Final,
};
