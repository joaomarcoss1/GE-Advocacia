import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Link2, Plus, Unlink } from 'lucide-react';
import { Badge, PageHeader, useToast } from '@/components/ui';
import { CartaoIntegracao, PassosAtivacao } from '@/components/Integracao';
import { ErroNegocio } from '@/lib/erros';
import TarefaDetalhe, { quando } from '@/components/TarefaDetalhe';
import TarefaModal from '@/components/TarefaModal';
import { useDados } from '@/context/Dados';
import { useGoogle } from '@/context/useGoogle';
import { baixarIcs } from '@/lib/agenda';
import { addDays, agoraBR, diaSemana, eachDay, fmtDataCurta, isoParaBR } from '@/lib/datetime';
import { ABERTA, TIPO_ROTULO, atrasada, diaDe } from '@/lib/tarefas';
import type { Tarefa } from '@/lib/types';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const segunda = (d: string) => addDays(d, -((diaSemana(d) + 6) % 7));
const ocorreEm = (t: Tarefa, dia: string) => { const i = diaDe(t); if (!i) return false; const f = t.fim ? isoParaBR(t.fim).data : i; return dia >= i && dia <= (t.dia_inteiro ? f : i); };

export default function Agenda() {
  const { tarefas, funcionarios, escritorio, db, recarregar } = useDados();
  const google = useGoogle();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const hoje = agoraBR().data;
  const [ini, setIni] = useState(segunda(hoje));
  const [resp, setResp] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Tarefa | null>(null);
  const [ativacao, setAtivacao] = useState<'FUNCAO_NAO_PUBLICADA' | 'GOOGLE_INDISPONIVEL' | null>(null);

  // Retorno do consentimento do Google (?google=ok | erro)
  useEffect(() => {
    const g = params.get('google');
    if (!g) return;
    if (g === 'ok') { toast.ok('Google Agenda conectado.'); void google.recarregar(); } else toast.erro('Não foi possível conectar o Google Agenda.');
    nav('/painel/agenda', { replace: true });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const dias = eachDay(ini, addDays(ini, 6));
  const agenda = useMemo(() => tarefas.filter(t => t.inicio && t.status !== 'cancelada' && (!resp || t.responsavel_id === resp || t.revisor_id === resp || t.participantes.includes(resp))), [tarefas, resp]);
  const doDia = (d: string) => agenda.filter(t => ocorreEm(t, d)).sort((a, b) => Number(b.dia_inteiro) - Number(a.dia_inteiro) || (a.inicio as string).localeCompare(b.inicio as string));
  const atual = aberta ? tarefas.find(t => t.id === aberta) ?? null : null;
  const nomeDe = (id: string | null) => funcionarios.find(f => f.id === id)?.nome ?? null;

  async function conectar() {
    try { setAtivacao(null); window.location.href = await db.google.conectar(); } catch (e) {
      const cod = e instanceof ErroNegocio ? e.codigo : '';
      if (cod === 'FUNCAO_NAO_PUBLICADA' || cod === 'GOOGLE_INDISPONIVEL') setAtivacao(cod); else toast.erro((e as Error).message);
    }
  }
  async function desconectar() {
    try { await db.google.desconectar(); toast.ok('Google Agenda desconectado.'); await google.recarregar(); } catch (e) { toast.erro((e as Error).message); }
  }
  async function atualizar() { await recarregar(); await google.recarregar(); }
  async function aposSalvar(t: Tarefa, sincronizar: boolean) {
    setNova(null); setEdicao(null);
    if (t.inicio && google.status.conectado && (sincronizar || google.estados[t.id]?.event_id)) {
      try { await db.google.sincronizar(t.id); toast.ok('Marcado no Google Agenda.'); } catch (e) { toast.erro(`Salvo, mas não sincronizou: ${(e as Error).message}`); }
    }
    await atualizar();
  }
  const baixar = () => baixarIcs(agenda.filter(t => ABERTA(t.status)), escritorio.nome, `agenda-${escritorio.slug}.ics`);

  return (
    <>
      <PageHeader titulo="Agenda">
        <button className="btn ghost" onClick={baixar} disabled={!agenda.length}><Download size={17} />Baixar .ics</button>
        <button className="btn gold" onClick={() => setNova(hoje)}><Plus size={18} />Novo compromisso</button>
      </PageHeader>

      <CartaoIntegracao
        icone={<CalendarDays size={20} />}
        titulo="Google Agenda"
        descricao="Prazos, audiências e reuniões vão para a sua agenda, com lembrete e convite por e-mail aos envolvidos."
        situacao={!google.status.disponivel ? 'Indisponível' : google.status.conectado ? 'Conectado' : ativacao ? 'Ativação necessária' : 'Não conectado'}
        tom={google.status.conectado ? 'ok' : ativacao ? 'warn' : 'mute'}
        acoes={google.status.disponivel && (google.status.conectado
          ? <button className="btn ghost sm" onClick={desconectar}><Unlink size={15} />Desconectar</button>
          : <button className="btn sm" onClick={conectar}><Link2 size={15} />Conectar</button>)}
      >
        {google.status.conectado && google.status.email && <p className="ci-conta">Conta conectada: <b>{google.status.email}</b></p>}
        {ativacao && <PassosAtivacao motivo={ativacao} servico="google-agenda" />}
      </CartaoIntegracao>

      <div className="row between" style={{ margin: '18px 0 12px' }}>
        <div className="row" style={{ gap: 6 }}>
          <button className="icon-btn" aria-label="Semana anterior" onClick={() => setIni(addDays(ini, -7))}><ChevronLeft size={20} /></button>
          <button className="btn ghost sm" onClick={() => setIni(segunda(hoje))}>Hoje</button>
          <button className="icon-btn" aria-label="Próxima semana" onClick={() => setIni(addDays(ini, 7))}><ChevronRight size={20} /></button>
          <strong className="semana-rotulo">{fmtDataCurta(dias[0])} – {fmtDataCurta(dias[6])}</strong>
        </div>
        <select className="select" aria-label="Pessoa" value={resp} onChange={e => setResp(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Toda a equipe</option>
          {funcionarios.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
      </div>

      <div className="semana">
        {dias.map(d => {
          const itens = doDia(d);
          return (
            <section key={d} className={`dia ${d === hoje ? 'hoje' : ''}`} aria-label={fmtDataCurta(d)}>
              <header><span>{DIAS[diaSemana(d)]}</span><b>{d.slice(8)}</b></header>
              <div className="dia-itens">
                {itens.map(t => (
                  <button key={t.id} className={`evento ${atrasada(t) ? 'atrasada' : ''} ${t.prazo_fatal ? 'fatal' : ''} ${t.status === 'concluida' ? 'feita' : ''}`} onClick={() => setAberta(t.id)}>
                    <span className="hora">{t.dia_inteiro ? 'Dia inteiro' : isoParaBR(t.inicio as string).hhmm}</span>
                    <strong>{t.titulo}</strong>
                    <small>{TIPO_ROTULO[t.tipo]}{nomeDe(t.responsavel_id) ? ` · ${nomeDe(t.responsavel_id)}` : ''}</small>
                    {google.estados[t.id]?.event_id && <span className="gdot" aria-label="Na agenda do Google" />}
                  </button>
                ))}
                {!itens.length && <p className="kvazio">—</p>}
                <button className="add-dia" aria-label={`Novo compromisso em ${fmtDataCurta(d)}`} onClick={() => setNova(d)}><Plus size={14} /></button>
              </div>
            </section>
          );
        })}
      </div>
      {!agenda.length && <p style={{ marginTop: 14 }}><Badge tom="mute">Sem compromissos</Badge></p>}

      {(nova || edicao) && <TarefaModal tarefa={edicao} padrao={nova ? { tipo: 'reuniao', data: nova, diaInteiro: false } : undefined} googleConectado={google.status.conectado} onClose={() => { setNova(null); setEdicao(null); }} onSalvo={aposSalvar} />}
      {atual && !edicao && !nova && <TarefaDetalhe tarefa={atual} google={google.status} sync={google.estados[atual.id]} onClose={() => setAberta(null)} onEditar={() => setEdicao(atual)} onMudou={atualizar} />}
      <span className="sr-only">{atual ? quando(atual) : ''}</span>
    </>
  );
}
