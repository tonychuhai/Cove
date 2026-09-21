// The eight photos are key poses. Interpolate their silhouettes and texture coordinates
// on the GPU so every display frame has a new pose, rather than holding a flat sprite.
const PROFILE_ROWS = 128;
const VERTEX = `#version 300 es
in vec2 position;
uniform vec4 bounds;
uniform vec2 viewport;
out vec2 uv;
void main() {
  uv = position;
  vec2 p = bounds.xy + position * bounds.zw;
  gl_Position = vec4(p.x / viewport.x * 2.0 - 1.0, 1.0 - p.y / viewport.y * 2.0, 0.0, 1.0);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D currentAtlas;
uniform sampler2D nextAtlas;
uniform sampler2D profiles;
uniform ivec2 looks;
uniform ivec2 frames;
uniform float poseMix;
uniform float outfitMix;
uniform vec2 atlasSize;
in vec2 uv;
out vec4 color;
vec3 profile(int look, int frame, float y) {
  float row = clamp(y, 0.0, 1.0) * 127.0;
  int low = int(floor(row));
  return mix(texelFetch(profiles, ivec2(low, look * 8 + frame), 0).rgb,
             texelFetch(profiles, ivec2(min(127, low + 1), look * 8 + frame), 0).rgb, fract(row));
}
vec4 samplePose(sampler2D atlas, int frame, vec3 shape, vec2 target) {
  // Both views stretch toward the same intermediate silhouette; this also keeps
  // shoulders, waist, hem and shoes from jumping sideways at a key-pose boundary.
  float x = mix(shape.x, shape.y, (uv.x - target.x) / max(0.02, target.y - target.x));
  if (x < 0.0 || x > 1.0) return vec4(0.0);
  vec2 tile = vec2(float(frame % 4), float(frame / 4));
  vec2 p = (tile + vec2(x, shape.z)) / vec2(4.0, 2.0);
  vec2 edge = 0.5 / atlasSize;
  p = clamp(p, tile / vec2(4.0, 2.0) + edge, (tile + 1.0) / vec2(4.0, 2.0) - edge);
  return texture(atlas, p);
}
void main() {
  float y = (uv.y - 0.025) / 0.945;
  if (y < 0.0 || y > 1.0) { color = vec4(0.0); return; }
  vec3 a = profile(looks.x, frames.x, y);
  vec3 b = profile(looks.x, frames.y, y);
  vec3 c = profile(looks.y, frames.x, y);
  vec3 d = profile(looks.y, frames.y, y);
  vec2 target = mix(mix(a.xy, b.xy, poseMix), mix(c.xy, d.xy, poseMix), outfitMix);
  vec4 first = mix(samplePose(currentAtlas, frames.x, a, target), samplePose(currentAtlas, frames.y, b, target), poseMix);
  vec4 second = mix(samplePose(nextAtlas, frames.x, c, target), samplePose(nextAtlas, frames.y, d, target), poseMix);
  // Textures are premultiplied: linear mixing preserves body opacity. Drawing two
  // semi-transparent sprites over one another instead made the person fade out.
  color = mix(first, second, outfitMix);
}`;

function silhouetteProfiles(images) {
  const values = new Float32Array(PROFILE_ROWS * images.length * 8 * 4);
  const scratch = document.createElement('canvas');
  const context = scratch.getContext('2d', { willReadFrequently: true });
  images.forEach((image, look) => {
    scratch.width = image.width; scratch.height = image.height;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const cellWidth = image.width / 4, w = Math.floor(cellWidth), h = image.height / 2;
    for (let frame = 0; frame < 8; frame++) {
      const rows = [], ox = Math.round((frame % 4) * cellWidth), oy = Math.floor(frame / 4) * h;
      let top = h, bottom = 0;
      for (let y = 0; y < h; y++) {
        const occupied = [];
        for (let x = 0; x < w; x++) {
          if (data[((oy + y) * image.width + ox + x) * 4 + 3] > 128) occupied.push(x);
        }
        if (occupied.length >= Math.max(4, w * 0.035)) {
          top = Math.min(top, y); bottom = Math.max(bottom, y);
          rows[y] = [occupied[Math.floor(occupied.length * 0.015)] / w,
            (occupied[Math.min(occupied.length - 1, Math.floor(occupied.length * 0.985))] + 1) / w];
        }
      }
      if (top >= bottom) { top = 0; bottom = h - 1; }
      for (let row = 0; row < PROFILE_ROWS; row++) {
        const y = top + (bottom - top) * row / (PROFILE_ROWS - 1);
        let left = 0, right = 0, count = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const bounds = rows[Math.max(top, Math.min(bottom, Math.round(y) + dy))];
          if (bounds) { left += bounds[0]; right += bounds[1]; count++; }
        }
        const index = ((look * 8 + frame) * PROFILE_ROWS + row) * 4;
        values.set([count ? left / count : 0.45, count ? right / count : 0.55, (y + 0.5) / h, 1], index);
      }
    }
  });
  return values;
}

export function createPortraitRenderer(canvas, images) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('此设备无法启动 WebGL2 人物动画');
  const shader = (type, source) => {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram(), vert = shader(gl.VERTEX_SHADER, VERTEX), frag = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  gl.attachShader(program, vert); gl.attachShader(program, frag); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.deleteShader(vert); gl.deleteShader(frag); gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = (filter) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t;
  };
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const atlases = images.map(image => {
    const t = texture(gl.LINEAR); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); return t;
  });
  const profiles = texture(gl.NEAREST);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, PROFILE_ROWS, images.length * 8, 0, gl.RGBA, gl.FLOAT, silhouetteProfiles(images));
  const uniforms = Object.fromEntries(['bounds', 'viewport', 'looks', 'frames', 'poseMix', 'outfitMix', 'atlasSize', 'currentAtlas', 'nextAtlas', 'profiles'].map(n => [n, gl.getUniformLocation(program, n)]));
  gl.uniform1i(uniforms.currentAtlas, 0); gl.uniform1i(uniforms.nextAtlas, 1); gl.uniform1i(uniforms.profiles, 2);
  gl.uniform2f(uniforms.atlasSize, images[0].width, images[0].height);
  gl.clearColor(0, 0, 0, 0);
  return {
    draw(state, bounds, width, height) {
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      [atlases[state.current], atlases[state.next], profiles].forEach((t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); });
      gl.uniform4f(uniforms.bounds, bounds.x, bounds.y, bounds.w, bounds.h);
      gl.uniform2f(uniforms.viewport, width, height); gl.uniform2i(uniforms.looks, state.current, state.next);
      gl.uniform2i(uniforms.frames, state.frameA, state.frameB);
      gl.uniform1f(uniforms.poseMix, state.poseMix); gl.uniform1f(uniforms.outfitMix, state.outfitMix);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose() { for (const t of [...atlases, profiles]) gl.deleteTexture(t); gl.deleteBuffer(buffer); gl.deleteProgram(program); },
  };
}
