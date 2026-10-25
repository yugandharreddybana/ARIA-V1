import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

const candidates = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env.local'),
  path.resolve(process.cwd(), '../../.env'),
];

for (const file of candidates) {
  if (fs.existsSync(file)) dotenv.config({ path: file });
}
