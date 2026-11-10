// يجمّع web/app.js من أجزاء web/_build بالترتيب: الرأس ثم الأيقونات ثم المنطق
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../web/', import.meta.url);
const parts = ['_build/app.head.js', '_build/app.icons.js', '_build/app.main.js'];
const out = parts.map(p => readFileSync(new URL(p, root), 'utf8').trimEnd()).join('\n\n') + '\n';
writeFileSync(new URL('app.js', root), out);
console.log('web/app.js', out.length, 'bytes');
