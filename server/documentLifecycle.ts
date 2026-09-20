export const DOCUMENT_STATES = ["DRAFT", "VALIDATED", "APPROVED", "POSTED", "REVERSED", "CANCELLED"] as const;
export type DocumentState = (typeof DOCUMENT_STATES)[number];

export type DocumentTransition = {
  from: DocumentState;
  to: DocumentState;
  actor: string;
  reason?: string;
  requestId: string;
  occurredAt?: Date;
};

const transitions: Record<DocumentState, readonly DocumentState[]> = {
  DRAFT: ["VALIDATED", "CANCELLED"],
  VALIDATED: ["DRAFT", "APPROVED", "CANCELLED"],
  APPROVED: ["VALIDATED", "POSTED", "CANCELLED"],
  POSTED: ["REVERSED"],
  REVERSED: [],
  CANCELLED: [],
};

export function isDocumentState(value: unknown): value is DocumentState {
  return typeof value === "string" && (DOCUMENT_STATES as readonly string[]).includes(value);
}

export function canTransitionDocument(from: DocumentState, to: DocumentState) {
  return transitions[from].includes(to);
}

export function transitionDocument(input: DocumentTransition) {
  if (!input.actor.trim()) throw new Error("DOCUMENT_ACTOR_REQUIRED");
  if (!input.requestId.trim()) throw new Error("DOCUMENT_REQUEST_ID_REQUIRED");
  if (!canTransitionDocument(input.from, input.to)) throw new Error(`DOCUMENT_INVALID_TRANSITION:${input.from}:${input.to}`);
  return {
    ...input,
    actor: input.actor.trim(),
    requestId: input.requestId.trim(),
    occurredAt: input.occurredAt || new Date(),
  };
}

export function buildPostingIdempotencyKey(input: { documentType: string; documentId: number; requestId: string }) {
  const documentType = input.documentType.trim().toUpperCase();
  const requestId = input.requestId.trim();
  if (!documentType) throw new Error("DOCUMENT_TYPE_REQUIRED");
  if (!Number.isInteger(input.documentId) || input.documentId <= 0) throw new Error("DOCUMENT_ID_REQUIRED");
  if (!requestId) throw new Error("DOCUMENT_REQUEST_ID_REQUIRED");
  return `${documentType}:${input.documentId}:POST:${requestId}`;
}

export function assertPostableState(state: DocumentState) {
  if (!["APPROVED", "VALIDATED"].includes(state)) throw new Error(`DOCUMENT_NOT_POSTABLE:${state}`);
  return true;
}

/** Validates the complete atomic posting path used by ERP services. */
export function assertAtomicPost(input: { documentType: string; documentId: number; actor: string; requestId: string; from?: "DRAFT" | "VALIDATED" | "APPROVED" }) {
  const from = input.from || "DRAFT";
  const validated = transitionDocument({ from, to: "VALIDATED", actor: input.actor, requestId: input.requestId });
  const approved = transitionDocument({ ...validated, from: validated.to, to: "APPROVED" });
  const posted = transitionDocument({ ...approved, from: approved.to, to: "POSTED" });
  return { ...posted, postingKey: buildPostingIdempotencyKey({ documentType: input.documentType, documentId: input.documentId, requestId: input.requestId }) };
}

/** Validates the only legal reversal path for a posted document. */
export function assertAtomicReverse(input: { documentType: string; documentId: number; actor: string; requestId: string }) {
  return transitionDocument({ from: "POSTED", to: "REVERSED", actor: input.actor, requestId: input.requestId, reason: `${input.documentType}:${input.documentId}` });
}
