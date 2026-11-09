import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../tgcloud/', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}
const files = walk(ROOT);

test('relative imports end in .js and resolve; only "sdk" is imported by name', () => {
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        assert.ok(spec.endsWith('.js'), `${file}: ${spec} needs .js`);
        assert.ok(existsSync(resolve(dirname(file), spec)), `${file}: ${spec} not found`);
      } else {
        assert.ok(spec === 'sdk' || spec.startsWith('sdk/'), `${file}: unexpected import ${spec}`);
      }
    }
  }
});

test('handlers are flat and no insecure randomness is used', () => {
  const handlerDir = join(ROOT, 'handlers');
  for (const name of readdirSync(handlerDir)) assert.ok(statSync(join(handlerDir, name)).isFile(), name);
  for (const file of files) assert.ok(!/Math\.random\s*\(/.test(readFileSync(file, 'utf8')), file);
});

test('only SDK-bound modules import the SDK (everything else stays testable)', () => {
  const allowed = new Set(['schema.js', 'db-store.js', 'tg-client.js']);
  for (const file of files) {
    const base = file.split(/[\\/]/).pop();
    if (allowed.has(base)) continue;
    assert.ok(!/from\s*['"]sdk/.test(readFileSync(file, 'utf8')), `${base} imports sdk`);
  }
});

test('no placeholder echo handler remains', () => {
  assert.ok(!readFileSync(join(ROOT, 'handlers/message.js'), 'utf8').includes('You said'));
});
