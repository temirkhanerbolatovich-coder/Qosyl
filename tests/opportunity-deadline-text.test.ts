import { describe, expect, it } from 'vitest';
import { opportunityDeadlineText } from '../src/lib/notification-language';

describe('deadline reminder text', () => {
  it('names the opportunity and counts days in both languages', () => {
    expect(opportunityDeadlineText('ru', 'Грант', 3)).toContain('«Грант»');
    expect(opportunityDeadlineText('ru', 'Грант', 3)).toContain('3');
    expect(opportunityDeadlineText('kk', 'Грант', 3)).toContain('3 күн қалды');
    expect(opportunityDeadlineText('ru', 'Грант', 1)).toContain('сутки');
    expect(opportunityDeadlineText('kk', 'Грант', 1)).toContain('бір тәуліктен');
  });
  it('shortens a very long publisher title', () => {
    const text = opportunityDeadlineText('ru', 'А'.repeat(400), 7);
    expect(text.length).toBeLessThan(260);
    expect(text).toContain('…');
  });
});
