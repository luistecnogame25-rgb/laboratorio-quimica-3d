import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface QualitySettings {
  shadows: boolean;
  pixelRatio: number;
}

/**
 * Renderizador, cámara orbital, luces y mesa de trabajo.
 * No conoce el circuito: solo ofrece la escena y utilidades de raycasting.
 */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly content = new THREE.Group();
  readonly overlay = new THREE.Group();
  readonly raycaster = new THREE.Raycaster();
  private sun: THREE.DirectionalLight;
  private frameCallbacks = new Set<(dt: number) => void>();
  private last = performance.now();
  private running = false;
  private resizeObs: ResizeObserver;
  needsRender = true;

  constructor(public readonly container: HTMLElement, quality: QualitySettings) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('lab-canvas');

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.background = new THREE.Color(0x0b0f16);
    this.scene.fog = new THREE.Fog(0x0b0f16, 900, 2600);

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 6000);
    this.camera.position.set(40, 230, 250);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 10);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 1600;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => (this.needsRender = true));

    const hemi = new THREE.HemisphereLight(0xdbe8ff, 0x1a1f28, 0.7);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(180, 380, 220);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -320;
    sc.right = sc.top = 320;
    sc.near = 50;
    sc.far = 1200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.4;
    this.scene.add(this.sun);
    const rim = new THREE.DirectionalLight(0x7fb2ff, 0.5);
    rim.position.set(-300, 200, -260);
    this.scene.add(rim);

    this.scene.add(this.buildTable());
    this.scene.add(this.content);
    this.scene.add(this.overlay);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
  }

  private buildTable(): THREE.Object3D {
    const size = 2400;
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = '#18202c';
    g.fillRect(0, 0, 512, 512);
    // Cuadrícula de 10 mm con línea mayor cada 50 mm (tapete antiestático)
    for (let i = 0; i <= 512; i += 512 / 10) {
      const major = Math.round(i) % (512 / 2) === 0;
      g.strokeStyle = major ? 'rgba(120,160,210,0.22)' : 'rgba(120,160,210,0.09)';
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(size / 100, size / 100);
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.userData.table = true;
    return mesh;
  }

  setQuality(q: QualitySettings) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.needsRender = true;
  }

  onFrame(cb: (dt: number) => void): () => void {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.controls.update()) this.needsRender = true;
    for (const cb of this.frameCallbacks) cb(dt);
    // Render bajo demanda: ahorra batería cuando nada cambia.
    if (this.needsRender) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Rayo desde coordenadas de puntero (clientX/Y). */
  ray(clientX: number, clientY: number): THREE.Raycaster {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }

  /** Intersección con el plano horizontal y = h. */
  planeHit(clientX: number, clientY: number, h = 0): THREE.Vector3 | null {
    const ray = this.ray(clientX, clientY).ray;
    const p = new THREE.Vector3();
    return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), p) ? p : null;
  }

  /** Proyección a coordenadas de pantalla (para etiquetas HTML). */
  toScreen(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height, visible: p.z < 1 && p.z > -1 };
  }

  setView(kind: 'top' | 'front' | 'iso' | 'reset', focus = new THREE.Vector3(0, 0, 10)) {
    const d = this.camera.position.distanceTo(this.controls.target);
    const pos =
      kind === 'top'
        ? new THREE.Vector3(0, Math.max(d, 200), 0.01)
        : kind === 'front'
          ? new THREE.Vector3(0, 90, Math.max(d, 220))
          : kind === 'iso'
            ? new THREE.Vector3(180, 200, 200)
            : new THREE.Vector3(40, 230, 250);
    this.controls.target.copy(focus);
    this.camera.position.copy(focus.clone().add(pos));
    this.controls.update();
    this.needsRender = true;
  }

  /** Encuadra todo el contenido de la mesa (vista en perspectiva 3/4). */
  frameContent() {
    const box = new THREE.Box3().setFromObject(this.content);
    if (box.isEmpty()) {
      this.setView('reset');
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    center.y = 0;
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x / Math.max(this.camera.aspect, 0.6), size.z * 1.2, 80);
    const dist = (span / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.05;
    const dir = new THREE.Vector3(0.12, 0.78, 0.62).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center.clone().addScaledVector(dir, dist));
    this.controls.update();
    this.needsRender = true;
  }

  zoom(factor: number) {
    const t = this.controls.target;
    const dir = this.camera.position.clone().sub(t);
    const len = THREE.MathUtils.clamp(dir.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(t.clone().add(dir.setLength(len)));
    this.needsRender = true;
  }

  dispose() {
    this.stop();
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
