import { lazy, Suspense } from 'react';
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
const Escritorios = lazy(() => import('@/pages/plataforma/Escritorios'));

type Papel = 'admin' | 'gerente' | 'plataforma';

/** Só entra quem tem sessão e um dos papéis permitidos; a plataforma e os escritórios têm áreas separadas. */
function Protegido({ papeis, children }: { papeis: Papel[]; children: React.ReactNode }) {
  const { sessao, carregando } = useAuth();
  if (carregando) return null;
  if (!sessao) return <Navigate to="/entrar" replace />;
  if (!papeis.includes(sessao.papel)) return <Navigate to={sessao.papel === 'plataforma' ? '/plataforma' : '/painel'} replace />;
  return <>{children}</>;
}

function InicioPainel() {
  const { sessao } = useAuth();
  return sessao?.papel === 'admin' ? <Dashboard /> : <Navigate to="/painel/gerencia" replace />;
}
const carregando = <PaginaEsqueleto />;
const pagina = (el: React.ReactNode) => <Suspense fallback={carregando}>{el}</Suspense>;
const soAdmin = (el: React.ReactNode) => <Protegido papeis={['admin']}>{pagina(el)}</Protegido>;

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <PerguntaProvider>
            <Routes>
              <Route path="/" element={<Inicio />} />
              <Route path="/ponto/:slug" element={<BaterPonto />} />
              <Route path="/entrar" element={<Login />} />
              <Route path="/diagnostico" element={<Diagnostico />} />
              <Route path="/verificar" element={<Verificar />} />
              <Route path="/verificar/:codigo" element={<Verificar />} />
              <Route path="/privacidade" element={<Privacidade />} />
              <Route path="/privacidade/:slug" element={<Privacidade />} />

              <Route path="/painel" element={<Protegido papeis={['admin', 'gerente']}><DadosProvider><Layout /></DadosProvider></Protegido>}>
                <Route index element={pagina(<InicioPainel />)} />
                <Route path="gerencia" element={pagina(<Gerencia />)} />
                <Route path="funcionarios" element={soAdmin(<Funcionarios />)} />
                <Route path="cargos" element={soAdmin(<Cargos />)} />
                <Route path="escalas" element={pagina(<Escalas />)} />
                <Route path="ponto" element={pagina(<Registros />)} />
                <Route path="ocorrencias" element={pagina(<Ocorrencias />)} />
                <Route path="feriados" element={pagina(<Feriados />)} />
                <Route path="folha" element={soAdmin(<Folha />)} />
                <Route path="relatorios" element={pagina(<Relatorios />)} />
                <Route path="configuracoes" element={soAdmin(<Configuracoes />)} />
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
