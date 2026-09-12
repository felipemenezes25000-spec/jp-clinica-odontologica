/**
 * Unidades — criar, renomear e fechar clínica.
 *
 * ============================================================================
 *  ESTE BLOCO FECHA UMA LACUNA QUE O CRC CARREGAVA DESDE O COMEÇO: o banco era
 *  multi-clínica e o uso era mono-clínica.
 *
 *  `crc_clinics` existe desde o primeiro schema, e todo filtro de tenant passa
 *  por ela. O que faltava era o caminho de volta — só a instalação criava
 *  unidade. Quem abrisse a segunda tinha de pedir para alguém rodar SQL.
 *
 *  Ele mora DENTRO de Configurações, e não numa aba própria (item 1): é ajuste
 *  de organização, feito uma vez a cada abertura de unidade, e não uma tela de
 *  operação diária.
 * ============================================================================
 */
import { useCallback, useEffect, useState } from "react";

import {
  carregarClinicas,
  criarUnidade,
  editarUnidade,
  mudarSituacaoDaUnidade,
  type ClinicaDto,
} from "@/lib/crc/api";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Cartao,
  Entrada,
  Etiqueta,
  ListaEsqueleto,
  Modal,
  useAcao,
} from "./base";

/*
 * A LISTA DE FUSOS É CURTA E EXPLÍCITA.
 *
 * `Intl.supportedValuesOf("timeZone")` devolveria 400 opções, e a pessoa teria
 * de achar a dela numa lista que inclui `America/Argentina/Ushuaia`. Estes são
 * os fusos do Brasil — e quem precisar de outro pede, o que é um pedido raro o
 * bastante para não valer a tela de 400 linhas.
 */
const FUSOS = [
  { valor: "America/Sao_Paulo", rotulo: "Brasília (São Paulo, Rio, Sul, Nordeste)" },
  { valor: "America/Manaus", rotulo: "Amazonas, Rondônia, Roraima, Mato Grosso" },
  { valor: "America/Rio_Branco", rotulo: "Acre" },
  { valor: "America/Belem", rotulo: "Pará, Amapá" },
  { valor: "America/Noronha", rotulo: "Fernando de Noronha" },
] as const;

