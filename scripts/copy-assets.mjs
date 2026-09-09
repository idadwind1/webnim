import {copyFile} from 'node:fs/promises';
await copyFile(new URL('../src/react/style.css',import.meta.url),new URL('../dist/react/style.css',import.meta.url));
