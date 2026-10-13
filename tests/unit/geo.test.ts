import { describe, expect, it } from "vitest";
import { formatStraightLine, haversineMetres } from "@domain";

describe("straight-line distance", () => {
  it("computes a known great-circle distance within a small tolerance", () => {
    // Berlin Hauptbahnhof -> Alexanderplatz: ~2.99 km as the crow flies.
    const metres = haversineMetres({ lat: 52.5251, lon: 13.3694 }, { lat: 52.5219, lon: 13.4132 });
    expect(metres).toBeGreaterThan(2900);
    expect(metres).toBeLessThan(3100);
    // Sanity-check the scale against a second known pair (~1.11 km).
    const short = haversineMetres({ lat: 52.52, lon: 13.405 }, { lat: 52.53, lon: 13.405 });
    expect(short).toBeGreaterThan(1050);
    expect(short).toBeLessThan(1180);
  });

  it("is zero for the same point", () => {
    expect(haversineMetres({ lat: 52.5, lon: 13.4 }, { lat: 52.5, lon: 13.4 })).toBeCloseTo(0, 6);
  });

  it("never labels the number as a walking route or travel time", () => {
    expect(formatStraightLine(2400)).toBe("2.4 km straight-line");
    expect(formatStraightLine(480)).toBe("480 m straight-line");
    expect(formatStraightLine(null)).toBe("distance unknown");
    expect(formatStraightLine(2400)).not.toMatch(/walk|minute|travel/i);
  });
});
