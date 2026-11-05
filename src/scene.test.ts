import { afterEach, describe, expect, test, vi } from "vitest";
import * as THREE from "three";

const loaderMock = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load = loaderMock.load;
  },
}));

import { changeShadowPreset, clearScene, renderBuilding } from "./scene";

afterEach(() => loaderMock.load.mockReset());

describe("scene operations without WebGL", () => {
  test("clearScene removes generated objects and preserves environment objects", () => {
    const scene = new THREE.Scene();
    const building = new THREE.Group();
    building.name = "Building";
    const environment = new THREE.Group();
    environment.name = "Environment";
    scene.add(building, environment);
    clearScene(scene);
    expect(scene.children).toEqual([environment]);
  });

  test("renderBuilding caps height and loads ground, floors, and roof by level", () => {
    const loaded: string[] = [];
    loaderMock.load.mockImplementation(
      (url: string, onLoad: (gltf: { scene: THREE.Group }) => void) => {
        loaded.push(url);
        onLoad({ scene: new THREE.Group() });
      },
    );
    const scene = new THREE.Scene();
    renderBuilding(
      0,
      0,
      0,
      {
        value: 50,
        type: 0,
        dir: 0,
        building: { groundUrl: "ground.glb", floorUrl: "floor.glb", roofUrl: "roof.glb" },
      },
      scene,
    );
    expect(loaded).toHaveLength(35);
    expect(loaded[0]).toContain("ground.glb");
    expect(loaded.slice(1, -1).every((url) => url.includes("floor.glb"))).toBe(true);
    expect(loaded.at(-1)).toContain("roof.glb");
    expect(scene.children).toHaveLength(35);
  });

  test("selects ground then roof for a one-floor model", () => {
    const loaded: string[] = [];
    loaderMock.load.mockImplementation(
      (url: string, onLoad: (gltf: { scene: THREE.Group }) => void) => {
        loaded.push(url);
        onLoad({ scene: new THREE.Group() });
      },
    );
    renderBuilding(
      0,
      0,
      0,
      { value: 1, type: 0, dir: 0, building: { groundUrl: "ground.glb", roofUrl: "roof.glb" } },
      new THREE.Scene(),
    );
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toContain("ground.glb");
  });

  test("shadow presets tolerate a null shadow map", () => {
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight();
    light.shadow.map = null;
    scene.add(light);
    expect(() => changeShadowPreset(scene, "2")).not.toThrow();
    expect(light.shadow.mapSize.width).toBe(2048);
    expect(light.shadow.map).toBeNull();
  });
});
