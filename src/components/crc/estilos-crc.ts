/**
 * O CSS do portal do CRC, na ordem da cascata, e a classe raiz que o usa.
 *
 * POR QUE UM MÓDULO, e não os `import "x.css"` no arquivo de rota: com o
 * autoCodeSplitting do TanStack, import de efeito colateral num arquivo de
 * rota fica na parte NÃO dividida da rota, que entra no pacote de entrada — e
 * os ~120 KB do CRC iam como CSS bloqueante em TODAS as páginas do site,
 * inclusive nas landings pagas. Importado por aqui e usado dentro do
 * componente (`className={CLASSE_CRC}`), ele viaja junto com o pedaço do
 * portal e só carrega em /crc. O uso real da constante é o que impede o
 * tree-shaking (`"sideEffects": false` no package.json) de descartar o módulo.
 *
 * A ORDEM É CASCATA: `crc.css` é a base, `crc-premium` o tema, `crc-screens` o
 * layout das telas, e `polish`/`qa`/`shell-harmony` são correções que dependem
 * de vir depois. `crc-agenda.css` continua em `Agenda.tsx`.
 */
import "./crc.css";
import "./crc-premium.css";
import "./crc-screens.css";
import "./crc-polish.css";
import "./crc-qa.css";
import "./crc-shell-harmony.css";

export const CLASSE_CRC = "crc-app";
