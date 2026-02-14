import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils';
import Breadcrumbs from './Breadcrumbs';

describe('Breadcrumbs', () => {
  const mockItems = [
    { id: 'folder-1', name: 'Documents' },
    { id: 'folder-2', name: 'Projects' },
  ];

  it('should render home link', () => {
    const onNavigate = vi.fn();
    render(<Breadcrumbs items={[]} onNavigate={onNavigate} />);

    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('should render breadcrumb items', () => {
    const onNavigate = vi.fn();
    render(<Breadcrumbs items={mockItems} onNavigate={onNavigate} />);

    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('should call onNavigate with null when clicking home', () => {
    const onNavigate = vi.fn();
    render(<Breadcrumbs items={mockItems} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText('Home'));

    expect(onNavigate).toHaveBeenCalledWith(null);
  });

  it('should call onNavigate with folder id when clicking breadcrumb', () => {
    const onNavigate = vi.fn();
    render(<Breadcrumbs items={mockItems} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText('Documents'));

    expect(onNavigate).toHaveBeenCalledWith('folder-1');
  });

  it('should not make last item clickable', () => {
    const onNavigate = vi.fn();
    render(<Breadcrumbs items={mockItems} onNavigate={onNavigate} />);

    // Last item should be text, not a button
    const projectsElement = screen.getByText('Projects');
    expect(projectsElement.tagName).not.toBe('BUTTON');
  });
});
