/**
 * Modelos 3D procedurales de los componentes (unidades: mm, proporciones de hojas de datos).
 * Se generan por código: no hay dependencia de archivos externos ni licencias de terceros.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { num } from '../core/registry';
import { PITCH, type Params, type TerminalDef, type VisualState } from '../core/types';
import { LED_COLORS } from '../library/semiconductors';
import { BAND_COLORS, MAT, drawText, glowTexture, resistorBands, std, textTexture } from './materials';

export interface ComponentVisual {
  root: THREE.Group;
  applyVisual(v: VisualState | null): void;
  dispose(): void;
}

type Builder = (params: Params, terms: TerminalDef[]) => ComponentVisual;

/* ---------------- utilidades geométricas ---------------- */

/** Pata/alambre como tubo que recorre una polilínea con esquinas redondeadas. */
export function leadMesh(points: THREE.Vector3[], radius = 0.28, mat: THREE.Material = MAT.lead()): THREE.Mesh {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const r = 0.9;
  let prev = points[0].clone();
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const next = points[i + 1];
    if (next) {
      const dirIn = p.clone().sub(prev).normalize();
      const dirOut = next.clone().sub(p).normalize();
      const a = p.clone().addScaledVector(dirIn, -Math.min(r, p.distanceTo(prev) / 2));
      const b = p.clone().addScaledVector(dirOut, Math.min(r, p.distanceTo(next) / 2));
      if (a.distanceTo(prev) > 1e-4) path.add(new THREE.LineCurve3(prev, a));
      path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
      prev = b;
    } else {
      path.add(new THREE.LineCurve3(prev, p.clone()));
    }
  }
  const segs = Math.max(8, points.length * 10);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, segs, radius, 6, false), mat);
  mesh.castShadow = true;
  return mesh;
}

/** Esferas invisibles sobre cada terminal para seleccionarlo con el puntero/dedo. */
const PICK_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
function addPickTargets(group: THREE.Group, terms: TerminalDef[], insertable: boolean) {
  for (const t of terms) {
    const r = insertable ? 1.1 : 2.6;
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), PICK_MAT);
    s.position.set(t.local.x, insertable ? 0.8 : (t.height ?? 0), t.local.z);
    s.userData.term = t.id;
    s.renderOrder = 10;
    group.add(s);
  }
}

function shadowAll(o: THREE.Object3D) {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mat = m.material as THREE.Material & { map?: THREE.Texture };
      // Los materiales compartidos se conservan; solo se liberan los propios.
      if (mat.userData?.own) {
        mat.map?.dispose();
        mat.dispose();
      }
    }
    const sp = c as THREE.Sprite;
    if (sp.isSprite && sp.material.userData?.own) sp.material.dispose();
  });
}

function own<T extends THREE.Material>(m: T): T {
  m.userData.own = true;
  return m;
}

function simple(root: THREE.Group, apply: (v: VisualState | null) => void = () => {}): ComponentVisual {
  shadowAll(root);
  return { root, applyVisual: apply, dispose: () => disposeGroup(root) };
}

/* ---------------- componentes axiales (resistencia, diodo) ---------------- */

function axialLeads(group: THREE.Group, terms: TerminalDef[], bodyHalf: number, y: number) {
  for (const t of terms) {
    const sx = Math.sign(t.local.x) || 1;
    group.add(
      leadMesh([
        new THREE.Vector3(sx * (bodyHalf - 0.3), y, 0),
        new THREE.Vector3(t.local.x, y, 0),
        new THREE.Vector3(t.local.x, -2.2, 0),
      ]),
    );
  }
}

