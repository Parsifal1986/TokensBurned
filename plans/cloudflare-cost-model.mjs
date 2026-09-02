#!/usr/bin/env node

const pricing = {
  workers: {
    baseMonthly: 5,
    includedRequests: 10_000_000,
    requestsPerUnit: 1_000_000,
    requestUnitPrice: 0.30,
    includedCpuMs: 30_000_000,
    cpuMsPerUnit: 1_000_000,
    cpuUnitPrice: 0.02,
  },
  d1: {
    includedReads: 25_000_000_000,
    readsPerUnit: 1_000_000,
    readUnitPrice: 0.001,
    includedWrites: 50_000_000,
    writesPerUnit: 1_000_000,
    writeUnitPrice: 1.00,
    includedStorageGb: 5,
    storageGbPrice: 0.75,
  },
  r2: {
    includedClassA: 1_000_000,
    classAPerUnit: 1_000_000,
    classAUnitPrice: 4.50,
    includedClassB: 10_000_000,
    classBPerUnit: 1_000_000,
    classBUnitPrice: 0.36,
    includedStorageGb: 10,
    storageGbPrice: 0.015,
  },
};

const usageModel = {
  activeDaysPerMonth: 20,
  activeHoursPerDay: 8,
  turnsPerHour: 12,
  paidUploadIntervalMinutes: 15,
  extraSessionEndUploadsPerActiveDay: 1,
  publicSvgRequestsPerMonth: 300,
  cardRegenerationsPerMonth: 30,
  otherApiRequestsPerMonth: 20,
  authRowsReadPerUpload: 3,
  rowsReadPerCardRegeneration: 100,
  compactionRowsReadPerActiveDay: 1,
  dailyRowIndexWritesOnInsert: 1,
  dailyRowIndexWritesOnDelete: 1,
  downsampleWritesPerActiveDay: 1,
  monthlyRollupRowsWrittenPerMonth: 2,
  userTotalRowsWrittenPerRegeneration: 1,
  lastSeenRowsWrittenPerActiveDay: 1,
  summaryRowsWrittenPerRegeneration: 1,
  d1StorageGbPerUser: 0.00010,
  r2StorageGbPerUser: 0.000015,
  uploadCpuMs: 2,
  cardRegenerationCpuMs: 5,
  otherApiCpuMs: 2,
};

function perUser(plan) {
  const activeHours = usageModel.activeDaysPerMonth * usageModel.activeHoursPerDay;
  const turns = activeHours * usageModel.turnsPerHour;
  const paidUploadsPerDay = Math.ceil(
    usageModel.activeHoursPerDay * 60 / usageModel.paidUploadIntervalMinutes,
  );
  const scheduledUploads = plan === "paid"
    ? usageModel.activeDaysPerMonth * paidUploadsPerDay
    : activeHours;
  const uploads = scheduledUploads
    + usageModel.activeDaysPerMonth * usageModel.extraSessionEndUploadsPerActiveDay;

  // Each changed upload inserts or updates one device/day row. Updating only
  // non-indexed counters and JSON payload is modeled as one row written. The
  // first insert and eventual delete also maintain the primary-key index.
  const dailyUsageWrites = uploads
    + usageModel.activeDaysPerMonth * usageModel.dailyRowIndexWritesOnInsert;
  const retentionWrites = usageModel.activeDaysPerMonth
    * (usageModel.downsampleWritesPerActiveDay
      + 1
      + usageModel.dailyRowIndexWritesOnDelete);
  const readModelWrites = usageModel.monthlyRollupRowsWrittenPerMonth
    + usageModel.cardRegenerationsPerMonth * usageModel.userTotalRowsWrittenPerRegeneration
    + usageModel.activeDaysPerMonth * usageModel.lastSeenRowsWrittenPerActiveDay
    + usageModel.cardRegenerationsPerMonth * usageModel.summaryRowsWrittenPerRegeneration;
  const d1Writes = dailyUsageWrites + retentionWrites + readModelWrites;

  const d1Reads = uploads * usageModel.authRowsReadPerUpload
    + usageModel.cardRegenerationsPerMonth * usageModel.rowsReadPerCardRegeneration
    + usageModel.otherApiRequestsPerMonth * usageModel.authRowsReadPerUpload
    + usageModel.activeDaysPerMonth * usageModel.compactionRowsReadPerActiveDay;

  const workerRequests = uploads
    + usageModel.publicSvgRequestsPerMonth
    + usageModel.otherApiRequestsPerMonth;

  const cpuMs = uploads * usageModel.uploadCpuMs
    + usageModel.cardRegenerationsPerMonth * usageModel.cardRegenerationCpuMs
    + usageModel.otherApiRequestsPerMonth * usageModel.otherApiCpuMs;

  return {
    uploads,
    turns,
    workerRequests,
    cpuMs,
    d1Reads,
    d1Writes,
    d1StorageGb: usageModel.d1StorageGbPerUser,
    r2ClassA: usageModel.cardRegenerationsPerMonth,
    r2ClassB: usageModel.cardRegenerationsPerMonth,
    r2StorageGb: usageModel.r2StorageGbPerUser,
  };
}

