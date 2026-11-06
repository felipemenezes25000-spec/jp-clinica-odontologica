import { useEffect, useState } from "react";

/**
 * "Aberto agora" — o horário da clínica lido no relógio de São Paulo.
 *
 * O horário é o de CLINICA.horario: segunda a sexta, 08:00 às 18:00. Mora aqui
 * em números porque o texto de CLINICA é para gente ler; se a clínica mudar o
 * horário, os dois mudam juntos (horario.test.ts amarra os dois).
 *
 * O servidor não sabe a hora de quem visita e uma diferença entre o HTML e a
 * hidratação vira aviso de React: por isso o hook devolve `null` no primeiro
 * desenho e só calcula depois de montar. Quem usa mostra o horário fixo até lá.
 */
export const EXPEDIENTE = { abre: 8, fecha: 18, dias: [1, 2, 3, 4, 5] } as const;

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function agoraEmSaoPaulo(): { dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "0";
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(valor("weekday"));
  return { dia, minutos: Number(valor("hour")) * 60 + Number(valor("minute")) };
}

export type Situacao = { aberto: boolean; texto: string };

export function situacaoAgora(): Situacao {
  const { dia, minutos } = agoraEmSaoPaulo();
  const util = (EXPEDIENTE.dias as readonly number[]).includes(dia);
  const abre = EXPEDIENTE.abre * 60;
  const fecha = EXPEDIENTE.fecha * 60;

  if (util && minutos >= abre && minutos < fecha) {
    const falta = fecha - minutos;
    return {
      aberto: true,
      texto:
        falta <= 60
          ? `Aberto agora · fecha em ${String(falta)} min`
          : `Aberto agora · até as ${String(EXPEDIENTE.fecha)}h`,
    };
  }

  if (util && minutos < abre) {
    return { aberto: false, texto: `Fechado · abre hoje às ${String(EXPEDIENTE.abre)}h` };
  }

  // Próximo dia útil.
  let proximo = (dia + 1) % 7;
  while (!(EXPEDIENTE.dias as readonly number[]).includes(proximo)) proximo = (proximo + 1) % 7;
  const quando = proximo === (dia + 1) % 7 ? "amanhã" : DIAS[proximo];
  return {
    aberto: false,
    texto: `Fechado · abre ${String(quando)} às ${String(EXPEDIENTE.abre)}h`,
  };
}

export function useSituacao(): Situacao | null {
  const [s, setS] = useState<Situacao | null>(null);
  useEffect(() => {
    setS(situacaoAgora());
    const id = window.setInterval(() => setS(situacaoAgora()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return s;
}
