import type { TraceStep } from "@domain";
import { fingerprint } from "@domain";

/**
 * Trace recorder.
 *
 * Every allowlisted tool call appends one row. Rows carry a non-reversible
 * fingerprint of the input instead of the raw private text, so the trace is
 * inspectable without becoming a copy of somebody's taste profile. Credentials
 * never reach a row: the adapters never put them in an error message.
 */
export class TraceRecorder {
  private readonly steps: TraceStep[] = [];
  private readonly started: number;

  constructor(private readonly now: () => number = Date.now) {
    this.started = this.now();
  }

  async record<T>(
    step: string,
    tool: TraceStep["tool"] | string,
    inputDescription: string,
    run: () => Promise<T>,
    summarise: (result: T) => { entityIds: string[]; resultCount: number; warnings?: string[] },
  ): Promise<T> {
    const startedAt = this.now();
    try {
      const result = await run();
      const summary = summarise(result);
      this.push({
        step,
        tool,
        status: summary.resultCount === 0 ? "empty" : "ok",
        latencyMs: this.now() - startedAt,
        inputHash: fingerprint(inputDescription),
        entityIds: summary.entityIds.slice(0, 12),
        resultCount: summary.resultCount,
        warnings: summary.warnings ?? [],
      });
      return result;
    } catch (error) {
      this.push({
        step,
        tool,
        status: "error",
        latencyMs: this.now() - startedAt,
        inputHash: fingerprint(inputDescription),
        entityIds: [],
        resultCount: 0,
        warnings: [error instanceof Error ? error.message.slice(0, 200) : "tool call failed"],
      });
      throw error;
    }
  }

  recordSkip(step: string, tool: string, reason: string): void {
    this.push({
      step,
      tool,
      status: "skipped",
      latencyMs: 0,
      inputHash: fingerprint(`${step}:${reason}`),
      entityIds: [],
      resultCount: 0,
      warnings: [reason],
    });
  }

  private push(partial: Omit<TraceStep, "index">): void {
    this.steps.push({ index: this.steps.length, ...partial });
  }

  get totalLatencyMs(): number {
    return this.now() - this.started;
  }

  snapshot(): TraceStep[] {
    return [...this.steps];
  }
}
