import * as THREE from "three";

const MODEL_URL = new URL("../assets/rabbit.json", import.meta.url);

// The Blender export uses Three's Y-up coordinates and local geometry for these
// pivots. Keeping the original pivots lets the existing pet behaviour animate it.
function createPivots() {
  const nodes = Object.fromEntries(
    ["root", "body", "neck", "head", "earL", "earR", "eyeL", "eyeR", "nose", "arms"].map((name) => {
      const group = new THREE.Group();
      group.name = name;
      return [name, group];
    }),
  );
  nodes.root.name = "Blender lop rabbit";
  nodes.neck.position.set(0, 0.78, 0.3);
  nodes.earL.position.set(-0.22, 0.34, 0.02);
  nodes.earR.position.set(0.22, 0.34, 0.02);
  nodes.eyeL.position.set(-0.19, 0.1, 0.36);
  nodes.eyeR.position.set(0.19, 0.1, 0.36);
  nodes.nose.position.set(0, 0.03, 0.5);
  nodes.arms.position.set(0, 0.27, 0.30);
  nodes.earL.userData.side = -1;
  nodes.earR.userData.side = 1;
  nodes.root.add(nodes.body, nodes.neck);
  nodes.body.add(nodes.arms);
  nodes.neck.add(nodes.head);
  nodes.head.add(nodes.earL, nodes.earR, nodes.eyeL, nodes.eyeR, nodes.nose);
  return nodes;
}

function attribute(buffer, spec, Type, label) {
  if (!spec || !Number.isInteger(spec.offset) || !Number.isInteger(spec.count) || spec.offset < 0 || spec.count < 1 || spec.offset % 4 !== 0 || spec.offset + spec.count * 4 > buffer.byteLength) {
    throw new Error(`Blender rabbit: invalid ${label} buffer range`);
  }
  const data = new Type(buffer, spec.offset, spec.count);
  if (!data.every(Number.isFinite)) throw new Error(`Blender rabbit: non-finite ${label}`);
  return data;
}

function vector(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new Error(`Blender rabbit: invalid ${label}`);
  }
  return value;
}

export function buildBlenderRabbit(manifest, buffer, { shadows = true } = {}) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.meshes) || !manifest.meshes.length || !manifest.materials || !(buffer instanceof ArrayBuffer)) {
    throw new Error("Blender rabbit: unsupported or empty model export");
  }
  const nodes = createPivots();
  const disposables = [];
  const dispose = () => {
    for (const resource of disposables) resource.dispose();
    nodes.root.removeFromParent();
  };
  try {
    const materials = {};
    for (const [name, config] of Object.entries(manifest.materials)) {
      const color = Array.isArray(config.color)
        ? new THREE.Color().fromArray(vector(config.color, `${name} color`))
        : config.color ?? 0xffffff;
      const isEye = /eye/i.test(name);
      const Material = isEye ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
      const material = new Material({
        name,
        color,
        roughness: config.roughness ?? (name === "strands" ? 0.86 : 0.8),
        metalness: config.metalness ?? 0,
        vertexColors: config.vertexColors === true,
        side: name === "strands" ? THREE.DoubleSide : THREE.FrontSide,
        ...(isEye ? { clearcoat: 0.6, clearcoatRoughness: 0.08 } : {}),
      });
      materials[name] = material;
      disposables.push(material);
    }
    for (const spec of manifest.meshes) {
      const parent = nodes[spec.parent];
      const material = materials[spec.material];
      if (!parent || !material) throw new Error(`Blender rabbit: unknown parent or material for ${spec.name}`);
      const positions = attribute(buffer, spec.positions, Float32Array, `${spec.name} positions`);
      const normals = attribute(buffer, spec.normals, Float32Array, `${spec.name} normals`);
      const colors = spec.colors || material.vertexColors
        ? attribute(buffer, spec.colors, Float32Array, `${spec.name} colors`)
        : null;
      const indices = attribute(buffer, spec.indices, Uint32Array, `${spec.name} indices`);
      if (positions.length % 3 || normals.length !== positions.length || (colors && colors.length !== positions.length) || indices.length % 3 || indices.some((i) => i >= positions.length / 3)) {
        throw new Error(`Blender rabbit: inconsistent geometry for ${spec.name}`);
      }
      const geometry = new THREE.BufferGeometry();
      disposables.push(geometry);
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      if (colors) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = spec.name;
      mesh.position.fromArray(vector(spec.position ?? [0, 0, 0], `${spec.name} position`));
      if (spec.rotation) mesh.rotation.set(...vector(spec.rotation, `${spec.name} rotation`));
      mesh.castShadow = shadows && spec.material !== "strands";
      mesh.receiveShadow = shadows;
      parent.add(mesh);
    }
    nodes.root.userData.source = "Blender";
    nodes.root.userData.meshCount = manifest.meshes.length;
    return { ...nodes, ears: [nodes.earL, nodes.earR], eyes: [nodes.eyeL, nodes.eyeR], dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

export async function loadBlenderRabbit({ shadows = true, modelUrl = MODEL_URL, fetcher = fetch } = {}) {
  try {
    const url = new URL(modelUrl, MODEL_URL);
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`model request returned HTTP ${response.status}`);
    const manifest = await response.json();
    if (typeof manifest.buffers !== "string" || !manifest.buffers) throw new Error("missing model buffer path");
    const binaryResponse = await fetcher(new URL(manifest.buffers, url));
    if (!binaryResponse.ok) throw new Error(`geometry request returned HTTP ${binaryResponse.status}`);
    return buildBlenderRabbit(manifest, await binaryResponse.arrayBuffer(), { shadows });
  } catch (error) {
    throw new Error(`兔子 Blender 模型加载失败：${error.message}`, { cause: error });
  }
}
