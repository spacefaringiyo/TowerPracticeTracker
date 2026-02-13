import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcPath = path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
const destDir = path.resolve(__dirname, 'public');
const destPath = path.join(destDir, 'sql-wasm.wasm');

console.log('--- WASM COPY SCRIPT (ESM) ---');
console.log('Source:', srcPath);
console.log('Dest:', destPath);

if (!fs.existsSync(srcPath)) {
    console.error('ERROR: Source file not found at:', srcPath);
    process.exit(1);
}

if (!fs.existsSync(destDir)) {
    console.log('Creating public directory...');
    fs.mkdirSync(destDir, { recursive: true });
}

console.log('Copying file...');
fs.copyFileSync(srcPath, destPath);
console.log('SUCCESS! File copied.');
