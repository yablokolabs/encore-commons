import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Reads the recorded fixture metadata directly from disk so tests can assert
 * that replay data is genuinely recorded and comes from the hackathon origin.
 */
export function recordFixturesArePresent(): {
  origin: string;
  recordedAt: string;
  placeCount: number;
  profileCount: number;
} {
  const path = resolve(process.cwd(), "fixtures/replay/insights.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    origin?: string;
    recordedAt?: string;
    places?: Record<string, unknown>;
    profiles?: Record<string, unknown>;
  };
  return {
    origin: raw.origin ?? "",
    recordedAt: raw.recordedAt ?? "",
    placeCount: Object.keys(raw.places ?? {}).length,
    profileCount: Object.keys(raw.profiles ?? {}).length,
  };
}
