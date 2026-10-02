#!/usr/bin/env node
// Refreshes data/wa/framework.json from the live Azure Well-Architected Framework checklists (needs network access to learn.microsoft.com).
import { acquireCorpus, saveCorpus, SOURCES } from "../src/wa/corpus.mjs";
for (const lens of Object.keys(SOURCES)) {
  const c = await acquireCorpus(lens);
  if (!c.manifest.valid) { console.error(`${lens}: INVALID`, c.manifest.errors); process.exit(1); }
  saveCorpus(c);
  console.log(`${lens}: ${c.manifest.counts.pillars} pillars, ${c.manifest.counts.bps} recommendations`, JSON.stringify(c.manifest.counts.perPillar));
}
