import { Link } from 'react-router-dom';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import Logo from '@/components/Logo';

/** Itens guardados no aparelho. Mantenha esta lista igual ao que o código grava (há um teste que confere). */
export const ARMAZENAMENTO = [
  { nome: 'sb-…-auth-token', onde: 'localStorage', para: 'Sessão de quem entrou no painel (feita pelo Supabase Auth). Sai ao clicar em Sair.', duracao: 'Até sair ou expirar (renovada enquanto você usa)', essencial: true },
  { nome: 'ge.tema', onde: 'localStorage', para: 'Tema claro/escuro escolhido.', duracao: 'Até você limpar o navegador', essencial: false },
  { nome: 'ge.densidade', onde: 'localStorage', para: 'Densidade das telas (confortável ou compacta).', duracao: 'Até você limpar o navegador', essencial: false },
  { nome: 'ge.quiosque', onde: 'localStorage', para: 'Modo quiosque da tela de ponto (tablet na recepção).', duracao: 'Até você desligar o modo', essencial: false },
  { nome: 'ge.destino', onde: 'localStorage', para: 'Última tela usada, para o aplicativo instalado abrir de onde parou.', duracao: 'Até você limpar o navegador', essencial: false },
  { nome: 'ge.ultimo-escritorio', onde: 'localStorage', para: 'Endereço do último escritório aberto, para preencher a tela inicial.', duracao: 'Até você limpar o navegador', essencial: false },
  { nome: 'ge.login.falhas', onde: 'localStorage', para: 'Contador de tentativas incorretas de login (segurança), sem a senha.', duracao: '10 minutos', essencial: true },
  { nome: 'ge.aviso.cookies', onde: 'localStorage', para: 'Lembra que você já leu este aviso.', duracao: 'Até você limpar o navegador', essencial: true },
  { nome: 'ge.backup.adiado.<escritório>', onde: 'localStorage', para: 'Lembrete de backup adiado por 24 horas (administrador).', duracao: '24 horas', essencial: false },
  { nome: 'ge.backup.ultimo.<escritório>', onde: 'localStorage', para: 'Data do último backup feito neste aparelho (administrador).', duracao: 'Até você limpar o navegador', essencial: false },
  { nome: 'ge.backup.auto.<escritório>', onde: 'localStorage', para: 'Preferência de salvar o backup semanal sozinho (administrador).', duracao: 'Até você desligar', essencial: false },
  { nome: 'ge.selos.pendentes', onde: 'localStorage', para: 'Selos de autenticidade de PDFs a enviar quando a conexão voltar.', duracao: 'Até serem enviados', essencial: false },
];

/** Política de cookies e armazenamento local — TEXTO-BASE para o jurídico do escritório revisar. */
export default function Cookies() {
  return (
    <div className="verif">
      <main className="verif-card" style={{ width: 'min(760px, 100%)' }}>
        <div className="verif-logo"><Logo /></div>
        <h1>Cookies e armazenamento no seu aparelho</h1>
        <div className="demo-banner" role="note"><strong>Texto-base para revisão jurídica.</strong> Descreve o que o sistema faz tecnicamente; cada escritório deve revisá-lo e adaptá-lo.</div>
        <div className="texto-longo">
          <h2>Resumo</h2>
          <ul>
            <li>O GE Advocacia <strong>não usa cookies de publicidade, de rastreamento nem de análise de comportamento</strong>, e não vende nem compartilha dados de navegação.</li>
            <li>O sistema não grava cookies próprios. Guarda no aparelho (armazenamento local do navegador) apenas o necessário para você entrar, manter a sessão, lembrar suas escolhas e proteger a conta.</li>
            <li>O que é <strong>estritamente necessário</strong> ao serviço dispensa consentimento; as preferências (tema, densidade, modo quiosque) só existem porque você as escolheu e podem ser apagadas a qualquer momento.</li>
          </ul>
          <h2>O que fica no seu aparelho</h2>
          <div className="table-wrap"><table className="tbl">
            <caption className="sr-only">Itens guardados no aparelho, para que servem e por quanto tempo</caption>
            <thead><tr><th>Nome</th><th>Para que serve</th><th>Duração</th><th>Tipo</th></tr></thead>
            <tbody>{ARMAZENAMENTO.map(i => (
              <tr key={i.nome}><td><code>{i.nome}</code></td><td>{i.para}</td><td>{i.duracao}</td><td>{i.essencial ? 'Necessário' : 'Preferência'}</td></tr>
            ))}</tbody>
          </table></div>
          <h2>Serviços de terceiros</h2>
          <ul>
            <li><strong>Supabase</strong> (banco de dados e autenticação) e <strong>Vercel</strong> (hospedagem): processam as requisições do sistema, o que inclui o endereço IP, para entregar o serviço e proteger contra abuso (por exemplo, limitar tentativas).</li>
            <li><strong>Monitoramento de erros</strong> (opcional, só se o escritório ligar): envia relatórios de falha <em>sem</em> CPF, e-mail, PIN, senha ou dados bancários, que são removidos antes do envio.</li>
            <li><strong>Google</strong> (Agenda e Drive): só se o escritório conectar a conta; ver o aviso de privacidade.</li>
            <li>Nenhuma fonte, imagem ou script de redes de anúncio é carregado: a política de segurança do site bloqueia origens externas.</li>
          </ul>
          <h2>Como apagar ou controlar</h2>
          <p>Nas configurações do seu navegador, você pode ver e apagar os dados do site (o que encerra a sessão e volta as preferências ao padrão). Em um aparelho compartilhado, clique em <em>Sair</em> ao terminar. O modo quiosque da tela de ponto não abre sessão no sistema.</p>
          <h2>Contato</h2>
          <p>Dúvidas sobre dados pessoais: procure o administrador do seu escritório, controlador dos dados da equipe. Veja também o <Link to="/privacidade">aviso de privacidade</Link>.</p>
        </div>
        <Link to="/" className="auth-link"><ArrowLeft size={15} />Voltar</Link>
        <p className="secure" style={{ marginTop: 0 }}><LockKeyhole size={13} />GE Advocacia · política de cookies (texto-base)</p>
      </main>
    </div>
  );
}
