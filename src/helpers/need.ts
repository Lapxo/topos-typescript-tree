import { createRequire as ask } from 'module';
Object.assign(globalThis, { require: ask(import.meta.url), __filename: import.meta.url, __dirname: import.meta.url });