const resistorBuilder: Builder = (p, terms) => {
  const g = new THREE.Group();
  const y = 3.0;
  const L = 6.3;
  const R = 1.2;
  // Perfil "hueso de perro" típico de una resistencia de película de carbón
  const prof: THREE.Vector2[] = [];
  const pts: [number, number][] = [
    [0, -L / 2],
    [0.9, -L / 2],
    [R * 1.08, -L / 2 + 0.5],
    [R * 1.1, -L / 2 + 1.4],
    [R * 0.95, -L / 2 + 1.9],
    [R * 0.95, L / 2 - 1.9],
    [R * 1.1, L / 2 - 1.4],
    [R * 1.08, L / 2 - 0.5],
    [0.9, L / 2],
    [0, L / 2],
  ];
  for (const [r, yy] of pts) prof.push(new THREE.Vector2(r, yy));
  const bodyGeo = new THREE.LatheGeometry(prof, 28);
  bodyGeo.rotateZ(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, std('resBody', { color: 0xd8c08f, roughness: 0.6 }));
  body.position.y = y;
  g.add(body);
  // Bandas de color
  const bands = resistorBands(num(p, 'resistance'), String(p.tolerance));
  const bandX = [-1.9, -1.1, -0.3, 1.9];
  bands.forEach((b, i) => {
    const r = i === 0 || i === 3 ? R * 1.12 : R * 0.99;
    const geo = new THREE.CylinderGeometry(r, r, 0.45, 28, 1, true);
    geo.rotateZ(Math.PI / 2);
    const isMetal = b === '-1' || b === '-2';
    const m = new THREE.Mesh(
      geo,
      std('band' + b, { color: BAND_COLORS[b], roughness: isMetal ? 0.3 : 0.55, metalness: isMetal ? 0.8 : 0, side: THREE.DoubleSide }),
    );
    m.position.set(bandX[i], y, 0);
    g.add(m);
  });
  axialLeads(g, terms, L / 2, y);
  addPickTargets(g, terms, true);
  return simple(g, (v) => {
    const heat = v?.heat ?? 0;
    const glow = Math.max(0, Math.min(1, (heat - 0.8) / 1.5));
    const mat = body.material as THREE.MeshStandardMaterial;
    if (glow > 0) {
      if (!mat.userData.own) body.material = own(mat.clone());
      const mm = body.material as THREE.MeshStandardMaterial;
      mm.emissive.setRGB(1, 0.25, 0.05);
      mm.emissiveIntensity = glow * 1.5;
    } else if (mat.userData.own) {
      (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    }
  });
};

const diodeBuilder: Builder = (p, terms) => {
  const g = new THREE.Group();
  const y = 2.6;
  const big = String(p.model) === '1N4007';
  const L = big ? 5.2 : 3.8;
  const R = big ? 1.35 : 0.9;
  const geo = new THREE.CapsuleGeometry(R, L - 2 * R * 0.6, 6, 20);
  geo.rotateZ(Math.PI / 2);
  const body = new THREE.Mesh(
    geo,
    big
      ? std('diodeBody', { color: 0x161618, roughness: 0.45 })
      : std('glassDiode', { color: 0xd04a1a, roughness: 0.15, transparent: true, opacity: 0.75 }),
  );
  body.position.y = y;
  g.add(body);
  const bandGeo = new THREE.CylinderGeometry(R * 1.02, R * 1.02, 0.6, 24, 1, true);
  bandGeo.rotateZ(Math.PI / 2);
  const band = new THREE.Mesh(bandGeo, std('diodeBand', { color: big ? 0xc4c8cc : 0x111111, roughness: 0.4, side: THREE.DoubleSide }));
  band.position.set(L / 2 - 1.1, y, 0); // cátodo a la derecha (+x)
  g.add(band);
  axialLeads(g, terms, L / 2, y);
  addPickTargets(g, terms, true);
  return simple(g);
};

/* ---------------- LED ---------------- */

const ledBuilder: Builder = (p, terms) => {
  const g = new THREE.Group();
  const c = LED_COLORS[String(p.color)] ?? LED_COLORS.red;
  const color = new THREE.Color(c.hex);
  const base = 3.2;
  const lensMat = own(
    new THREE.MeshPhysicalMaterial({
      color: color.clone().lerp(new THREE.Color(0xffffff), 0.15),
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.78,
      emissive: color,
      emissiveIntensity: 0,
      clearcoat: 1,
    }),
  );
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 1, 32), lensMat);
  flange.position.y = base + 0.5;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 5.2, 32), lensMat);
  body.position.y = base + 1 + 2.6;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), lensMat);
  dome.position.y = base + 6.2;
  g.add(flange, body, dome);
  // Chip interno (yunque y poste)
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 0.5), MAT.steel());
  anvil.position.set(0.7, base + 2.6, 0);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 0.5), MAT.steel());
  post.position.set(-0.7, base + 2.9, 0);
  g.add(anvil, post);
  // Patas: el ánodo (−x) es la más larga
  for (const t of terms) {
    g.add(leadMesh([new THREE.Vector3(t.local.x * 0.55, base + 1.5, 0), new THREE.Vector3(t.local.x, base - 0.4, 0), new THREE.Vector3(t.local.x, -2.2, 0)], 0.25));
  }
  // Halo de luz
  const spriteMat = own(
    new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  const glow = new THREE.Sprite(spriteMat);
  glow.position.y = base + 5;
  glow.scale.setScalar(18);
  glow.renderOrder = 5;
  g.add(glow);
  addPickTargets(g, terms, true);
  shadowAll(g);
  glow.castShadow = false;
  return {
    root: g,
    applyVisual(v) {
      const b = v?.damaged ? 0 : (v?.brightness ?? 0);
      lensMat.emissiveIntensity = b * 2.2;
      lensMat.opacity = 0.78 + Math.min(0.2, b * 0.2);
      spriteMat.opacity = Math.min(1, b * 0.9);
      glow.scale.setScalar(10 + 16 * Math.min(1.5, b));
      if (v?.damaged) lensMat.color.set(0x2a2a2a);
      else lensMat.color.copy(color).lerp(new THREE.Color(0xffffff), 0.15);
    },
    dispose: () => disposeGroup(g),
  };
};

