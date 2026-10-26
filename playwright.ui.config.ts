import { defineConfig } from '@playwright/test';
import workflowConfig from './playwright.config';
const mode = process.env.UI_QUALITY_BASELINE === 'true' ? 'baseline' : 'enforced';

// Reuse the existing isolated database, seed and server; never audit the owner's database.
export default defineConfig({
  ...workflowConfig,
  testDir: './tests/ui-quality',
  outputDir: `.local/ui-quality/${mode}/results`,
  reporter: [
    ['list'],
    ['html', { outputFolder: `.local/ui-quality/${mode}/report`, open: 'never' }],
    ['json', { outputFile: `.local/ui-quality/${mode}/playwright.json` }],
  ],
  use: { ...workflowConfig.use, reducedMotion: 'reduce' },
  projects: [320, 375, 390, 768, 1024, 1440, 1920].flatMap((width) =>
    (['light', 'dark'] as const).map((colorScheme) => ({
      name: `chromium-${width}-${colorScheme}`,
      use: { viewport: { width, height: 1000 }, colorScheme },
    })),
  ),
});
