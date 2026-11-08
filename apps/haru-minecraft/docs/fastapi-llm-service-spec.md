# GPU推論サービス 依頼仕様書(FastAPI実装向け)

対象: ハル・マイクラ(AI VTuberの自動マイクラプレイ)の「頭」(`apps/haru-minecraft`)が
利用するGPU推論サービス。チャット補完(ツール呼び出し)とembedding生成の2本を
FastAPI(等)で実装してほしい。

このドキュメントに書かれた入出力形式のとおりに実装すれば、受け側(`apps/haru-minecraft`)
は**コード変更なしでURLを向けるだけ**で接続できる(既存のOpenAI互換/Ollama互換の
クライアント実装を再利用しているため)。形式を変えたい場合は事前に相談してほしい。

## 1. 提供してほしいエンドポイント

### 1-1. チャット補完(ツール呼び出し対応) — 必須

```
POST /v1/chat/completions
```

OpenAI Chat Completions API のツール呼び出し(Function Calling)互換。

**リクエスト例:**
```json
{
  "model": "任意の文字列(現状は無視してよい)",
  "messages": [
    { "role": "system", "content": "システムプロンプト(短い、数百文字程度)" },
    { "role": "user", "content": "状態をJSON文字列にしたもの" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "move_to",
        "description": "指定座標の近くまで歩いて移動する。",
        "parameters": {
          "type": "object",
          "properties": { "x": {"type": "number"}, "y": {"type": "number"}, "z": {"type": "number"} },
          "required": ["x", "y", "z"]
        }
      }
    }
  ],
  "tool_choice": "auto",
  "max_tokens": 512
}
```

**レスポンス例(ツールを呼ぶ場合):**
```json
{
  "choices": [
    {
      "message": {
        "content": null,
        "tool_calls": [
          {
            "function": {
              "name": "move_to",
              "arguments": "{\"x\":10,\"y\":64,\"z\":-3}"
            }
          }
        ]
      }
    }
  ],
  "usage": { "prompt_tokens": 123, "completion_tokens": 45 }
}
```

- `tool_calls[].function.arguments` は **JSON文字列**(オブジェクトではない)。これが
  受け側のパース実装(`JSON.parse`)が期待する形。
- ツールを呼ばない場合は `tool_calls` を省略(または空配列)にし、`content` に
  テキストを入れる。
- `usage` は無くても動くが、あれば使う(コスト/速度の観測用)。

**モデル選定について**: ベースモデルは既存のもので固定(変更不可)、アダプター
(LoRA等)側の変更で対応する前提と確認済み。そのため「ツール呼び出し精度が不十分」な
場合の対策は、ベースモデルの大型化ではなく、**このドキュメント末尾(付録)の
ツール定義一覧を学習・評価データの対象として、ツール呼び出し専用のアダプターを
用意すること**になる見込み。付録のJSON Schemaがそのまま評価用の正解形式として使える。

vLLMを使うなら`--enable-auto-tool-choice --tool-call-parser hermes`(モデル・
アダプターの対応状況に応じて変更)でこのエンドポイントがそのまま立つ可能性があるので、
自前実装より先にそちらを確認した方が早いかもしれない。

**重要な性能要件**: 1回の判断で**60秒以内**に応答すること(タイムアウト設定値、
`LLM_TIMEOUT_MS`)。以前「23,000字の巨大プロンプト→45秒応答」で苦しんだ事例があり、
受け側のプロンプトは数百文字程度に圧縮済み。巨大なプロンプトを前提にした設計は不要。

### 1-2. Embedding生成 — RAG(学習済み行動の検索)用、あると望ましい

```
POST /api/embeddings
```

Ollama の `/api/embeddings` 互換。

**リクエスト:**
```json
{ "model": "任意のモデル名", "prompt": "collect oak_log {\"item\":\"oak_log\"}" }
```

**レスポンス:**
```json
{ "embedding": [0.012, -0.034, 0.21, ...] }
```

- 次元数は何でもよい(cosine類似度の計算側は次元数を前提にしていない)。
- **これが無くても全体は動く**(受け側に決定論的なハッシュベースの代用embeddingが
  組み込んであり、接続できなければそちらに自動フォールバックする)。ただし代用品は
  意味的な類似度を持たないため、学習したスキルの検索精度が出ない。優先度は1-1より低い。

## 2. 認証

`Authorization: Bearer <token>` ヘッダーで検証してほしい。トークンの値は別途共有する
(このドキュメントには書かない)。未認証だった場合は `401` を返すこと。

## 3. 受け側の設定(参考)

サービスが立ったら、`apps/haru-minecraft/.env` 側で以下を設定する(担当者側の作業ではない、
参考情報):

```
LLM_PROVIDER=ollama              # 名前はollamaだが実体はOpenAI互換なら何でもよい
OLLAMA_BASE_URL=<このサービスのURL>
OLLAMA_MODEL=<実際のモデル名>
LLM_TIMEOUT_MS=60000

EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=<embeddingモデル名>
```

## 4. 動作確認方法(受け側は未検証なので、実装側で一度動作確認してほしい点)

```bash
curl -X POST http://<host>:<port>/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "test",
    "messages": [{"role":"system","content":"テスト"},{"role":"user","content":"状態: HP20"}],
    "tools": [{"type":"function","function":{"name":"wait","description":"待つ","parameters":{"type":"object","properties":{"seconds":{"type":"number"}}}}}],
    "tool_choice": "auto"
  }'
```

`tool_calls` が正しい形式(JSON文字列のargumentsを含む)で返ってくることを確認してほしい。

## 5. 未確定・要相談事項

- モデル名・embeddingモデルの最終選定(受け側は何を使っても動く設計)
- 同時実行数の制限(仕様上、ハルのセッションは常に1つだけなので基本は同時1リクエストのみ)
- GPUリソースをTTS(Irodori)と共有する場合の優先度制御(必要なら別途相談)
