import * as THREE from "three";
import { createVilla } from "./villa.js";

export const WALL_Z = -6;
export const FLOOR_NEAR_Z = 5.5;
const WALL_SIZE = [30, 12];
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function texture(width, height, draw, color = true) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const result = new THREE.CanvasTexture(canvas);
  if (color) result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 8;
  return result;
}

// Static meshes are combined so dozens of individually curved leaves and stems cost
// two draw calls, while retaining their real silhouettes, highlights and shadows.
function mergeGeometry(parts) {
  const expanded = parts.map((part) => part.index ? part.toNonIndexed() : part);
  const attributes = ["position", "normal", "uv", "color"].filter((name) => expanded.every((part) => part.attributes[name]));
  const merged = new THREE.BufferGeometry();
  for (const name of attributes) {
    const size = expanded[0].attributes[name].itemSize;
    const array = new Float32Array(expanded.reduce((sum, part) => sum + part.attributes[name].array.length, 0));
    let offset = 0;
    for (const part of expanded) {
      array.set(part.attributes[name].array, offset);
      offset += part.attributes[name].array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  for (const part of new Set([...parts, ...expanded])) part.dispose();
  merged.computeBoundingSphere();
  return merged;
}

function wallFinish() {
  return texture(2048, 1024, (ctx, w, h) => {
    const random = seeded(12);
    const gradient = ctx.createLinearGradient(0, 0, w * 0.8, h);
    gradient.addColorStop(0, "#6c86af");
    gradient.addColorStop(0.5, "#8da5c8");
    gradient.addColorStop(1, "#bac9dc");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    const point = (x, y) => [(x / WALL_SIZE[0] + 0.5) * w, (1 - y / WALL_SIZE[1]) * h];
    // A broad window projects a softly defocused grid onto the painted plaster.
    // Keeping the projection in the wall material avoids translucent floating planes.
    ctx.save();
    ctx.filter = "blur(6px)";
    for (let column = 0; column < 3; column++) {
      for (let row = 0; row < 4; row++) {
        const x = 1.0 + column * 2.15;
        const y = 0.38 + row * 2.2;
        const corners = [[x + y * 0.29, y], [x + 1.9 + y * 0.29, y], [x + 1.9 + (y + 1.98) * 0.29, y + 1.98], [x + (y + 1.98) * 0.29, y + 1.98]];
        ctx.fillStyle = `rgba(255,225,179,${0.53 - column * 0.04})`;
        ctx.beginPath();
        corners.map(([a, b]) => point(a, b)).forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b));
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    // Fine plaster variation is deliberately subpixel and low contrast.
    for (let i = 0; i < 23000; i++) {
      ctx.fillStyle = random() > 0.5 ? "rgba(255,255,255,.022)" : "rgba(30,45,65,.02)";
      ctx.fillRect(random() * w, random() * h, 1.2, 1.2);
    }
    const shade = ctx.createLinearGradient(0, h - 22, 0, h);
    shade.addColorStop(0, "rgba(42,50,65,0)");
    shade.addColorStop(1, "rgba(42,50,65,.20)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, h - 22, w, 22);
  });
}

function floorFinish() {
  return texture(2048, 2048, (ctx, w, h) => {
    const random = seeded(67);
    ctx.fillStyle = "#ded9cc";
    ctx.fillRect(0, 0, w, h);
    const boardWidth = w / 34;
    for (let board = 0; board < 34; board++) {
      const x = board * boardWidth;
      const tone = 214 + Math.floor(random() * 12);
      ctx.fillStyle = `rgb(${tone + 9},${tone + 4},${tone - 7})`;
      ctx.fillRect(x + 0.5, 0, boardWidth - 1, h);
      for (let grain = 0; grain < 75; grain++) {
        const gx = x + random() * boardWidth;
        const start = random() * h;
        const length = 50 + random() * 900;
        ctx.strokeStyle = `rgba(110,94,69,${0.015 + random() * 0.025})`;
        ctx.lineWidth = 0.3 + random() * 0.7;
        ctx.beginPath();
        ctx.moveTo(gx, start);
        ctx.bezierCurveTo(gx + 3, start + length * 0.3, gx - 4, start + length * 0.7, gx + 1, start + length);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(112,105,89,.14)";
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      for (let joint = -1; joint < 4; joint++) {
        const y = joint * h / 3 + (board % 3) * h / 9;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + boardWidth, y); ctx.stroke();
      }
    }
  });
}

function contactTexture() {
  return texture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, "rgba(53,43,30,.32)");
    gradient.addColorStop(0.4, "rgba(53,43,30,.18)");
    gradient.addColorStop(1, "rgba(53,43,30,0)");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  });
}