/* ---------------- capacitores ---------------- */

const ceramicBuilder: Builder = (_p, terms) => {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(2.6, 2.6, 1.6, 32);
  geo.rotateX(Math.PI / 2);
  const disc = new THREE.Mesh(geo, std('ceramic', { color: 0xc27a2c, roughness: 0.75 }));
  disc.scale.set(1, 1, 1);
  disc.position.y = 6;
  g.add(disc);
  for (const t of terms) {
    g.add(leadMesh([new THREE.Vector3(t.local.x * 0.35, 4, 0), new THREE.Vector3(t.local.x, 2, 0), new THREE.Vector3(t.local.x, -2.2, 0)], 0.25));
  }
  addPickTargets(g, terms, true);
  return simple(g);
};

const electrolyticBuilder: Builder = (p, terms) => {
  const g = new THREE.Group();
  const C = num(p, 'capacitance');
  const r = C >= 1000e-6 ? 5 : C >= 220e-6 ? 4 : C >= 47e-6 ? 3.15 : 2.5;
  const h = C >= 1000e-6 ? 13 : C >= 220e-6 ? 11.5 : C >= 47e-6 ? 11 : 7;
  const y0 = 1.2;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), std('capSleeve', { color: 0x1d2f5c, roughness: 0.35, metalness: 0.1 }));
  sleeve.position.y = y0 + h / 2;
  // Franja del negativo (lado +x)
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.98, 16, 1, true, Math.PI / 2 - 0.45, 0.9),
    std('capStripe', { color: 0xb8c1d4, roughness: 0.4, side: THREE.DoubleSide }),
  );
  stripe.position.y = y0 + h / 2;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.3, 40), MAT.steel());
  top.position.y = y0 + h + 0.05;
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(r * 1.4, 0.32, 0.25), MAT.darkPlastic());
  cross1.position.y = y0 + h + 0.1;
  const cross2 = cross1.clone();
  cross2.rotation.y = Math.PI / 2;
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.5, 32), MAT.blackPlastic());
  seal.position.y = y0 - 0.1;
  g.add(sleeve, stripe, top, cross1, cross2, seal);
  for (const t of terms) g.add(leadMesh([new THREE.Vector3(t.local.x, y0, 0), new THREE.Vector3(t.local.x, -2.2, 0)], 0.25));
  addPickTargets(g, terms, true);
  // Indicador de carga: anillo luminoso sutil en la tapa
  const ringMat = own(new THREE.MeshBasicMaterial({ color: 0x35d0ff, transparent: true, opacity: 0 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.18, 8, 40), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = y0 + h + 0.3;
  g.add(ring);
  return simple(g, (v) => {
    ringMat.opacity = Math.min(1, (v?.charge ?? 0) * 0.9);
  });
};

/* ---------------- transistor TO-92 ---------------- */

const to92Builder: Builder = (p, terms) => {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-2.4, 0);
  shape.lineTo(2.4, 0);
  shape.absarc(0, 0, 2.4, 0, Math.PI, false);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 4.8, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2); // extrusión hacia arriba; parte curva hacia −z
  geo.translate(0, 4, 0.6);
  const body = new THREE.Mesh(geo, MAT.blackPlastic());
  g.add(body);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 4.0),
    own(new THREE.MeshStandardMaterial({ map: textTexture([String(p.model).replace('2N2222A', 'PN2222A').replace('2N2907A', 'PN2907A'), terms.map((t) => t.id).join(' ')], { w: 256, h: 160, bg: '#17181b', fg: '#c9ccd1', font: 'bold 44px monospace' }), roughness: 0.6 })),
  );
  label.position.set(0, 6.4, 0.8);
  g.add(label);
  for (const t of terms) {
    g.add(leadMesh([new THREE.Vector3(t.local.x * 0.6, 4.2, 0.6), new THREE.Vector3(t.local.x * 0.6, 3, 0.6), new THREE.Vector3(t.local.x, 1.6, 0), new THREE.Vector3(t.local.x, -2.2, 0)], 0.22));
  }
  addPickTargets(g, terms, true);
  // Indicador de región: pequeño LED virtual de estado sobre el encapsulado (no es una pieza real)
  const indMat = own(new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0 }));
  const ind = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), indMat);
  ind.position.set(0, 9.6, 0);
  g.add(ind);
  const regionColor: Record<string, number> = { corte: 0x5a6270, activa: 0xffc83a, 'saturación': 0x37e08a, inversa: 0xff4d6d };
  return simple(g, (v) => {
    if (!v?.region) {
      indMat.opacity = 0;
      return;
    }
    indMat.opacity = 0.95;
    indMat.color.setHex(regionColor[v.region] ?? 0x888888);
  });
};

