import { Building2, ShieldCheck, Stethoscope } from 'lucide-react';
import Shell, { type ItemNav } from '@/components/Shell';
import { useAuth } from '@/context/Auth';
import { dataExtensa } from '@/lib/datetime';

const ITENS: ItemNav[] = [
  { grupo: 'Plataforma', to: '/plataforma', fim: true, rotulo: 'Escritórios', icone: Building2 },
  { grupo: 'Sistema', to: '/plataforma/diagnostico', rotulo: 'Diagnóstico', icone: Stethoscope },
];

/** Painel do dono do GE Advocacia: cria e suspende escritórios. Não tem acesso aos dados deles. */
export default function LayoutPlataforma() {
  const { sessao, sair, modo } = useAuth();
  if (!sessao || sessao.papel !== 'plataforma') return null;
  return (
    <Shell
      itens={ITENS} atalhos={['/plataforma', '/plataforma/diagnostico']} inicio="/plataforma" sessao={sessao} sair={sair} papelRotulo="Plataforma"
      cartao={<div className="escritorio-card"><span className="rot">Área</span><strong>Gestão da plataforma</strong><span className="slug"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> sem acesso aos dados dos escritórios</span></div>}
      avisos={modo === 'local' ? <div className="demo-banner" style={{ marginBottom: 20 }}><strong>Modo demonstração</strong> · dados fictícios, salvos só neste navegador.</div> : undefined}
      carregando={false} dataExtenso={dataExtensa(new Date().toISOString())} nomeImpressao="GE Advocacia · Plataforma"
      rodapeImpressao="GE Advocacia · relatório da plataforma."
    />
  );
}
