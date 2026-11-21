#!/usr/bin/env node
// Precomputes the document embeddings for the research library.
//
//   node scripts/research/embed-library.mjs [--model bge-small-en-v1.5] [--out path]
//
// Reads api/_lib/research/library.json, embeds every item with the
// vendored model through api/_lib/research/embed.ts (the same code the
// server uses for queries: same tokenizer, ONNX file, pooling and
// normalisation) and writes api/_lib/research/library-embeddings.json:
// one int8-quantised unit vector per item id plus a hash of the text it
// was built from, so a library rebuild without a re-embed is caught by
// the tests. Run it after build-library.mjs. Fully offline.
//
// Needs Node 22.18+ / 23.6+ (imports the .ts module via type stripping).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const research = join(root, 'api', '_lib', 'research');
const { DEFAULT_EMBEDDING_MODEL, DOC_TEXT_RECIPE, documentText, encodeVector, getEmbedder, textHash } = await import(
  join(research, 'embed.ts')
);

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const model = arg('model') ?? DEFAULT_EMBEDDING_MODEL;
const out = arg('out') ?? join(research, 'library-embeddings.json');

const lib = JSON.parse(readFileSync(join(research, 'library.json'), 'utf8'));
const t0 = Date.now();
const embedder = await getEmbedder(model);
const texts = lib.items.map(documentText);
const vectors = await embedder.embed(texts, 'document');

const items = {};
lib.items.forEach((it, i) => {
  items[it.id] = { h: textHash(texts[i]), ...encodeVector(vectors[i]) };
});
const file = {
  model,
  modelId: embedder.spec.id,
  dims: embedder.spec.dims,
  recipe: DOC_TEXT_RECIPE,
  generatedAt: new Date().toISOString(),
  items,
};
writeFileSync(out, JSON.stringify(file) + '\n');
console.log(`Embedded ${lib.items.length} items with ${embedder.spec.id} in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
