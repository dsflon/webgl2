#version 300 es
// タイル(インスタンス矩形)頂点シェーダー。変形ロジックはCPU側(仕様 §4.1)。
layout(location = 0) in vec2 a_corner;   // 単位クワッド 0..1
layout(location = 1) in vec2 a_center;   // スクリーン座標(CSS px)
layout(location = 2) in vec2 a_size;     // 表示サイズ(CSS px)
layout(location = 3) in vec4 a_uvRect;   // アトラスUV矩形 x,y,w,h
layout(location = 4) in vec3 a_fx;       // 明度, 彩度, ハイライト

uniform vec2 u_viewport; // CSS px

out vec2 v_uv;
out vec2 v_local;     // タイル中心からのローカル座標(px)
out vec2 v_halfSize;  // 半サイズ(px)
out vec3 v_fx;

void main() {
  vec2 pos = a_center + (a_corner - 0.5) * a_size;
  vec2 clip = pos / u_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uvRect.xy + a_corner * a_uvRect.zw;
  v_local = (a_corner - 0.5) * a_size;
  v_halfSize = a_size * 0.5;
  v_fx = a_fx;
}
