import { readFile, writeFile, mkdir } from 'node:fs/promises';

const mode = process.argv.includes('--baseline') ? 'baseline' : 'enforced';
const report = JSON.parse(await readFile(`.local/ui-quality/${mode}/playwright.json`, 'utf8'));
const observations = [];
function visit(suite) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const result = test.results.at(-1);
      const audit = result?.attachments.find((attachment) => attachment.name.endsWith('-audit'));
      const data = audit?.body
        ? JSON.parse(Buffer.from(audit.body, 'base64').toString('utf8'))
        : null;
      observations.push({
        name: spec.title,
        project: test.projectName,
        status: result?.status,
        mode: data?.mode,
        layout: data?.layout,
        violations:
          data?.violations.map((issue) => ({
            id: issue.id,
            impact: issue.impact,
            helpUrl: issue.helpUrl,
            nodes: issue.nodes.map((node) => ({
              target: node.target,
              summary: node.failureSummary,
            })),
          })) ?? [],
        incompleteRules: data?.incomplete.map((issue) => issue.id) ?? [],
      });
    }
  }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites ?? []) visit(suite);
if (!observations.length) throw new Error('No UI observations found.');
const auditedStates = observations.filter((row) => row.mode).length;
const evidence = { checkedAt: new Date().toISOString(), stats: report.stats, auditedStates, observations };
await mkdir('outputs/ui-quality', { recursive: true });
await writeFile(
  `outputs/ui-quality/browser-${mode}.json`,
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      states: observations.length,
      auditedStates,
      stats: report.stats,
      rules: [...new Set(observations.flatMap((row) => row.violations.map((issue) => issue.id)))],
      overflow: observations
        .filter((row) => row.layout?.documentWidth > row.layout?.viewport + 1)
        .map((row) => ({ name: row.name, project: row.project })),
    },
    null,
    2,
  ),
);
