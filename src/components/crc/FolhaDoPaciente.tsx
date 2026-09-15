/**
 * A ficha do paciente como FOLHA sobre a tela de onde se veio.
 *
 * ============================================================================
 *  O QUE ELA SUBSTITUI, E POR QUÊ.
 *
 *  "Abrir paciente" levava para `/crc/pacientes`. Quem clicava num nome na fila
 *  perdia a fila; quem clicava num card do funil perdia o recorte que tinha
 *  montado. Voltar exigia lembrar de onde se veio — e o §6 chama isso pelo
 *  nome: takeover.
 *
 *  A folha abre POR CIMA. A lista continua atrás, o filtro continua valendo, e
 *  fechar devolve exatamente o lugar onde a pessoa estava.
 *
 *  O ENDEREÇO ACOMPANHA: `/crc/funil?paciente=123`. A folha é linkável,
 *  sobrevive a um F5 e "voltar" do navegador a fecha — que é o comportamento
 *  que qualquer pessoa espera de um painel aberto.
 * ============================================================================
 */
import { lazy, type ComponentType, type ReactElement } from "react";

import { Modal } from "./base";

/*
 * O MESMO MÓDULO QUE A TELA `/crc/pacientes` usa.
 *
 * Como o import é idêntico, o navegador baixa UM pedaço só: quem já abriu a
 * tela de pacientes abre a folha sem rede nenhuma, e vice-versa.
 */
const CentralDoPaciente = lazy(() =>
  import("./Pacientes").then((m) => ({
    default: m.CentralDoPaciente as ComponentType<{
      patientId: string;
      aoVoltar: () => void;
    }>,
  })),
);

export function FolhaDoPaciente({
  patientId,
  aoFechar,
}: {
  patientId: string;
  aoFechar: () => void;
}): ReactElement {
  return (
    <Modal
      lateral
      aberto
      titulo="Ficha do paciente"
      aoFechar={aoFechar}
      /*
       * `aoVoltar` da ficha também FECHA A FOLHA. Dentro dela, "voltar" não
       * tem para onde ir: o lugar de trás é a tela que está atrás da folha.
       */
    >
      <CentralDoPaciente patientId={patientId} aoVoltar={aoFechar} />
    </Modal>
  );
}
