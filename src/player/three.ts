import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { SpaceDefinition, SpaceFrame, Vec3 } from "../document/types.ts";
import {
  axesEnabled,
  initialCamera,
  shownPoints,
  strokePaths,
  arrowTips,
  type RenderAdapter,
} from "./adapter.ts";
import { transformSpacePoint } from "../document/space-transform.ts";
export function createThreeAdapter(
  space: SpaceDefinition,
  changed: () => void,
  onError: (e: Error) => void,
): RenderAdapter {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch {
    throw new Error(
      "3D rendering is unavailable: this device could not create a WebGL2 context.",
    );
  }
  const element = renderer.domElement;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const state = initialCamera(space),
    scene = new THREE.Scene(),
    objects = new THREE.Group();
  scene.add(objects);
  scene.add(new THREE.AmbientLight(0xffffff, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(3, -4, 8);
  scene.add(light);
  const camera =
    state.projection === "orthographic"
      ? new THREE.OrthographicCamera(-5, 5, 5, -5, 0.01, 10000)
      : new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  camera.up.set(0, 0, 1);
  camera.position.fromArray(state.position);
  const controls = new OrbitControls(camera, element);
  controls.target.fromArray(state.center);
  controls.enableDamping = false;
  controls.zoomToCursor = true;
  let applyingCamera = false;
  let nonInteractive = new Set<string>();
  const sync = () => {
    if (applyingCamera) return;
    state.position = camera.position.toArray() as Vec3;
    state.center = controls.target.toArray() as Vec3;
    state.scale = baseScale * camera.zoom;
    changed();
  };
  let width = 1,
    height = 1,
    baseScale = state.scale;
  controls.addEventListener("change", sync);
  controls.update();
  const lost = (e: Event) => {
    e.preventDefault();
    onError(
      new Error(
        "WebGL context lost; reload the document to restore 3D rendering.",
      ),
    );
  };
  element.addEventListener("webglcontextlost", lost);
  type Drawable = THREE.Mesh | THREE.Line | THREE.Points;
  const cached = new Map<string, Drawable>();
  let used = new Set<string>();
  let lastFrame: SpaceFrame | undefined;
  let lastHover: string | null = null;
  let handles: { id: string; at: Vec3; radius: number }[] = [];
  const handleMaterial = () => {
    const material = new THREE.PointsMaterial({
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
    });
    material.userData.dragHandle = true;
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif (distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;",
      );
    };
    material.customProgramCacheKey = () => "webnim-drag-handle-circle";
    return material;
  };
  const releaseNode = (node: Drawable) => {
    node.geometry.dispose();
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      material.dispose();
    node.removeFromParent();
  };
  const release = () => {
    for (const node of cached.values()) releaseNode(node);
    cached.clear();
    lastFrame = undefined;
  };
  const retain = <T extends Drawable>(key: string, create: () => T): T => {
    used.add(key);
    let node = cached.get(key);
    if (!node) {
      node = create();
      cached.set(key, node);
      objects.add(node);
    }
    return node as T;
  };
  const style = (node: Drawable, color: string, opacity: number) => {
    const material = node.material as THREE.MeshBasicMaterial;
    material.color.set(color);
    const transparent = opacity < 1 || material.userData.dragHandle === true;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true;
    }
    material.opacity = opacity;
  };
  const positions = (geometry: THREE.BufferGeometry, points: Vec3[]) => {
    let attribute = geometry.getAttribute("position") as
      THREE.BufferAttribute | undefined;
    let dirty = !attribute || attribute.count !== points.length;
    if (dirty) {
      if (attribute) {
        geometry.dispose();
        geometry.deleteAttribute("normal");
      }
      attribute = new THREE.BufferAttribute(
        new Float32Array(points.length * 3),
        3,
      );
      geometry.setAttribute("position", attribute);
    }
    const array = attribute!.array;
    for (let i = 0; i < points.length; i++)
      for (let k = 0; k < 3; k++) {
        const value = Math.fround(points[i][k]);
        if (array[i * 3 + k] !== value) {
          array[i * 3 + k] = value;
          dirty = true;
        }
      }
    if (dirty) {
      attribute!.needsUpdate = true;
      geometry.computeBoundingSphere();
      geometry.boundingBox = null;
    }
    return dirty;
  };
  const indices = (geometry: THREE.BufferGeometry, values: number[]) => {
    const previous = geometry.index?.array;
    if (
      previous?.length === values.length &&
      values.every((v, i) => previous[i] === v)
    )
      return false;
    geometry.setIndex(values);
    return true;
  };
  const makeLine = (
    key: string,
    points: Vec3[],
    color: string,
    opacity = 1,
    id?: string,
  ) => {
    const line = retain(
      key,
      () =>
        new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial(),
        ),
    );
    positions(line.geometry, points);
    style(line, color, opacity);
    if (id) line.userData.id = id;
  };
  const project = (p: Vec3): Vec3 => {
    const v = new THREE.Vector3(...p).project(camera);
    return [((v.x + 1) * width) / 2, ((1 - v.y) * height) / 2, v.z];
  };
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line!.threshold = 0.09;
  raycaster.params.Points!.threshold = 0.1;
  return {
    element,
    camera: state,
    setCamera(value) {
      applyingCamera = true;
      try {
        camera.position.fromArray(value.position);
        controls.target.fromArray(value.center);
        camera.zoom = value.scale / baseScale;
        camera.updateProjectionMatrix();
        controls.update();
        camera.updateMatrixWorld();
        Object.assign(state, structuredClone(value));
      } finally {
        applyingCamera = false;
      }
    },
    project,
    resize(w, h) {
      width = w;
      height = h;
      renderer.setSize(w, h);
      if (camera instanceof THREE.PerspectiveCamera) camera.aspect = w / h;
      else {
        camera.left = -w / (2 * baseScale);
        camera.right = w / (2 * baseScale);
        camera.top = h / (2 * baseScale);
        camera.bottom = -h / (2 * baseScale);
      }
      camera.updateProjectionMatrix();
    },
    draw(frame, hover) {
      nonInteractive = new Set(
        frame.objects.filter((o) => o.interactive === false).map((o) => o.id),
      );
      if (frame === lastFrame && hover === lastHover) {
        camera.updateMatrixWorld();
        renderer.render(scene, camera);
        return;
      }
      used.clear();
      handles = [];
      lastFrame = frame;
      lastHover = hover;
      scene.background = new THREE.Color(frame.theme.background);
      const map = (p: Vec3) => transformSpacePoint(p, frame.transforms);
      const gridPoints: Vec3[] = [],
        axisPoints: Vec3[][] = [[], [], []];
      if (space.grid !== false)
        for (let i = -10; i <= 10; i++) {
          gridPoints.push(map([i, -10, 0]), map([i, 10, 0]));
          gridPoints.push(map([-10, i, 0]), map([10, i, 0]));
        }
      for (const [axis, k] of [
        ["x", 0],
        ["y", 1],
        ["z", 2],
      ] as const)
        if (axesEnabled(space, axis)) {
          const a: Vec3 = [0, 0, 0],
            b: Vec3 = [0, 0, 0];
          a[k] = -10;
          b[k] = 10;
          axisPoints[k].push(map(a), map(b));
          if (space.ticks !== false)
            for (let i = -10; i <= 10; i++) {
              const p: Vec3 = [0, 0, 0],
                q: Vec3 = [0, 0, 0];
              p[k] = q[k] = i;
              p[(k + 1) % 3] = -0.07;
              q[(k + 1) % 3] = 0.07;
              axisPoints[k].push(map(p), map(q));
            }
        }
      for (const [key, points, color, opacity] of [
        ["grid", gridPoints, frame.theme.grid, 1],
        ["axis:x", axisPoints[0], frame.theme.axes, 1],
        ["axis:y", axisPoints[1], frame.theme.axes, 1],
        ["axis:z", axisPoints[2], frame.theme.axes, 1],
      ] as const) {
        if (!points.length || opacity <= 0) continue;
        const lines = retain(
          key,
          () =>
            new THREE.LineSegments(
              new THREE.BufferGeometry(),
              new THREE.LineBasicMaterial(),
            ),
        );
        positions(lines.geometry, points);
        style(lines, color, opacity);
      }
      for (const o of frame.objects) {
        if (!o.visible || o.opacity <= 0 || !o.geometry.points.length) continue;
        const color = o.id === hover ? "#ffffff" : o.color;
        if (o.geometry.kind === "mesh") {
          const mesh = retain(
            `${o.id}:mesh`,
            () =>
              new THREE.Mesh(
                new THREE.BufferGeometry(),
                new THREE.MeshStandardMaterial({
                  side: THREE.DoubleSide,
                  roughness: 0.65,
                }),
              ),
          );
          const changed = positions(mesh.geometry, o.geometry.points);
          const topologyChanged = indices(
            mesh.geometry,
            o.geometry.indices ?? [],
          );
          if (changed || topologyChanged) mesh.geometry.computeVertexNormals();
          style(mesh, color, o.opacity);
          mesh.userData.id = o.id;
        } else if (o.geometry.kind === "point") {
          const point = retain(
            `${o.id}:point`,
            () =>
              new THREE.Points(
                new THREE.BufferGeometry(),
                o.draggable
                  ? handleMaterial()
                  : new THREE.PointsMaterial({ sizeAttenuation: false }),
              ),
          );
          positions(point.geometry, o.geometry.points);
          style(point, o.draggable ? o.color : color, o.opacity);
          (point.material as THREE.PointsMaterial).size =
            (o.style.pointSize ?? 5) *
            2 *
            Math.hypot(o.matrix[0], o.matrix[4], o.matrix[8]);
          if (o.draggable) {
            const radius = Math.max(6, o.style.pointSize ?? 6);
            (point.material as THREE.PointsMaterial).size = radius * 2;
            point.renderOrder = 1001;
            const halo = retain(
              `${o.id}:halo`,
              () =>
                new THREE.Points(new THREE.BufferGeometry(), handleMaterial()),
            );
            positions(halo.geometry, o.geometry.points);
            style(halo, o.color, o.opacity * (hover === o.id ? 0.32 : 0.2));
            (halo.material as THREE.PointsMaterial).size = (radius + 7) * 2;
            halo.renderOrder = 1000;
            // Keep both parts in the transparent pass, above world geometry.
            (point.material as THREE.PointsMaterial).transparent = true;
            halo.userData.id = o.id;
            handles.push({
              id: o.id,
              at: o.geometry.points[0],
              radius: radius + 12,
            });
          }
          point.userData.id = o.id;
        } else if (o.geometry.kind === "path") {
          const points = shownPoints(o);
          if (o.geometry.dash || o.geometry.breaks) {
            const segments = retain(
              `${o.id}:dashes`,
              () =>
                new THREE.LineSegments(
                  new THREE.BufferGeometry(),
                  new THREE.LineBasicMaterial(),
                ),
            );
            positions(
              segments.geometry,
              strokePaths(o).flatMap((path) =>
                path.slice(1).flatMap((p, i) => [path[i], p]),
              ),
            );
            style(segments, color, o.opacity);
            segments.userData.id = o.id;
          } else makeLine(`${o.id}:path`, points, color, o.opacity, o.id);
          if (
            o.geometry.closed &&
            (o.fillReveal ?? o.reveal) > 0 &&
            (o.style.fillOpacity ?? 0.15) > 0
          ) {
            const mesh = retain(
              `${o.id}:fill`,
              () =>
                new THREE.Mesh(
                  new THREE.BufferGeometry(),
                  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
                ),
            );
            if (positions(mesh.geometry, o.geometry.points)) {
              mesh.geometry.setIndex(
                o.geometry.indices ??
                  (o.geometry.breaks ?? [0]).flatMap((start, i, starts) =>
                    THREE.ShapeUtils.triangulateShape(
                      o.geometry.points
                        .slice(start, starts[i + 1] ?? o.geometry.points.length)
                        .map((p) => new THREE.Vector2(p[0], p[1])),
                      [],
                    )
                      .flat()
                      .map((index) => index + start),
                  ),
              );
            }
            style(
              mesh,
              color,
              o.opacity *
                (o.style.fillOpacity ?? 0.15) *
                (o.fillReveal ?? o.reveal),
            );
            mesh.userData.id = o.id;
          }
          if (o.geometry.arrows) {
            const heads = retain(
              `${o.id}:heads`,
              () =>
                new THREE.LineSegments(
                  new THREE.BufferGeometry(),
                  new THREE.LineBasicMaterial(),
                ),
            );
            const headPoints: Vec3[] = [];
            for (const [tip, adjacent] of arrowTips(o, points)) {
              const direction = new THREE.Vector3(...tip).sub(
                new THREE.Vector3(...adjacent),
              );
              const length = Math.min(0.18, direction.length() / 3);
              direction.normalize();
              const side = new THREE.Vector3(-direction.y, direction.x, 0);
              if (side.length() < 1e-8) side.set(1, 0, 0);
              else side.normalize();
              const center = new THREE.Vector3(...tip).addScaledVector(
                direction,
                -length,
              );
              for (const sign of [-1, 1])
                headPoints.push(
                  tip,
                  center
                    .clone()
                    .addScaledVector(side, sign * length * 0.4)
                    .toArray() as Vec3,
                );
            }
            positions(heads.geometry, headPoints);
            style(heads, color, o.opacity);
            heads.userData.id = o.id;
          }
          for (const [index, [tip, adjacent]] of (o.geometry.arrows
            ? []
            : arrowTips(o, points)
          ).entries()) {
            const a = new THREE.Vector3(...adjacent),
              b = new THREE.Vector3(...tip),
              direction = b.clone().sub(a).normalize(),
              cone = retain(
                `${o.id}:arrow:${index}`,
                () =>
                  new THREE.Mesh(
                    new THREE.ConeGeometry(0.07, 0.2, 12),
                    new THREE.MeshBasicMaterial(),
                  ),
              );
            style(cone, color, o.opacity);
            cone.quaternion.setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              direction,
            );
            cone.scale.setScalar(o.arrowScale ?? 1);
            cone.position.copy(
              b.addScaledVector(direction, -0.1 * (o.arrowScale ?? 1)),
            );
            cone.userData.id = o.id;
          }
        }
      }
      for (const [key, node] of cached) {
        if (!used.has(key)) {
          releaseNode(node);
          cached.delete(key);
        }
      }
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
    },
    pick(x, y) {
      for (let i = handles.length - 1; i >= 0; i--) {
        const handle = handles[i],
          p = project(handle.at);
        if (
          p[2] >= -1 &&
          p[2] <= 1 &&
          Math.hypot(x - p[0], y - p[1]) <= handle.radius
        )
          return handle.id;
      }
      raycaster.setFromCamera(
        new THREE.Vector2((x / width) * 2 - 1, 1 - (y / height) * 2),
        camera,
      );
      return (
        raycaster
          .intersectObjects(objects.children, true)
          .find(
            (h) =>
              h.object.userData.id && !nonInteractive.has(h.object.userData.id),
          )?.object.userData.id ?? null
      );
    },
    navigate(value) {
      controls.enabled = value;
    },
    reset() {
      const initial = initialCamera(space);
      baseScale = initial.scale;
      camera.position.fromArray(initial.position);
      camera.zoom = 1;
      controls.target.fromArray(initial.center);
      camera.updateProjectionMatrix();
      controls.update();
      sync();
    },
    dispose() {
      controls.removeEventListener("change", sync);
      controls.dispose();
      element.removeEventListener("webglcontextlost", lost);
      release();
      renderer.dispose();
      renderer.forceContextLoss();
      element.remove();
    },
  };
}
