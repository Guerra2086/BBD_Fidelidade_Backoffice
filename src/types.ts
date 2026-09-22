export type Category = {
  id: string;
  nome: string;
  slug: string;
  ordem: number;
};

export type Product = {
  id: string;
  nome: string;
  slug: string;
  category_id: string | null;
  descricao: string | null;
  preco: number;
  estado: 'Novo' | 'Como novo' | 'Bom';
  icone: string;
  imagem_url: string | null;
  peso_kg: number;
  stock: number;
  stock_inicial: number;
  destaque_novo: boolean;
  ativo: boolean;
  codigo_passaporte: string;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: string;
  codigo: string;
  buyer_nome: string;
  buyer_email: string;
  total: number;
  peso_total_kg: number;
  estado: 'pendente' | 'confirmada' | 'pronta_levantamento' | 'entregue' | 'cancelada';
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_nome_snapshot: string;
  quantidade: number;
  preco_unitario: number;
};

export type Faq = {
  id: string;
  pergunta: string;
  resposta: string;
  ativo: boolean;
  ordem: number;
};

export type SiteStat = {
  key: string;
  label: string;
  value: string;
  ordem: number;
};
