import { describe, it, expect, beforeEach } from "vitest";
import {
  ResponseCV,
  TupleCV,
  UIntCV,
  PrincipalCV,
  BuffCV,
  BooleanCV,
} from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 200;
const ERR_INVALID_USER = 201;
const ERR_INVALID_VERIFICATION = 202;
const ERR_PROOF_ALREADY_GENERATED = 203;
const ERR_INVALID_PROOF_HASH = 204;
const ERR_INVALID_TIMESTAMP = 205;
const ERR_INVALID_PLAN = 206;
const ERR_INSUFFICIENT_SCORE = 207;
const ERR_INVALID_PROOF_ID = 208;
const ERR_INVALID_EXPIRY = 209;
const ERR_PROOF_EXPIRED = 210;
const ERR_INVALID_METADATA = 211;
const ERR_INVALID_ISSUER = 212;
const ERR_MAX_PROOFS_EXCEEDED = 213;
const ERR_INVALID_VERIFIER = 214;
const ERR_INVALID_STATUS = 215;
const ERR_INVALID_REQUEST = 216;
const ERR_INVALID_PLAN_ID = 217;
const ERR_INVALID_PERIOD = 218;
const ERR_VERIFICATION_FAILED = 219;

type Verification = { score: number; status: boolean; timestamp: number };
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
type Result<T> = { ok: boolean; value: T };

class ProofGeneratorMock {
  state: {
    admin: string;
    maxProofs: number;
    proofFee: number;
    proofExpiry: number;
    nextProofId: number;
    proofs: Map<number, Proof>;
    proofByUser: Map<string, number>;
  } = {
    admin: "ST1ADMIN",
    maxProofs: 1000,
    proofFee: 200,
    proofExpiry: 52560,
    nextProofId: 0,
    proofs: new Map(),
    proofByUser: new Map(),
  };
  blockHeight: number = 1000;
  caller: string = "ST1USER";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  verifications: Map<string, Verification> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      maxProofs: 1000,
      proofFee: 200,
      proofExpiry: 52560,
      nextProofId: 0,
      proofs: new Map(),
      proofByUser: new Map(),
    };
    this.blockHeight = 1000;
    this.caller = "ST1USER";
    this.stxTransfers = [];
    this.verifications = new Map();
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setMaxProofs(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_PROOF_ID };
    this.state.maxProofs = newMax;
    return { ok: true, value: true };
  }

  setProofFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.proofFee = newFee;
    return { ok: true, value: true };
  }

  setProofExpiry(newExpiry: number): Result<boolean> {
    if (this.caller !== this.state.admin)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newExpiry <= 0) return { ok: false, value: ERR_INVALID_EXPIRY };
    this.state.proofExpiry = newExpiry;
    return { ok: true, value: true };
  }

  generateProof(
    periodStart: number,
    periodEnd: number,
    planId: number,
    proofHash: Buffer
  ): Result<number> {
    const user = this.caller;
    if (user !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const key = `${user}-${periodStart}-${periodEnd}`;
    if (this.state.proofByUser.has(key))
      return { ok: false, value: ERR_PROOF_ALREADY_GENERATED };
    const verif = this.verifications.get(key);
    if (!verif) return { ok: false, value: ERR_INVALID_VERIFICATION };
    if (!verif.status || verif.score < this.state.proofFee)
      return { ok: false, value: ERR_INSUFFICIENT_SCORE };
    if (proofHash.length === 0)
      return { ok: false, value: ERR_INVALID_PROOF_HASH };
    if (this.state.nextProofId >= this.state.maxProofs)
      return { ok: false, value: ERR_MAX_PROOFS_EXCEEDED };
    this.stxTransfers.push({
      amount: this.state.proofFee,
      from: user,
      to: this.state.admin,
    });
    const proofId = this.state.nextProofId;
    const expiry = this.blockHeight + this.state.proofExpiry;
    const proof: Proof = {
      user,
      periodStart,
      periodEnd,
      score: verif.score,
      proofHash,
      issuedAt: this.blockHeight,
      expiry,
      status: true,
      planId,
    };
    this.state.proofs.set(proofId, proof);
    this.state.proofByUser.set(key, proofId);
    this.state.nextProofId++;
    return { ok: true, value: proofId };
  }

  verifyProof(proofId: number): Result<boolean> {
    const proof = this.state.proofs.get(proofId);
    if (!proof) return { ok: false, value: ERR_INVALID_PROOF_ID };
    if (proof.expiry <= this.blockHeight)
      return { ok: false, value: ERR_PROOF_EXPIRED };
    return { ok: true, value: proof.status };
  }

  revokeProof(proofId: number): Result<boolean> {
    const proof = this.state.proofs.get(proofId);
    if (!proof) return { ok: false, value: ERR_INVALID_PROOF_ID };
    if (this.caller !== this.state.admin && this.caller !== proof.user)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.proofs.set(proofId, { ...proof, status: false });
    return { ok: true, value: true };
  }

  getProof(proofId: number): Proof | null {
    return this.state.proofs.get(proofId) || null;
  }

  getProofByUser(
    user: string,
    periodStart: number,
    periodEnd: number
  ): number | null {
    return (
      this.state.proofByUser.get(`${user}-${periodStart}-${periodEnd}`) || null
    );
  }
}

describe("ProofGenerator", () => {
  let contract: ProofGeneratorMock;

  beforeEach(() => {
    contract = new ProofGeneratorMock();
    contract.reset();
  });

  it("sets admin successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setAdmin("ST2NEWADMIN");
    expect(result.ok).toBe(true);
    expect(contract.state.admin).toBe("ST2NEWADMIN");
  });

  it("rejects set admin by non-admin", () => {
    contract.caller = "ST1USER";
    const result = contract.setAdmin("ST2NEWADMIN");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets max proofs successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setMaxProofs(500);
    expect(result.ok).toBe(true);
    expect(contract.state.maxProofs).toBe(500);
  });

  it("rejects invalid max proofs", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setMaxProofs(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROOF_ID);
  });

  it("sets proof fee successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setProofFee(300);
    expect(result.ok).toBe(true);
    expect(contract.state.proofFee).toBe(300);
  });

  it("sets proof expiry successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setProofExpiry(100000);
    expect(result.ok).toBe(true);
    expect(contract.state.proofExpiry).toBe(100000);
  });

  it("rejects invalid proof expiry", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setProofExpiry(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EXPIRY);
  });

  it("rejects proof generation with invalid verification", () => {
    const proofHash = Buffer.from("12345678901234567890123456789012");
    const result = contract.generateProof(100, 130, 1, proofHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VERIFICATION);
  });

  it("rejects proof generation with insufficient score", () => {
    contract.verifications.set("ST1USER-100-130", {
      score: 50,
      status: true,
      timestamp: 1000,
    });
    const proofHash = Buffer.from("12345678901234567890123456789012");
    const result = contract.generateProof(100, 130, 1, proofHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_SCORE);
  });
});
