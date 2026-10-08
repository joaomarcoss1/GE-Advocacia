import type { ReactNode } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Badge } from '@/components/ui';

const URL_SUPABASE = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/$/, '');

/** Cartão de uma integração: ícone, nome, o que ela entrega, situação e ações. */
export function CartaoIntegracao({ icone, titulo, descricao, situacao, tom, acoes, children }: {
  icone: ReactNode; titulo: string; descricao: string; situacao: string; tom: 'ok' | 'warn' | 'mute'; acoes?: ReactNode; children?: ReactNode;
}) {
  return (
    <section className="cartao-integracao" aria-label={titulo}>
      <div className="ci-topo">
        <span className="g-ic" aria-hidden="true">{icone}</span>
        <div className="ci-texto">
          <div className="ci-titulo"><strong>{titulo}</strong><Badge tom={tom}>{situacao}</Badge></div>
          <p>{descricao}</p>
        </div>
        {acoes && <div className="ci-acoes">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

/** Passo a passo (somente para quem administra) quando a integração ainda não foi ativada no servidor. */
export function PassosAtivacao({ motivo, servico }: { motivo: 'FUNCAO_NAO_PUBLICADA' | 'GOOGLE_INDISPONIVEL'; servico: 'google-agenda' | 'documentos' }) {
  const retorno = `${URL_SUPABASE || 'https://<seu-projeto>.supabase.co'}/functions/v1/${servico}`;
  const publicada = motivo === 'GOOGLE_INDISPONIVEL';
  return (
    <div className="ativacao" role="status">
      <div className="ativacao-cab"><AlertTriangle size={18} aria-hidden="true" /><strong>{publicada ? 'Faltam as credenciais do Google' : 'Ativação necessária (uma única vez)'}</strong></div>
      <p>{publicada ? 'O serviço já está no ar, mas ainda não recebeu as credenciais do Google. ' : 'O serviço de integração ainda não foi publicado no servidor. '}Quem administra o projeto conclui em poucos minutos:</p>
      <ol>
        <li className={publicada ? 'feito' : ''}>{publicada && <Check size={14} aria-hidden="true" />} No <b>GitHub</b> → <i>Actions</i> → <b>Supabase — aplicar banco e funções</b> → <i>Run workflow</i>, marcando <i>Publicar as Edge Functions</i>.</li>
        <li>No <b>Google Cloud</b> crie a credencial OAuth (aplicativo da Web) e libere o endereço de retorno:<code className="bloco">{retorno}</code></li>
        <li>Cadastre no GitHub (<i>Settings → Secrets → Actions</i>) <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> e <code>ALLOWED_ORIGINS</code> (o endereço deste site) e rode o workflow de novo.</li>
      </ol>
      <p className="ativacao-nota">Enquanto isso, <b>Adicionar ao Google Agenda</b> e <b>Baixar .ics</b> continuam funcionando em cada compromisso.</p>
    </div>
  );
}
