import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('client-only', () => ({}));
vi.mock('@/client/features/layout/LanguageSelector', () => ({
  default: () => <div data-testid="lang-selector" />,
}));
vi.mock('@/client/features/layout/ThemeToggle', () => ({
  default: () => <div data-testid="theme-toggle" />,
}));
vi.mock('@/client/features/layout/BrandLogo', () => ({
  default: () => <div data-testid="brand-logo" />,
}));

import Header from './Header';

describe('Header', () => {
  it('maxWidth 미제공 시 max-w-[640px] 기본값 적용', () => {
    const { container } = render(<Header />);
    const inner = container.querySelector('header > div');
    expect(inner?.className).toContain('max-w-[640px]');
  });

  it('maxWidth 제�� 시 해당 값 적용', () => {
    const { container } = render(<Header maxWidth="max-w-[960px]" />);
    const inner = container.querySelector('header > div');
    expect(inner?.className).toContain('max-w-[960px]');
    expect(inner?.className).not.toContain('max-w-[640px]');
  });

  it('leftContent 렌더링', () => {
    render(<Header leftContent={<span data-testid="left">L</span>} />);
    expect(screen.getByTestId('left')).toBeDefined();
  });

  it('rightContent 렌더링', () => {
    render(<Header rightContent={<span data-testid="right">R</span>} />);
    expect(screen.getByTestId('right')).toBeDefined();
  });

  it('showLanguageSelector=true 시 LanguageSelector 표시', () => {
    render(<Header showLanguageSelector />);
    expect(screen.getByTestId('lang-selector')).toBeDefined();
  });

  it('showLanguageSelector 기본값 false — LanguageSelector 미표시', () => {
    render(<Header />);
    expect(screen.queryByTestId('lang-selector')).toBeNull();
  });
});
