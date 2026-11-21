// Sentence embeddings for the research library, computed ON OUR SERVER.
//
// A user's health question never leaves our function: the query is
// tokenised with @huggingface/tokenizers (pure JS, the tokenizer that
// transformers.js uses) and run through a small quantized open-source
// model (Xenova/all-MiniLM-L6-v2, int8 ONNX, 384 dims, 23 MB) on
// onnxruntime-web's single-thread WASM backend. Model files are vendored
// in ./model/ and the WASM comes from node_modules; nothing is downloaded
// at request time and no third-party API is called.
//
// Why not the transformers.js pipeline itself: it statically imports
// onnxruntime-node, whose npm package ships binaries for every platform
// (~300 MB unpacked) and would push the Vercel function over its 250 MB
// limit. The two pieces used here are what that pipeline runs anyway
// (same tokenizer.json, same ONNX file, same pooling); vectors were
// checked identical (cosine 1.000000) to transformers.js
// pipeline('feature-extraction', ..., { dtype: 'q8' }).
//
// Model choice: all-MiniLM-L6-v2 beat bge-small-en-v1.5 on the patient-
// question eval (search-eval.ts; semantic-only hit@3 0.91 vs 0.71; best
// hybrid hit@3/hit@6 on the tuning grid 0.97/1.00 vs 0.88/0.97), and is
// smaller (23 vs 34 MB) and
// ~6x faster per query. bge stays listed here for future comparisons; its
// files are not vendored.
//
// The document embeddings in library-embeddings.json are built by
// scripts/research/embed-library.mjs with this same module, so query and
// document vectors always come from the same model and code path.
//
// Keep this file free of TS-only runtime syntax (enums, parameter
// properties): the build script imports it with Node's type stripping.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface EmbeddingModelSpec {
  /** Hugging Face id, for the record. */
  id: string;
  /** Folder name under api/_lib/research/model/. */
  dir: string;
  pooling: 'cls' | 'mean';
  /** Prepended to queries only (asymmetric retrieval models). */
  queryPrefix: string;
  dims: number;
  maxTokens: number;
}

export const EMBEDDING_MODELS: Record<string, EmbeddingModelSpec> = {
  'bge-small-en-v1.5': {
    id: 'Xenova/bge-small-en-v1.5',
    dir: 'bge-small-en-v1.5',
    pooling: 'cls',
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
    dims: 384,
    maxTokens: 512,
  },
  'all-MiniLM-L6-v2': {
    id: 'Xenova/all-MiniLM-L6-v2',
    dir: 'all-MiniLM-L6-v2',
    pooling: 'mean',
    queryPrefix: '',
    dims: 384,
    maxTokens: 256,
  },
};

/** The model the app uses (query side and library-embeddings.json). */
export const DEFAULT_EMBEDDING_MODEL = 'all-MiniLM-L6-v2';

/** Version of the document text recipe below; bump it to force a re-embed. */
export const DOC_TEXT_RECIPE = 'v1:title+summary+keyPoints+tags';

/** The text a library item is embedded from. */
export function documentText(item: { title: string; summary: string; keyPoints: string[]; tags: string[] }): string {
  return [item.title, item.summary, item.keyPoints.join(' '), item.tags.length ? `Tags: ${item.tags.join(', ')}.` : '']
    .filter(Boolean)
    .join('\n');
}

/** Small stable hash (FNV-1a, hex) so stale embeddings can be detected. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Model files ───────────────────────────────────────────────────

function modelRoot(): string {
  const candidates = [
    (() => {
      try {
        return dirname(fileURLToPath(new URL('./model/README.txt', import.meta.url)));
      } catch {
        return '';
      }
    })(),
    join(process.cwd(), 'api', '_lib', 'research', 'model'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      readFileSync(join(dir, 'README.txt'));
      return dir;
    } catch {
      /* try the next one */
    }
  }
  return candidates[candidates.length - 1];
}

