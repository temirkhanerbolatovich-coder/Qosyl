import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { marketplaceCopy } from '../src/lib/marketplace-copy';
import ErrorPage from '../src/app/error';

const state = vi.hoisted(() => ({ locale: 'ru' as 'ru' | 'kk' }));
vi.mock('@/components/marketplace-copy', () => ({
  useMarketplaceCopy: () => ({
    locale: state.locale,
    copy: (text: string) => marketplaceCopy(text, state.locale),
  }),
}));
describe('system error presentation', () => {
  for (const locale of ['ru', 'kk'] as const)
    it(`renders safe ${locale} recovery without leaking server details`, () => {
      state.locale = locale;
      const html = renderToStaticMarkup(
        createElement(ErrorPage, { error: new Error('PRIVATE_SERVER_DETAIL'), reset: () => {} }),
      );
      expect(html).not.toContain('PRIVATE_SERVER_DETAIL');
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(
        locale === 'kk' ? 'алдымен оның күйін тексеріңіз' : 'сначала проверьте его статус',
      );
      expect(html).toContain('href="/"');
    });
  it('passes retry through unchanged without invoking it during rendering or language change', () => {
    const reset = vi.fn();
    function retry(node: ReactNode): (() => void) | undefined {
      if (!node || typeof node !== 'object' || !('props' in node)) return;
      const element = node as ReactElement<{ onClick?: () => void; children?: ReactNode }>;
      if (element.type === 'button') return element.props.onClick;
      for (const child of [element.props.children].flat()) {
        const found = retry(child);
        if (found) return found;
      }
    }
    for (const locale of ['ru', 'kk'] as const) {
      state.locale = locale;
      expect(retry(ErrorPage({ error: new Error('private'), reset }))).toBe(reset);
    }
    expect(reset).not.toHaveBeenCalled();
  });
});
