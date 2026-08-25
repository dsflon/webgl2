# webgl2

WebGL2 でリアルタイムのグラフィック表現を実験している作品集。
トップページ: [https://dsflon.github.io/webgl2/](https://dsflon.github.io/webgl2/)

## トップページ(レンズ格子ポートフォリオ)

画面全体を作品サムネイルの無限グリッドで敷き詰め、ポインタ中心のレンズ拡大・
ドラッグパン・クリック遷移を持つトップページ。仕様は
[docs/top_page_spec_v1.1.md](docs/top_page_spec_v1.1.md) が唯一の正。
ソースは `site/`(TypeScript + Vite + 素のWebGL2)、ビルド成果物
(`index.html`, `assets/top/`)はコミットする方式(GitHub Pages ルート配信のため)。

### 作品の追加手順(コード変更不要)

1. `works.json` に1エントリ追記(`slug/file/title/date/desc/model/tags/series/thumb`)
2. `node tools/thumbs.mjs <slug>` でサムネイル生成(要 `./server.sh` で http://localhost:8888)
3. README.md のリンク一覧に1行追加(任意)

トップページはリロードだけで新作品を拾う(グリッド・フォールバック一覧・sr-only nav すべて works.json 駆動)。
※ `<noscript>` 用リンク一覧だけはビルド時に焼き込まれるため、次回の `npm run build` で反映される(JS有効環境には影響なし)。

### トップページの開発

```sh
cd site
npm install
npm run dev    # 開発サーバー(works.json/thumbs はリポジトリルートから配信)
npm test       # ユニットテスト(レンズ非重複・決定的割当・クリック判別 ほか)
npm run build  # tsc --noEmit + リポジトリルートへ成果物出力(要コミット)
```

- `?debug=1` で lil-gui(全パラメータ)+ fps 表示
- `?seed=42` で作品配置を固定再現(既定 42)
- WebGL2 不可 / works.json 取得失敗時は静的グリッドへ自動フォールバック

## 作品一覧

[https://dsflon.github.io/webgl2/dogra-magra.html](https://dsflon.github.io/webgl2/dogra-magra.html)  
[https://dsflon.github.io/webgl2/ds_voice.html](https://dsflon.github.io/webgl2/ds_voice.html)  
[https://dsflon.github.io/webgl2/live_portrait_in_flux.html](https://dsflon.github.io/webgl2/live_portrait_in_flux.html)  
[https://dsflon.github.io/webgl2/overflowing_aura.html](https://dsflon.github.io/webgl2/overflowing_aura.html)  
[https://dsflon.github.io/webgl2/overflowing_aura_4taigyo_v2.html](https://dsflon.github.io/webgl2/overflowing_aura_4taigyo_v2.html)  
[https://dsflon.github.io/webgl2/overflowing_aura_4taigyo.html](https://dsflon.github.io/webgl2/overflowing_aura_4taigyo.html)  
[https://dsflon.github.io/webgl2/suibokuga_fluid.html](https://dsflon.github.io/webgl2/suibokuga_fluid.html)  
[https://dsflon.github.io/webgl2/suibokuga_particle.html](https://dsflon.github.io/webgl2/suibokuga_particle.html)  
[https://dsflon.github.io/webgl2/iwashi_ball_sakanaai.html](https://dsflon.github.io/webgl2/iwashi_ball_sakanaai.html)  
[https://dsflon.github.io/webgl2/iwashi_ball_opus4_8.html](https://dsflon.github.io/webgl2/iwashi_ball_opus4_8.html)  
[https://dsflon.github.io/webgl2/suibokuga_sakana.html](https://dsflon.github.io/webgl2/suibokuga_sakana.html)  
[https://dsflon.github.io/webgl2/suibokuga_opus4_8.html](https://dsflon.github.io/webgl2/suibokuga_opus4_8.html)  
[https://dsflon.github.io/webgl2/ascii_sakana.html](https://dsflon.github.io/webgl2/ascii_sakana.html)  
[https://dsflon.github.io/webgl2/ascii_opus4_8.html](https://dsflon.github.io/webgl2/ascii_opus4_8.html)  
[https://dsflon.github.io/webgl2/van-gogh_sakana.html](https://dsflon.github.io/webgl2/van-gogh_sakana.html)  
[https://dsflon.github.io/webgl2/fable5_scribble-cam.html](https://dsflon.github.io/webgl2/fable5_scribble-cam.html)  
[https://dsflon.github.io/webgl2/fable5_water-cam.html](https://dsflon.github.io/webgl2/fable5_water-cam.html)  
[https://dsflon.github.io/webgl2/fable5_oneline-cam.html](https://dsflon.github.io/webgl2/fable5_oneline-cam.html)  
[https://dsflon.github.io/webgl2/fable5_typo-cam.html](https://dsflon.github.io/webgl2/fable5_typo-cam.html)  
[https://dsflon.github.io/webgl2/fable5_van-gogh.html](https://dsflon.github.io/webgl2/fable5_van-gogh.html)
[https://dsflon.github.io/webgl2/fable5_papercraft-cam.html](https://dsflon.github.io/webgl2/fable5_papercraft-cam.html)
[https://dsflon.github.io/webgl2/fable5_blue-dissolve.html](https://dsflon.github.io/webgl2/fable5_blue-dissolve.html)
[https://dsflon.github.io/webgl2/fable5_smoke-portrait.html](https://dsflon.github.io/webgl2/fable5_smoke-portrait.html)
[https://dsflon.github.io/webgl2/fable5_gas-head.html](https://dsflon.github.io/webgl2/fable5_gas-head.html)  
[https://dsflon.github.io/webgl2/fable5_depth-suibokuga.html](https://dsflon.github.io/webgl2/fable5_depth-suibokuga.html)

[https://dsflon.github.io/webgl2/fable5_flower-being.html](https://dsflon.github.io/webgl2/fable5_flower-being.html)

[https://dsflon.github.io/webgl2/fable5_mosaic.html](https://dsflon.github.io/webgl2/fable5_mosaic.html)

[https://dsflon.github.io/webgl2/fable5_taifu-no-me.html](https://dsflon.github.io/webgl2/fable5_taifu-no-me.html)

[https://dsflon.github.io/webgl2/fable5_kotonoha-shigure.html](https://dsflon.github.io/webgl2/fable5_kotonoha-shigure.html)

[https://dsflon.github.io/webgl2/fable5_uchimizu.html](https://dsflon.github.io/webgl2/fable5_uchimizu.html)

[https://dsflon.github.io/webgl2/fable5_senkohanabi.html](https://dsflon.github.io/webgl2/fable5_senkohanabi.html)

[https://dsflon.github.io/webgl2/opus5_soumatou.html](https://dsflon.github.io/webgl2/opus5_soumatou.html)

[https://dsflon.github.io/webgl2/opus5_kiin-seido.html](https://dsflon.github.io/webgl2/opus5_kiin-seido.html)

[https://dsflon.github.io/webgl2/opus5_hana.html](https://dsflon.github.io/webgl2/opus5_hana.html)

[https://dsflon.github.io/webgl2/opus5_samoarinan.html](https://dsflon.github.io/webgl2/opus5_samoarinan.html)

[https://dsflon.github.io/webgl2/opus5_ikitsugi.html](https://dsflon.github.io/webgl2/opus5_ikitsugi.html)

[https://dsflon.github.io/webgl2/opus5_koe.html](https://dsflon.github.io/webgl2/opus5_koe.html)

[https://dsflon.github.io/webgl2/fable5_kirie-portrait.html](https://dsflon.github.io/webgl2/fable5_kirie-portrait.html)

[https://dsflon.github.io/webgl2/fable5_itsuwari-hyomen.html](https://dsflon.github.io/webgl2/fable5_itsuwari-hyomen.html)

[https://dsflon.github.io/webgl2/fable5_kirie-sekai.html](https://dsflon.github.io/webgl2/fable5_kirie-sekai.html)  
[https://dsflon.github.io/webgl2/fable5_unari.html](https://dsflon.github.io/webgl2/fable5_unari.html)

[https://dsflon.github.io/webgl2/opus5_uneri.html](https://dsflon.github.io/webgl2/opus5_uneri.html)