function leafGeometry(base, direction, length, width, roll, random) {
  const rows = 14, columns = 8;
  const vertices = [], uvs = [], indices = [], colors = [];
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize());
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
  orientation.multiply(rotation);
  const tint = new THREE.Color().setHSL(0.23 + random() * 0.045, 0.34 + random() * 0.16, 0.22 + random() * 0.09);
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const spread = Math.pow(Math.sin(Math.PI * t), 0.7) * (1.16 - t * 0.5);
    for (let column = 0; column <= columns; column++) {
      const u = column / columns * 2 - 1;
      const x = u * width * spread * 0.5;
      const y = (1 - u * u) * width * 0.13 * Math.sin(Math.PI * t) - t * t * length * 0.20;
      const z = length * t;
      const p = new THREE.Vector3(x, y, z).applyQuaternion(orientation).add(base);
      vertices.push(p.x, p.y, p.z);
      uvs.push(column / columns, t);
      const veinTint = tint.clone().multiplyScalar(0.94 + 0.06 * Math.abs(u));
      colors.push(veinTint.r, veinTint.g, veinTint.b);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createScenery(scene, { camera, aspect, shadows = true }) {
  const random = seeded(31337);
  const group = new THREE.Group();
  group.name = "Morning room · real geometry";
  scene.add(group);
  const disposables = new Set();
  const keep = (item) => { disposables.add(item); return item; };
  const material = (params) => keep(new THREE.MeshStandardMaterial(params));
  function mesh(geometry, mat, position, parent = group) {
    keep(geometry);
    const object = new THREE.Mesh(geometry, mat);
    if (position) object.position.set(...position);
    object.castShadow = shadows;
    object.receiveShadow = shadows;
    parent.add(object);
    return object;
  }
  function box(size, mat, position, parent) { return mesh(new THREE.BoxGeometry(...size), mat, position, parent); }
  const whiteCeramic = keep(new THREE.MeshPhysicalMaterial({ color: 0xe9e3d8, roughness: 0.28, clearcoat: 0.3, clearcoatRoughness: 0.25 }));
  const contactMap = keep(contactTexture());
  function contact(x, z, width, depth, opacity = 0.75) {
    const shadow = mesh(new THREE.PlaneGeometry(width, depth), keep(new THREE.MeshBasicMaterial({ map: contactMap, transparent: true, opacity, depthWrite: false })), [x, 0.008, z]);
    shadow.rotation.x = -Math.PI / 2;
    shadow.castShadow = false;
    shadow.receiveShadow = false;
  }

  const wallMap = keep(wallFinish());
  const wall = mesh(new THREE.PlaneGeometry(...WALL_SIZE), material({ map: wallMap, roughness: 0.96 }), [0, 6, WALL_Z]);
  wall.name = "Blue grey plaster and softly projected window light";
  wall.castShadow = false;
  const trim = material({ color: 0xe4e1d9, roughness: 0.46 });
  box([30, 0.2, 0.055], trim, [0, 0.1, WALL_Z + 0.028]);
  box([30, 0.035, 0.078], trim, [0, 0.208, WALL_Z + 0.04]);
  const floorMap = keep(floorFinish());
  floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping;
  floorMap.repeat.set(1.35, 0.75);
  const floorMaterial = keep(new THREE.MeshPhysicalMaterial({ map: floorMap, roughness: 0.31, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.34 }));
  const floor = mesh(new THREE.PlaneGeometry(30, 24), floorMaterial, [0, -0.012, 1]);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  floor.name = "Whitewashed oak · satin finish";

  // The mug's inside, rolled rim, foot and handle are modeled, so the opening reads
  // as a hollow ceramic object from every angle.
  const mug = new THREE.Group(); group.add(mug);
  mug.position.set(-4.85, 0.49, -2.8);
  mug.rotation.set(0, -0.12, -Math.PI / 2);
  const mugProfile = [[0,0.02],[0.29,0.02],[0.39,0.05],[0.445,0.13],[0.465,0.74],[0.462,0.84],[0.445,0.87],[0.414,0.87],[0.398,0.82],[0.395,0.2],[0.33,0.135],[0,0.135]].map(([x,y]) => new THREE.Vector2(x,y));
  mesh(new THREE.LatheGeometry(mugProfile, 64), whiteCeramic, [0,0,0], mug);
  const handle = mesh(new THREE.TorusGeometry(0.255, 0.07, 12, 40), whiteCeramic, [0.45, 0.43, 0], mug);
  handle.scale.y = 1.22;
  mug.name = "Hollow porcelain mug";
  contact(-4.42, -2.8, 1.55, 1.1);

  const paperMap = keep(texture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#d9d1bd"; ctx.fillRect(0,0,w,h);
    for (let i = 0; i < h; i += 3) { ctx.fillStyle = `rgba(104,94,72,${0.06 + random() * 0.12})`; ctx.fillRect(0,i,w,0.7); }
  }));
  const paper = material({ map: paperMap, roughness: 0.94 });
  const covers = [0xc9b5a1, 0xced0bc, 0xd9c7af];
  for (let i = 0; i < 3; i++) {
    const book = new THREE.Group(); group.add(book);
    book.position.set(-3.82 + (i % 2) * 0.1, 0.095 + i * 0.175, -3.12);
    book.rotation.y = [-0.04, 0.08, -0.12][i];
    const cover = material({ color: covers[i], roughness: 0.7 });
    box([1.25, 0.127, 0.77], paper, [0,0,0], book);
    for (const side of [-1,1]) box([1.31,0.021,0.81], cover, [0,side*0.074,0], book);
    box([0.03,0.17,0.81], cover, [-0.639,0,0], book);
    book.name = "Clothbound book";
  }
  contact(-3.8,-3.12,1.8,1.25);

  const plant = new THREE.Group(); group.add(plant);
  plant.position.set(4.1, 0, -2.7);
  plant.name = "Pothos in an ivory stoneware planter";
  const potProfile = [[0,0.035],[0.49,0.035],[0.52,0.07],[0.65,1.03],[0.66,1.11],[0.635,1.135],[0.595,1.13],[0.583,1.075],[0.49,0.25],[0,0.25]].map(([x,y]) => new THREE.Vector2(x,y));
  mesh(new THREE.LatheGeometry(potProfile, 64), whiteCeramic, [0,0,0], plant);
  const soilMaterial = material({ color: 0x42382a, roughness: 1 });
  mesh(new THREE.CylinderGeometry(0.596,0.596,0.025,40), soilMaterial, [0,1.06,0], plant);
  const soilBits = [];
  for (let i=0;i<45;i++) {
    const r=Math.sqrt(random())*.55, a=random()*Math.PI*2;
    const bit=new THREE.IcosahedronGeometry(.018+random()*.02,0);
    bit.translate(Math.cos(a)*r,1.08,Math.sin(a)*r); soilBits.push(bit);
  }
  mesh(mergeGeometry(soilBits), material({color:0x79705a,roughness:1}), [0,0,0], plant);
  contact(4.1,-2.7,1.9,1.55);
  const leafMap = keep(texture(256,512,(ctx,w,h) => {
    ctx.fillStyle="#c6d0a0"; ctx.fillRect(0,0,w,h);
    const sheen=ctx.createLinearGradient(0,0,w,0);
    sheen.addColorStop(0,"rgba(55,68,28,.1)"); sheen.addColorStop(.49,"rgba(255,255,230,.12)"); sheen.addColorStop(.51,"rgba(67,74,30,.13)"); sheen.addColorStop(1,"rgba(255,255,230,.02)");
    ctx.fillStyle=sheen; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle="rgba(242,242,175,.3)"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.stroke();
    ctx.lineWidth=.8;
    for(let i=1;i<12;i++) for(const side of[-1,1]) {
      const y=i*h/12; ctx.beginPath();ctx.moveTo(w/2,y);ctx.quadraticCurveTo(w/2+side*w*.18,y+h*.05,w/2+side*w*.49,y+h*.15);ctx.stroke();
    }
  }));
  const leaves=[], stems=[];
  for(let branch=0;branch<9;branch++) {
    const angle=branch/9*Math.PI*2+.35;
    const reach=.55+random()*.75;
    const height=1.65+random()*1.35;
    const end=new THREE.Vector3(Math.cos(angle)*reach,height+1,Math.sin(angle)*reach*.7);
    const curve=new THREE.CubicBezierCurve3(new THREE.Vector3((random()-.5)*.2,1.04,(random()-.5)*.2),new THREE.Vector3(Math.cos(angle)*.18,1.8,Math.sin(angle)*.18),new THREE.Vector3(end.x*.8,end.y+.35,end.z*.7),end);
    stems.push(new THREE.TubeGeometry(curve,22,.013,5,false));
    for(let i=0;i<5;i++) {
      const t=.25+i*.17;
      const base=curve.getPoint(t);
      const side=i%2?-1:1;
      const leafAngle=angle+side*(.85+random()*.7);
      const length=.5+random()*.28;
      const direction=new THREE.Vector3(Math.cos(leafAngle),.12-random()*.38,Math.sin(leafAngle));
      const petioleEnd=base.clone().add(direction.clone().multiplyScalar(.13));
      const petiole=new THREE.QuadraticBezierCurve3(base,base.clone().add(new THREE.Vector3(0,.07,0)),petioleEnd);
      stems.push(new THREE.TubeGeometry(petiole,4,.007,4,false));
      leaves.push(leafGeometry(petioleEnd,direction,length,length*.65,side*.28+(random()-.5)*.35,random));
    }
    leaves.push(leafGeometry(end,new THREE.Vector3(Math.cos(angle),-.35,Math.sin(angle)),.65,.39,.3,random));
  }
  const foliageMaterial=material({map:leafMap,vertexColors:true,roughness:.47,side:THREE.DoubleSide});
  mesh(mergeGeometry(leaves),foliageMaterial,[0,0,0],plant);
  mesh(mergeGeometry(stems),material({color:0x536143,roughness:.68}),[0,0,0],plant);

  // A woven cotton mat at the edge of the room adds scale without blocking the
  // rabbit's central play area. Its radial braids are actual low-profile geometry.
  const rugPosition=new THREE.Vector3(3.67,.014,.38);
  const rugMaterial=material({color:0xd2c5ae,roughness:1});
  const rug=mesh(new THREE.CylinderGeometry(.9,.9,.028,64),rugMaterial,rugPosition.toArray());
  rug.scale.z=.65;
  const braids=[];
  for(let ring=0;ring<18;ring++) {
    const braid=new THREE.TorusGeometry(.06+ring*.047,.012,4,Math.max(18,ring*8));
    braid.rotateX(-Math.PI/2);braid.scale(1,1,.65);braid.translate(rugPosition.x,.039,rugPosition.z);braids.push(braid);
  }
  mesh(mergeGeometry(braids),material({color:0xe4d9c6,roughness:1}),[0,0,0]);
  contact(rugPosition.x,rugPosition.z,2.15,1.5,.4);

  const villa = createVilla({ group, mesh, material, mergeGeometry });
  contact(villa.position[0], villa.position[2], 3.2, 3.2, 0.7);

  // Warm morning sun and cooler sky fill preserve the coat's volume. Shadows stay
  // soft, but cast by the rabbit and all real room props rather than painted cutouts.
  const hemisphere=new THREE.HemisphereLight(0xdce8f6,0xc8b99f,.78);group.add(hemisphere);
  const sun=new THREE.DirectionalLight(0xffe4bd,2.55);
  sun.position.set(5.5,7.5,3.8);sun.target.position.set(-1,0,-1.2);
  sun.castShadow=shadows;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-5,near:.1,far:27});
  sun.shadow.bias=-.00025;sun.shadow.normalBias=.018;sun.shadow.radius=4;
  group.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(0xc5d9ee,.72);fill.position.set(-4,3,5);group.add(fill);
  const rim=new THREE.DirectionalLight(0xffe8c6,.5);rim.position.set(2,4,-4);group.add(rim);

  // Only a few tiny motes are visible; the room itself remains the backdrop.
  const count=30,positions=new Float32Array(count*3),moteState=[];
  for(let i=0;i<count;i++) {
    const p={x:1+random()*4,y:.4+random()*3.2,z:-4+random()*4,phase:random()*6.28};moteState.push(p);positions.set([p.x,p.y,p.z],i*3);
  }
  const moteGeometry=keep(new THREE.BufferGeometry());moteGeometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
  const moteMap=keep(texture(32,32,(ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,"rgba(255,249,226,.7)");g.addColorStop(1,"rgba(255,249,226,0)");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}));
  const motes=new THREE.Points(moteGeometry,keep(new THREE.PointsMaterial({map:moteMap,color:0xffedca,size:.014,transparent:true,opacity:.25,depthWrite:false})));group.add(motes);
  let elapsed=0;
  return {
    sun,
    villa,
    update(dt) {
      elapsed+=dt;
      for(let i=0;i<count;i++) {const p=moteState[i];positions[i*3]=p.x+Math.sin(elapsed*.13+p.phase)*.1;positions[i*3+1]=p.y+Math.sin(elapsed*.18+p.phase)*.07;}
      moteGeometry.attributes.position.needsUpdate=true;
    },
    dispose() {
      scene.remove(group);
      sun.shadow.map?.dispose();
      for(const item of disposables)item.dispose?.();
    },
  };
}
