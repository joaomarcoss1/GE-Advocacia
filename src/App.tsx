import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/Auth';
import { DadosProvider } from '@/context/Dados';
import { ConfirmProvider, PaginaEsqueleto, PerguntaProvider, ToastProvider } from '@/components/ui';
import Layout from '@/components/Layout';
import LayoutPlataforma from '@/components/LayoutPlataforma';
import BaterPonto from '@/pages/ponto/BaterPonto';
import Inicio from '@/pages/Inicio';
import Login from '@/pages/Login';
import Diagnostico from '@/pages/Diagnostico';
import Verificar from '@/pages/Verificar';
import Privacidade from '@/pages/Privacidade';
import EnviarDocumentos from '@/pages/EnviarDocumentos';
import { AvisoAtualizacao, AvisoConexao } from '@/components/Aplicativo';
import AcessoBloqueado from '@/pages/AcessoBloqueado';
import TrocarSenha from '@/pages/TrocarSenha';
import { PERMISSAO_DA_ROTA, type PapelId } from '@/lib/permissoes';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Gerencia = lazy(() => import('@/pages/Gerencia'));
const Funcionarios = lazy(() => import('@/pages/Funcionarios'));
const Cargos = lazy(() => import('@/pages/Cargos'));
const Escalas = lazy(() => import('@/pages/Escalas'));
const Registros = lazy(() => import('@/pages/Registros'));
const Ocorrencias = lazy(() => import('@/pages/Ocorrencias'));
const Feriados = lazy(() => import('@/pages/Feriados'));
const Folha = lazy(() => import('@/pages/Folha'));
const Relatorios = lazy(() => import('@/pages/Relatorios'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));
const Tarefas = lazy(() => import('@/pages/Tarefas'));
const Agenda = lazy(() => import('@/pages/Agenda'));
const Processos = lazy(() => import('@/pages/Processos'));
const Documentos = lazy(() => import('@/pages/Documentos'));
const Modelos = lazy(() => import('@/pages/Modelos'));
const Honorarios = lazy(() => import('@/pages/Honorarios'));
const Intimacoes = lazy(() => import('@/pages/Intimacoes'));
const Escritorios = lazy(() => import('@/pages/plataforma/Escritorios'));
const MeuEspaco = lazy(() => import('@/pages/MeuEspaco'));
const Acessos = lazy(() => import('@/pages/Acessos'));

type Papel = PapelId | 'plataforma';

/** Só entra quem tem sessão e um dos papéis permitidos; a plataforma e os escritórios têm áreas separadas. */
function Protegido({ papeis, children }: { papeis: Papel[]; children: React.ReactNode }) {
  const { sessao, carregando } = useAuth();
  if (carregando) return null;
  if (!sessao) return <Navigate to="/entrar" replace />;
  if (!papeis.includes(sessao.papel)) return <Navigate to={sessao.papel === 'plataforma' ? '/plataforma' : '/painel'} replace />;
  return <>{children}</>;
}

/**
 * Porta do painel: senha provisória pede a troca; ponto ainda não batido (ou jornada encerrada) mostra o aviso de acesso.
 * Enquanto a porta está fechada, o painel nem é montado: nenhum dado do escritório é lido.
 */
function Porta({ children }: { children: React.ReactNode }) {
  const { sessao, acesso, recarregar } = useAuth();
  // Ao entrar no painel (por exemplo, vindo da tela de ponto), o estado do ponto é conferido de novo.
  useEffect(() => { void recarregar(); }, [recarregar]);
  if (sessao?.trocar_senha) return <TrocarSenha />;
  if (acesso !== 'liberado') return <AcessoBloqueado />;
  return <>{children}</>;
}

