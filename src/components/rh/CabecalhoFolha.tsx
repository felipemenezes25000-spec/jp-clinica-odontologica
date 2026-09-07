/**
 * O cabeçalho das folhas impressas do RH.
 *
 * Existe por uma reclamação direta do cliente: o PDF que a clínica já usa traz
 * "JP CLÍNICA INTEGRADA ODONTOLÓGICA" no topo de TODAS as páginas, e a nossa
 * ficha saía da impressora sem marca nenhuma — uma folha anônima com o nome de
 * uma candidata e notas de entrevista, que ninguém sabe de onde veio nem a quem
 * devolver. Este componente reproduz aquele topo.
 *
 * A marca é o componente `<Logo>`, que serve os SVGs oficiais de
 * `src/assets/marca/`. Nada aqui desenha "JP" com texto, fonte ou caminho
 * próprio: a única marca do projeto é a oficial, e num documento que sai do
 * prédio essa é a diferença entre papel institucional e papel qualquer.
 * `fundo="claro"` porque a superfície é papel branco — a arte de fundo claro é
 * a de contorno verde escuro, que no papel dá contraste; a de fundo escuro é
 * branca e sairia invisível.
 *
 * Cor: fundo branco, letra preta (`text-ink`), a regra do cliente. Vale
 * inclusive para a tinta: preto num papel branco é o único par que sobrevive a
 * impressora sem toner colorido, e a folha é impressa em qualquer máquina.
 *
 * O layout de impressão (fontes, régua, repetição do cabeçalho em cada página)
 * mora no bloco `@media print` no fim de `src/styles.css`, junto do resto da
 * folha. Aqui fica só o markup e a semântica.
 */
import { Logo } from "@/components/site/Logo";
import { CLINICA } from "@/lib/jp";

export function CabecalhoFolha(props: {
  /** A linha grande: o que é este documento ("Ficha de entrevista — Fulana"). */
  titulo: string;
  /** Contexto de segunda linha: guia usado, entrevistadores. */
  subtitulo?: string;
  /** A linha corrida de dados: vaga, protocolo, data, horário. */
  linhaDados?: string;
  /**
   * Liga o aviso de LGPD do rodapé do cabeçalho. Verdadeiro sempre que a folha
   * levar dado de pessoa identificada; falso na ficha em branco, que é só
   * formulário.
   */
  confidencial?: boolean;
}) {
  const { titulo, subtitulo, linhaDados, confidencial = false } = props;

  return (
    <header className="rh-folha-cabecalho bg-white text-ink">
      {/* A faixa institucional: é ela que se repete em toda página impressa. */}
      <div className="rh-folha-cabecalho-marca">
        <Logo
          variante="lockup"
          fundo="claro"
          altura={44}
          alt={CLINICA.nome}
          className="rh-folha-cabecalho-logo"
        />
        <div className="rh-folha-cabecalho-orgao">
          {/* O nome vem de CLINICA.nome e sobe para caixa alta no CSS: assim a
              razão de exibição continua num lugar só, e nenhuma folha começa a
              divergir do resto do sistema por causa de um texto redigitado. */}
          <p className="rh-folha-cabecalho-nome text-ink">
            {CLINICA.nome} <span className="rh-folha-cabecalho-barra">|</span> Processo seletivo
          </p>
          <p className="rh-folha-cabecalho-uso text-ink">Uso interno — Coordenação/Gestão</p>
        </div>
      </div>

      {/* Assunto do documento. Fica depois do filete, como no PDF da clínica. */}
      <div className="rh-folha-cabecalho-assunto">
        <h1 className="rh-folha-cabecalho-titulo text-ink">{titulo}</h1>
        {subtitulo === undefined || subtitulo.trim() === "" ? null : (
          <p className="rh-folha-cabecalho-subtitulo text-ink">{subtitulo}</p>
        )}
        {linhaDados === undefined || linhaDados.trim() === "" ? null : (
          <p className="rh-folha-cabecalho-dados text-ink">{linhaDados}</p>
        )}
      </div>

      {/* Aviso de LGPD, discreto e no papel de propósito.

          A folha impressa é o ponto em que o dado pessoal sai do sistema: aqui
          dentro há sessão, papel e log; depois do papel sair da bandeja não há
          controle de acesso nenhum — a ficha vai para uma mesa, uma pasta, às
          vezes uma foto de celular. O aviso não impede nada, mas põe a regra no
          próprio suporte, que é o que a LGPD pede de quem trata o dado: quem
          pegar a folha sabe que ela não é para circular. */}
      {confidencial ? (
        <p className="rh-folha-cabecalho-lgpd text-ink">
          Documento interno. Contém dados pessoais de candidata — não compartilhar fora da
          coordenação.
        </p>
      ) : null}
    </header>
  );
}