export function Unidades() {
  const [clinicas, setClinicas] = useState<ClinicaDto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<ClinicaDto | null>(null);
  const [nome, setNome] = useState("");
  const [fuso, setFuso] = useState<string>("America/Sao_Paulo");
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarClinicas();
      if (r.ok) {
        setClinicas(r.clinicas);
        setErro(null);
      } else setErro(r.message);
    } catch {
      setErro("Não conseguimos carregar as unidades agora.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const abrirCriacao = useCallback((): void => {
    setNome("");
    setFuso("America/Sao_Paulo");
    setCriando(true);
  }, []);

  const abrirEdicao = useCallback((c: ClinicaDto): void => {
    setNome(c.nome);
    setFuso(c.fuso);
    setEditando(c);
  }, []);

  const salvarNova = useCallback(async (): Promise<void> => {
    await acao.executar(
      () => criarUnidade({ data: { nome, fuso, externalId: null } }),
      () => {
        setCriando(false);
        void recarregar();
      },
      `Unidade “${nome.trim()}” criada. Ninguém a enxerga ainda — vincule as pessoas em Equipe.`,
    );
  }, [acao, fuso, nome, recarregar]);

  const salvarEdicao = useCallback(async (): Promise<void> => {
    if (editando === null) return;
    const alvo = editando;
    await acao.executar(
      () => editarUnidade({ data: { clinicId: alvo.id, nome, fuso } }),
      () => {
        setEditando(null);
        void recarregar();
      },
      "Unidade atualizada.",
    );
  }, [acao, editando, fuso, nome, recarregar]);

  const alternar = useCallback(
    async (c: ClinicaDto): Promise<void> => {
      await acao.executar(
        () => mudarSituacaoDaUnidade({ data: { clinicId: c.id, ativa: !c.ativa } }),
        () => void recarregar(),
        c.ativa
          ? `${c.nome} fechada. O histórico dela continua no sistema.`
          : `${c.nome} reaberta.`,
      );
    },
    [acao, recarregar],
  );

  if (erro !== null && clinicas === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (clinicas === null) return <ListaEsqueleto linhas={3} />;

  const ativas = clinicas.filter((c) => c.ativa).length;

  return (
    <Cartao
      titulo="Unidades"
      acao={
        <Botao variante="primario" pequeno onClick={abrirCriacao}>
          Nova unidade
        </Botao>
      }
    >
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <p className="crc-meta" style={{ marginBottom: "var(--crc-e4)" }}>
        {/*
          A FRASE EXPLICA O QUE UMA UNIDADE FAZ, e não o que ela é. Sem isso, a
          pessoa não sabe se "unidade" é endereço, CNPJ ou sala — e o efeito de
          criar uma segunda é invisível até alguém reclamar que não vê nada.
        */}
        Tudo no CRC pendura em uma unidade: paciente, consulta, conversa e lead. Cada pessoa da
        equipe enxerga apenas as unidades a que está vinculada — exceto administradores, que
        alcançam todas.
      </p>

      <ul className="crc-pilha">
        {clinicas.map((c) => (
          <li key={c.id} className="crc-cartao-compacto">
            <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
              <strong>{c.nome}</strong>
              {c.ativa ? (
                <Etiqueta tom="positiva">aberta</Etiqueta>
              ) : (
                <Etiqueta tom="neutra">fechada</Etiqueta>
              )}
              {c.integrada ? (
                <Etiqueta tom="info">Dental Office ligado</Etiqueta>
              ) : (
                <Etiqueta tom="alerta">sem integração</Etiqueta>
              )}
              <div className="crc-empurra">
                <Botao pequeno onClick={() => abrirEdicao(c)}>
                  Editar
                </Botao>{" "}
                <Botao
                  pequeno
                  variante={c.ativa ? "perigo" : "secundario"}
                  carregando={acao.rodando}
                  /*
                    O BOTÃO DA ÚLTIMA UNIDADE ABERTA FICA DESABILITADO, e o
                    servidor recusa de novo se alguém chamar a rota direto.
                    Esconder o botão é UX; a recusa é que é a regra.
                  */
                  disabled={c.ativa && ativas <= 1}
                  onClick={() => void alternar(c)}
                >
                  {c.ativa ? "Fechar" : "Reabrir"}
                </Botao>
              </div>
            </div>
            <small className="crc-meta">
              Identificador <code>{c.slug}</code> · {String(c.pacientes)}{" "}
              {c.pacientes === 1 ? "paciente" : "pacientes"} · {String(c.pessoas)}{" "}
              {c.pessoas === 1 ? "pessoa vinculada" : "pessoas vinculadas"} · {c.fuso}
            </small>
          </li>
        ))}
      </ul>

      {ativas <= 1 && (
        <div style={{ marginTop: "var(--crc-e4)" }}>
          <Aviso tom="info">
            A última unidade aberta não pode ser fechada: sem nenhuma, não haveria onde receber
            paciente, lead ou sincronização — e nem esta tela para reabrir.
          </Aviso>
        </div>
      )}

      <Modal
        titulo="Nova unidade"
        aberto={criando}
        aoFechar={() => setCriando(false)}
        rodape={
          <>
            <Botao onClick={() => setCriando(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={acao.rodando} onClick={() => void salvarNova()}>
              Criar
            </Botao>
          </>
        }
      >
        <FormularioDaUnidade
          nome={nome}
          fuso={fuso}
          aoMudarNome={setNome}
          aoMudarFuso={setFuso}
          novo
        />
      </Modal>

      <Modal
        titulo={`Editar ${editando?.nome ?? "unidade"}`}
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        rodape={
          <>
            <Botao onClick={() => setEditando(null)}>Cancelar</Botao>
            <Botao
              variante="primario"
              carregando={acao.rodando}
              onClick={() => void salvarEdicao()}
            >
              Salvar
            </Botao>
          </>
        }
      >
        <FormularioDaUnidade
          nome={nome}
          fuso={fuso}
          aoMudarNome={setNome}
          aoMudarFuso={setFuso}
          novo={false}
          slug={editando?.slug ?? null}
        />
      </Modal>
    </Cartao>
  );
}

function FormularioDaUnidade({
  nome,
  fuso,
  aoMudarNome,
  aoMudarFuso,
  novo,
  slug = null,
}: {
  nome: string;
  fuso: string;
  aoMudarNome: (v: string) => void;
  aoMudarFuso: (v: string) => void;
  novo: boolean;
  slug?: string | null;
}) {
  return (
    <div className="crc-pilha">
      <Campo
        rotulo="Nome"
        dica={
          novo
            ? "O identificador na URL sai daqui, e depois não muda mais."
            : /*
                O AVISO SÓ APARECE NA EDIÇÃO, porque é aí que ele importa: a
                pessoa está renomeando e precisa saber que o identificador —
                que já entrou em link e em log — continua o mesmo.
              */
              `O identificador continua ${slug ?? ""}: ele já está em links e no histórico, e mudá-lo quebraria os dois.`
        }
      >
        {(id) => (
          <Entrada
            id={id}
            value={nome}
            maxLength={80}
            placeholder="Unidade Centro"
            onChange={(e) => {
              aoMudarNome(e.target.value);
            }}
          />
        )}
      </Campo>

      <Campo
        rotulo="Fuso horário"
        dica="Decide a que horas a automação considera 'manhã' e quando a agenda vira o dia."
      >
        {(id) => (
          <select
            id={id}
            className="crc-entrada"
            value={fuso}
            onChange={(e) => {
              aoMudarFuso(e.target.value);
            }}
          >
            {FUSOS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        )}
      </Campo>
    </div>
  );
}
