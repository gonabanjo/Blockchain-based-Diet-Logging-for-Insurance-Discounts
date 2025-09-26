import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, ResponseCV, TupleCV, UIntCV, PrincipalCV, ListCV, StringAsciiCV, BuffCV, BooleanCV, OptionalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_USER = 101;
const ERR_INVALID_PLAN = 102;
const ERR_INVALID_PERIOD = 103;
const ERR_NO_LOGS = 104;
const ERR_INSUFFICIENT_COMPLIANCE = 105;
const ERR_INVALID_SCORE = 106;
const ERR_PLAN_NOT_SUBSCRIBED = 107;
const ERR_INVALID_TIMESTAMP = 108;
const ERR_INVALID_THRESHOLD = 109;
const ERR_INVALID_NUTRIENT = 110;
const ERR_INVALID_CALORIES = 111;
const ERR_VERIFICATION_FAILED = 112;
const ERR_ALREADY_VERIFIED = 113;
const ERR_INVALID_LOG_HASH = 114;
const ERR_INVALID_AGGREGATE = 115;
const ERR_MAX_PERIODS_EXCEEDED = 116;
const ERR_INVALID_START_BLOCK = 117;
const ERR_INVALID_END_BLOCK = 118;
const ERR_INVALID_COMPLIANCE_RATE = 119;
const ERR_INVALID_METRIC = 120;

type MetricRule = { metric: string; min: number; max: number };
type Nutrient = { nutrient: string; value: number };
type DailyLog = { hash: Buffer; calories: number; nutrients: Nutrient[] };
type PlanDetails = { rules: MetricRule[]; threshold: number };
type UserInfo = { subscribedPlan: number };
type Verification = { score: number; status: boolean; timestamp: number };
type AggregateScore = { totalPeriods: number; averageScore: number };

interface Result<T> {
  ok: boolean;
  value: T;
}

class AdherenceVerifierMock {
  state: {
    admin: string;
    maxPeriods: number;
    verificationFee: number;
    complianceThreshold: number;
    verifications: Map<string, Verification>;
    aggregateScores: Map<string, AggregateScore>;
  } = {
    admin: "ST1ADMIN",
    maxPeriods: 100,
    verificationFee: 500,
    complianceThreshold: 80,
    verifications: new Map(),
    aggregateScores: new Map(),
  };
  blockHeight: number = 1000;
  caller: string = "ST1USER";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  userProfiles: Map<string, UserInfo> = new Map();
  dietPlans: Map<number, PlanDetails> = new Map();
  dailyLogs: Map<string, DailyLog> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      maxPeriods: 100,
      verificationFee: 500,
      complianceThreshold: 80,
      verifications: new Map(),
      aggregateScores: new Map(),
    };
    this.blockHeight = 1000;
    this.caller = "ST1USER";
    this.stxTransfers = [];
    this.userProfiles = new Map();
    this.dietPlans = new Map();
    this.dailyLogs = new Map();
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setMaxPeriods(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_PERIOD };
    this.state.maxPeriods = newMax;
    return { ok: true, value: true };
  }

  setVerificationFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.verificationFee = newFee;
    return { ok: true, value: true };
  }

  setComplianceThreshold(newThreshold: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newThreshold <= 0 || newThreshold > 100) return { ok: false, value: ERR_INVALID_THRESHOLD };
    this.state.complianceThreshold = newThreshold;
    return { ok: true, value: true };
  }

  verifyPeriod(startBlock: number, endBlock: number): Result<number> {
    const user = this.caller;
    if (user !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (endBlock <= startBlock || (endBlock - startBlock) > 365) return { ok: false, value: ERR_INVALID_PERIOD };
    const key = `${user}-${startBlock}-${endBlock}`;
    if (this.state.verifications.has(key)) return { ok: false, value: ERR_ALREADY_VERIFIED };
    const userInfo = this.userProfiles.get(user);
    if (!userInfo) return { ok: false, value: ERR_INVALID_USER };
    const plan = userInfo.subscribedPlan;
    if (plan <= 0) return { ok: false, value: ERR_INVALID_PLAN };
    const planDetails = this.dietPlans.get(plan);
    if (!planDetails) return { ok: false, value: ERR_INVALID_PLAN };
    const rules = planDetails.rules;
    const threshold = planDetails.threshold;
    let compliantDays = 0;
    for (let block = startBlock; block < endBlock; block++) {
      const logKey = `${user}-${block}`;
      const log = this.dailyLogs.get(logKey);
      if (!log) continue;
      let compliant = true;
      const calRule = rules.find(r => r.metric === "calories");
      if (calRule && (log.calories < calRule.min || log.calories > calRule.max)) compliant = false;
      for (const nut of log.nutrients) {
        const rule = rules.find(r => r.metric === nut.nutrient);
        if (rule && (nut.value < rule.min || nut.value > rule.max)) compliant = false;
      }
      if (compliant) compliantDays++;
    }
    const periodDays = endBlock - startBlock;
    const score = Math.floor((compliantDays * 100) / periodDays);
    if (score < 0 || score > 100) return { ok: false, value: ERR_INVALID_SCORE };
    this.stxTransfers.push({ amount: this.state.verificationFee, from: user, to: this.state.admin });
    this.state.verifications.set(key, { score, status: score >= threshold, timestamp: this.blockHeight });
    this.updateAggregateScore(user, score);
    return { ok: true, value: score };
  }

  private updateAggregateScore(user: string, newScore: number): void {
    let agg = this.state.aggregateScores.get(user) || { totalPeriods: 0, averageScore: 0 };
    const total = agg.totalPeriods + 1;
    if (total > this.state.maxPeriods) throw new Error("Max periods exceeded");
    const avg = Math.floor((agg.averageScore * agg.totalPeriods + newScore) / total);
    this.state.aggregateScores.set(user, { totalPeriods: total, averageScore: avg });
  }

  getVerification(user: string, start: number, end: number): Verification | null {
    const key = `${user}-${start}-${end}`;
    return this.state.verifications.get(key) || null;
  }

  getAggregateScore(user: string): AggregateScore | null {
    return this.state.aggregateScores.get(user) || null;
  }

  calculateAdherenceScore(user: string, start: number, end: number): Result<number> {
    const periodDays = end - start;
    let compliantDays = 0;
    const planDetails = this.dietPlans.get(1);
    if (!planDetails) return { ok: false, value: ERR_INVALID_PLAN };
    const rules = planDetails.rules;
    for (let block = start; block < end; block++) {
      const logKey = `${user}-${block}`;
      const log = this.dailyLogs.get(logKey);
      if (!log) continue;
      let compliant = true;
      const calRule = rules.find(r => r.metric === "calories");
      if (calRule && (log.calories < calRule.min || log.calories > calRule.max)) compliant = false;
      for (const nut of log.nutrients) {
        const rule = rules.find(r => r.metric === nut.nutrient);
        if (rule && (nut.value < rule.min || nut.value > rule.max)) compliant = false;
      }
      if (compliant) compliantDays++;
    }
    const score = Math.floor((compliantDays * 100) / periodDays);
    return { ok: true, value: score };
  }

  getVerificationStatus(user: string, start: number, end: number): Result<boolean> {
    const verif = this.getVerification(user, start, end);
    if (!verif) return { ok: false, value: ERR_VERIFICATION_FAILED };
    return { ok: true, value: verif.status };
  }
}

