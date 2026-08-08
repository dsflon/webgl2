#version 300 es
// タイルのフラグメント: 角丸SDF・ヴィネット(明度)・周縁彩度低下・注視ハイライト(仕様 §5.4)
precision mediump float;

uniform sampler2D u_atlas;
uniform float u_radius; // 角丸半径(px)
uniform float u_fade;   // 全体フェードイン 0..1(§6)

in vec2 v_uv;
in vec2 v_local;
in vec2 v_halfSize;
in vec3 v_fx; // x=明度, y=彩度, z=ハイライト

out vec4 outColor;

void main() {
  // 角丸矩形SDF(px)
  float r = min(u_radius, min(v_halfSize.x, v_halfSize.y));
  vec2 q = abs(v_local) - (v_halfSize - vec2(r));
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float aa = fwidth(d);
  float alpha = 1.0 - smoothstep(-aa, aa, d);
  if (alpha <= 0.001) discard;

  vec3 col = texture(u_atlas, v_uv).rgb;

  // 周縁の彩度低下(§5.4)
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, v_fx.y);

  // ヴィネット: レンズ中心からの距離に応じた明度(CPUで算出した係数)
  col *= v_fx.x;

  // 注視ハイライト: 白の細枠(角丸に沿う) + わずかな明度アップ
  float stroke = (1.0 - smoothstep(0.0, 1.6, abs(d + 1.6))) * v_fx.z;
  col = mix(col * (1.0 + 0.15 * v_fx.z), vec3(1.0), stroke * 0.9);

  outColor = vec4(col, alpha * u_fade);
}
