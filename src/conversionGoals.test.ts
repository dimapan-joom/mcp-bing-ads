import { describe, it, expect } from "vitest";
import {
  RawGoal,
  summarizeGoal,
  resolveCampaignGoals,
  buildGoalNameIndex,
  buildGoalPerformance,
  totalsByGoal,
  weekWindows,
  computeOfflineHealth,
  planCampaignGoalChange,
  planGoalUpdate,
  verifyGoalUpdate,
} from "./conversionGoals.js";
import {
  GoalApi,
  getCampaignConversionGoals,
  getOfflineConversionHealth,
  setCampaignConversionGoals,
  updateConversionGoal,
  listConversionGoals,
  getConversionGoalPerformance,
} from "./conversionGoalTools.js";

// Shapes recorded from the live REST API (IDs kept, values trimmed).
const GOALS: RawGoal[] = [
  { Id: "160326742", Name: "web smart purchase gp 14 days", Type: "OfflineConversion", Status: "Active", TrackingStatus: "RecordingConversions", ExcludeFromBidding: false, Scope: "Account", ConversionWindowInMinutes: 20160, CountType: "All", GoalCategory: "Purchase", Revenue: { Type: "VariableValue", Value: 0.01, CurrencyCode: "USD" } },
  { Id: "160408643", Name: "test", Type: "OfflineConversion", Status: "Paused", TrackingStatus: "NoRecentConversions", ExcludeFromBidding: false, Scope: "Account", ConversionWindowInMinutes: 20160 },
  { Id: "160492710", Name: "web last click gp 30 days", Type: "OfflineConversion", Status: "Active", TrackingStatus: "NoRecentConversions", ExcludeFromBidding: true, Scope: "Account", ConversionWindowInMinutes: 43200 },
  { Id: "160516857", Name: "web smart purchase gp 30 days v2", Type: "OfflineConversion", Status: "Active", TrackingStatus: "RecordingConversions", ExcludeFromBidding: true, Scope: "Account", ConversionWindowInMinutes: 43200, CountType: "All", Revenue: { Type: "VariableValue", Value: 0.01, CurrencyCode: "USD" } },
];
const gm = () => new Map(GOALS.map((g) => [String(g.Id), g]));

describe("summarizeGoal", () => {
  it("derives include_in_conversions and account-default membership", () => {
    const s = summarizeGoal(GOALS[0]);
    expect(s.include_in_conversions).toBe(true);
    expect(s.is_account_default).toBe(true);
    expect(s.conversion_window_days).toBe(14);
    const secondary = summarizeGoal(GOALS[2]);
    expect(secondary.include_in_conversions).toBe(false);
    expect(secondary.is_account_default).toBe(false);
  });

  it("does not put a paused goal in the default set", () => {
    expect(summarizeGoal(GOALS[1]).is_account_default).toBe(false);
  });
});

describe("resolveCampaignGoals", () => {
  it("treats null GoalIds as the account default set", () => {
    const r = resolveCampaignGoals({ Id: "1", GoalIds: null, Status: "Active" }, gm());
    expect(r.selection_mode).toBe("account_default");
    expect(r.effective_bidding_goals.map((g) => g.goal_id)).toEqual(["160326742"]);
  });

  it("uses the campaign selection even for a goal excluded from bidding", () => {
    const r = resolveCampaignGoals({ Id: "2", GoalIds: ["160516857"] }, gm());
    expect(r.selection_mode).toBe("campaign_specific");
    expect(r.effective_bidding_goals.map((g) => g.goal_id)).toEqual(["160516857"]);
    expect(r.warnings).toEqual([]);
  });

  it("warns about a selected goal that records nothing", () => {
    const r = resolveCampaignGoals({ Id: "3", GoalIds: ["160492710"] }, gm());
    expect(r.warnings.join(" ")).toMatch(/NoRecentConversions/);
  });

  it("warns when the only selected goal is paused or missing", () => {
    const r = resolveCampaignGoals({ Id: "4", GoalIds: ["160408643", "999"] }, gm());
    expect(r.effective_bidding_goals).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/Paused/);
    expect(r.warnings.join(" ")).toMatch(/999/);
    expect(r.warnings.join(" ")).toMatch(/no active goal/);
  });
});

