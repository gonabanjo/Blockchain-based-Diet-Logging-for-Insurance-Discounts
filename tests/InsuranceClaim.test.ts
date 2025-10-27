import { describe, it, expect, beforeEach } from "vitest";
import {
  ResponseCV,
  TupleCV,
  UIntCV,
  PrincipalCV,
  StringAsciiCV,
  BooleanCV,
} from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 300;
const ERR_INVALID_PROOF = 301;
const ERR_INVALID_INSURER = 302;
const ERR_CLAIM_ALREADY_SUBMITTED = 303;
const ERR_INVALID_CLAIM_ID = 304;
const ERR_INVALID_TIMESTAMP = 305;
const ERR_PROOF_EXPIRED = 306;
const ERR_INVALID_STATUS = 307;
const ERR_INVALID_AMOUNT = 308;
const ERR_INVALID_USER = 309;
const ERR_PROOF_NOT_VERIFIED = 310;
const ERR_INVALID_REQUEST = 311;
const ERR_MAX_CLAIMS_EXCEEDED = 312;
const ERR_INVALID_DISCOUNT = 313;
const ERR_INSURER_NOT_REGISTERED = 314;
const ERR_CLAIM_NOT_FOUND = 315;
const ERR_INVALID_UPDATE = 316;
const ERR_INVALID_PLAN_ID = 317;
const ERR_INVALID_PERIOD = 318;
const ERR_PROOF_INVALIDATED = 319;

type Proof = {
  user: string;
  periodStart: number;
  periodEnd: number;
  score: number;
  proofHash: Buffer;
  issuedAt: number;
  expiry: number;
  status: boolean;
  planId: number;
};
type Claim = {
  user: string;
  proofId: number;
  insurer: string;
  discountAmount: number;
  status: string;
  submittedAt: number;
};
type Result<T> = { ok: boolean; value: T };

class InsuranceClaimMock {
  state: {
    admin: string;
    maxClaims: number;
    claimFee: number;
    nextClaimId: number;
    insurers: Map<string, boolean>;
    claims: Map<number, Claim>;
    claimsByUser: Map<string, number>;
  } = {
    admin: "ST1ADMIN",
    maxClaims: 1000,
    claimFee: 100,
    nextClaimId: 0,
    insurers: new Map(),
    claims: new Map(),
    claimsByUser: new Map(),
  };
  blockHeight: number = 1000;
  caller: string = "ST1USER";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  proofs: Map<number, Proof> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      maxClaims: 1000,
      claimFee: 100,
      nextClaimId: 0,
      insurers: new Map(),
      claims: new Map(),
      claimsByUser: new Map(),
    };
    this.blockHeight = 1000;
    this.caller = "ST1USER";
    this.stxTransfers = [];
    this.proofs = new Map();
  }

  registerInsurer(insurer: string): Result<boolean> {
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.insurers.set(insurer, true);
    return { ok: true, value: true };
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setMaxClaims(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_CLAIM_ID };
    this.state.maxClaims = newMax;
    return { ok: true, value: true };
  }

  setClaimFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.claimFee = newFee;
    return { ok: true, value: true };
  }

  submitClaim(
    proofId: number,
    insurer: string,
    discountAmount: number
  ): Result<number> {
    const user = this.caller;
    if (user !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.insurers.get(insurer))
      return { ok: false, value: ERR_INSURER_NOT_REGISTERED };
    if (discountAmount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const proof = this.proofs.get(proofId);
    if (!proof) return { ok: false, value: ERR_INVALID_PROOF };
    if (proof.user !== user) return { ok: false, value: ERR_INVALID_USER };
    if (!proof.status) return { ok: false, value: ERR_PROOF_INVALIDATED };
    const key = `${user}-${proofId}`;
    if (this.state.claimsByUser.has(key))
      return { ok: false, value: ERR_CLAIM_ALREADY_SUBMITTED };
    if (this.state.nextClaimId >= this.state.maxClaims)
      return { ok: false, value: ERR_MAX_CLAIMS_EXCEEDED };
    this.stxTransfers.push({
      amount: this.state.claimFee,
      from: user,
      to: this.state.admin,
    });
    const claimId = this.state.nextClaimId;
    this.state.claims.set(claimId, {
      user,
      proofId,
      insurer,
      discountAmount,
      status: "pending",
      submittedAt: this.blockHeight,
    });
    this.state.claimsByUser.set(key, claimId);
    this.state.nextClaimId++;
    return { ok: true, value: claimId };
  }

  approveClaim(claimId: number): Result<boolean> {
    const claim = this.state.claims.get(claimId);
    if (!claim) return { ok: false, value: ERR_CLAIM_NOT_FOUND };
    if (!this.state.insurers.get(this.caller) || this.caller !== claim.insurer)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (claim.status !== "pending")
      return { ok: false, value: ERR_INVALID_STATUS };
    this.state.claims.set(claimId, { ...claim, status: "approved" });
    return { ok: true, value: true };
  }

  rejectClaim(claimId: number): Result<boolean> {
    const claim = this.state.claims.get(claimId);
    if (!claim) return { ok: false, value: ERR_CLAIM_NOT_FOUND };
    if (!this.state.insurers.get(this.caller) || this.caller !== claim.insurer)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (claim.status !== "pending")
      return { ok: false, value: ERR_INVALID_STATUS };
    this.state.claims.set(claimId, { ...claim, status: "rejected" });
    return { ok: true, value: true };
  }

  getClaim(claimId: number): Claim | null {
    return this.state.claims.get(claimId) || null;
  }

  getClaimByUser(user: string, proofId: number): number | null {
    return this.state.claimsByUser.get(`${user}-${proofId}`) || null;
  }

  isInsurer(insurer: string): boolean {
    return this.state.insurers.get(insurer) || false;
  }
}

