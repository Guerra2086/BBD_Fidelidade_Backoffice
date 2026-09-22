/** Corta uma lista já filtrada/ordenada na página pedida (1-based), sem rebentar se a página ficou inválida. */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { pageItems: items.slice(start, start + pageSize), totalPages, safePage };
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior">
        ‹
      </button>
      <span>
        Página {page} de {totalPages}
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Página seguinte">
        ›
      </button>
    </div>
  );
}