/** Path of a file inside the vendored model folder. */
export function modelFile(spec: EmbeddingModelSpec, file: string): string {
  return join(modelRoot(), spec.dir, file);
}

function ortDistDir(): string {
  const req = createRequire(import.meta.url);
  try {
    return dirname(req.resolve('onnxruntime-web'));
  } catch {
    return join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist');
  }
}

// ── Embedder ──────────────────────────────────────────────────────

interface TokenizerLike {
  encode(text: string, options?: { return_token_type_ids?: boolean }): {
    ids: number[];
    attention_mask: number[];
    token_type_ids?: number[];
  };
}

/* Minimal structural types for the parts of onnxruntime-web used here. */
interface OrtTensor {
  data: unknown;
  dims: readonly number[];
}
interface OrtSession {
  inputNames: readonly string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}
interface OrtModule {
  env: { wasm: Record<string, unknown>; logLevel?: string };
  Tensor: new (type: 'int64', data: BigInt64Array, dims: number[]) => OrtTensor;
  InferenceSession: { create(model: Uint8Array, opts?: Record<string, unknown>): Promise<OrtSession> };
}

export interface Embedder {
  spec: EmbeddingModelSpec;
  /** Unit-length vectors, one per text. */
  embed(texts: string[], kind: 'query' | 'document'): Promise<Float32Array[]>;
}

async function createEmbedder(spec: EmbeddingModelSpec): Promise<Embedder> {
  const { Tokenizer } = (await import('@huggingface/tokenizers')) as unknown as {
    Tokenizer: new (json: object, config: object) => TokenizerLike;
  };
  const ort = (await import('onnxruntime-web')) as unknown as OrtModule;

  const tokenizer = new Tokenizer(
    JSON.parse(readFileSync(modelFile(spec, 'tokenizer.json'), 'utf8')),
    JSON.parse(readFileSync(modelFile(spec, 'tokenizer_config.json'), 'utf8')),
  );

  // Single-threaded WASM: no worker threads inside a serverless function.
  const dist = ortDistDir();
  const wasmFile = join(dist, 'ort-wasm-simd-threaded.wasm');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = {
    mjs: pathToFileURL(join(dist, 'ort-wasm-simd-threaded.mjs')).href,
    wasm: pathToFileURL(wasmFile).href,
  };
  ort.env.wasm.wasmBinary = new Uint8Array(readFileSync(wasmFile));
  ort.env.logLevel = 'error';

  const session = await ort.InferenceSession.create(
    new Uint8Array(readFileSync(modelFile(spec, 'onnx/model_quantized.onnx'))),
    { executionProviders: ['wasm'], graphOptimizationLevel: 'all' },
  );

  async function embedBatch(texts: string[]): Promise<Float32Array[]> {
    const enc = texts.map((t) => {
      const e = tokenizer.encode(t, { return_token_type_ids: true });
      let ids = e.ids;
      let mask = e.attention_mask;
      if (ids.length > spec.maxTokens) {
        // Keep [CLS] ... and the final [SEP].
        ids = [...ids.slice(0, spec.maxTokens - 1), ids[ids.length - 1]];
        mask = mask.slice(0, spec.maxTokens);
      }
      return { ids, mask };
    });
    const len = Math.max(...enc.map((e) => e.ids.length));
    const b = enc.length;
    const ids = new BigInt64Array(b * len);
    const mask = new BigInt64Array(b * len);
    const types = new BigInt64Array(b * len);
    enc.forEach((e, i) => {
      e.ids.forEach((id, j) => {
        ids[i * len + j] = BigInt(id);
        mask[i * len + j] = BigInt(e.mask[j] ?? 1);
      });
    });
    const feeds: Record<string, OrtTensor> = {
      input_ids: new ort.Tensor('int64', ids, [b, len]),
      attention_mask: new ort.Tensor('int64', mask, [b, len]),
    };
    if (session.inputNames.includes('token_type_ids')) feeds.token_type_ids = new ort.Tensor('int64', types, [b, len]);
    const out = await session.run(feeds);
    const hidden = (out.last_hidden_state ?? Object.values(out)[0]) as OrtTensor;
    const data = hidden.data as Float32Array;
    const dims = hidden.dims[2];
    return enc.map((e, i) => {
      const v = new Float32Array(dims);
      if (spec.pooling === 'cls') {
        v.set(data.subarray(i * len * dims, i * len * dims + dims));
      } else {
        let n = 0;
        for (let j = 0; j < e.ids.length; j++) {
          if (!e.mask[j]) continue;
          n++;
          const off = (i * len + j) * dims;
          for (let k = 0; k < dims; k++) v[k] += data[off + k];
        }
        for (let k = 0; k < dims; k++) v[k] /= n || 1;
      }
      return normalize(v);
    });
  }

  return {
    spec,
    async embed(texts, kind) {
      const prepared = kind === 'query' ? texts.map((t) => spec.queryPrefix + t) : texts;
      // One text per run: no padding, so a vector never depends on what it
      // was batched with (the int8 model quantises activations per batch).
      const out: Float32Array[] = [];
      for (const t of prepared) out.push(...(await embedBatch([t])));
      return out;
    },
  };
}

