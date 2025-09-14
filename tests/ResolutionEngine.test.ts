import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_DISPUTE = 101;
const ERR_APPEAL_EXPIRED = 102;
const ERR_ALREADY_RESOLVED = 103;
const ERR_INVALID_MEDIATOR = 104;
const ERR_INVALID_OUTCOME = 105;
const ERR_INVALID_RATIONALE = 106;
const ERR_APPEAL_NOT_ALLOWED = 107;
const ERR_FINALIZATION_EARLY = 108;
const ERR_NO_RESOLUTION = 109;

interface Resolution {
  mediator: string;
  outcome: string;
  rationale: string;
  resolvedAt: number;
  appealed: boolean;
  appealsCount: number;
  final: boolean;
  feePaid: boolean;
}

interface DisputeParties {
  landlord: string;
  tenant: string;
  disputeType: string;
  claimAmount: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ResolutionEngineMock {
  state: {
    resolutions: Map<number, Resolution>;
    disputeParties: Map<number, DisputeParties>;
    appealWindow: number;
    maxAppeals: number;
    resolutionFee: number;
  } = {
    resolutions: new Map(),
    disputeParties: new Map(),
    appealWindow: 43200,
    maxAppeals: 1,
    resolutionFee: 500,
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  admin: string = "ST1ADMIN";
  mediators: Set<string> = new Set(["ST1MEDIATOR"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      resolutions: new Map(),
      disputeParties: new Map(),
      appealWindow: 43200,
      maxAppeals: 1,
      resolutionFee: 500,
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.admin = "ST1ADMIN";
    this.mediators = new Set(["ST1MEDIATOR"]);
    this.stxTransfers = [];
  }

  setDisputeParties(disputeId: number, landlord: string, tenant: string, disputeType: string, claimAmount: number): void {
    this.state.disputeParties.set(disputeId, { landlord, tenant, disputeType, claimAmount });
  }

  isValidMediator(disputeId: number, caller: string): boolean {
    return this.mediators.has(caller);
  }

  isDisputeParty(disputeId: number, caller: string): boolean {
    const parties = this.state.disputeParties.get(disputeId);
    return parties ? (caller === parties.landlord || caller === parties.tenant) : false;
  }

  getDispute(disputeId: number): Result<DisputeParties | null> {
    const parties = this.state.disputeParties.get(disputeId);
    return { ok: true, value: parties || null };
  }

  proposeResolution(disputeId: number, outcome: string, rationale: string): Result<boolean> {
    if (!this.isValidMediator(disputeId, this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const existing = this.state.resolutions.get(disputeId);
    if (existing && existing.final) return { ok: false, value: ERR_ALREADY_RESOLVED };
    if (outcome.length === 0 || outcome.length > 256) return { ok: false, value: ERR_INVALID_OUTCOME };
    if (rationale.length === 0 || rationale.length > 512) return { ok: false, value: ERR_INVALID_RATIONALE };
    if (!this.getDispute(disputeId).value) return { ok: false, value: ERR_INVALID_DISPUTE };
    this.state.resolutions.set(disputeId, {
      mediator: this.caller,
      outcome,
      rationale,
      resolvedAt: this.blockHeight,
      appealed: false,
      appealsCount: 0,
      final: false,
      feePaid: false,
    });
    return { ok: true, value: true };
  }

  payResolutionFee(disputeId: number): Result<boolean> {
    const resolution = this.state.resolutions.get(disputeId);
    if (!resolution) return { ok: false, value: ERR_NO_RESOLUTION };
    if (!this.isValidMediator(disputeId, this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (resolution.feePaid) return { ok: false, value: ERR_ALREADY_RESOLVED };
    this.stxTransfers.push({ amount: this.state.resolutionFee, from: this.caller, to: "ST1FEEHANDLER" });
    this.state.resolutions.set(disputeId, { ...resolution, feePaid: true });
    return { ok: true, value: true };
  }

  finalizeResolution(disputeId: number): Result<boolean> {
    const resolution = this.state.resolutions.get(disputeId);
    if (!resolution) return { ok: false, value: ERR_INVALID_DISPUTE };
    if (!resolution.feePaid) return { ok: false, value: ERR_ALREADY_RESOLVED };
    if (this.blockHeight < resolution.resolvedAt + this.state.appealWindow) return { ok: false, value: ERR_FINALIZATION_EARLY };
    if (resolution.final) return { ok: false, value: ERR_ALREADY_RESOLVED };
    this.state.resolutions.set(disputeId, { ...resolution, final: true });
    return { ok: true, value: true };
  }

  appealResolution(disputeId: number, appealReason: string): Result<boolean> {
    const resolution = this.state.resolutions.get(disputeId);
    if (!resolution) return { ok: false, value: ERR_INVALID_DISPUTE };
    if (!this.isDisputeParty(disputeId, this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (resolution.final) return { ok: false, value: ERR_ALREADY_RESOLVED };
    if (resolution.appealsCount >= this.state.maxAppeals) return { ok: false, value: ERR_APPEAL_NOT_ALLOWED };
    if (this.blockHeight > resolution.resolvedAt + this.state.appealWindow) return { ok: false, value: ERR_APPEAL_EXPIRED };
    this.stxTransfers.push({ amount: this.state.resolutionFee, from: this.caller, to: "ST1FEEHANDLER" });
    this.state.resolutions.set(disputeId, {
      ...resolution,
      appealed: true,
      appealsCount: resolution.appealsCount + 1,
    });
    return { ok: true, value: true };
  }

  setAppealWindow(newWindow: number): Result<boolean> {
    if (this.caller !== this.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.appealWindow = newWindow;
    return { ok: true, value: true };
  }

  setMaxAppeals(newMax: number): Result<boolean> {
    if (this.caller !== this.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.maxAppeals = newMax;
    return { ok: true, value: true };
  }

  setResolutionFee(newFee: number): Result<boolean> {
    if (this.caller !== this.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.resolutionFee = newFee;
    return { ok: true, value: true };
  }

  getResolution(disputeId: number): Resolution | null {
    return this.state.resolutions.get(disputeId) || null;
  }

  getDisputeParties(disputeId: number): DisputeParties | null {
    return this.state.disputeParties.get(disputeId) || null;
  }

  getAppealWindow(): number {
    return this.state.appealWindow;
  }

  getMaxAppeals(): number {
    return this.state.maxAppeals;
  }

  getResolutionFee(): number {
    return this.state.resolutionFee;
  }
}

describe("ResolutionEngine", () => {
  let contract: ResolutionEngineMock;

  beforeEach(() => {
    contract = new ResolutionEngineMock();
    contract.reset();
    contract.setDisputeParties(1, "ST1LANDLORD", "ST1TENANT", "rent", 1000);
  });

  it("proposes resolution successfully", () => {
    contract.caller = "ST1MEDIATOR";
    const result = contract.proposeResolution(1, "70% refund", "Evidence shows damage");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const res = contract.getResolution(1);
    expect(res?.mediator).toBe("ST1MEDIATOR");
    expect(res?.outcome).toBe("70% refund");
    expect(res?.rationale).toBe("Evidence shows damage");
    expect(res?.final).toBe(false);
  });

  it("rejects propose by non-mediator", () => {
    const result = contract.proposeResolution(1, "70% refund", "Evidence shows damage");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects propose for invalid outcome length", () => {
    contract.caller = "ST1MEDIATOR";
    const result = contract.proposeResolution(1, "", "Evidence shows damage");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_OUTCOME);
  });

  it("rejects propose for invalid rationale length", () => {
    contract.caller = "ST1MEDIATOR";
    const result = contract.proposeResolution(1, "70% refund", "");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RATIONALE);
  });

  it("pays resolution fee successfully", () => {
    contract.caller = "ST1MEDIATOR";
    contract.proposeResolution(1, "70% refund", "Evidence shows damage");
    const result = contract.payResolutionFee(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1MEDIATOR", to: "ST1FEEHANDLER" }]);
    const res = contract.getResolution(1);
    expect(res?.feePaid).toBe(true);
  });

  it("rejects duplicate fee payment", () => {
    contract.caller = "ST1MEDIATOR";
    contract.proposeResolution(1, "70% refund", "Evidence shows damage");
    contract.payResolutionFee(1);
    const result = contract.payResolutionFee(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_RESOLVED);
  });

  it("finalizes resolution successfully", () => {
    contract.caller = "ST1MEDIATOR";
    contract.proposeResolution(1, "70% refund", "Evidence shows damage");
    contract.payResolutionFee(1);
    contract.blockHeight = 43201;
    const result = contract.finalizeResolution(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const res = contract.getResolution(1);
    expect(res?.final).toBe(true);
  });

  it("rejects finalization without fee", () => {
    contract.caller = "ST1MEDIATOR";
    contract.proposeResolution(1, "70% refund", "Evidence shows damage");
    contract.blockHeight = 43201;
    const result = contract.finalizeResolution(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_RESOLVED);
  });

  it("rejects early finalization", () => {
    contract.caller = "ST1MEDIATOR";
    contract.proposeResolution(1, "70% refund", "Evidence shows damage");
    contract.payResolutionFee(1);
    const result = contract.finalizeResolution(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_FINALIZATION_EARLY);
  });

  it("appeals resolution successfully", () => {
    contract.caller = "ST1TENANT";
    contract.setDisputeParties(1, "ST1LANDLORD", "ST1TENANT", "rent", 1000);
    contract.mediators.add("ST1MEDIATOR");
    contract.caller = "ST1MEDIATOR";
    contract.proposeResolution(1, "70% refund", "Evidence shows damage");
    contract.payResolutionFee(1);
    contract.caller = "ST1TENANT";
    contract.blockHeight = 43200;
    const result = contract.appealResolution(1, "Disagree with outcome");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.stxTransfers).toEqual([
      { amount: 500, from: "ST1MEDIATOR", to: "ST1FEEHANDLER" },
      { amount: 500, from: "ST1TENANT", to: "ST1FEEHANDLER" }
    ]);
    const res = contract.getResolution(1);
    expect(res?.appealed).toBe(true);
    expect(res?.appealsCount).toBe(1);
  });

  it("rejects appeal by non-party", () => {
    contract.caller = "ST1MEDIATOR";
    contract.proposeResolution(1, "70% refund", "Evidence shows damage");
    contract.payResolutionFee(1);
    contract.caller = "ST2FAKE";
    contract.blockHeight = 43200;
    const result = contract.appealResolution(1, "Disagree");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets appeal window successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setAppealWindow(50000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getAppealWindow()).toBe(50000);
  });

  it("rejects set appeal window by non-admin", () => {
    const result = contract.setAppealWindow(50000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets max appeals successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setMaxAppeals(2);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getMaxAppeals()).toBe(2);
  });

  it("rejects set max appeals by non-admin", () => {
    const result = contract.setMaxAppeals(2);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets resolution fee successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setResolutionFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getResolutionFee()).toBe(1000);
  });

  it("rejects set resolution fee by non-admin", () => {
    const result = contract.setResolutionFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("returns resolution details", () => {
    contract.caller = "ST1MEDIATOR";
    contract.proposeResolution(1, "70% refund", "Evidence shows damage");
    const res = contract.getResolution(1);
    expect(res).toBeDefined();
    expect(res?.outcome).toBe("70% refund");
  });

  it("returns dispute parties", () => {
    const parties = contract.getDisputeParties(1);
    expect(parties).toBeDefined();
    expect(parties?.landlord).toBe("ST1LANDLORD");
  });

  it("parses ascii strings with Clarity", () => {
    const outcome = stringAsciiCV("70% refund");
    const rationale = stringAsciiCV("Evidence shows damage");
    expect(outcome.value).toBe("70% refund");
    expect(rationale.value).toBe("Evidence shows damage");
  });

  it("rejects propose for invalid dispute", () => {
    contract.caller = "ST1MEDIATOR";
    const result = contract.proposeResolution(999, "70% refund", "Evidence shows damage");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DISPUTE);
  });
});