# haru-minecraft

AI VTuber「ハル」が自動でMinecraftをプレイするための「頭(brain)」。
「ハル・マイクラ API仕様（連携契約）v1（2026-11-07）」に従う。

- **(A) bridge**: Creator Studio管理画面との連携 (`src/bridge/`)
- **(B) brain**: LLMによる判断ループ (`src/brain/`)
- **(D) memory**: SQLiteによるエピソード・スキル・教訓の保存 (`src/memory/`)

(C)のスキル実行(Mineflayerでの実際のゲーム操作)は**このプロセスには無い**。
別パッケージ `apps/haru-body` がMineflayer本体+定番プラグイン(pathfinder等)で
実行し、このプロセスは `src/body/client.ts`(`BodyClient`)経由でHTTPで呼ぶだけ。

## 配置場所: Proxmox(haru-bodyと同居)

このプロセス自体はGPUもMinecraft接続も直接使わない(全部HTTP越しの呼び出し)ため、
**`apps/haru-body` と同じProxmox VM(`haru_worker`)に同居させる**。GPUが必要な
LLM・embedding生成はWindows側のサービスにAPI越しで依頼し、Creator Studio(Mac側)
へは発話・イベントをAPI越しに送るだけ。

```
                         [Proxmox VM: haru_worker]
                         ┌───────────────────────┐
                         │ haru-minecraft(ここ)    │
                         │   │                    │
Mac: Creator Studio <----┼---┤ (A) 発話/イベント送信   │
                         │   │                    │
Windows: LLM/embedding <-┼---┤ (B) 判断・学習(GPU要求) │
  (FastAPI, GPU)         │   │                    │
                         │   ▼                    │
                         │ haru-body ---mineflayer-┼--> Minecraftサーバー
                         └───────────────────────┘
```

`BODY_BASE_URL` は既定で `http://127.0.0.1:3300`(同居前提のlocalhost)。
`STUDIO_BASE_URL` はMacの実アドレス(Tailscale等)を指す必要がある
(localhostでは届かない)。

## セットアップ

```bash
npm install
cp .env.example .env   # 値を記入する(Secretはここにのみ書く)。BODY_TOKEN は
                        # apps/haru-body 側の .env と同じ値にする
npm run dev
```

`apps/haru-body` が先に起動していないと `connect()` (起動時の `/tools` 取得)で失敗する。

## コマンド

- `npm run dev` — ウォッチモードで起動
- `npm run build` / `npm run typecheck` — 型チェック
- `npm test` — テスト実行

## デプロイ

`haru_worker`(Proxmox VM)上で `apps/haru-body` と一緒に常駐させる。手順・systemd
ユニットは `apps/haru-body/docs/proxmox-deploy.md` にまとめた(両パッケージ分)。

`Dockerfile` / `.dockerignore` はローカル開発・CIでのビルド確認用(race-controller
と構成を揃えるため用意した)。コンテナ/k3s経由でのデプロイは今のところ想定していない
(systemdでの直接実行。理由は同ドキュメント参照)。

~~`scripts/register-task.ps1`(Windowsタスクスケジューラ)~~ は、このプロセスをWindows
に置く前提で最初に作ったが、Proxmoxに置く方針に変わったため**使わない**(削除はせず
残してあるだけ)。

## マイクラの接続先(apps/haru-body側の話)

実際のMinecraft接続設定(`MC_HOST`等)はこのパッケージには無く、`apps/haru-body/.env`
にある。レース大会用とは**別の、ハル専用・常時稼働のPaperサーバー**(1.21.9, Tailscale
ホスト名 `haru-minecraft`)を使う。配信中のレースとハルの自動プレイが互いのリソース・
ワールドに影響しないための分離。構築用のIaCは `terraform/proxmox`(`haru_worker`)と
`helm/haru-server` に用意した(まだ適用していない、手順は各READMEを参照)。

## 未検証の範囲(重要)

このリポジトリ内の環境には実際のMinecraftサーバーもLLMも存在しないため、
以下は型・ロジックとしては実装済みだが**実機での動作は未確認**:

- `apps/haru-body` の各スキル実装(Mineflayer APIの呼び出し)・実際のサーバー接続
- `src/brain/adapters/homeLlm.ts` のJSON指示埋め込み方式が、実際のLLMで
  どの程度安定して正しいJSONを返せるか(仕様が明記する「Phase 1での検証が必要」な点)
- Creator Studio側の `/api/minecraft/events` エンドポイントとの実際の通信(Mac↔Proxmox間)

**実機で確認できたこと**: `apps/haru-body` と `apps/haru-minecraft` を実際に起動し、
互いのHTTP連携(`/tools` 取得・`/status`)が動くことはこの開発環境で確認済み
(Minecraft/LLM本体への接続のみ、実機が無いため未確認)。

型チェック・ユニットテスト(`npm run typecheck` / `npm test`)はいずれも通過している。
