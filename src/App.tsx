import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TopNav } from './components/TopNav/TopNav';
import { Login } from './pages/Login';
import { SemAcesso } from './pages/SemAcesso';
import { Dashboard } from './pages/Dashboard';
import { Produtos } from './pages/Produtos';
import { ProdutosRelatorios } from './pages/ProdutosRelatorios';
import { Encomendas } from './pages/Encomendas';
import { Colaboradores } from './pages/Colaboradores';
import { ChatbotFaqs } from './pages/ChatbotFaqs';
import { ChatbotConversas } from './pages/ChatbotConversas';
import { ConteudosImpacto } from './pages/ConteudosImpacto';
import { ConteudosNewsletter } from './pages/ConteudosNewsletter';
import { ConteudosConfiguracoes } from './pages/ConteudosConfiguracoes';

function Shell() {
  const { session, isAdmin, loading, signOut } = useAuth();

  if (loading) return null;
  if (!session) return <Login />;
  if (!isAdmin) return <SemAcesso />;

  return (
    <>
      <TopNav userLabel={session.user.email ?? undefined} onSignOut={signOut} />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/produtos/relatorios" element={<ProdutosRelatorios />} />
        <Route path="/encomendas" element={<Encomendas />} />
        <Route path="/encomendas/pendentes" element={<Encomendas onlyPending />} />
        <Route path="/colaboradores" element={<Colaboradores />} />
        <Route path="/chatbot/faqs" element={<ChatbotFaqs />} />
        <Route path="/chatbot/conversas" element={<ChatbotConversas />} />
        <Route path="/conteudos/impacto" element={<ConteudosImpacto />} />
        <Route path="/conteudos/newsletter" element={<ConteudosNewsletter />} />
        <Route path="/conteudos/configuracoes" element={<ConteudosConfiguracoes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
