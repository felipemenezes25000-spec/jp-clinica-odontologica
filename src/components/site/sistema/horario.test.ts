import { afterEach, describe, expect, it, vi } from "vitest";

import { CLINICA } from "@/lib/jp";
import { EXPEDIENTE, situacaoAgora } from "./horario";

/**
 * O "Aberto agora" do topo e do cabeçalho lê EXPEDIENTE, em números; o texto
 * que a pessoa lê no rodapé e no JSON-LD é CLINICA.horario. Se a clínica mudar
 * o horário e alguém atualizar só um dos dois, o site passa a dizer "aberto"
 * com a porta fechada. Este teste é o que amarra os dois.
 */
describe("horário da clínica", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("EXPEDIENTE bate com o texto de CLINICA.horario", () => {
    const pad = (h: number) => String(h).padStart(2, "0");
    expect(CLINICA.horario).toContain(`${pad(EXPEDIENTE.abre)}:00`);
    expect(CLINICA.horario).toContain(`${pad(EXPEDIENTE.fecha)}:00`);
    expect(CLINICA.horario.toLowerCase()).toContain("segunda a sexta");
    expect(EXPEDIENTE.dias).toEqual([1, 2, 3, 4, 5]);
  });

  // As datas abaixo estão em UTC; São Paulo é UTC-3 o ano inteiro desde 2019.
  const em = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    return situacaoAgora();
  };

  it("aberto numa quarta às 10h", () => {
    const s = em("2026-11-04T13:00:00Z");
    expect(s.aberto).toBe(true);
    expect(s.texto).toBe("Aberto agora · até as 18h");
  });

  it("avisa a última hora", () => {
    const s = em("2026-11-04T20:20:00Z"); // 17:20
    expect(s.aberto).toBe(true);
    expect(s.texto).toBe("Aberto agora · fecha em 40 min");
  });

  it("fechado de madrugada abre no mesmo dia", () => {
    const s = em("2026-11-04T09:00:00Z"); // 06:00 de quarta
    expect(s).toEqual({ aberto: false, texto: "Fechado · abre hoje às 8h" });
  });

  it("às 18h em ponto já está fechado e abre amanhã", () => {
    const s = em("2026-11-04T21:00:00Z"); // 18:00 de quarta
    expect(s).toEqual({ aberto: false, texto: "Fechado · abre amanhã às 8h" });
  });

  it("sexta à noite abre na segunda", () => {
    const s = em("2026-11-06T23:00:00Z"); // 20:00 de sexta
    expect(s).toEqual({ aberto: false, texto: "Fechado · abre segunda às 8h" });
  });

  it("sábado abre na segunda", () => {
    const s = em("2026-11-07T15:00:00Z"); // 12:00 de sábado
    expect(s).toEqual({ aberto: false, texto: "Fechado · abre segunda às 8h" });
  });

  it("domingo abre amanhã (segunda)", () => {
    const s = em("2026-11-08T15:00:00Z");
    expect(s).toEqual({ aberto: false, texto: "Fechado · abre amanhã às 8h" });
  });
});
