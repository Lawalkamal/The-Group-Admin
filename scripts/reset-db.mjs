#!/usr/bin/env node
/** Deletes the local development database so the next run starts clean. */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const target = join(process.cwd(), '.data');
await rm(target, { recursive: true, force: true });
console.log(`Removed ${target}. The next \`npm run dev\` starts with an empty database.`);
