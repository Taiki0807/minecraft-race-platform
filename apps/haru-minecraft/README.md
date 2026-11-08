# haru-minecraft

AI VTuber「ハル」が自動でMinecraftをプレイするための実装。
「ハル・マイクラ API仕様（連携契約）v1（2026-11-07）」+ 2026-11-09の`/chat`仕様改定
(ネイティブtools対応)に従う。単一プロセスで以下を全部持つ:

- **(A) bridge**: Creator Studio管理画面との連携 (`src/bridge/`)
- **(B) brain**: LLMによる判断ループ (`src/brain/`)
- **(C) skills**: Mineflayer本体+定番プラグイン(pathfinder等)での実際のゲーム操作 (`src/skills/`, `src/bot/`)
- **(D) memory**: SQLiteによるエピソード・スキル・教訓の保存 (`src/memory/`)

## 配置場所: Proxmox(`haru_worker` VM)

Mineflayerでマイクラに直接接続するため、マイクラサーバーと同じクラスタに置く。
外部との通信はAPI越し: GPUが必要なLLM・embeddingはWindows側の`/chat`に、
発話・イベント通知はMac側のCreator Studioに、それぞれHTTPで送るだけ。

```
Mac: Creator Studio <--HTTP-- [Proxmox VM: haru_worker]
                                 haru-minecraft(ここ、1プロセス)
                                   - Mineflayer本体でMinecraftサーバーへ直接接続
                                   - 判断・記憶・bridgeも同プロセス内
                                 --HTTP--> Windows: chat.hosokawa-lab.dev/chat (LLM)
```

`STUDIO_BASE_URL`はMacの実アドレス(Tailscale)を指す必要がある(localhostでは届かない)。

## セットアップ

```bash
npm install
cp .env.example .env   # 値を記入する(Secretはここにのみ書く)
npm run dev
```

## LLM: `LLM_PROVIDER=haru-chat`(既定、本命)

2026-11-09に、既存の`/chat`(`chat.hosokawa-lab.dev`)自体がネイティブの
`tools`/`tool_calls`に対応する形で改定された(新しいFastAPIサービスは不要になった)。
実装は`src/brain/adapters/haruChat.ts`。`LLM_PROVIDER=home-llm`(改定前のJSON埋め込み
互換モード)は経緯として残しているが、もう使う必要はない。

## コマンド

- `npm run dev` — ウォッチモードで起動
- `npm run build` / `npm run typecheck` — 型チェック
- `npm test` — テスト実行

## デプロイ

`haru_worker`(Proxmox VM)上でsystemdサービスとして常駐させる。手順は
`docs/proxmox-deploy.md`。`Dockerfile`/`.dockerignore`はローカル開発・CIでの
ビルド確認用(race-controllerと構成を揃えるため)で、本番の配置先ではない。

## マイクラの接続先

レース大会用とは**別の、ハル専用・常時稼働のPaperサーバー**(1.21.9, Tailscale
ホスト名 `haru-minecraft`)を使う。構築用IaCは`terraform/proxmox`(`haru_worker`)と
`helm/haru-server`。配信画面にマイクラの映像を出す手順(別の観戦用クライアント+OBS)は
`docs/streaming-setup.md`。

## 実機で確認できたこと(2026-11-08〜09、Proxmox実機で検証済み)

- Mineflayerでの実際のMinecraftサーバーへの接続・spawn・死亡後の自動リスポーン
- Creator Studioへの発話・イベント送信、および実際のTTS読み上げ
- Creator StudioからのUI操作(`/minecraft`ページの開始/停止/一時停止/再開)
- セッション終了時の振り返り(エピソードからの教訓抽出)
- 旧home-llm互換モードでの基本動作(ただしJSON崩れ・無行動が多かった)

## 未検証の範囲

- 新しい`haru-chat`プロバイダ(ネイティブtool-calling)自体はまだ実機未確認
  (仕様書のテスト結果はAIサーバー上での手動シミュレーションであり、本物のMineflayer
  bot越しではまだ試されていない)
- `docs/streaming-setup.md`の観戦クライアント+OBSキャプチャの手順全体

型チェック・ユニットテスト(`npm run typecheck` / `npm test`)はいずれも通過している。
