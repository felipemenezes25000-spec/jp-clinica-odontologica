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
import { Cena12Reativacao } from "./Cena12Reativacao";
import { Cena13WhatsApp } from "./Cena13WhatsApp";
import { Cena14Ia } from "./Cena14Ia";
import { Cena15Intencoes } from "./Cena15Intencoes";
import { Cena16Agendamento } from "./Cena16Agendamento";
import { Cena17Humano } from "./Cena17Humano";
import { Cena18Home } from "./Cena18Home";
import { Cena19Inbox } from "./Cena19Inbox";
import { Cena20Paciente360 } from "./Cena20Paciente360";
import { Cena21Resultados } from "./Cena21Resultados";
import { Cena22Funil } from "./Cena22Funil";
import { Cena23AntesDepois } from "./Cena23AntesDepois";
import { Cena24Impacto } from "./Cena24Impacto";
import { Cena25Gestor } from "./Cena25Gestor";
import { Cena26Ecossistema } from "./Cena26Ecossistema";
import { Cena27Frase } from "./Cena27Frase";
import { Cena28Final } from "./Cena28Final";

/**
 * O índice das cenas.
 *
 * Um mapa estático, não `lazy()`: o filme roda a 30 fps e a linha do tempo pode
 * saltar para qualquer frame (arrastar a barra, pular capítulo, render de frame
 * avulso no Remotion). Uma cena que chegasse por import dinâmico apareceria em
 * branco no primeiro frame depois do salto — e no render, em branco de vez, já
 * que ninguém espera a promessa resolver.
 *
 * O custo é o bundle inteiro no primeiro paint. A 28 cenas de componente puro,
 * isso é pequeno; o que pesa em bundle de vídeo é asset, e os assets já são
 * SVG e carregam sob demanda.
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
  reativacao: Cena12Reativacao,
  whatsapp: Cena13WhatsApp,
  ia: Cena14Ia,
  intencoes: Cena15Intencoes,
  agendamento: Cena16Agendamento,
  humano: Cena17Humano,
  home: Cena18Home,
  inbox: Cena19Inbox,
  paciente360: Cena20Paciente360,
  resultados: Cena21Resultados,
  funil: Cena22Funil,
  antesDepois: Cena23AntesDepois,
  impacto: Cena24Impacto,
  gestor: Cena25Gestor,
  ecossistema: Cena26Ecossistema,
  frase: Cena27Frase,
  final: Cena28Final,
};
