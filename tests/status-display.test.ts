import { describe, expect, it } from 'vitest';
import * as lucide from 'lucide-react';
import { applicationStatusSchema, projectStatusSchema } from '../src/contracts/api-entities';
import tokens from '../src/lib/design-tokens.json';
import { localizedStatusLabels } from '../src/lib/localized-labels';
import { statusDisplay } from '../src/lib/status-display';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const lightness = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lightness[0] + 0.05) / (lightness[1] + 0.05);
}

describe('project and application status display', () => {
  it('defines a tone and a real Lucide icon for every contract status', () => {
    const statuses = new Set([...projectStatusSchema.options, ...applicationStatusSchema.options]);
    for (const status of statuses) {
      const display = statusDisplay[status];
      expect(display, `Missing display for ${status}`).toBeDefined();
      expect(['neutral', 'info', 'progress', 'success', 'attention']).toContain(display.tone);
      expect(display.icon, `Missing icon for ${status}`).toBeTruthy();
      expect(Object.hasOwn(lucide, display.icon), `Unknown Lucide icon for ${status}`).toBe(true);
    }
  });

  it('distinguishes neutral, information, in-progress and completed work', () => {
    expect(statusDisplay.withdrawn.tone).toBe('neutral');
    expect(statusDisplay.active.tone).toBe('info');
    expect(statusDisplay.assigned.tone).toBe('info');
    expect(statusDisplay.in_progress.tone).toBe('progress');
    expect(statusDisplay.selected.tone).toBe('success');
    expect(statusDisplay.completed.tone).toBe('success');
    expect(statusDisplay.changes_requested).toMatchObject({
      tone: 'attention',
      severity: 'warning',
    });
    expect(statusDisplay.disputed).toMatchObject({ tone: 'attention', severity: 'error' });
  });

  it('describes an active application as being under review in both languages', () => {
    expect(localizedStatusLabels('ru').active).toBe('На рассмотрении');
    expect(localizedStatusLabels('kk').active).toBe('Қаралуда');
  });

  it.each(Object.entries(tokens.themes))(
    '%s status text and backgrounds meet 4.5:1',
    (_, colors) => {
      const pairs: [string, string][] = [
        [colors['text-secondary'], colors['surface-elevated']],
        [colors.info, colors['info-background']],
        [colors['action-text'], colors['action-background']],
        [colors.success, colors['success-background']],
        [colors.warning, colors['warning-background']],
        [colors.error, colors['error-background']],
      ];
      for (const [foreground, background] of pairs) {
        expect(
          contrast(foreground, background),
          `${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
