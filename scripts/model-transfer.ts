#!/usr/bin/env node
/**
 * scripts/model-transfer.ts — `/model-transfer` CLI.
 *
 * Rebuilds the derived `.backend/<workspace>/` index from the canonical `.entiresystem/`
 * tree. Pure file IO — NO LLM CALLS, NO NETWORK. Idempotent.
 *
 *   pnpm -F @aria/middleware exec tsx ../../scripts/model-transfer.ts [workspace]
 */

import { ModelTransferService } from '../apps/middleware/src/services/modelTransfer.service';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..');
const workspace = process.argv[2] ?? 'default';

const r = new ModelTransferService(repoRoot).run(workspace);
console.log(`[model-transfer] workspace=${r.workspace}`);
console.log(`  files indexed       : ${r.filesIndexed}`);
console.log(`  skills indexed      : ${r.skillsIndexed}`);
console.log(`  experience entries  : ${r.experienceEntries}`);
console.log(`  output dir          : ${r.outputDir}`);
