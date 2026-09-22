export type MenuChild = { label: string; href: string };
export type MenuItem = { id: string; label: string; href?: string; children?: MenuChild[] };

export const MENU: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/' },
  {
    id: 'produtos',
    label: 'Produtos',
    children: [
      { label: 'Produtos', href: '/produtos' },
      { label: 'Relatórios', href: '/produtos/relatorios' },
    ],
  },
  {
    id: 'encomendas',
    label: 'Encomendas',
    children: [
      { label: 'Todas as encomendas', href: '/encomendas' },
      { label: 'Pendentes', href: '/encomendas/pendentes' },
    ],
  },
  { id: 'colaboradores', label: 'Colaboradores', href: '/colaboradores' },
  {
    id: 'chatbot',
    label: 'Chatbot',
    children: [
      { label: 'FAQs', href: '/chatbot/faqs' },
      { label: 'Conversas', href: '/chatbot/conversas' },
    ],
  },
  {
    id: 'conteudos',
    label: 'Conteúdos',
    children: [
      { label: 'Números de impacto', href: '/conteudos/impacto' },
      { label: 'Newsletter', href: '/conteudos/newsletter' },
      { label: 'Configurações', href: '/conteudos/configuracoes' },
    ],
  },
];