describe("AdherenceVerifier", () => {
  let contract: AdherenceVerifierMock;

  beforeEach(() => {
    contract = new AdherenceVerifierMock();
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

  it("sets max periods successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setMaxPeriods(200);
    expect(result.ok).toBe(true);
    expect(contract.state.maxPeriods).toBe(200);
  });

  it("rejects invalid max periods", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setMaxPeriods(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PERIOD);
  });

  it("sets verification fee successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setVerificationFee(1000);
    expect(result.ok).toBe(true);
    expect(contract.state.verificationFee).toBe(1000);
  });

  it("sets compliance threshold successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setComplianceThreshold(90);
    expect(result.ok).toBe(true);
    expect(contract.state.complianceThreshold).toBe(90);
  });

  it("rejects invalid compliance threshold", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setComplianceThreshold(101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_THRESHOLD);
  });

  it("verifies period successfully", () => {
    contract.userProfiles.set("ST1USER", { subscribedPlan: 1 });
    contract.dietPlans.set(1, { rules: [{ metric: "calories", min: 1500, max: 2500 }, { metric: "protein", min: 50, max: 200 }], threshold: 80 });
    for (let i = 100; i < 130; i++) {
      contract.dailyLogs.set(`ST1USER-${i}`, { hash: Buffer.from("hash"), calories: 2000, nutrients: [{ nutrient: "protein", value: 100 }] });
    }
    const result = contract.verifyPeriod(100, 130);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(100);
    const verif = contract.getVerification("ST1USER", 100, 130);
    expect(verif?.score).toBe(100);
    expect(verif?.status).toBe(true);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1USER", to: "ST1ADMIN" }]);
    const agg = contract.getAggregateScore("ST1USER");
    expect(agg?.totalPeriods).toBe(1);
    expect(agg?.averageScore).toBe(100);
  });

  it("rejects verification for invalid period", () => {
    const result = contract.verifyPeriod(130, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PERIOD);
  });

  it("rejects already verified period", () => {
    contract.userProfiles.set("ST1USER", { subscribedPlan: 1 });
    contract.dietPlans.set(1, { rules: [], threshold: 80 });
    contract.verifyPeriod(100, 130);
    const result = contract.verifyPeriod(100, 130);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_VERIFIED);
  });

  it("rejects verification without user plan", () => {
    const result = contract.verifyPeriod(100, 130);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_USER);
  });

  it("calculates adherence score correctly", () => {
    contract.dietPlans.set(1, { rules: [{ metric: "calories", min: 1500, max: 2500 }], threshold: 80 });
    for (let i = 100; i < 110; i++) {
      contract.dailyLogs.set(`ST1USER-${i}`, { hash: Buffer.from("hash"), calories: 2000, nutrients: [] });
    }
    const result = contract.calculateAdherenceScore("ST1USER", 100, 120);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(50);
  });

  it("rejects get status for unverified period", () => {
    const result = contract.getVerificationStatus("ST1USER", 100, 130);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VERIFICATION_FAILED);
  });
});