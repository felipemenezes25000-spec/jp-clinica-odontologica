/**
 * A tela de equipe.
 *
 * O QUE ELA RESOLVE: até existir, a clínica inteira entrava com o mesmo login,
 * e a auditoria do item 74 registrava "alguém" em cada ação. Dar um login por
 * pessoa não é organização — é o que faz o histórico significar alguma coisa.
 *
 * TRÊS ESCOLHAS DE INTERFACE QUE VALEM SER DITAS:
 *
 *   O PAPEL VEM COM A EXPLICAÇÃO DO QUE ELE FAZ, e não só com o nome. Quem
 *   está cadastrando a recepcionista tem uma pergunta concreta na cabeça —
 *   "ela vai ver valor de orçamento?" — e um `<select>` com seis substantivos
 *   não responde. A frase abaixo do campo responde.
 *
 *   A SENHA É ESCOLHIDA POR QUEM CADASTRA, e entregue pessoalmente. Não há
 *   e-mail de convite porque não há remetente configurado, e um convite que não
 *   chega é pior do que não existir. O campo diz isso na dica, para ninguém
 *   ficar esperando um e-mail.
 *
 *   DESATIVAR NÃO APAGA. O histórico da pessoa continua ligado ao nome dela —
 *   apagar o usuário deixaria meses de tarefas e mensagens órfãs, que é
 *   exatamente o que a auditoria não pode ter.
 */
import { useCallback, useEffect, useState } from "react";

import {
  carregarEquipe,
  convidarMembroDaEquipe,
  mudarAtivacaoDoMembro,
  mudarPapelDoMembro,
  redefinirSenhaDoMembro,
  type MembroDto,
} from "@/lib/crc/api";
import { EXPLICACAO_PAPEL, ROTULO_PAPEL } from "@/lib/crc/dominio/rotulos";
import { PAPEIS } from "@/lib/crc/dominio/tipos";

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

const MIN_SENHA = 10;

