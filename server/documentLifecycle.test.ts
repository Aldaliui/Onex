import { describe, expect, it } from "vitest";
import { assertPostableState, buildPostingIdempotencyKey, canTransitionDocument, transitionDocument } from "./documentLifecycle";

describe("atomic document lifecycle", () => {
  it("allows the controlled draft-to-posted path", () => {
    expect(canTransitionDocument("DRAFT", "VALIDATED")).toBe(true);
    expect(canTransitionDocument("VALIDATED", "APPROVED")).toBe(true);
    expect(canTransitionDocument("APPROVED", "POSTED")).toBe(true);
    expect(canTransitionDocument("POSTED", "DRAFT")).toBe(false);
  });

  it("rejects invalid transitions and missing identity", () => {
    expect(() => transitionDocument({ from: "POSTED", to: "DRAFT", actor: "tester", requestId: "x" })).toThrow("DOCUMENT_INVALID_TRANSITION");
    expect(() => transitionDocument({ from: "DRAFT", to: "VALIDATED", actor: "", requestId: "x" })).toThrow("DOCUMENT_ACTOR_REQUIRED");
    expect(() => transitionDocument({ from: "DRAFT", to: "VALIDATED", actor: "tester", requestId: "" })).toThrow("DOCUMENT_REQUEST_ID_REQUIRED");
  });

  it("creates stable posting keys and only permits postable states", () => {
    expect(buildPostingIdempotencyKey({ documentType: "sales_invoice", documentId: 12, requestId: "req-1" })).toBe("SALES_INVOICE:12:POST:req-1");
    expect(() => assertPostableState("DRAFT")).toThrow("DOCUMENT_NOT_POSTABLE:DRAFT");
    expect(assertPostableState("APPROVED")).toBe(true);
    expect(assertPostableState("VALIDATED")).toBe(true);
  });
});
