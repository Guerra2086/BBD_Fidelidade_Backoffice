export type Category = {
  id: string;
  nome: string;
  slug: string;
  ordem: number;
  limite_unidades: number | null;
  created_by_import: boolean;
};

export type Product = {
  id: string;
  nome: string;
  slug: string;
  category_id: string | null;
  descricao: string | null;
  preco: number | null;
  estado: 'Novo' | 'Como novo' | 'Bom';
  icone: string;
  peso_kg: number;
  stock: number;
  stock_inicial: number;
  destaque_novo: boolean;
  ativo: boolean;
  codigo_passaporte: string;
  external_id: string | null;
  medidas: string | null;
  formato: string | null;
  edificios: string | null;
  grade: string | null;
  destinos: string[] | null;
  codigo_slide: string | null;
  review_status: string | null;
  created_at: string;
  updated_at: string;
  imagens?: ProductImage[];
};

export type QualityFlags = {
  baixa_resolucao?: boolean;
  muito_escura?: boolean;
  muito_clara?: boolean;
  desfocada?: boolean;
  objeto_a_tocar_na_borda?: boolean;
  duplicada?: boolean;
  needs_reprocessing?: boolean;
};

export type Enquadramento = { x: number; y: number; w: number; h: number };

export type ProductImage = {
  id: string;
  product_id: string;
  posicao: number;
  capa: boolean;
  original_path: string;
  large_path: string;
  medium_path: string;
  thumb_path: string;
  largura: number | null;
  altura: number | null;
  quality_flags: QualityFlags | null;
  enquadramento: Enquadramento | null;
  created_at: string;
  updated_at: string;
};

export type OrderEstado = 'pendente' | 'confirmada' | 'pronta_levantamento' | 'entregue' | 'cancelada' | 'expirada';

export type Order = {
  id: string;
  codigo: string;
  buyer_nome: string;
  buyer_email: string;
  total: number;
  peso_total_kg: number;
  estado: OrderEstado;
  payment_method: 'Numerário' | 'Multibanco' | 'MB WAY' | null;
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

export type OrderEvent = {
  id: string;
  order_id: string;
  texto: string;
  created_at: string;
};

export type StockMovement = {
  id: string;
  product_id: string | null;
  delta: number;
  motivo: string;
  ref_order_id: string | null;
  user_label: string;
  resulting_stock: number;
  created_at: string;
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
