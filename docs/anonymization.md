# Native local anonymization

Anonymization is enabled separately for each Pura LLM / multiple-model setup. New and cloned setups start disabled; Ollama is excluded. Model files are downloaded once from a pinned Hugging Face revision with SHA-256 validation, and shared between setups.

The private CPU worker contains the pinned rizzo-pii neural detector, overlapping text chunking, and deterministic detectors. No upstream web server or dictionary files are used. The worker communicates over stdio and loads only local model files with Hugging Face telemetry/network access disabled.

## Data boundary

The gateway operates in Electron's main process on copies of prompts, history, tool results, tool argument string values and descriptive schema fields. Auxiliary completions, memory embeddings and SDK compaction use the same boundary. Original content is retained locally; response text, reasoning and tool arguments are restored before UI events and tool execution.

Archiveye retrieval follows the same MCP boundary. Searches receive the restored original query, and documents and retrieved top-k results remain readable in the tool output and local transcript. Before each LLM call, the gateway masks the selected snippets and their textual metadata (including document titles), together with the rest of the context. This also covers text embedded in MCP resource results and JSON results. Repeated values use the same chat-scoped references across the query and snippets; the answer is restored before display. Search indexing and stored documents are not modified. Enabling this setting protects the LLM payload; Archiveye itself still handles the original query and documents.

Matching lives in `userData/anonymization/matching.sqlite`. Each chat has a separate random token namespace; values use AES-256-GCM with chat/token binding, lookup keys use HMAC, and the encryption key is protected by Electron `safeStorage`. No plaintext-key fallback is used. Deleting a chat removes its matching; deleting encrypted rows still works if the key is unavailable.

Text files, PDFs with extractable text and text-only DOCX/PPTX/XLSX files are supported. Images, audio, scans, unreadable/encrypted/mixed-media documents, unsafe text chunks and low-confidence detections require a decision. There is no OCR or transcription. Personal values used as structured keys also require a decision, because protocol/schema keys remain stable. Response tool-argument keys are restored when the model uses a reference there. A decision applies only to unchanged content in the current chat run. New content or a new run requires a new decision.

Service failures offer proceed without anonymization, cancel and restart. Restart stays loading until it succeeds or fails. Complex inputs offer retry, exclude, cancel and proceed in clear text. Excluding all user content cancels the request. Unknown response references require a decision before releasing them; retry regenerates a protected answer, proceeding repeats that call in clear text, and exclusion prevents tool execution from that answer.

Built-in Computer Use vision requests obtain consent for each new screenshot/prompt through a loopback-only broker with a short-lived chat/tool capability. The capability is revoked on cancellation and never included in provider payloads or tool logs. Human waits do not trigger automatic MCP retries. Existing Pura realtime voice also requires a separate decision before connecting when protection is enabled; a clear-text exception covers only that voice connection until disconnect, with a visible voice badge. It does not disable text-chat protection.

Model detection is probabilistic. All supported categories are enabled, including amounts and dates, which can affect reasoning on hidden values. Arbitrary third-party tools and external service uploads retain their own permission boundaries. Calls without a reliable chat identity are refused when protection is enabled; background operations with a chat identity wait for a user decision when needed.

## Development and packaging

On macOS, model readiness does not imply that the matching database can be opened: Electron `safeStorage` also needs access to the system Keychain. If access is denied or the login keychain is unavailable, the gateway stops before inference and displays a secure-storage-specific decision. Unlock the login keychain in Keychain Access, grant access to Aiden if prompted, then fully quit and reopen Aiden. Electron 35's synchronous encryption implementation caches a failed key derivation for the process lifetime, so restarting just the Python worker cannot repair it. No unencrypted key fallback is created and existing encrypted matching is preserved. The native service smoke test covers download and inference; it does not validate system Keychain access, which must also be checked on the actual application runtime.

`npm run prepare:anonymization` builds the private PyInstaller worker using Python 3.11/3.12. It is included in `dev` and `build`, and skipped when unchanged. End users need no Python installation. Build each OS/architecture natively; release CI builds Apple Silicon, Intel and Windows workers before packaging. Intel macOS uses the last compatible PyTorch wheel with eager CPU attention. The upstream source commit and license are in `resources/anonymization/vendor/`.

Run `npm run test:anonymization:smoke -- --download` after preparing the worker to test the real download, integrity checks, offline inference, text extraction and restart. To reuse downloaded test weights, put them in `.cache/anonymization-model`, or set `AIDEN_PII_SMOKE_MODEL_PATH`, and omit `--download`. Tests use temporary app data and delete it afterward.

Ordinary Vitest tests cover matching encryption/isolation, setup persistence, streaming restoration, tool arguments, failure decisions, cancellation and vision capabilities. If better-sqlite3 is compiled for Electron, run Vitest with `ELECTRON_RUN_AS_NODE=1` using the Electron executable; CI rebuilds the native module for its Node test runner.
