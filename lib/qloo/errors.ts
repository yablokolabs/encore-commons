export type QlooFailureKind =
  | "missing_credential"
  | "unauthorized"
  | "forbidden"
  | "quota"
  | "bad_request"
  | "timeout"
  | "network"
  | "server"
  | "malformed_response";

export class QlooError extends Error {
  readonly kind: QlooFailureKind;
  readonly status: number | null;
  /** Sanitised provider message. Never contains a credential. */
  readonly providerMessage: string | null;

  constructor(
    kind: QlooFailureKind,
    message: string,
    options: { status?: number | null; providerMessage?: string | null } = {},
  ) {
    super(message);
    this.name = "QlooError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.providerMessage = options.providerMessage ?? null;
  }

  /** Transient failures may be retried; auth and request errors may not. */
  get retryable(): boolean {
    return this.kind === "timeout" || this.kind === "network" || this.kind === "server";
  }

  /** What the operator should do next, shown to users instead of a raw error. */
  get remediation(): string {
    switch (this.kind) {
      case "missing_credential":
        return "Qloo is not configured on this deployment. Set the QLOO_API_KEY runtime secret.";
      case "unauthorized":
        return "Qloo rejected the credential for this origin. Confirm the hackathon key and that requests go to hackathon.api.qloo.com.";
      case "forbidden":
        return "Qloo does not permit this entity type or plan for the current key.";
      case "quota":
        return "The Qloo quota for this key is exhausted. Request a limit increase before retrying.";
      case "bad_request":
        return "Qloo rejected a request parameter. Check the parameter against the official contract.";
      case "timeout":
        return "Qloo did not answer before the request deadline.";
      case "network":
        return "The server could not reach Qloo.";
      case "server":
        return "Qloo returned a server error after the allowed retries.";
      case "malformed_response":
        return "Qloo returned a response that did not match the documented shape.";
      default:
        return "Qloo request failed.";
    }
  }
}

export function classifyStatus(status: number): QlooFailureKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "quota";
  if (status >= 500) return "server";
  if (status >= 400) return "bad_request";
  return "server";
}