/* ---------------- batería 9 V ---------------- */

const battery9vBuilder: Builder = (p, terms) => {
  const g = new THREE.Group();
  const W = 26.5;
  const H = 17.5;
  const D = 48.5;
  const shell = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 1.6), std('batt', { color: 0x16181c, roughness: 0.35, metalness: 0.4 }));
  shell.position.y = H / 2;
  g.add(shell);
  const chem = String(p.chemistry);
  const accent = chem === 'lithium' ? '#3aa0ff' : chem === 'nimh' ? '#36d27a' : '#e8b34a';
  const labelMat = own(
    new THREE.MeshStandardMaterial({
      map: textTexture(['9V  ' + (chem === 'lithium' ? 'LITIO' : chem === 'nimh' ? 'NiMH' : 'ALCALINA')], { w: 640, h: 300, bg: '#1b1e24', fg: accent, font: 'bold 120px "Segoe UI", sans-serif' }),
      roughness: 0.5,
    }),
  );
  // El texto corre a lo largo del eje mayor de la batería (z).
  const labelGeo = new THREE.PlaneGeometry(D - 10, W - 4);
  labelGeo.rotateX(-Math.PI / 2);
  labelGeo.rotateY(Math.PI / 2);
  const label = new THREE.Mesh(labelGeo, labelMat);
  label.position.y = H + 0.02;
  g.add(label);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(W - 1, H - 1, 1.2), MAT.darkPlastic());
  cap.position.set(0, H / 2, D / 2 + 0.3);
  g.add(cap);
  for (const t of terms) {
    const isNeg = t.id === '-';
    const snapGeo = isNeg ? new THREE.CylinderGeometry(4, 4, 3.2, 6) : new THREE.CylinderGeometry(2.9, 2.9, 3.2, 28);
    snapGeo.rotateX(Math.PI / 2);
    const snap = new THREE.Mesh(snapGeo, MAT.steel());
    snap.position.set(t.local.x, t.height ?? 8.75, D / 2 + 2.2);
    g.add(snap);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), own(new THREE.MeshBasicMaterial({ map: textTexture([isNeg ? '−' : '+'], { w: 64, h: 64, bg: '#16181c', fg: isNeg ? '#7aa2ff' : '#ff5a5a', font: 'bold 56px sans-serif' }) })));
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(t.local.x, H + 0.04, D / 2 - 5);
    g.add(mark);
  }
  addPickTargets(g, terms, false);
  return simple(g);
};