function quando(iso: string | null): string {
  if (iso === null) return "nunca entrou";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "nunca entrou";
  return new Date(t).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function Equipe() {
  const [membros, setMembros] = useState<MembroDto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [convidando, setConvidando] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<string>("recepcao");

  const [trocandoSenhaDe, setTrocandoSenhaDe] = useState<MembroDto | null>(null);
  const [novaSenha, setNovaSenha] = useState("");

  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarEquipe();
      if (r.ok) {
        setMembros(r.membros);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar a equipe. Tente atualizar a página.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const limparFormulario = useCallback((): void => {
    setNome("");
    setEmail("");
    setSenha("");
    setPapel("recepcao");
  }, []);

  const convidar = useCallback(async (): Promise<void> => {
    await acao.executar(
      () => convidarMembroDaEquipe({ data: { nome, email, senha, papel } }),
      () => {
        setConvidando(false);
        limparFormulario();
        void recarregar();
      },
      `${nome.trim()} já pode entrar. Passe a senha pessoalmente.`,
    );
  }, [acao, email, limparFormulario, nome, papel, recarregar, senha]);

  const trocarPapel = useCallback(
    async (m: MembroDto, novo: string): Promise<void> => {
      await acao.executar(
        () => mudarPapelDoMembro({ data: { userId: m.id, papel: novo } }),
        () => {
          void recarregar();
        },
        `${m.nome} agora é ${ROTULO_PAPEL[novo as keyof typeof ROTULO_PAPEL] ?? novo}.`,
      );
    },
    [acao, recarregar],
  );

  const alternarAtivacao = useCallback(
    async (m: MembroDto): Promise<void> => {
      await acao.executar(
        () => mudarAtivacaoDoMembro({ data: { userId: m.id, ativo: !m.ativo } }),
        () => {
          void recarregar();
        },
        m.ativo ? `${m.nome} não entra mais.` : `${m.nome} voltou a ter acesso.`,
      );
    },
    [acao, recarregar],
  );

  const confirmarNovaSenha = useCallback(async (): Promise<void> => {
    if (trocandoSenhaDe === null) return;
    const alvo = trocandoSenhaDe;
    await acao.executar(
      () => redefinirSenhaDoMembro({ data: { userId: alvo.id, senha: novaSenha } }),
      () => {
        setTrocandoSenhaDe(null);
        setNovaSenha("");
      },
      `Senha de ${alvo.nome} trocada. Passe a nova pessoalmente.`,
    );
  }, [acao, novaSenha, trocandoSenhaDe]);

  if (erro !== null && membros === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (membros === null) return <ListaEsqueleto linhas={4} />;

  const ativos = membros.filter((m) => m.ativo);
  const inativos = membros.filter((m) => !m.ativo);

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <Cartao
        titulo="Quem tem acesso"
        acao={
          <Botao
            variante="primario"
            onClick={() => {
              setConvidando(true);
            }}
          >
            Cadastrar pessoa
          </Botao>
        }
      >
        {membros.length === 1 && (
          <Aviso tom="alerta">
            Só existe um acesso no sistema. Enquanto a equipe compartilhar este login, o histórico
            de cada tarefa e cada mensagem vai dizer apenas que "alguém" fez — e não quem.
          </Aviso>
        )}

        <ul className="crc-pilha">
          {ativos.map((m) => (
            <LinhaMembro
              key={m.id}
              membro={m}
              ocupado={acao.rodando}
              aoTrocarPapel={trocarPapel}
              aoAlternar={alternarAtivacao}
              aoTrocarSenha={setTrocandoSenhaDe}
            />
          ))}
        </ul>
      </Cartao>

      {inativos.length > 0 && (
        <Cartao titulo="Sem acesso">
          <p className="crc-meta" style={{ marginBottom: "var(--crc-e3)" }}>
            Continuam no histórico: as tarefas e mensagens que estas pessoas fizeram seguem
            assinadas com o nome delas. Reativar devolve o acesso na hora.
          </p>
          <ul className="crc-pilha">
            {inativos.map((m) => (
              <LinhaMembro
                key={m.id}
                membro={m}
                ocupado={acao.rodando}
                aoTrocarPapel={trocarPapel}
                aoAlternar={alternarAtivacao}
                aoTrocarSenha={setTrocandoSenhaDe}
              />
            ))}
          </ul>
        </Cartao>
      )}

      {/* ---- Cadastro ---- */}

      <Modal
        titulo="Cadastrar pessoa"
        aberto={convidando}
        aoFechar={() => {
          setConvidando(false);
        }}
        rodape={
          <>
            <Botao
              onClick={() => {
                setConvidando(false);
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={acao.rodando}
              disabled={nome.trim().length < 2 || senha.length < MIN_SENHA}
              onClick={() => {
                void convidar();
              }}
            >
              Cadastrar
            </Botao>
          </>
        }
      >
        <Campo rotulo="Nome">
          {(id) => (
            <Entrada
              id={id}
              value={nome}
              maxLength={120}
              autoComplete="off"
              onChange={(e) => {
                setNome(e.target.value);
              }}
            />
          )}
        </Campo>

        <Campo rotulo="E-mail" dica="É com ele que a pessoa entra.">
          {(id) => (
            <Entrada
              id={id}
              type="email"
              value={email}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
          )}
        </Campo>

        <Campo
          rotulo="Senha"
          dica={`Pelo menos ${String(MIN_SENHA)} caracteres. Não existe e-mail de convite: entregue a senha pessoalmente e peça para a pessoa trocá-la com você depois.`}
        >
          {(id) => (
            <Entrada
              id={id}
              type="password"
              value={senha}
              autoComplete="new-password"
              onChange={(e) => {
                setSenha(e.target.value);
              }}
            />
          )}
        </Campo>

        <Campo rotulo="Papel" dica={EXPLICACAO_PAPEL[papel as keyof typeof EXPLICACAO_PAPEL]}>
          {(id) => (
            <select
              id={id}
              className="crc-selecao"
              value={papel}
              onChange={(e) => {
                setPapel(e.target.value);
              }}
            >
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PAPEL[p]}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </Modal>

      {/* ---- Troca de senha ---- */}

      <Modal
        titulo={`Nova senha para ${trocandoSenhaDe?.nome ?? ""}`}
        aberto={trocandoSenhaDe !== null}
        aoFechar={() => {
          setTrocandoSenhaDe(null);
          setNovaSenha("");
        }}
        rodape={
          <>
            <Botao
              onClick={() => {
                setTrocandoSenhaDe(null);
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={acao.rodando}
              disabled={novaSenha.length < MIN_SENHA}
              onClick={() => {
                void confirmarNovaSenha();
              }}
            >
              Trocar senha
            </Botao>
          </>
        }
      >
        <Campo rotulo="Nova senha" dica={`Pelo menos ${String(MIN_SENHA)} caracteres.`}>
          {(id) => (
            <Entrada
              id={id}
              type="password"
              value={novaSenha}
              autoComplete="new-password"
              onChange={(e) => {
                setNovaSenha(e.target.value);
              }}
            />
          )}
        </Campo>
        <Aviso tom="info">
          Trocar a senha <strong>não</strong> derruba quem já está com a sessão aberta. Se a pessoa
          saiu da clínica, o botão certo é <strong>Tirar acesso</strong>.
        </Aviso>
      </Modal>
    </>
  );
}

function LinhaMembro({
  membro,
  ocupado,
  aoTrocarPapel,
  aoAlternar,
  aoTrocarSenha,
}: {
  membro: MembroDto;
  ocupado: boolean;
  aoTrocarPapel: (m: MembroDto, papel: string) => Promise<void>;
  aoAlternar: (m: MembroDto) => Promise<void>;
  aoTrocarSenha: (m: MembroDto) => void;
}) {
  return (
    <li className="crc-cartao-compacto">
      <div className="crc-linha">
        <div style={{ minWidth: 0, flex: "1 1 14rem" }}>
          <strong style={{ display: "block" }}>{membro.nome}</strong>
          <span className="crc-meta" style={{ display: "block", wordBreak: "break-word" }}>
            {membro.email} · último acesso: {quando(membro.ultimoAcesso)}
          </span>
        </div>

        {membro.souEu && <Etiqueta tom="info">Você</Etiqueta>}

        <div className="crc-linha crc-empurra">
          <label className="crc-so-leitor" htmlFor={`papel-${membro.id}`}>
            Papel de {membro.nome}
          </label>
          <select
            id={`papel-${membro.id}`}
            className="crc-selecao"
            style={{ width: "auto", minWidth: 148 }}
            value={membro.papel}
            disabled={ocupado}
            onChange={(e) => {
              void aoTrocarPapel(membro, e.target.value);
            }}
          >
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PAPEL[p]}
              </option>
            ))}
          </select>

          <Botao
            pequeno
            disabled={ocupado}
            onClick={() => {
              aoTrocarSenha(membro);
            }}
          >
            Trocar senha
          </Botao>

          {/* A própria conta não mostra o botão de tirar acesso: o servidor
              recusaria, e um botão que sempre falha é pior que botão nenhum. */}
          {!membro.souEu && (
            <Botao
              pequeno
              variante={membro.ativo ? "perigo" : "secundario"}
              disabled={ocupado}
              onClick={() => {
                void aoAlternar(membro);
              }}
            >
              {membro.ativo ? "Tirar acesso" : "Devolver acesso"}
            </Botao>
          )}
        </div>
      </div>

      <p className="crc-meta" style={{ marginTop: "var(--crc-e2)" }}>
        {EXPLICACAO_PAPEL[membro.papel as keyof typeof EXPLICACAO_PAPEL]}
      </p>
    </li>
  );
}
