import { describe, expect, test } from "vitest";

import { findTiles, getTileTypes, initializeTiles } from "./algo";
import { BUILDING_TYPES } from "./constants";

const tilesFor = (values: number[][]) => {
  initializeTiles(values);
  findTiles();
  return getTileTypes();
};

describe("algorithm layout", () => {
  test("each building shape supports every contribution value through 3000", () => {
    for (const shape of [0, 1, 2] as const) {
      for (let value = 1; value <= 3000; value++) {
        expect(
          BUILDING_TYPES[shape].some((model) => value >= model.min && value <= model.max),
        ).toBe(true);
      }
    }
  });

  test("finds road types and directions, including edge-of-grid roads", () => {
    expect(
      tilesFor([
        [1, 0, 1],
        [1, 0, 1],
        [1, 0, 1],
      ])[1]![1],
    ).toMatchObject({ tile: 1, type: 0, dir: 0 });
    expect(
      tilesFor([
        [1, 1, 1],
        [0, 0, 0],
        [1, 1, 1],
      ])[1]![1],
    ).toMatchObject({ tile: 1, type: 0, dir: 1 });
    expect(
      tilesFor([
        [1, 0, 1],
        [1, 0, 0],
        [1, 0, 1],
      ])[1]![1],
    ).toMatchObject({ tile: 1, type: 1, dir: 2 });
    expect(
      tilesFor([
        [1, 0, 1],
        [0, 0, 0],
        [1, 0, 1],
      ])[1]![1],
    ).toMatchObject({ tile: 1, type: 2, dir: 0 });
    expect(
      tilesFor([
        [1, 0, 1],
        [1, 0, 0],
        [1, 1, 1],
      ])[1]![1],
    ).toMatchObject({ tile: 1, type: 3, dir: 1 });
    expect(tilesFor([[0, 1, 1]])[0]![0]).toMatchObject({ tile: 1, type: 0, dir: 1 });
  });

  test("replaces a 2x2 road square with grass and handles grid boundaries", () => {
    const tiles = tilesFor([
      [0, 0],
      [0, 0],
    ]);
    expect(tiles[1]![1]).toEqual({ tile: 0 });
    expect(() => tilesFor([[0]])).not.toThrow();
  });

  test("detects 1x1, 1x2, and L buildings and assigns each a model", () => {
    const one = tilesFor([[1]]);
    expect(one[0]![0]).toMatchObject({ tile: 2, type: 0, building: expect.any(Object) });
    const two = tilesFor([[1, 1]]);
    expect(two[0]![0]).toMatchObject({ tile: 2, type: 1, building: expect.any(Object) });
    const l = tilesFor([
      [1, 1],
      [0, 1],
    ]);
    expect(l.flat().some((tile) => tile.tile === 2 && tile.type === 2 && tile.building)).toBe(true);
  });

  test("assigns models to large contribution counts", () => {
    const tiles = tilesFor([[2583, 3000, 0, 0]]);
    expect(tiles[0]![0]).toMatchObject({ tile: 2, building: expect.any(Object) });
    expect(tiles[0]![1]).toMatchObject({ tile: 2, building: expect.any(Object) });
  });
});
