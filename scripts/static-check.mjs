import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const failures = [];
const localFiles = new Set();

function addFiles(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) addFiles(path);
        else localFiles.add(relative(root, path).replaceAll('\\', '/'));
    }
}

function fail(message) {
    failures.push(message);
    console.error(`FAIL: ${message}`);
}

function checkJson(file) {
    try {
        JSON.parse(readFileSync(join(root, file), 'utf8'));
        console.log(`OK: ${file} is valid JSON`);
    } catch (error) {
        fail(`${file}: ${error.message}`);
    }
}

function checkLocalReferences(file, patterns) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            const raw = match[1].split('?')[0].split('#')[0];
            if (!raw || ['/', 'http://', 'https://', 'data:', 'mailto:'].some(prefix => raw.startsWith(prefix))) continue;
            const candidate = resolve(root, raw.startsWith('.') ? join(file, '..', raw) : raw);
            if (!existsSync(candidate)) fail(`${file}: missing local reference ${raw}`);
        }
    }
}

addFiles(root);
checkJson('database.rules.json');
checkJson('manifest.json');

checkLocalReferences('index.html', [/(?:src|href)=["']([^"']+)["']/g]);
checkLocalReferences('manifest.json', [/(?:"(?:start_url|scope|src)"\s*:\s*")([^"]+)/g]);
checkLocalReferences('sw.js', [/(?:['"])(\.\/?[^'"]+)(?:['"])/g]);

for (const file of [...localFiles].filter(file => file.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
    if (result.status !== 0) fail(`${file}: ${result.stderr.trim()}`);
}

if (failures.length) {
    console.error(`\n${failures.length} validation error(s) found.`);
    process.exit(1);
}

console.log('\nStatic validation passed.');