function addScaled(target, source, scale) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value * scale;
  }
}

function excess(value, included) {
  return Math.max(0, value - included);
}

function operationCost(value, included, unit, price) {
  const billable = excess(value, included);
  return billable === 0 ? 0 : Math.ceil(billable / unit) * price;
}

function storageCost(value, included, price) {
  const billable = excess(value, included);
  return billable === 0 ? 0 : Math.ceil(billable) * price;
}

function estimate(users, paidShare = 0.10) {
  const paidUsers = users * paidShare;
  const freeUsers = users - paidUsers;
  const usage = {};
  addScaled(usage, perUser("free"), freeUsers);
  addScaled(usage, perUser("paid"), paidUsers);

  const costs = {
    workersBase: pricing.workers.baseMonthly,
    workersRequests: operationCost(
      usage.workerRequests,
      pricing.workers.includedRequests,
      pricing.workers.requestsPerUnit,
      pricing.workers.requestUnitPrice,
    ),
    workersCpu: operationCost(
      usage.cpuMs,
      pricing.workers.includedCpuMs,
      pricing.workers.cpuMsPerUnit,
      pricing.workers.cpuUnitPrice,
    ),
    d1Reads: operationCost(
      usage.d1Reads,
      pricing.d1.includedReads,
      pricing.d1.readsPerUnit,
      pricing.d1.readUnitPrice,
    ),
    d1Writes: operationCost(
      usage.d1Writes,
      pricing.d1.includedWrites,
      pricing.d1.writesPerUnit,
      pricing.d1.writeUnitPrice,
    ),
    d1Storage: storageCost(
      usage.d1StorageGb,
      pricing.d1.includedStorageGb,
      pricing.d1.storageGbPrice,
    ),
    r2ClassA: operationCost(
      usage.r2ClassA,
      pricing.r2.includedClassA,
      pricing.r2.classAPerUnit,
      pricing.r2.classAUnitPrice,
    ),
    r2ClassB: operationCost(
      usage.r2ClassB,
      pricing.r2.includedClassB,
      pricing.r2.classBPerUnit,
      pricing.r2.classBUnitPrice,
    ),
    r2Storage: storageCost(
      usage.r2StorageGb,
      pricing.r2.includedStorageGb,
      pricing.r2.storageGbPrice,
    ),
  };
  costs.total = Object.values(costs).reduce((sum, value) => sum + value, 0);
  return { users, paidShare, usage, costs };
}

function compact(value) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(0);
}

function dollars(value) {
  return `$${value.toFixed(2)}`;
}

const scenarios = [1_000, 10_000, 100_000, 1_000_000].map((users) => estimate(users));
const freeUser = perUser("free");
const paidUser = perUser("paid");

console.log("Per-user monthly usage");
console.table([
  { plan: "free", ...freeUser },
  { plan: "paid", ...paidUser },
]);

console.log("\n90% free / 10% paid scenarios");
console.table(scenarios.map(({ users, usage, costs }) => ({
  users: compact(users),
  workerRequests: compact(usage.workerRequests),
  d1Reads: compact(usage.d1Reads),
  d1Writes: compact(usage.d1Writes),
  r2Puts: compact(usage.r2ClassA),
  monthlyCost: dollars(costs.total),
  d1WriteCost: dollars(costs.d1Writes),
})));

console.log("\nDetailed costs");
for (const scenario of scenarios) {
  console.log(`\n${compact(scenario.users)} users`);
  console.table(Object.entries(scenario.costs).map(([component, value]) => ({
    component,
    cost: dollars(value),
  })));
}

export { estimate, perUser, pricing, usageModel };
