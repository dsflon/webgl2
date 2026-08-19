#!/bin/sh

##############################################################
##  処理内容: 特定のディレクトリの .jpg, .jpeg, .png から .webp を生成し、指定の出力先に出力します。
##  動作条件: `brew install webp` 済みであること
##  実行:     `$ sh webp.sh`
##  @see https://developer.a-blogcms.jp/blog/kaizen/webp.html
##############################################################

# 元のディレクトリ
from='./thumbs'

# 出力先ディレクトリ
# 同ディレクトリ出力の場合は '.' を指定
to='.'

images=`find $from -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) -not -name "ogp.*"`

# 処理1
createWebp() {
    # 移動元ディレクトリの存在確認
    if [ ! -d $from ]; then
        echo "ERROE! 元ディレクトリ[$from]が存在しません。"
        exit
    fi

    # 出力先ディレクトリの存在確認
    if [ ! -d $to ]; then
        echo "ERROE! 出力先ディレクトリ[$to]が存在しません。"
        exit
    fi


    for image in $images;
    do
        to_path=$to${image#.}
        to_dir=${to_path%/*}

        # 1. ディレクトリ生成 （-p: なかったら生成のオプション）
        mkdir -p $to_dir

        # 2. 一応ディレクトリ存在チェック
        if [ ! -d $to_dir ]; then
            echo "ERROE! 出力先ディレクトリ[$to_dir]が存在しません。"
            exit
        fi

        # すでに .webp が存在する場合はスキップ
        # if [ ! -e $to_path".webp" ]; then
          # 3. webp 生成
          cwebp -preset photo -metadata icc -sharp_yuv -o $image".webp" -progress -short $image
          # cwebp $image -o $image".webp" >/dev/null 2>&1

          wait

          # 4. 対象ディレクトリへ移動
          mv $image".webp" $to_path".webp"

          # wait

          # 5. 元の画像ファイルを削除
          rm $image
          echo "削除: $image"

          echo $to_path".webp"

          echo "\n----------------\n"
        # fi
    done
}

echo "###############################################"
echo "##                   START                   ##"
echo "###############################################"
echo ""

createWebp

echo ""
echo "###############################################"
echo "##                    COMPLETE               ##"
echo "###############################################"
