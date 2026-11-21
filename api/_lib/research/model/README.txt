Vendored sentence-embedding model for the research library search
(api/_lib/research/embed.ts). Bundled so that user questions are embedded
on our own server: nothing is downloaded from the Hugging Face hub at
request time and no third-party API sees the query.

all-MiniLM-L6-v2/    Xenova/all-MiniLM-L6-v2 (ONNX export of
                     sentence-transformers/all-MiniLM-L6-v2), licence Apache-2.0.
                     Used by the app (DEFAULT_EMBEDDING_MODEL).

Files: config.json, tokenizer.json, tokenizer_config.json,
special_tokens_map.json, onnx/model_quantized.onnx (int8, 23 MB), fetched from
https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/<file>.

After changing the model or library.json, rebuild the document vectors:
  node scripts/research/embed-library.mjs
(Node 22.18+ / 23.6+: the script imports embed.ts via type stripping.)