/* ---------------- fuente de laboratorio ---------------- */

const supplyBuilder: Builder = (p, terms) => {
  const g = new THREE.Group();
  const W = 110;
  const H = 62;
  const D = 80;
  const case_ = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 3), std('supplyCase', { color: 0x2b3038, roughness: 0.45, metalness: 0.3 }));
  case_.position.y = H / 2;
  g.add(case_);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(W - 6, H - 6, 1), std('supplyPanel', { color: 0x1a1d22, roughness: 0.6 }));
  panel.position.set(0, H / 2, D / 2 + 0.2);
  g.add(panel);
  const dispTex = textTexture(['--.-- V', '---- mA'], { w: 512, h: 256, bg: '#050806', fg: '#59ff8a', font: 'bold 86px "Consolas", monospace' });
  const display = new THREE.Mesh(new THREE.PlaneGeometry(56, 28), own(new THREE.MeshBasicMaterial({ map: dispTex })));
  display.position.set(-20, H / 2 + 12, D / 2 + 0.8);
  g.add(display);
  const brand = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 7),
    own(new THREE.MeshBasicMaterial({ map: textTexture(['FUENTE DC 0–30 V / 5 A'], { w: 512, h: 90, bg: '#1a1d22', fg: '#9aa4b2', font: 'bold 44px "Segoe UI", sans-serif' }) })),
  );
  brand.position.set(-20, H / 2 - 9, D / 2 + 0.8);
  g.add(brand);
  // Perillas (V y A)
  for (const [i, x] of [-38, -2].entries()) {
    const kGeo = new THREE.CylinderGeometry(5, 5.5, 6, 28);
    kGeo.rotateX(Math.PI / 2);
    const knob = new THREE.Mesh(kGeo, MAT.black());
    knob.position.set(x, 13, D / 2 + 3.5);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.5), std('knobMark', { color: 0xdfe5ec }));
    mark.position.set(x, 15.5, D / 2 + 6.6);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), own(new THREE.MeshBasicMaterial({ map: textTexture([i === 0 ? 'VOLT' : 'AMP'], { w: 128, h: 48, bg: '#1a1d22', fg: '#9aa4b2', font: 'bold 34px sans-serif' }) })));
    lbl.position.set(x, 4.5, D / 2 + 0.8);
    g.add(knob, mark, lbl);
  }
  // Bornes de salida
  for (const t of terms) {
    const isPos = t.id === '+';
    const postGeo = new THREE.CylinderGeometry(3.6, 4, 7, 24);
    postGeo.rotateX(Math.PI / 2);
    const post = new THREE.Mesh(postGeo, isPos ? MAT.red() : MAT.black());
    post.position.set(t.local.x, t.height ?? 16, D / 2 + 3.5);
    const tipGeo = new THREE.CylinderGeometry(1.6, 1.6, 3, 16);
    tipGeo.rotateX(Math.PI / 2);
    const tip = new THREE.Mesh(tipGeo, MAT.gold());
    tip.position.set(t.local.x, t.height ?? 16, D / 2 + 8);
    g.add(post, tip);
  }
  // El punto de conexión de cada terminal es la punta dorada del borne (frente, +z).
  addPickTargets(g, terms, false);
  const ccLed = own(new THREE.MeshBasicMaterial({ color: 0x3a1010 }));
  const cc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16), ccLed);
  cc.position.set(30, H / 2 + 20, D / 2 + 0.8);
  const cvLed = own(new THREE.MeshBasicMaterial({ color: 0x103a18 }));
  const cv = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16), cvLed);
  cv.position.set(38, H / 2 + 20, D / 2 + 0.8);
  const modeLbl = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), own(new THREE.MeshBasicMaterial({ map: textTexture(['CC   CV'], { w: 160, h: 40, bg: '#1a1d22', fg: '#9aa4b2', font: 'bold 30px sans-serif' }) })));
  modeLbl.position.set(34, H / 2 + 15, D / 2 + 0.8);
  g.add(cc, cv, modeLbl);
  let lastText = '';
  const idle = () => [`${num(p, 'voltage').toFixed(2)} V`, `${(num(p, 'ilim') * 1000).toFixed(0)} mA lím`];
  drawText(dispTex, idle(), { bg: '#050806', fg: '#2f8a4c', font: 'bold 86px "Consolas", monospace' });
  return simple(g, (v) => {
    const lines = v?.display ? v.display.slice(0, 2) : idle();
    const key = lines.join('|') + (v ? 'on' : 'off');
    if (key !== lastText) {
      lastText = key;
      drawText(dispTex, lines, { bg: '#050806', fg: v ? '#59ff8a' : '#2f8a4c', font: 'bold 86px "Consolas", monospace' });
    }
    const mode = v?.display?.[2];
    ccLed.color.setHex(mode === 'CC' ? 0xff3030 : 0x3a1010);
    cvLed.color.setHex(mode === 'CV' ? 0x40ff70 : 0x103a18);
  });
};

