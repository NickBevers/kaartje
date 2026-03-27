// ---------------------------------------------------------------------------
// Instanced stamp shaders — GPU billboard, visibility, per-instance textures
// ---------------------------------------------------------------------------

export const instancedStampVertex = /* glsl */ `
  // Per-instance attributes
  attribute float aTextureLayer;
  attribute float aOpacityMul;

  // Uniforms
  uniform vec3 uCameraPosition;

  varying vec2 vUv;
  varying float vOpacity;
  varying float vTextureLayer;

  void main() {
    vUv = uv;
    vTextureLayer = aTextureLayer;

    // instanceMatrix already contains billboard-oriented transform (set on CPU)
    vec4 worldPos4 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 worldPos = worldPos4.xyz;

    // Facing check: fade stamps on the far side of the globe
    vec3 outward = normalize(worldPos);
    vec3 toCamera = normalize(uCameraPosition - worldPos);
    float facing = dot(toCamera, outward);
    float globeFade = clamp((facing + 0.05) / 0.2, 0.0, 1.0);
    vOpacity = globeFade * aOpacityMul;

    // Standard instanced position
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const instancedStampFragment = /* glsl */ `
  precision highp float;
  precision highp sampler2DArray;

  uniform sampler2DArray uTextureArray;

  varying vec2 vUv;
  varying float vOpacity;
  varying float vTextureLayer;

  void main() {
    vec4 color = texture(uTextureArray, vec3(vUv, vTextureLayer));
    color.a *= vOpacity;
    if (color.a < 0.001) discard;
    gl_FragColor = color;
  }
`;