export function normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** Cosine of two unit vectors (= dot product). */
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

// Loaded once per server instance and shared by every request. A failed
// load is forgotten so the next request can try again.
const embedders = new Map<string, Promise<Embedder>>();

export function getEmbedder(model: string = DEFAULT_EMBEDDING_MODEL): Promise<Embedder> {
  let p = embedders.get(model);
  if (!p) {
    const spec = EMBEDDING_MODELS[model];
    if (!spec) return Promise.reject(new Error(`Unknown embedding model ${model}`));
    p = createEmbedder(spec);
    p.catch(() => embedders.delete(model));
    embedders.set(model, p);
  }
  return p;
}

/** Test hook: forget loaded models. */
export function resetEmbedders(): void {
  embedders.clear();
}

// ── Stored document embeddings ────────────────────────────────────

export interface EmbeddingsFile {
  model: string;
  modelId: string;
  dims: number;
  recipe: string;
  generatedAt: string;
  /** int8 vector (base64) and its scale; value = int8 * scale. */
  items: Record<string, { h: string; s: number; v: string }>;
}

/** int8-quantises a unit vector (per-vector scale). */
export function encodeVector(v: Float32Array): { s: number; v: string } {
  let max = 0;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]));
  const scale = max / 127 || 1;
  const q = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(v[i] / scale)));
  return { s: Number(scale.toPrecision(6)), v: Buffer.from(q.buffer).toString('base64') };
}

export function decodeVector(e: { s: number; v: string }): Float32Array {
  const buf = Buffer.from(e.v, 'base64');
  const q = new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] * e.s;
  return normalize(out);
}

let cachedEmbeddings: { file: EmbeddingsFile; vectors: Map<string, Float32Array> } | null = null;

/** library-embeddings.json decoded (lazy, cached); null if missing. */
export function getDocEmbeddings(): { file: EmbeddingsFile; vectors: Map<string, Float32Array> } | null {
  if (cachedEmbeddings) return cachedEmbeddings;
  let raw: string | null = null;
  for (const read of [
    () => readFileSync(new URL('./library-embeddings.json', import.meta.url), 'utf8'),
    () => readFileSync(join(process.cwd(), 'api', '_lib', 'research', 'library-embeddings.json'), 'utf8'),
  ]) {
    try {
      raw = read();
      break;
    } catch {
      /* next */
    }
  }
  if (!raw) return null;
  const file = JSON.parse(raw) as EmbeddingsFile;
  const vectors = new Map(Object.entries(file.items).map(([id, e]) => [id, decodeVector(e)]));
  cachedEmbeddings = { file, vectors };
  return cachedEmbeddings;
}
