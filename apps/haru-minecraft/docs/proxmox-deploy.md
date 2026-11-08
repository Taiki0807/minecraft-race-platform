# Proxmox(haru_worker)への配置手順

`apps/haru-minecraft` は単一プロセスで (A)(B)(C)(D) を全部持つ(Mineflayer本体も
このプロセス内で直接呼ぶ。別プロセス・HTTP API化はしていない)。
`terraform/proxmox` の `haru_worker`(VM 109)上に、この1プロセスだけを常駐させる。

外部との通信はすべてAPI越し:

- GPUが必要なLLM・embedding → Windows側のFastAPIサービス(`docs/fastapi-llm-service-spec.md`)
- 発話・イベント通知 → Mac側のCreator Studio

Minecraft操作自体はこのプロセス内でMineflayerが直接行うため、追加のAPI層は無い。

## 0. VM自体がまだ無い場合

`terraform/proxmox` の `haru_worker` リソースをまだ`apply`していなければ先に行う
(手順・安全確認は `terraform/proxmox/README.md` の「Haru Minecraft worker」節)。

```bash
cd terraform/proxmox
terraform plan -out=haru-worker.tfplan
terraform apply haru-worker.tfplan   # haru_vm_started=false でまず作成のみ
```

起動確認後、`terraform.tfvars` で `haru_vm_started = true` にして再apply。
その後VMにSSHし、k3sエージェントを導入してノードラベル `workload=haru-minecraft`
を付ける(Minecraftサーバー本体を`helm/haru-server`でスケジュールするため)。
これは`haru-minecraft`プロセス自体の必須要件ではないが、同じVM上で実際に
Minecraftサーバーを動かすために必要。

## 1. 前提

```bash
ssh ubuntu@192.168.100.9   # terraform/proxmox/README.md 参照
node -v                     # 22以上。無ければ Node.js を導入する
```

## 2. コードを配置・依存インストール

```bash
git clone <このリポジトリ> ~/minecraft-race-platform
cd ~/minecraft-race-platform/apps/haru-minecraft
npm install
cp .env.example .env
```

`.env` で設定が必要な主な項目:

- `MC_HOST`/`MC_PORT`/`MC_USERNAME`/`MC_AUTH` — このVM上の、または到達可能な
  Minecraftサーバー(`helm/haru-server`で構築したもの)
- `STUDIO_BASE_URL` — Mac(Creator Studio)の実アドレス
- `LLM_PROVIDER=haru-chat`(既定) + `LOCAL_LLM_URL`/`LOCAL_LLM_TOKEN` — Windows側の`/chat`

## 3. 動作確認(systemd登録前に一度手動で)

```bash
npm run dev
curl http://127.0.0.1:3200/status
```

`apps/haru-minecraft/docs/verification-runbook.md` の段階的な確認手順も参照。

## 4. systemdサービスとして常駐化

```bash
sudo cp scripts/haru-minecraft.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now haru-minecraft
systemctl status haru-minecraft
journalctl -u haru-minecraft -f
```

ユニットファイル内のパス(`WorkingDirectory`/`EnvironmentFile`)はクローン先に
合わせて書き換えること。

## 未検証の範囲

この手順はコード・設定から想定したものであり、実際にProxmox VM上で実行して
確認したものではない(この開発環境にはProxmox/systemdへのアクセスが無い)。
`npm run dev` でのプロセス起動自体(HTTP API応答まで)はこの開発環境で実機確認済み
(Minecraft/LLM/Creator Studio本体への接続のみ、実機が無いため未確認)。