/* ---------------- entradas ---------------- */

const pushbuttonBuilder: Builder = (_p, terms) => {
  const g = new THREE.Group();
  const cx = PITCH;
  const cz = 1.5 * PITCH;
  const base = new THREE.Mesh(new RoundedBoxGeometry(6, 3.4, 6, 2, 0.3), MAT.blackPlastic());
  base.position.set(cx, 2.4, cz);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.3, 6.1), MAT.steel());
  plate.position.set(cx, 4.2, cz);
  const actMat = std('actuator', { color: 0x30343b, roughness: 0.5 });
  const act = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 1.6, 24), actMat);
  act.position.set(cx, 5.1, cz);
  g.add(base, plate, act);
  for (const t of terms) {
    const inX = t.local.x < cx ? cx - 2.6 : cx + 2.6;
    g.add(leadMesh([new THREE.Vector3(inX, 1.2, t.local.z), new THREE.Vector3(t.local.x, 1.2, t.local.z), new THREE.Vector3(t.local.x, -2.2, t.local.z)], 0.3, MAT.tin()));
  }
  addPickTargets(g, terms, true);
  return simple(g, (v) => {
    act.position.y = v?.pressed ? 4.6 : 5.1;
  });
};

const slideSwitchBuilder: Builder = (p, terms) => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(8.6, 3.6, 3.6), MAT.blackPlastic());
  body.position.y = 3.6;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.3, 3.8), MAT.steel());
  frame.position.y = 5.5;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3, 1.6), std('lever', { color: 0x2f6cf6, roughness: 0.4 }));
  const setPos = (b: boolean) => lever.position.set(b ? 1.4 : -1.4, 6.9, 0);
  setPos(String(p.position) === 'B');
  g.add(body, frame, lever);
  for (const t of terms) g.add(leadMesh([new THREE.Vector3(t.local.x, 2, 0), new THREE.Vector3(t.local.x, -2.2, 0)], 0.3, MAT.tin()));
  addPickTargets(g, terms, true);
  return simple(g);
};

const BUILDERS: Record<string, Builder> = {
  resistor: resistorBuilder,
  diode: diodeBuilder,
  led: ledBuilder,
  'capacitor-ceramic': ceramicBuilder,
  'capacitor-electrolytic': electrolyticBuilder,
  npn: to92Builder,
  pnp: to92Builder,
  'battery-9v': battery9vBuilder,
  'dc-supply': supplyBuilder,
  pushbutton: pushbuttonBuilder,
  'slide-switch': slideSwitchBuilder,
};

export function buildComponentVisual(type: string, params: Params, terms: TerminalDef[]): ComponentVisual {
  const b = BUILDERS[type];
  if (!b) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), MAT.darkPlastic()));
    addPickTargets(g, terms, true);
    return simple(g);
  }
  return b(params, terms);
}
