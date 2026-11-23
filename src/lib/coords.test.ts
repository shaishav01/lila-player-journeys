import { describe, expect, it } from "vitest";
import { imageToWorld, worldToImage } from "./coords";

const AMBROSE = { scale: 900, originX: -370, originZ: -473, image: "" };

describe("worldToImage", () => {
  it("matches the worked example in the dataset README (1024 px image)", () => {
    const [px, py] = worldToImage(-301.45, -355.55, AMBROSE, 1024);
    expect(Math.round(px)).toBe(78);
    expect(Math.round(py)).toBe(890);
  });

  it("puts the world origin at the bottom-left corner", () => {
    expect(worldToImage(-370, -473, AMBROSE, 1000)).toEqual([0, 1000]);
  });

  it("round-trips through imageToWorld", () => {
    const [px, py] = worldToImage(12.5, -40.25, AMBROSE);
    const [x, z] = imageToWorld(px, py, AMBROSE);
    expect(x).toBeCloseTo(12.5, 6);
    expect(z).toBeCloseTo(-40.25, 6);
  });
});
