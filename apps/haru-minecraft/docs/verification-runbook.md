# 動作確認手順(段階的)

目的: 全部を一度に繋ぐ前に、依存の少ない順に1段ずつ確認する。FastAPI(GPU推論)が
まだ無くても、段階Aで確認できる所は確認できる。

`apps/haru-minecraft` は単一プロセス(Mineflayer本体も内包)なので、確認対象は
このプロセス1つ + 外部3箇所(Minecraftサーバー・LLM・Creator Studio)。

依存関係の目安:

```
段階A (プロセス単体の起動)     ← 何も繋がっていなくても起動自体はできる
段階B (Minecraft接続)          ← サーバーがあれば確認できる。LLM/Creator Studio不要
段階C (LLM接続)                ← 既存のhome-llmでまず試せる。FastAPI待たなくてよい
段階D (Creator Studio連携)     ← 独立して確認できる
段階E (通し確認)               ← A〜Dが全部繋がってから
```

---

## 事前準備

```bash
cd apps/haru-minecraft
npm install
cp .env.example .env
```

接続先のMinecraftサーバーをどうするか選ぶ:

- **(推奨・最速)** まだ専用サーバー(`terraform/proxmox`の`haru_worker`)を`apply`していないなら、
  一旦は手元やLAN内で動くPaperサーバー(1.21.9、`online-mode=false`)を何でもいいので1つ立てて、
  `.env` の `MC_HOST`/`MC_PORT` をそれに向ける。専用サーバーの構築確認は後回しでよい。
- 専用サーバーを先に`apply`済みなら、そのまま `MC_HOST=haru-minecraft` のデフォルトで進める。

---

## 段階A: プロセスが起動するか

```bash
npm run dev
```

起動ログに `control server listening on :3200` が出るか確認する(Minecraftサーバーが
まだ無くても、接続エラーがログに出るだけでプロセス自体は起動し続ける設計)。

```bash
curl http://127.0.0.1:3200/status
# => {"online":true,"state":"idle",...}
```

---

## 段階B: Minecraft接続が実際に動くか

`.env` の `MC_HOST`/`MC_PORT` が有効なサーバーを指している状態で `npm run dev` し、
Minecraft側の画面でHaru(botのユーザー名)がサーバーに入ってくるか確認する。

見えなければサーバーアドレス・`online-mode`設定・ポート開放を確認する。

```bash
# セッション開始(LLM未接続でも落ちない設計のはず。最初のLLM呼び出しでエラーに
# なり、ログに記録されて続行することを確認する)
curl -X POST http://127.0.0.1:3200/control \
  -H "Content-Type: application/json" \
  -d '{"command":"start","session_note":"動作確認"}'

curl -X POST http://127.0.0.1:3200/control \
  -H "Content-Type: application/json" \
  -d '{"command":"stop"}'
```

`logs/<session_id>.jsonl` が作られ、`decision`または`error`系のログが残っていれば
ここまでの配線は正しい(LLM自体の応答精度はこの段階では見ない)。

---

## 段階C: LLM接続確認

**まずFastAPIを待たず、既存のhome-llmで配線だけ確認する:**

```bash
# .env
LLM_PROVIDER=home-llm
LOCAL_LLM_URL=https://chat.hosokawa-lab.dev
LOCAL_LLM_TOKEN=<既存のトークン>
```

段階Bと同じく `/control start` → `logs/*.jsonl` の `decision` ログを見る。
`tool_calls` が空配列でも構わない(home-llmはJSON指示埋め込み方式なので、精度は
あまり期待しない)。**ここで見たいのは「クラッシュせず1周回るか」だけ**。

**FastAPIが準備できたら:**

```bash
# .env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=<FastAPIサービスのURL>
OLLAMA_MODEL=<モデル名>
```

同じ手順で`/control start`し、`decision`ログの`tool_calls`に実際の形式(`{name, args}`)が
入っているか確認する。ここで初めて「ハルが自分でツールを選べているか」を見ることになる。

---

## 段階D: Creator Studio連携確認(独立して確認できる)

```bash
cd ../../../local-ai-creator-studio   # パスは実際の配置に合わせる
npm run dev
```

`.env.local` に `MINECRAFT_BRIDGE_TOKEN` を設定(haru-minecraft側の`STUDIO_TOKEN`と
同じ値)。

```bash
curl -X POST http://127.0.0.1:3100/api/minecraft/events \
  -H "Authorization: Bearer <MINECRAFT_BRIDGE_TOKENと同じ値>" \
  -H "Content-Type: application/json" \
  -d '{
    "v": 1, "id": "test-1", "ts": "2026-11-08T12:00:00+09:00",
    "session_id": "test", "type": "say",
    "payload": { "text": "テスト発話", "kind": "idle" }
  }'
```

`{"ok":true}` が返り、Creator Studio管理画面のログに「ハル(マイクラ): テスト発話」が
出れば確認完了。

---

## 段階E: 通し確認

A〜Dが個別に動くことを確認したら、Minecraftサーバー・LLMサービス・Creator Studioが
同時に動いている状態で `/control start` し、`logs/*.jsonl` とCreator Studioの管理画面
ログを両方見ながら、実際にハルが考えて喋って動くかを見る。

おかしい動きが出たら、まず`logs/*.jsonl`の`tool_result`の`message`を見るのが一番早い
(各スキルの失敗理由がそのまま日本語/英語で書かれている)。