describe("buildGoalPerformance", () => {
  // Spend sits on the empty-Goal row; each goal gets its own conversion row.
  const rows = [
    { CampaignId: 10, CampaignName: "pmax a", CampaignType: "Performance max", Goal: "", Spend: 100, Conversions: 0, Revenue: 0, AllConversions: 0, AllRevenue: 0 },
    { CampaignId: 10, CampaignName: "pmax a", CampaignType: "Performance max", Goal: "web smart purchase gp 14 days", Spend: 0, Conversions: 20, Revenue: 80, AllConversions: 25, AllRevenue: 90 },
    { CampaignId: 10, CampaignName: "pmax a", CampaignType: "Performance max", Goal: "web smart purchase gp 30 days v2", Spend: 0, Conversions: 0, Revenue: 0, AllConversions: 30, AllRevenue: 120 },
    { CampaignId: 11, CampaignName: "idle", CampaignType: "Search & content", Goal: "web last click gp 30 days", Spend: 0, Conversions: 0, Revenue: 0, AllConversions: 0, AllRevenue: 0 },
  ];

  it("attaches campaign spend to goal rows and maps names to IDs", () => {
    const perf = buildGoalPerformance(rows, buildGoalNameIndex(GOALS));
    expect(perf).toHaveLength(2);
    const a = perf.find((r) => r.goal_id === "160326742")!;
    expect(a.campaign_spend).toBe(100);
    expect(a.roas).toBe(0.8);
    expect(a.cpa).toBe(5);
    const b = perf.find((r) => r.goal_id === "160516857")!;
    expect(b.roas).toBe(0);
    expect(b.cpa).toBeNull();
    expect(b.all_roas).toBe(1.2);
  });

  it("leaves an ambiguous goal name unresolved", () => {
    const idx = buildGoalNameIndex([...GOALS, { Id: "1", Name: "test" }]);
    expect(idx.get("test")).toBeNull();
  });

  it("totals per goal and tracks the last converting day", () => {
    const daily = [
      { TimePeriod: "2026-10-01", CampaignId: 10, Goal: "test", Spend: 0, Conversions: 1, Revenue: 1, AllConversions: 1, AllRevenue: 1 },
      { TimePeriod: "2026-10-03", CampaignId: 11, Goal: "test", Spend: 0, Conversions: 0, Revenue: 0, AllConversions: 2, AllRevenue: 3 },
    ];
    const [t] = totalsByGoal(buildGoalPerformance(daily, buildGoalNameIndex(GOALS)));
    expect(t.all_conversions).toBe(3);
    expect(t.campaigns_with_conversions).toBe(2);
    expect(t.last_conversion_date).toBe("2026-10-03");
  });
});

describe("weekWindows", () => {
  it("splits into inclusive windows of at most 7 days", () => {
    expect(weekWindows("2026-09-16", "2026-10-15")).toEqual([
      ["2026-09-16", "2026-09-22"],
      ["2026-09-23", "2026-09-29"],
      ["2026-09-30", "2026-10-06"],
      ["2026-10-07", "2026-10-13"],
      ["2026-10-14", "2026-10-15"],
    ]);
  });
});

describe("computeOfflineHealth", () => {
  const daily = [
    { GoalId: "160326742", UploadDate: "2026-10-12T00:00:00", SuccessCount: 1280, UnattributedCount: 96153, Alerts: [{ UnattributedReason: "DuplicateConversionKey", Count: "83939" }, { UnattributedReason: "AccountMismatch", Count: "8647" }] },
    { GoalId: "160326742", UploadDate: "2026-10-13T00:00:00", SuccessCount: 1459, UnattributedCount: 96090, Alerts: [{ UnattributedReason: "DuplicateConversionKey", Count: "85285" }] },
  ];

  it("summarises a recording goal", () => {
    const h = computeOfflineHealth(GOALS[0], daily, "2026-10-15");
    expect(h.last_successful_upload_date).toBe("2026-10-13");
    expect(h.upload_latency_days).toBe(2);
    expect(h.accepted.last_7d).toBe(2739);
    expect(h.duplicates_period).toBe(169224);
    expect(h.rejection_reasons[0].reason).toBe("DuplicateConversionKey");
    expect(h.signals).toContain("low_acceptance_rate");
    expect(h.signals).toContain("mostly_duplicates");
    expect(h.signals).not.toContain("no_recent_conversions");
  });

  it("flags a goal with no data at all", () => {
    const h = computeOfflineHealth(GOALS[2], daily, "2026-10-15");
    expect(h.last_upload_date).toBeNull();
    expect(h.signals).toEqual(expect.arrayContaining(["no_uploads_in_period", "no_recent_conversions", "tracking_NoRecentConversions"]));
  });
});

