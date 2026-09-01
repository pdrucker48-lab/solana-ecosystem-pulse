# Mandatory pre-submission review

Every SOL//PULSE submission candidate must pass an adversarial review before it is published or submitted. The review is intentionally fail-closed: unresolved eligibility, public links, evidence, or technical checks stop the final command.

## What the gate critiques

1. Requirement coverage against the live bounty brief.
2. Judge experience: immediate clarity, working links, readable reports, and transparent limitations.
3. Competitive differentiation versus a conventional single-source dashboard.
4. Data accuracy, provenance, provider disagreement, freshness, and failure behavior.
5. Automation and operational risk, including reproducibility without paid API keys.
6. Originality and intellectual-property hygiene.
7. Submission completeness, entrant eligibility, and public-access requirements.
8. Whether each additional feature adds judge-visible value rather than avoidable complexity.

## Commands

Private review, where eligibility and public links may remain unresolved:

    pnpm preflight:review

Final submission gate, which must exit successfully before any submission:

    pnpm preflight

Both commands write `reports/preflight.md`. A high score is useful evidence, not a promise of winning; comparative judging remains outside the project's control.
