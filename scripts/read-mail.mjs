import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
const folder = path.join(process.cwd(), '.local', 'mail');
if (!existsSync(folder)) console.log('Локальный почтовый ящик пуст.');
else
  for (const name of readdirSync(folder).sort().slice(-10))
    console.log(readFileSync(path.join(folder, name), 'utf8'));
