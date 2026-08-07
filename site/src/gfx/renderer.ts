/**
 * WebGL2 セットアップ・インスタンス描画・リサイズ・context lost(仕様 §5.1, §9)。
 * ドローコールは1(アトラス1枚)。毎フレームのGCアロケーションはゼロ(§8)。
 */
import vertSrc from './shaders/tile.vert.glsl?raw';
import fragSrc from './shaders/tile.frag.glsl?raw';
import { CONFIG } from '../config';

/** インスタンス属性: center(2) size(2) uvRect(4) fx(3) = 11 floats */
export const STRIDE = 11;

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  /** 事前確保のインスタンスバッファ(§8: GCゼロ) */
  readonly instanceData: Float32Array;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private instanceBuf!: WebGLBuffer;
  private texture: WebGLTexture | null = null;
  private atlasSource: TexImageSource | null = null;
  private uViewport!: WebGLUniformLocation;
  private uRadius!: WebGLUniformLocation;
  private uFade!: WebGLUniformLocation;
  private lost = false;
  onContextRestoreFailed: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 コンテキスト取得失敗');
    this.gl = gl;
    this.instanceData = new Float32Array(CONFIG.maxInstances * STRIDE);
    this.setup();

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.setup();
        if (this.atlasSource) this.uploadAtlas(this.atlasSource);
        this.lost = false;
      } catch (err) {
        console.error('コンテキスト復帰失敗', err);
        this.onContextRestoreFailed?.();
      }
    });
  }

  get isLost(): boolean {
    return this.lost;
  }

  private setup(): void {
    const gl = this.gl;
    this.program = link(gl, vertSrc, fragSrc);
    this.uViewport = uniform(gl, this.program, 'u_viewport');
    this.uRadius = uniform(gl, this.program, 'u_radius');
    this.uFade = uniform(gl, this.program, 'u_fade');

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('VAO作成失敗');
    this.vao = vao;
    gl.bindVertexArray(vao);

    // 単位クワッド(TRIANGLE_STRIP)
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // インスタンス属性(動的)
    const inst = gl.createBuffer();
    if (!inst) throw new Error('バッファ作成失敗');
    this.instanceBuf = inst;
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
    const bytes = STRIDE * 4;
    const attrs: Array<[number, number, number]> = [
      [1, 2, 0], // a_center
      [2, 2, 8], // a_size
      [3, 4, 16], // a_uvRect
      [4, 3, 32], // a_fx
    ];
    for (const [loc, size, offset] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, bytes, offset);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const [br, bg, bb] = CONFIG.background;
    gl.clearColor(br, bg, bb, 1);
  }

  /** アトラス転送 + ミップマップ + 異方性(§5.2) */
  uploadAtlas(source: TexImageSource): void {
    const gl = this.gl;
    this.atlasSource = source;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) {
      const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, max);
    }
  }

  /** リサイズ(§5.1): 1ワールド単位 = 1 CSS px、DPRは2でクランプ */
  resize(cssW: number, cssH: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** 1ドローコールで count インスタンスを描画 */
  draw(count: number, cssW: number, cssH: number, fade: number): void {
    if (this.lost) return;
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (count === 0 || !this.texture) return;
    gl.useProgram(this.program);
    gl.uniform2f(this.uViewport, cssW, cssH);
    gl.uniform1f(this.uRadius, CONFIG.cornerRadius);
    gl.uniform1f(this.uFade, fade);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, count * STRIDE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('シェーダー作成失敗');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`シェーダーコンパイル失敗: ${gl.getShaderInfoLog(sh) ?? ''}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error('プログラム作成失敗');
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`リンク失敗: ${gl.getProgramInfoLog(p) ?? ''}`);
  }
  return p;
}

function uniform(
  gl: WebGL2RenderingContext,
  p: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const loc = gl.getUniformLocation(p, name);
  if (!loc) throw new Error(`uniform ${name} が見つかりません`);
  return loc;
}