/** Tela inicial de cada nível: o administrador vê o painel; a gerência, a central de ponto; a coordenação, as tarefas; os demais, o próprio espaço. */
function InicioPainel() {
  const { sessao, pode } = useAuth();
  if (sessao?.papel === 'admin') return <Dashboard />;
  if (pode('ponto.gerir')) return <Navigate to="/painel/gerencia" replace />;
  return <Navigate to={sessao?.papel === 'coordenador' ? '/painel/tarefas' : '/painel/meu-espaco'} replace />;
}
/** Rota que exige uma permissão; sem ela, volta para o início do nível. */
function Guarda({ perm, children }: { perm: string | null; children: React.ReactNode }) {
  const { pode, sessao } = useAuth();
  if (perm && !pode(perm)) return <Navigate to="/painel" replace />;
  if (!perm && !sessao) return null;
  return <>{children}</>;
}
const carregando = <PaginaEsqueleto />;
const pagina = (el: React.ReactNode) => <Suspense fallback={carregando}>{el}</Suspense>;
/** Página do painel protegida pela permissão da rota (tabela em `lib/permissoes`). */
const rota = (caminho: string, el: React.ReactNode) => <Guarda perm={PERMISSAO_DA_ROTA[caminho] ?? null}>{pagina(el)}</Guarda>;

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <PerguntaProvider>
            <AvisoConexao />
            <AvisoAtualizacao />
            <Routes>
              <Route path="/" element={<Inicio />} />
              <Route path="/ponto/:slug" element={<BaterPonto />} />
              <Route path="/entrar" element={<Login />} />
              <Route path="/diagnostico" element={<Diagnostico />} />
              <Route path="/verificar" element={<Verificar />} />
              <Route path="/verificar/:codigo" element={<Verificar />} />
              <Route path="/enviar/:token" element={<EnviarDocumentos />} />
              <Route path="/privacidade" element={<Privacidade />} />
              <Route path="/privacidade/:slug" element={<Privacidade />} />

              <Route path="/painel" element={<Protegido papeis={['admin', 'gerente', 'coordenador', 'advogado', 'financeiro', 'secretaria', 'estagiario', 'colaborador']}><Porta><DadosProvider><Layout /></DadosProvider></Porta></Protegido>}>
                <Route index element={pagina(<InicioPainel />)} />
                <Route path="meu-espaco" element={pagina(<MeuEspaco />)} />
                <Route path="tarefas" element={rota('/painel/tarefas', <Tarefas />)} />
                <Route path="agenda" element={rota('/painel/agenda', <Agenda />)} />
                <Route path="processos" element={rota('/painel/processos', <Processos />)} />
                <Route path="intimacoes" element={rota('/painel/intimacoes', <Intimacoes />)} />
                <Route path="documentos" element={rota('/painel/documentos', <Documentos />)} />
                <Route path="modelos" element={rota('/painel/modelos', <Modelos />)} />
                <Route path="honorarios" element={rota('/painel/honorarios', <Honorarios />)} />
                <Route path="gerencia" element={rota('/painel/gerencia', <Gerencia />)} />
                <Route path="funcionarios" element={rota('/painel/funcionarios', <Funcionarios />)} />
                <Route path="cargos" element={rota('/painel/cargos', <Cargos />)} />
                <Route path="escalas" element={rota('/painel/escalas', <Escalas />)} />
                <Route path="ponto" element={rota('/painel/ponto', <Registros />)} />
                <Route path="ocorrencias" element={rota('/painel/ocorrencias', <Ocorrencias />)} />
                <Route path="feriados" element={rota('/painel/feriados', <Feriados />)} />
                <Route path="folha" element={rota('/painel/folha', <Folha />)} />
                <Route path="relatorios" element={rota('/painel/relatorios', <Relatorios />)} />
                <Route path="acessos" element={rota('/painel/acessos', <Acessos />)} />
                <Route path="configuracoes" element={rota('/painel/configuracoes', <Configuracoes />)} />
              </Route>

              <Route path="/plataforma" element={<Protegido papeis={['plataforma']}><LayoutPlataforma /></Protegido>}>
                <Route index element={pagina(<Escritorios />)} />
                <Route path="diagnostico" element={<Diagnostico embutido />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PerguntaProvider>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
