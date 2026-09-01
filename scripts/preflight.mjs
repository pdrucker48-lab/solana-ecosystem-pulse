import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const allowPrivate = process.argv.includes('--allow-private');
const exists = async (name) =>
  access(path.join(root, name), constants.F_OK).then(
    () => true,
    () => false,
  );
const read = (name) => readFile(path.join(root, name), 'utf8');
const snapshotPath = (await exists('reports/python-latest.json'))
  ? 'reports/python-latest.json'
  : 'reports/latest.json';
const [snapshot, readme, submission] = await Promise.all([
  read(snapshotPath).then(JSON.parse),
  read('README.md'),
  read('SUBMISSION.md'),
]);

const sections = [
  {
    name: 'Comprehensiveness',
    weight: 18,
    checks: [
      [
        snapshot.sources?.length >= 6,
        'Six distinct public source families are documented',
      ],
      [
        snapshot.activity?.activeAddresses > 0 &&
          snapshot.activity?.feePayers > 0,
        'Active-address and fee-payer coverage is populated',
      ],
      [
        snapshot.network?.medianTransactionFeeLamports > 0 &&
          snapshot.activity?.totalTransactions > 0,
        'Fee and transaction-count coverage is populated',
      ],
    ],
  },
  {
    name: 'Automation & maintainability',
    weight: 18,
    checks: [
      [
        await exists('scripts/solpulse.py'),
        'Zero-dependency Python generator is included',
      ],
      [
        await exists('.github/workflows/refresh-reports.yml'),
        'Scheduled report refresh is included',
      ],
      [
        readme.includes('transparent') && readme.includes('fallback'),
        'Failure behavior is documented',
      ],
    ],
  },
  {
    name: 'Clarity & presentation',
    weight: 16,
    checks: [
      [await exists('public/og.png'), 'Social preview asset is included'],
      [
        (await exists('reports/latest.md')) &&
          (await exists('reports/latest.json')),
        'Human- and machine-readable samples are included',
      ],
      [
        snapshot.signals?.length > 0 && snapshot.briefing?.length > 30,
        'Briefing and signal explanations are present',
      ],
    ],
  },
  {
    name: 'Innovation',
    weight: 16,
    checks: [
      [
        snapshot.activity?.providerCount >= 3,
        'Activity figures use multi-provider median consensus',
      ],
      [
        snapshot.performance?.some((point) => point.nonVoteTps > 0),
        'Total TPS is separated from non-vote TPS',
      ],
      [
        snapshot.developments?.length >= 2,
        'Official proposal status is tracked alongside current metrics',
      ],
    ],
  },
  {
    name: 'Technical implementation',
    weight: 18,
    checks: [
      [
        snapshot.state !== 'sample',
        'Generated evidence uses live or partial upstream data',
      ],
      [
        snapshot.sources?.filter((source) => source.state === 'live').length >=
          4,
        'At least four upstream source families were live',
      ],
      [
        (await exists('.github/workflows/quality.yml')) &&
          (await exists('app/api/report/json/route.ts')),
        'CI and live report endpoints are included',
      ],
    ],
  },
  {
    name: 'Originality & submission hygiene',
    weight: 14,
    checks: [
      [
        readme.includes('provider-consensus') ||
          readme.includes('provider consensus'),
        'Differentiating methodology is explicitly documented',
      ],
      [
        await exists('docs/PRE_SUBMISSION_REVIEW.md'),
        'Adversarial pre-submission review policy is included',
      ],
      [
        submission.includes('Accuracy note') &&
          submission.includes('Reviewer checklist'),
        'Reviewer path and limitations are explicit',
      ],
    ],
  },
];

let score = 0;
const rows = [];
const technicalBlockers = [];
for (const section of sections) {
  const passed = section.checks.filter(([ok]) => ok).length;
  const sectionScore = Math.round(
    (passed / section.checks.length) * section.weight,
  );
  score += sectionScore;
  rows.push(
    `| ${section.name} | ${sectionScore}/${section.weight} | ${passed}/${section.checks.length} |`,
  );
  for (const [ok, label] of section.checks)
    if (!ok) technicalBlockers.push(`${section.name}: ${label}`);
}

const releaseBlockers = [];
if (
  /Eligibility:\s*PENDING CONFIRMATION/i.test(submission) ||
  !/Eligibility:\s*CONFIRMED/i.test(submission)
) {
  releaseBlockers.push(
    'Entrant has not recorded confirmation of Canada eligibility in SUBMISSION.md.',
  );
}
if (/PENDING APPROVAL/i.test(submission)) {
  releaseBlockers.push(
    'Public repository and/or hosted-demo links remain marked PENDING APPROVAL.',
  );
}
const blockers = [
  ...technicalBlockers,
  ...(allowPrivate ? [] : releaseBlockers),
];
const warnings = allowPrivate ? releaseBlockers : [];
const verdict = blockers.length
  ? 'BLOCKED'
  : score >= 90
    ? 'HIGH-CONFIDENCE READY'
    : 'REVIEW REQUIRED';
const bullets = (items, empty) =>
  items.length ? items.map((item) => `- ${item}`).join('\n') : `- ${empty}`;
const report = `# SOL//PULSE pre-submission review

Generated: ${new Date().toISOString()}
Mode: ${allowPrivate ? 'private review' : 'final submission'}
Evidence: ${snapshotPath}
Verdict: **${verdict}**
Rubric score: **${score}/100**

## Weighted critique

| Criterion | Score | Checks passed |
| --- | ---: | ---: |
${rows.join('\n')}

## Technical blockers

${bullets(technicalBlockers, 'None.')}

## Release blockers

${bullets(releaseBlockers, 'None.')}

## Warnings allowed only for private review

${bullets(warnings, 'None.')}

## Competitive assessment

- Strongest differentiator: provider-consensus activity metrics reduce dependence on a single indexer while remaining keyless.
- Strongest execution evidence: the dashboard, API endpoints, scheduled Python report generator, and sample artifacts all use the same auditable schema.
- Main residual risk: judging is comparative and subjective; this gate raises submission quality but cannot guarantee a prize.
- Submission policy: do not publish or submit unless this script passes in final mode with zero blockers.
`;

await writeFile(path.join(root, 'reports', 'preflight.md'), report, 'utf8');
console.log(report);
if (blockers.length || score < 90) process.exitCode = 1;