describe("planCampaignGoalChange", () => {
  it("switching to account default removes every campaign goal", () => {
    const p = planCampaignGoalChange({ Id: 1, GoalIds: ["a", "b"] }, "account_default", []);
    expect(p.remove).toEqual(["a", "b"]);
    expect(p.add).toEqual([]);
    expect(p.new_mode).toBe("account_default");
  });

  it("computes add/remove against the current selection", () => {
    const p = planCampaignGoalChange({ Id: 1, GoalIds: ["a"] }, "campaign_specific", ["b", "a", "b"]);
    expect(p.add).toEqual(["b"]);
    expect(p.remove).toEqual([]);
    expect(p.unchanged).toBe(false);
  });
});

describe("planGoalUpdate / verifyGoalUpdate", () => {
  it("sends only changed fields plus Id and Type", () => {
    const p = planGoalUpdate({ goal_id: "160492710", include_in_conversions: true, conversion_window_days: 30 }, GOALS[2]);
    expect(p.payload).toEqual({ Id: "160492710", Type: "OfflineConversion", ExcludeFromBidding: false });
    expect(Object.keys(p.diff)).toEqual(["include_in_conversions"]);
  });

  it("rejects out-of-range windows and unknown goals", () => {
    expect(planGoalUpdate({ goal_id: "x", conversion_window_days: 120 }, GOALS[0]).error).toBeTruthy();
    expect(planGoalUpdate({ goal_id: "x" }, undefined).error).toBeTruthy();
  });

  it("verifies against the read-back", () => {
    const p = planGoalUpdate({ goal_id: "160492710", include_in_conversions: true }, GOALS[2]);
    expect(verifyGoalUpdate(p, { ...GOALS[2], ExcludeFromBidding: false }).verified).toBe(true);
    expect(verifyGoalUpdate(p, GOALS[2]).verified).toBe(false);
  });
});

// ============================================
// Handlers against a fake API
// ============================================

function fakeApi(campaigns: any[]) {
  const state = { campaigns: campaigns.map((c) => ({ ...c, GoalIds: c.GoalIds ? [...c.GoalIds] : null })), goals: GOALS.map((g) => ({ ...g })), calls: [] as string[] };
  const api: GoalApi = {
    async getConversionGoals(_c, ids) {
      return ids?.length ? state.goals.filter((g) => ids.includes(String(g.Id))) : state.goals;
    },
    async getCampaignsDetailed() {
      return { campaigns: state.campaigns.map((c) => ({ ...c })), errors: [] };
    },
    async getGoalReportRows() {
      return [
        { TimePeriod: "2026-10-10", CampaignId: "1", Goal: "", Spend: 50, Conversions: 0, Revenue: 0, AllConversions: 0, AllRevenue: 0 },
        { TimePeriod: "2026-10-10", CampaignId: "1", Goal: "web smart purchase gp 14 days", Spend: 0, Conversions: 5, Revenue: 40, AllConversions: 5, AllRevenue: 40 },
      ];
    },
    async getOfflineConversionDaily() {
      return { daily: [], errors: [] };
    },
    async addCampaignConversionGoals(_c, pairs) {
      state.calls.push("add");
      for (const p of pairs) {
        const c = state.campaigns.find((x) => String(x.Id) === p.CampaignId)!;
        c.GoalIds = [...(c.GoalIds ?? []), p.GoalId];
      }
      return [];
    },
    async deleteCampaignConversionGoals(_c, pairs) {
      state.calls.push("delete");
      for (const p of pairs) {
        const c = state.campaigns.find((x) => String(x.Id) === p.CampaignId)!;
        c.GoalIds = (c.GoalIds ?? []).filter((g: string) => g !== p.GoalId);
        if (!c.GoalIds.length) c.GoalIds = null;
      }
      return [];
    },
    async updateConversionGoals(_c, goals) {
      state.calls.push("update");
      for (const u of goals) Object.assign(state.goals.find((g) => g.Id === u.Id)!, u);
      return [];
    },
    async addConversionGoals() {
      return { ids: [], errors: [] };
    },
  };
  return { api, state };
}

