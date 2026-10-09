import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import Logo from '@/components/Logo';
import { getDb } from '@/data/db';
import { CONFIG_PADRAO } from '@/lib/config';
import { RETENCAO_TENTATIVAS_DIAS } from '@/lib/regras';

/**
 * Aviso de privacidade (LGPD) — TEXTO-BASE para o jurídico de cada escritório revisar e adaptar.
 * Não é parecer jurídico nem garante conformidade por si só.
 */
export default function Privacidade() {
  const { slug } = useParams();
  const [escritorio, setEscritorio] = useState<string | null>(null);
  useEffect(() => {
    if (!slug) return;
    getDb().then(db => db.ponto.para(slug).contexto()).then(r => setEscritorio(r.ok ? r.ctx.escritorio_nome : null)).catch(() => undefined);
  }, [slug]);
  const quem = escritorio ?? 'o escritório responsável pelo seu cadastro';
  const pad = CONFIG_PADRAO.privacidade;

  return (
    <div className="verif">
      <main className="verif-card" style={{ width: 'min(760px, 100%)' }}>
        <div className="verif-logo"><Logo /></div>
        <div>
          <h1>Como tratamos os seus dados</h1>
        </div>
        <div className="demo-banner" role="note"><strong>Texto-base para revisão jurídica.</strong> Este aviso descreve o que o sistema faz tecnicamente. Cada escritório deve revisá-lo e adaptá-lo com o seu jurídico antes de adotá-lo; ele não substitui parecer jurídico.</div>
        <div className="texto-longo">
          <h2>Quem é o responsável</h2>
          <p><strong>{quem}</strong> é o controlador dos dados da sua equipe. A plataforma GE Advocacia atua como operadora: armazena e processa os dados em nome do escritório, que só enxerga os próprios dados. Nenhum escritório acessa os dados de outro, e a equipe da plataforma não tem acesso à folha, ao ponto nem aos atestados dos escritórios.</p>
          <h2>Quais dados são tratados</h2>
          <ul>
            <li><strong>Cadastro:</strong> nome, cargo, escala de trabalho, data de admissão e, quando o escritório informa, CPF, e-mail, telefone, OAB e dados de pagamento (PIX e conta bancária).</li>
            <li><strong>Registro de ponto:</strong> data e hora de cada marcação, justificativas e o resultado da análise.</li>
            <li><strong>Localização:</strong> somente se o escritório ativar a cerca de GPS, as coordenadas são lidas no instante da marcação para confirmar que você está no local de trabalho.</li>
            <li><strong>Atestados e comprovantes (dado de saúde):</strong> arquivos que você mesmo envia para justificar ausências.</li>
            <li><strong>Segurança:</strong> hash do PIN (nunca o PIN), tentativas de acesso e origem da conexão, para barrar tentativas de fraude.</li>
          </ul>
          <h2>Para que usamos</h2>
          <p>Para controlar a jornada, apurar faltas e atrasos, calcular a folha de conferência, analisar justificativas e manter a trilha de auditoria das alterações. As bases legais aplicáveis (por exemplo, execução do contrato de trabalho e cumprimento de obrigação legal) devem ser confirmadas pelo jurídico do escritório.</p>
          <h2>Quem acessa</h2>
          <ul>
            <li>Administração do escritório: todos os dados do escritório, inclusive salários.</li>
            <li>Gerência: presença, ponto e escalas, <strong>sem</strong> salários, CPF, dados bancários nem atestados.</li>
            <li>Atestados: somente o administrador abre, por endereço temporário de 60 segundos, e <strong>cada abertura fica registrada</strong> (quem, quando).</li>
          </ul>
          <h2>Por quanto tempo guardamos</h2>
          <p>Valores-padrão do sistema (o administrador pode ajustar; <strong>confirmar com o jurídico/contabilidade</strong>):</p>
          <ul>
            <li>Atestados e anexos de saúde: {pad.anexos_meses} meses.</li>
            <li>Coordenadas de GPS das marcações: {pad.geolocalizacao_meses} meses (depois, a marcação permanece sem a coordenada).</li>
            <li>Tentativas de PIN: {RETENCAO_TENTATIVAS_DIAS} dias, removidas automaticamente.</li>
            <li>Marcações, folha e auditoria: pelo prazo de guarda trabalhista definido pelo escritório.</li>
          </ul>
          <h2>Integrações com o Google (Agenda e Drive)</h2>
          <p>Quando o escritório conecta uma conta Google, o sistema usa apenas as permissões que ela autorizou:</p>
          <ul>
            <li><strong>Google Agenda</strong> (<code>calendar.events</code>): criar, atualizar e remover os <em>eventos que o próprio sistema cria</em> (prazos, audiências e reuniões), com convite por e-mail aos envolvidos. O sistema não lê nem altera os demais eventos da agenda.</li>
            <li><strong>Google Drive</strong> (<code>drive.file</code>): criar pastas e guardar os documentos enviados ao sistema. Por essa permissão, o sistema enxerga <em>somente os arquivos e pastas que ele mesmo criou</em>, nunca o restante do Drive.</li>
            <li>A autorização é guardada <strong>cifrada</strong> no servidor e nunca chega ao navegador. Pode ser desfeita a qualquer momento pelo botão <em>Desconectar</em> no sistema ou em myaccount.google.com/permissions.</li>
            <li>Os dados do Google não são vendidos, não são usados para publicidade nem para treinar modelos, e só servem para entregar essas funções ao escritório. O uso segue a Política de Dados de Usuário dos Serviços de API do Google, inclusive os requisitos de uso limitado.</li>
          </ul>
          <h2>Seus direitos</h2>
          <p>Você pode pedir ao escritório acesso, correção, informação sobre o compartilhamento e, quando cabível, eliminação dos seus dados, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018). Procure o administrador do escritório.</p>
          <h2>Como protegemos</h2>
          <ul>
            <li>Cada escritório tem os dados isolados no banco por regras de acesso (o banco recusa qualquer consulta ao escritório de outra pessoa).</li>
            <li>PIN guardado apenas como hash, com bloqueio após tentativas erradas.</li>
            <li>Atestados em armazenamento privado, sem endereço público.</li>
            <li>Toda alteração relevante é registrada em uma trilha de auditoria que ninguém consegue editar ou apagar.</li>
          </ul>
        </div>
        <Link to={slug ? `/ponto/${slug}` : '/'} className="auth-link"><ArrowLeft size={15} />Voltar</Link>
        <p className="secure" style={{ marginTop: 0 }}><LockKeyhole size={13} />GE Advocacia · aviso de privacidade (texto-base)</p>
      </main>
    </div>
  );
}
