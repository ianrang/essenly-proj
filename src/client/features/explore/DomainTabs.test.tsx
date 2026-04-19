import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('client-only', () => ({}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import DomainTabs from './DomainTabs';

describe('DomainTabs', () => {
  const mockOnChange = vi.fn();

  it('4개 탭을 렌더링한다', () => {
    render(
      <DomainTabs activeDomain="products" onDomainChange={mockOnChange} />,
    );

    expect(screen.getByText('explore.tabs.products')).toBeDefined();
    expect(screen.getByText('explore.tabs.treatments')).toBeDefined();
    expect(screen.getByText('explore.tabs.stores')).toBeDefined();
    expect(screen.getByText('explore.tabs.clinics')).toBeDefined();
  });

  it('탭 클릭 시 onDomainChange 호출', () => {
    render(
      <DomainTabs activeDomain="products" onDomainChange={mockOnChange} />,
    );

    fireEvent.click(screen.getByText('explore.tabs.treatments'));
    expect(mockOnChange).toHaveBeenCalledWith('treatments');
  });

  it('activeDomain에 해당하는 탭이 활성화된다', () => {
    const { container } = render(
      <DomainTabs activeDomain="stores" onDomainChange={mockOnChange} />,
    );

    const tabs = container.querySelectorAll('[data-slot="tabs-trigger"]');
    const storesTab = Array.from(tabs).find((tab) =>
      tab.textContent?.includes('explore.tabs.stores'),
    );
    expect(storesTab?.getAttribute('data-active')).not.toBeNull();
  });
});