const CAMPAIGNS = [
  { Id: "1", Name: "pmax default", CampaignType: "PerformanceMax", Status: "Active", GoalIds: null },
  { Id: "2", Name: "search v2", CampaignType: "Search", Status: "Active", GoalIds: ["160516857"] },
  { Id: "3", Name: "paused", CampaignType: "Shopping", Status: "Paused", GoalIds: ["160326742"] },
];
const client = { account_id: "138371118" };
const today = "2026-10-15";

describe("handlers", () => {
  it("get_campaign_conversion_goals groups active campaigns by effective goal set", async () => {
    const { api } = fakeApi(CAMPAIGNS);
    const r: any = await getCampaignConversionGoals({ api, client, today }, {});
    expect(r.summary.campaigns).toBe(2);
    expect(r.summary.account_default).toBe(1);
    expect(r.summary.campaign_specific).toBe(1);
    expect(r.account_default_goals.map((g: any) => g.goal_id)).toEqual(["160326742"]);
  });

  it("get_campaign_conversion_goals reports unknown campaign IDs", async () => {
    const { api } = fakeApi(CAMPAIGNS);
    const r: any = await getCampaignConversionGoals({ api, client, today }, { campaign_ids: ["3", "404"] });
    expect(r.campaigns.map((c: any) => c.campaign_id)).toEqual(["3"]);
    expect(r.missing_campaign_ids).toEqual(["404"]);
  });

  it("list_conversion_goals counts campaign usage and metrics", async () => {
    const { api } = fakeApi(CAMPAIGNS);
    const r: any = await listConversionGoals({ api, client, today }, {});
    const g14 = r.goals.find((g: any) => g.goal_id === "160326742");
    expect(g14.campaign_usage).toEqual({ campaign_specific_campaigns: 1, campaign_specific_active_campaigns: 0, via_account_default_campaigns: 1, via_account_default_active_campaigns: 1 });
    expect(g14.metrics.conversions).toBe(5);
    expect(g14.metrics.last_conversion_date).toBe("2026-10-10");
  });

  it("goal performance filters by goal_ids", async () => {
    const { api } = fakeApi(CAMPAIGNS);
    const r: any = await getConversionGoalPerformance({ api, client, today }, { start_date: "2026-10-01", end_date: "2026-10-14", goal_ids: ["160516857"] });
    expect(r.rows).toEqual([]);
    expect(r.total_spend).toBe(50);
  });

  it("offline health covers non-deleted offline goals", async () => {
    const { api } = fakeApi(CAMPAIGNS);
    const r: any = await getOfflineConversionHealth({ api, client, today }, {});
    expect(r.goals).toHaveLength(4);
    expect(r.goals.every((g: any) => g.signals.includes("no_recent_conversions"))).toBe(true);
  });

  it("set_campaign_conversion_goals is a dry run by default", async () => {
    const { api, state } = fakeApi(CAMPAIGNS);
    const r: any = await setCampaignConversionGoals({ api, client, today }, { changes: [{ campaign_id: "2", mode: "account_default" }] });
    expect(r.dry_run).toBe(true);
    expect(r.diff[0].remove).toEqual(["160516857"]);
    expect(state.calls).toEqual([]);
  });

  it("set_campaign_conversion_goals applies add before delete and verifies", async () => {
    const { api, state } = fakeApi(CAMPAIGNS);
    const r: any = await setCampaignConversionGoals({ api, client, today }, {
      dry_run: false,
      changes: [
        { campaign_id: "2", mode: "campaign_specific", goal_ids: ["160326742"] },
        { campaign_id: "1", mode: "account_default" },
        { campaign_id: "404", mode: "account_default" },
        { campaign_id: "3", mode: "campaign_specific", goal_ids: ["160408643"] },
      ],
    });
    expect(state.calls).toEqual(["add", "delete"]);
    expect(r.verified).toEqual(["2"]);
    expect(r.unchanged).toEqual(["1"]);
    expect(r.rejected.map((x: any) => x.campaign_id)).toEqual(["404", "3"]);
    expect(r.success).toBe(true);
  });

  it("update_conversion_goal applies and verifies", async () => {
    const { api, state } = fakeApi(CAMPAIGNS);
    const r: any = await updateConversionGoal({ api, client, today }, { dry_run: false, updates: [{ goal_id: "160492710", include_in_conversions: true }] });
    expect(state.calls).toEqual(["update"]);
    expect(r.verified).toEqual(["160492710"]);
  });
});
