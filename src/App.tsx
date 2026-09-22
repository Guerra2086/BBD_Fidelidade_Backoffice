import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Shell as AppShell } from './components/Shell';
import { Login } from './pages/Login';
import { SemAcesso } from './pages/SemAcesso';
import { Dashboard } from './pages/Dashboard';
import { Produtos } from './pages/Produtos';
import { Importar } from './pages/Importar';
import { Movimentos } from './pages/Movimentos';
import { Categorias } from './pages/Categorias';
import { Encomendas } from './pages/Encomendas';
import { Relatorios } from './pages/Relatorios';
import { Emails } from './pages/Emails';
import { Definicoes } from './pages/Definicoes';
import { Administradores } from './pages/Administradores';

function Shell() {
  const { session, isAdmin, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Login />;
  if (!isAdmin) return <SemAcesso />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/produtos/importar" element={<Importar />} />
        <Route path="/movimentos" element={<Movimentos />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/encomendas" element={<Encomendas />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/emails" element={<Emails />} />
        <Route path="/definicoes" element={<Definicoes />} />
        <Route path="/administradores" element={<Administradores />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
