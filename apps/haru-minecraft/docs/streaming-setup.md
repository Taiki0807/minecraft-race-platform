# マイクラ画面を配信に出す手順(手動セットアップ)

Mineflayer(ハルの「体」)には画面が無い。配信にマイクラの絵を出すには、
**別の本物のMinecraft Javaクライアントで観戦し、その画面をOBSでキャプチャする**
必要がある。これはコードでは解決できない、手作業のセットアップ。

## 事前準備(サーバー側、済み)

`helm/haru-server/values.yaml` に観戦用の2枠目(`maxPlayers: 2`)とOP権限
(観戦用アカウントは購入済みの本アカウント `Gonzales2` に設定)を用意した。反映するには:

```bash
helm upgrade haru-server minecraft-server-charts/minecraft \
  -f helm/haru-server/values.yaml \
  -n haru-minecraft
```

## 1. 観戦用クライアントを起動する

OBSを動かす予定のマシン(配信用PC)に、本物のMinecraft Java Edition クライアントを
用意し(`Gonzales2`のアカウントでログイン)、以下で接続する:

- サーバーアドレス: `haru-minecraft.tail5a3e5a.ts.net`(または対応するIPアドレス。
  `kubectl get svc -n haru-minecraft` で確認)

接続できたら、チャット欄で自分にスペクテイターモードを与える:

```
/gamemode spectator
```

(OPを持っているので自分自身に対して実行できる)

## 2. ハルを追いかける

スペクテイターモードでは自由に飛べる他、プレイヤーにテレポートできる:

```
/tp Haru
```

(`Haru` は `MC_USERNAME` の値。以後スペクテイターのまま視点を自由に動かして
ハルの近くをカメラのように映せる)

## 3. OBSでキャプチャ

OBSの「ソース」で「ウィンドウキャプチャ」または「ゲームキャプチャ」を追加し、
起動したMinecraftクライアントのウィンドウを選択する。これで配信画面にマイクラの
映像が乗る。

## 注意点

- 観戦用クライアントも`maxPlayers`の枠を1つ使う(今は2枠、Haru+観戦用でちょうど埋まる)。
  3人目を同時に入れたい場合は`values.yaml`の`maxPlayers`を増やす必要がある
- スペクテイターは当たり判定が無く、他プレイヤーからは基本的に見えない(観戦に適した
  モード)
- この手順は実機で試していない(この開発環境にはMinecraftクライアント・OBSが無いため)。
  接続自体(`online-mode=false`でのログイン、OPによる`/gamemode`実行)は設定上は
  動くはずだが、実際にOBSの画面に映るところまでは確認できていない
