import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { TopNav } from './TopNav';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderTopNav() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TopNav />
      <Routes>
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TopNav', () => {
  it('regra 1: abrir um segundo submenu fecha o primeiro', () => {
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: 'Produtos' }));
    expect(screen.getByText('Relatórios')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Encomendas' }));
    expect(screen.queryByText('Relatórios')).not.toBeInTheDocument();
    expect(screen.getByText('Todas as encomendas')).toBeInTheDocument();
  });

  it('regra 2: clicar no mesmo trigger duas vezes fecha o submenu', () => {
    renderTopNav();
    const trigger = screen.getByRole('button', { name: 'Produtos' });
    fireEvent.click(trigger);
    expect(screen.getByText('Relatórios')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByText('Relatórios')).not.toBeInTheDocument();
  });

  it('regra 3: clicar num item sem submenu fecha o submenu aberto e navega', () => {
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: 'Produtos' }));
    expect(screen.getByText('Relatórios')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Colaboradores' }));
    expect(screen.queryByText('Relatórios')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/colaboradores');
  });

  it('regra 4: clicar fora fecha o submenu aberto', () => {
    renderTopNav();
    fireEvent.click(screen.getByRole('button', { name: 'Produtos' }));
    expect(screen.getByText('Relatórios')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Relatórios')).not.toBeInTheDocument();
  });

  it('regra 5: Esc fecha o submenu e devolve o foco ao trigger', () => {
    renderTopNav();
    const trigger = screen.getByRole('button', { name: 'Produtos' });
    fireEvent.click(trigger);
    expect(screen.getByText('Relatórios')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Relatórios')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });
});
