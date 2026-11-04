---
name: qosyl-performance
description: Measure and investigate Qosyl page, API or database performance and assess optimizations using reproducible evidence. Use for performance investigations and benchmarks; do not assume slow behavior without measurements.
---

# Qosyl Performance

Identify the user operation, environment, dataset size, concurrency, metric and baseline before changing code. Distinguish production observations from local synthetic data; never load-test the public site or use private data without authorization. Preserve database contents and do not stop other services.

Inspect `src/server/marketplace/queries/public.ts` for catalogue ranking and pagination, and the relevant Prisma queries, indexes, UI requests and worker settings. Record dataset generation, timing distribution, resource constraints and query plan where useful. For backend measurement use an isolated database, confirm its target before writes, and avoid sharing the owner's `.next` build directory. Do not label a small local measurement as production capacity.

Choose the simplest change supported by evidence, preserve authorization and data projections, and compare equivalent before/after workloads. Verify behavior and relevant tests; document commands, results, limitations and unresolved regressions. If no bottleneck is measured, report the observation rather than optimizing speculatively.