describe("InsuranceClaim", () => {
  let contract: InsuranceClaimMock;

  beforeEach(() => {
    contract = new InsuranceClaimMock();
    contract.reset();
  });

  it("registers insurer successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.registerInsurer("ST2INSURER");
    expect(result.ok).toBe(true);
    expect(contract.isInsurer("ST2INSURER")).toBe(true);
  });

  it("rejects insurer registration by non-admin", () => {
    contract.caller = "ST1USER";
    const result = contract.registerInsurer("ST2INSURER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets admin successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setAdmin("ST2NEWADMIN");
    expect(result.ok).toBe(true);
    expect(contract.state.admin).toBe("ST2NEWADMIN");
  });

  it("sets max claims successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setMaxClaims(500);
    expect(result.ok).toBe(true);
    expect(contract.state.maxClaims).toBe(500);
  });

  it("rejects invalid max claims", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setMaxClaims(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CLAIM_ID);
  });

  it("sets claim fee successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setClaimFee(200);
    expect(result.ok).toBe(true);
    expect(contract.state.claimFee).toBe(200);
  });

  it("submits claim successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.registerInsurer("ST2INSURER");
    contract.caller = "ST1USER";
    contract.proofs.set(0, {
      user: "ST1USER",
      periodStart: 100,
      periodEnd: 130,
      score: 90,
      proofHash: Buffer.from("hash"),
      issuedAt: 1000,
      expiry: 53560,
      status: true,
      planId: 1,
    });
    const result = contract.submitClaim(0, "ST2INSURER", 1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const claim = contract.getClaim(0);
    expect(claim?.user).toBe("ST1USER");
    expect(claim?.insurer).toBe("ST2INSURER");
    expect(claim?.discountAmount).toBe(1000);
    expect(claim?.status).toBe("pending");
    expect(contract.stxTransfers).toEqual([
      { amount: 100, from: "ST1USER", to: "ST1ADMIN" },
    ]);
  });

  it("rejects claim with invalid insurer", () => {
    contract.proofs.set(0, {
      user: "ST1USER",
      periodStart: 100,
      periodEnd: 130,
      score: 90,
      proofHash: Buffer.from("hash"),
      issuedAt: 1000,
      expiry: 53560,
      status: true,
      planId: 1,
    });
    const result = contract.submitClaim(0, "ST2INSURER", 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSURER_NOT_REGISTERED);
  });

  it("rejects claim with invalid proof", () => {
    contract.caller = "ST1ADMIN";
    contract.registerInsurer("ST2INSURER");
    contract.caller = "ST1USER";
    const result = contract.submitClaim(0, "ST2INSURER", 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROOF);
  });

  it("approves claim successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.registerInsurer("ST2INSURER");
    contract.caller = "ST1USER";
    contract.proofs.set(0, {
      user: "ST1USER",
      periodStart: 100,
      periodEnd: 130,
      score: 90,
      proofHash: Buffer.from("hash"),
      issuedAt: 1000,
      expiry: 53560,
      status: true,
      planId: 1,
    });
    contract.submitClaim(0, "ST2INSURER", 1000);
    contract.caller = "ST2INSURER";
    const result = contract.approveClaim(0);
    expect(result.ok).toBe(true);
    expect(contract.getClaim(0)?.status).toBe("approved");
  });

  it("rejects approve claim by non-insurer", () => {
    contract.caller = "ST1ADMIN";
    contract.registerInsurer("ST2INSURER");
    contract.caller = "ST1USER";
    contract.proofs.set(0, {
      user: "ST1USER",
      periodStart: 100,
      periodEnd: 130,
      score: 90,
      proofHash: Buffer.from("hash"),
      issuedAt: 1000,
      expiry: 53560,
      status: true,
      planId: 1,
    });
    contract.submitClaim(0, "ST2INSURER", 1000);
    contract.caller = "ST3FAKE";
    const result = contract.approveClaim(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects claim with already submitted proof", () => {
    contract.caller = "ST1ADMIN";
    contract.registerInsurer("ST2INSURER");
    contract.caller = "ST1USER";
    contract.proofs.set(0, {
      user: "ST1USER",
      periodStart: 100,
      periodEnd: 130,
      score: 90,
      proofHash: Buffer.from("hash"),
      issuedAt: 1000,
      expiry: 53560,
      status: true,
      planId: 1,
    });
    contract.submitClaim(0, "ST2INSURER", 1000);
    const result = contract.submitClaim(0, "ST2INSURER", 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CLAIM_ALREADY_SUBMITTED);
  });

  it("rejects claim approval for non-pending claim", () => {
    contract.caller = "ST1ADMIN";
    contract.registerInsurer("ST2INSURER");
    contract.caller = "ST1USER";
    contract.proofs.set(0, {
      user: "ST1USER",
      periodStart: 100,
      periodEnd: 130,
      score: 90,
      proofHash: Buffer.from("hash"),
      issuedAt: 1000,
      expiry: 53560,
      status: true,
      planId: 1,
    });
    contract.submitClaim(0, "ST2INSURER", 1000);
    contract.caller = "ST2INSURER";
    contract.approveClaim(0);
    const result = contract.approveClaim(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });
});
