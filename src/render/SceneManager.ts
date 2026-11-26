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
  /** Fracción de la altura en que se desplaza la imagen hacia arriba (paneles inferiores en móvil). */
  verticalShift = 0;

  constructor(public readonly container: HTMLElement, quality: QualitySettings, options: { floor: boolean } = { floor: true }) {
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
    this.scene.environmentIntensity = 0.6;
    this.scene.background = new THREE.Color(0x0c0d10);
    this.scene.fog = new THREE.Fog(0x0c0d10, 60, 220);

    // Escala: 1 unidad = 1 Å.
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 1000);
    this.camera.position.set(9, 10, 14);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 160;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => (this.needsRender = true));

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x202226, 0.75));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.0);
    this.sun.position.set(18, 36, 24);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -30;
    sc.right = sc.top = 30;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 0.45);
    rim.position.set(-30, 20, -26);
    this.scene.add(rim);

    if (options.floor) this.scene.add(this.buildFloor());
    this.scene.add(this.content);
    this.scene.add(this.overlay);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
  }

  /** Plano de referencia: sombra suave + rejilla de 1 Å que se desvanece con la distancia. */
  private buildFloor(): THREE.Object3D {
    const g = new THREE.Group();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.28 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.receiveShadow = true;
    shadow.userData.floor = true;
    g.add(shadow);
    const grid = new THREE.GridHelper(80, 80, 0x3a3d44, 0x22242a);
    const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of mats) {
      m.transparent = true;
      m.opacity = 0.55;
      m.depthWrite = false;
    }
    grid.position.y = 0.001;
    g.add(grid);
    return g;
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
    if (this.verticalShift) this.camera.setViewOffset(w, h, 0, h * this.verticalShift, w, h);
    else this.camera.clearViewOffset();
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

  setView(kind: 'top' | 'front' | 'iso' | 'reset', focus = new THREE.Vector3(0, 1, 0)) {
    const d = Math.max(4, this.camera.position.distanceTo(this.controls.target));
    const pos =
      kind === 'top'
        ? new THREE.Vector3(0, d, 0.01)
        : kind === 'front'
          ? new THREE.Vector3(0, 0, d)
          : kind === 'iso'
            ? new THREE.Vector3(1, 1, 1).setLength(d)
            : new THREE.Vector3(9, 10, 14);
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
    const span = Math.max(box.getSize(new THREE.Vector3()).length(), 4) / Math.min(1, Math.max(0.45, this.camera.aspect));
    const dist = (span / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.15;
    const dir = new THREE.Vector3(0.45, 0.55, 0.7).normalize();
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
