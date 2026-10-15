// Tool handlers for conversion-goal audits and changes. They talk to Bing only
// through GoalApi, so tests drive them with a fake and no credentials.

import {
  RawGoal,
  OfflineDaily,
  summarizeGoal,
  resolveCampaignGoals,
  buildGoalNameIndex,
  buildGoalPerformance,
  totalsByGoal,
  computeOfflineHealth,
  planCampaignGoalChange,
  planGoalUpdate,
  verifyGoalUpdate,
  GoalUpdateInput,
  isAccountDefaultGoal,
} from "./conversionGoals.js";

export interface GoalApi {
  getConversionGoals(client: any, goalIds?: string[]): Promise<RawGoal[]>;
  getCampaignsDetailed(client: any): Promise<{ campaigns: any[]; errors: Array<{ campaign_type: string; message: string }> }>;
  getGoalReportRows(client: any, startDate: string, endDate: string, options?: { daily?: boolean; campaignIds?: string[] }): Promise<any[]>;
  getOfflineConversionDaily(client: any, goalIds: string[], startDate: string, endDate: string): Promise<{ daily: OfflineDaily[]; errors: any[] }>;
  addCampaignConversionGoals(client: any, pairs: Array<{ CampaignId: string; GoalId: string }>): Promise<any[]>;
  deleteCampaignConversionGoals(client: any, pairs: Array<{ CampaignId: string; GoalId: string }>): Promise<any[]>;
  updateConversionGoals(client: any, goals: Array<Record<string, unknown>>): Promise<any[]>;
  addConversionGoals(client: any, goals: Array<Record<string, unknown>>): Promise<{ ids: Array<string | null>; errors: any[] }>;
}

export interface Ctx {
  api: GoalApi;
  client: any;
  today: string; // YYYY-MM-DD
}

const daysAgo = (today: string, n: number): string =>
  new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const ACTIVE_CAMPAIGN_STATUSES = new Set(["Active", "BudgetPaused", "BudgetAndManualPaused"]);

function filterCampaigns(campaigns: any[], campaignIds: string[] | undefined, statusFilter: string | undefined) {
  if (campaignIds?.length) {
    const want = new Set(campaignIds.map(String));
    const found = campaigns.filter((c) => want.has(String(c.Id)));
    const foundIds = new Set(found.map((c) => String(c.Id)));
    return { selected: found, missing: [...want].filter((id) => !foundIds.has(id)) };
  }
  const f = (statusFilter ?? "active").toLowerCase();
  const selected = campaigns.filter((c) => {
    if (f === "all") return c.Status !== "Deleted";
    if (f === "paused") return c.Status === "Paused";
    return ACTIVE_CAMPAIGN_STATUSES.has(c.Status);
  });
  return { selected, missing: [] as string[] };
}

const goalMap = (goals: RawGoal[]) => new Map(goals.map((g) => [String(g.Id), g]));

function mapPartialErrors(errors: any[], pairs: Array<{ CampaignId: string; GoalId: string }>, op: string) {
  return errors.map((e) => ({
    op,
    campaign_id: pairs[e.Index]?.CampaignId ?? null,
    goal_id: pairs[e.Index]?.GoalId ?? null,
    code: e.ErrorCode ?? e.Code,
    message: e.Message,
  }));
}

// ============================================
// READ TOOLS
// ============================================

export async function listConversionGoals(ctx: Ctx, args: any) {
  const lookback = Number(args?.lookback_days ?? 30);
  const includeMetrics = args?.include_metrics !== false;
  const statusFilter = String(args?.status_filter ?? "all").toLowerCase();

  const [goals, campaignData] = await Promise.all([
    ctx.api.getConversionGoals(ctx.client, args?.goal_ids),
    ctx.api.getCampaignsDetailed(ctx.client),
  ]);

  const liveCampaigns = campaignData.campaigns.filter((c) => c.Status !== "Deleted");
  const explicitUse = new Map<string, { total: number; active: number }>();
  let onDefault = 0;
  let onDefaultActive = 0;
  for (const c of liveCampaigns) {
    const ids = (c.GoalIds ?? []).map(String);
    const active = ACTIVE_CAMPAIGN_STATUSES.has(c.Status);
    if (!ids.length) {
      onDefault++;
      if (active) onDefaultActive++;
    }
    for (const id of ids) {
      const u = explicitUse.get(id) ?? { total: 0, active: 0 };
      u.total++;
      if (active) u.active++;
      explicitUse.set(id, u);
    }
  }

  let totals = new Map<string, ReturnType<typeof totalsByGoal>[number]>();
  let unmatchedReportGoals: string[] = [];
  const window = { start_date: daysAgo(ctx.today, lookback - 1), end_date: ctx.today };
  if (includeMetrics) {
    const rows = await ctx.api.getGoalReportRows(ctx.client, window.start_date, window.end_date, { daily: true });
    const nameIndex = buildGoalNameIndex(goals);
    const t = totalsByGoal(buildGoalPerformance(rows, nameIndex));
    totals = new Map(t.map((x) => [x.goal_id ?? `name:${x.goal_name}`, x]));
    unmatchedReportGoals = t.filter((x) => !x.goal_id).map((x) => x.goal_name);
  }

  const out = goals
    .filter((g) => statusFilter === "all" || String(g.Status).toLowerCase() === statusFilter)
    .map((g) => {
      const s = summarizeGoal(g);
      const use = explicitUse.get(s.goal_id) ?? { total: 0, active: 0 };
      const m = totals.get(s.goal_id);
      return {
        ...s,
        campaign_usage: {
          campaign_specific_campaigns: use.total,
          campaign_specific_active_campaigns: use.active,
          // A goal in the account default set also serves every campaign that
          // has no campaign-level selection.
          via_account_default_campaigns: s.is_account_default ? onDefault : 0,
          via_account_default_active_campaigns: s.is_account_default ? onDefaultActive : 0,
        },
        metrics: includeMetrics
          ? {
              conversions: m?.conversions ?? 0,
              revenue: m?.revenue ?? 0,
              all_conversions: m?.all_conversions ?? 0,
              all_revenue: m?.all_revenue ?? 0,
              campaigns_with_conversions: m?.campaigns_with_conversions ?? 0,
              last_conversion_date: m?.last_conversion_date ?? null,
            }
          : undefined,
      };
    });

  return {
    account_id: ctx.client.account_id,
    account_default_goal_ids: goals.filter(isAccountDefaultGoal).map((g) => String(g.Id)),
    campaigns_on_account_default: { total: onDefault, active: onDefaultActive },
    metrics_window: includeMetrics ? window : null,
    goals: out,
    report_goals_not_matched_to_ids: unmatchedReportGoals,
    campaign_query_errors: campaignData.errors,
    notes: [
      "include_in_conversions = !ExcludeFromBidding. Account-default goals are Active goals with include_in_conversions=true.",
      "metrics.conversions/revenue count only where the goal drives the campaign (bidding columns); all_conversions/all_revenue count every attributed conversion.",
      "Bing reports conversions on the click date, in Pacific time; last_conversion_date is the last click day that later converted, not the upload day. For upload recency use bing_ads_get_offline_conversion_health.",
    ],
  };
}

export async function getCampaignConversionGoals(ctx: Ctx, args: any) {
  const [goals, campaignData] = await Promise.all([
    ctx.api.getConversionGoals(ctx.client),
    ctx.api.getCampaignsDetailed(ctx.client),
  ]);
  const gm = goalMap(goals);
  const { selected, missing } = filterCampaigns(campaignData.campaigns, args?.campaign_ids, args?.status_filter);
  const campaigns = selected.map((c) => resolveCampaignGoals(c, gm));

  const bySet = new Map<string, { selection_mode: string; effective_goal_ids: string[]; campaigns: number }>();
  for (const c of campaigns) {
    const ids = c.effective_bidding_goals.map((g) => g.goal_id).sort();
    const key = `${c.selection_mode}|${ids.join(",")}`;
    const e = bySet.get(key) ?? { selection_mode: c.selection_mode, effective_goal_ids: ids, campaigns: 0 };
    e.campaigns++;
    bySet.set(key, e);
  }

  return {
    account_id: ctx.client.account_id,
    account_default_goals: goals.filter(isAccountDefaultGoal).map((g) => ({
      goal_id: String(g.Id), name: g.Name ?? null, tracking_status: g.TrackingStatus ?? null,
    })),
    summary: {
      campaigns: campaigns.length,
      account_default: campaigns.filter((c) => c.selection_mode === "account_default").length,
      campaign_specific: campaigns.filter((c) => c.selection_mode === "campaign_specific").length,
      with_warnings: campaigns.filter((c) => c.warnings.length).length,
      by_effective_goal_set: [...bySet.values()].sort((a, b) => b.campaigns - a.campaigns),
    },
    campaigns,
    missing_campaign_ids: missing,
    campaign_query_errors: campaignData.errors,
  };
}

function biddingSummary(c: any) {
  const b = c.BiddingScheme ?? null;
  return {
    type: b?.Type ?? null,
    target_roas: b?.TargetRoas ?? null,
    target_cpa: b?.TargetCpa ?? null,
    max_cpc: b?.MaxCpc?.Amount ?? null,
    portfolio_bid_strategy_id: c.BidStrategyId ?? null,
  };
}

export async function getCampaignSettings(ctx: Ctx, args: any) {
  const [goals, campaignData] = await Promise.all([
    ctx.api.getConversionGoals(ctx.client),
    ctx.api.getCampaignsDetailed(ctx.client),
  ]);
  const gm = goalMap(goals);
  const { selected, missing } = filterCampaigns(campaignData.campaigns, args?.campaign_ids, args?.status_filter);
  return {
    account_id: ctx.client.account_id,
    campaigns: selected
      .map((c) => {
        const sel = resolveCampaignGoals(c, gm);
        return {
          campaign_id: String(c.Id),
          campaign_name: c.Name ?? null,
          campaign_type: c.CampaignType ?? null,
          status: c.Status ?? null,
          budget: {
            daily_budget: c.DailyBudget ?? null,
            budget_type: c.BudgetType ?? null,
            shared_budget_id: c.BudgetId ?? null,
          },
          bidding: biddingSummary(c),
          conversion_goal_selection: sel.selection_mode,
          selected_goals: sel.selected_goals,
          effective_bidding_goals: sel.effective_bidding_goals,
          warnings: sel.warnings,
        };
      })
      .sort((a, b) => String(a.campaign_name).localeCompare(String(b.campaign_name))),
    missing_campaign_ids: missing,
    campaign_query_errors: campaignData.errors,
    notes: ["target_roas is a ratio: 0.85 = 85%. A portfolio_bid_strategy_id means the target lives on a shared bid strategy."],
  };
}

export async function getConversionGoalPerformance(ctx: Ctx, args: any) {
  const daily = String(args?.time_aggregation ?? "summary").toLowerCase() === "daily";
  const groupBy = String(args?.group_by ?? "campaign_goal");
  const goals = await ctx.api.getConversionGoals(ctx.client);
  const rows = await ctx.api.getGoalReportRows(ctx.client, args.start_date, args.end_date, {
    daily,
    campaignIds: args?.campaign_ids,
  });
  let perf = buildGoalPerformance(rows, buildGoalNameIndex(goals));
  if (args?.goal_ids?.length) {
    const want = new Set((args.goal_ids as string[]).map(String));
    perf = perf.filter((r) => r.goal_id && want.has(r.goal_id));
  }

  const spendByCampaign = new Map<string, number>();
  for (const r of rows) {
    const id = String(r["CampaignId"]);
    const s = typeof r["Spend"] === "number" ? r["Spend"] : parseFloat(String(r["Spend"] ?? "0").replace(/,/g, "")) || 0;
    spendByCampaign.set(id, (spendByCampaign.get(id) ?? 0) + s);
  }
  const totalSpend = [...spendByCampaign.values()].reduce((a, b) => a + b, 0);
  const goalTotals = totalsByGoal(perf).map((t) => ({
    ...t,
    // Account-wide ratio: the goal's value against the spend of every
    // campaign in scope, so goals are comparable on one denominator.
    roas_vs_total_spend: totalSpend > 0 ? Math.round((t.revenue / totalSpend) * 10_000) / 10_000 : null,
    all_roas_vs_total_spend: totalSpend > 0 ? Math.round((t.all_revenue / totalSpend) * 10_000) / 10_000 : null,
    last_conversion_date: daily ? t.last_conversion_date : undefined,
  }));

  const limit = Number(args?.limit ?? 500);
  return {
    account_id: ctx.client.account_id,
    period: { start_date: args.start_date, end_date: args.end_date, time_aggregation: daily ? "daily" : "summary" },
    total_spend: Math.round(totalSpend * 100) / 100,
    goals: goalTotals.sort((a, b) => b.all_revenue - a.all_revenue),
    rows: groupBy === "goal" ? undefined : perf.sort((a, b) => b.all_revenue - a.all_revenue).slice(0, limit),
    rows_total: groupBy === "goal" ? undefined : perf.length,
    notes: [
      "conversions/revenue: only where the goal drives that campaign's bidding (Bing 'Conversions' column). all_conversions/all_revenue: every attributed conversion of the goal.",
      "campaign_spend is the campaign's whole spend; it is repeated on each goal row of that campaign, so do not sum it across goal rows.",
      "Bing attributes conversions to the click date (Pacific time). Conversion-date splits are not available from this report.",
    ],
  };
}

export async function getOfflineConversionHealth(ctx: Ctx, args: any) {
  const lookback = Math.min(Math.max(Number(args?.lookback_days ?? 30), 1), 90);
  const goals = (await ctx.api.getConversionGoals(ctx.client, args?.goal_ids)).filter(
    (g) => g.Type === "OfflineConversion" && (args?.goal_ids?.length || g.Status !== "Deleted"),
  );
  if (!goals.length) return { account_id: ctx.client.account_id, goals: [], message: "No offline conversion goals found." };

  const start = daysAgo(ctx.today, lookback - 1);
  const { daily, errors } = await ctx.api.getOfflineConversionDaily(ctx.client, goals.map((g) => String(g.Id)), start, ctx.today);
  const health = goals.map((g) => computeOfflineHealth(g, daily, ctx.today));
  return {
    account_id: ctx.client.account_id,
    period: { start_date: start, end_date: ctx.today, basis: "upload date (UTC)" },
    goals: health.sort((a, b) => b.signals.length - a.signals.length),
    partial_errors: errors,
    notes: [
      "accepted = matched to a click and attributed (Bing SuccessCount); rejected = UnattributedCount, split by reason.",
      "The report lags 1-2 days, so last_1d is often 0; check upload_latency_days.",
      "DuplicateConversionKey usually means the same conversion was re-uploaded; a high share is expected when a pipeline re-sends a rolling window.",
    ],
  };
}

// ============================================
// WRITE TOOLS
// ============================================

export async function setCampaignConversionGoals(ctx: Ctx, args: any) {
  const dryRun = args?.dry_run !== false;
  const changes: Array<{ campaign_id: string; mode: "account_default" | "campaign_specific"; goal_ids?: string[] }> = args?.changes ?? [];
  const [goals, campaignData] = await Promise.all([
    ctx.api.getConversionGoals(ctx.client),
    ctx.api.getCampaignsDetailed(ctx.client),
  ]);
  const gm = goalMap(goals);
  const byId = new Map(campaignData.campaigns.map((c) => [String(c.Id), c]));

  const plans: any[] = [];
  const rejected: any[] = [];
  for (const ch of changes) {
    const c = byId.get(String(ch.campaign_id));
    if (!c) { rejected.push({ campaign_id: ch.campaign_id, error: "campaign not found" }); continue; }
    if (ch.mode === "campaign_specific" && !ch.goal_ids?.length) { rejected.push({ campaign_id: ch.campaign_id, error: "campaign_specific needs goal_ids" }); continue; }
    const bad = (ch.goal_ids ?? []).filter((id) => gm.get(String(id))?.Status !== "Active");
    if (ch.mode === "campaign_specific" && bad.length) {
      rejected.push({ campaign_id: ch.campaign_id, error: `goals not found or not Active: ${bad.join(", ")}` });
      continue;
    }
    plans.push(planCampaignGoalChange(c, ch.mode, ch.goal_ids ?? []));
  }
  const toApply = plans.filter((p) => !p.unchanged);
  const base = {
    dry_run: dryRun,
    requested: changes.length,
    to_change: toApply.length,
    unchanged: plans.filter((p) => p.unchanged).map((p) => p.campaign_id),
    rejected,
    diff: toApply,
    campaign_query_errors: campaignData.errors,
  };
  if (dryRun || !toApply.length) return { ...base, message: dryRun ? "Dry run: nothing changed. Re-run with dry_run=false to apply." : "Nothing to change." };

  // Add before delete: removing the old goals first would briefly leave the
  // campaign on the account default set, which is a bidding change of its own.
  const addPairs = toApply.flatMap((p) => p.add.map((g: string) => ({ CampaignId: p.campaign_id, GoalId: g })));
  const delPairs = toApply.flatMap((p) => p.remove.map((g: string) => ({ CampaignId: p.campaign_id, GoalId: g })));
  const partial = [
    ...mapPartialErrors(await ctx.api.addCampaignConversionGoals(ctx.client, addPairs), addPairs, "add"),
    ...mapPartialErrors(await ctx.api.deleteCampaignConversionGoals(ctx.client, delPairs), delPairs, "delete"),
  ];

  const after = await ctx.api.getCampaignsDetailed(ctx.client);
  const afterById = new Map(after.campaigns.map((c) => [String(c.Id), c]));
  const verified: string[] = [];
  const failed: any[] = [];
  for (const p of toApply) {
    const actual = ((afterById.get(p.campaign_id)?.GoalIds ?? []) as any[]).map(String).sort();
    const want = [...p.new_goal_ids].sort();
    if (JSON.stringify(actual) === JSON.stringify(want)) verified.push(p.campaign_id);
    else failed.push({ campaign_id: p.campaign_id, wanted_goal_ids: want, actual_goal_ids: actual, errors: partial.filter((e) => e.campaign_id === p.campaign_id) });
  }
  return { ...base, partial_errors: partial, verified, failed, success: failed.length === 0 };
}

export async function updateConversionGoal(ctx: Ctx, args: any) {
  const dryRun = args?.dry_run !== false;
  const updates: GoalUpdateInput[] = args?.updates ?? [];
  const goals = goalMap(await ctx.api.getConversionGoals(ctx.client, updates.map((u) => String(u.goal_id))));
  const plans = updates.map((u) => planGoalUpdate(u, goals.get(String(u.goal_id))));
  const toApply = plans.filter((p) => p.payload);
  const base = {
    dry_run: dryRun,
    diff: toApply.map(({ payload, ...p }) => p),
    unchanged: plans.filter((p) => !p.payload && !p.error).map((p) => p.goal_id),
    rejected: plans.filter((p) => p.error).map((p) => ({ goal_id: p.goal_id, error: p.error })),
  };
  if (dryRun || !toApply.length) return { ...base, message: dryRun ? "Dry run: nothing changed. Re-run with dry_run=false to apply." : "Nothing to change." };

  const errs = await ctx.api.updateConversionGoals(ctx.client, toApply.map((p) => p.payload!));
  const partial = errs.map((e: any) => ({ goal_id: toApply[e.Index]?.goal_id ?? null, code: e.ErrorCode ?? e.Code, message: e.Message }));
  const after = goalMap(await ctx.api.getConversionGoals(ctx.client, toApply.map((p) => p.goal_id)));
  const results = toApply.map((p) => ({ goal_id: p.goal_id, ...verifyGoalUpdate(p, after.get(p.goal_id)) }));
  return {
    ...base,
    partial_errors: partial,
    verified: results.filter((r) => r.verified).map((r) => r.goal_id),
    failed: results.filter((r) => !r.verified),
    success: results.every((r) => r.verified),
  };
}

export async function createOfflineConversionGoal(ctx: Ctx, args: any) {
  const dryRun = args?.dry_run !== false;
  const windowDays = Number(args?.conversion_window_days ?? 30);
  if (!args?.name) throw new Error("name is required");
  if (windowDays < 1 || windowDays > 90) throw new Error("conversion_window_days must be between 1 and 90");
  const existing = await ctx.api.getConversionGoals(ctx.client);
  if (existing.some((g) => g.Name === args.name && g.Status !== "Deleted")) {
    throw new Error(`a goal named "${args.name}" already exists`);
  }
  const revenueType = args?.revenue_type ?? "VariableValue";
  const goal: Record<string, unknown> = {
    Type: "OfflineConversion",
    Name: args.name,
    Status: "Active",
    Scope: "Account",
    ConversionWindowInMinutes: Math.round(windowDays * 1440),
    CountType: args?.count_type ?? "All",
    // Defaults to secondary so a new goal cannot change bidding until someone
    // includes it on purpose.
    ExcludeFromBidding: !(args?.include_in_conversions === true),
    GoalCategory: args?.goal_category ?? "Purchase",
    Revenue: {
      Type: revenueType,
      Value: revenueType === "NoValue" ? null : (args?.revenue_value ?? (revenueType === "VariableValue" ? 0.01 : null)),
      CurrencyCode: args?.currency_code ?? "USD",
    },
  };
  if (dryRun) return { dry_run: true, would_create: goal, message: "Dry run: nothing created. Re-run with dry_run=false to apply." };

  const { ids, errors } = await ctx.api.addConversionGoals(ctx.client, [goal]);
  const id = ids[0];
  if (!id) return { dry_run: false, success: false, partial_errors: errors };
  const [created] = await ctx.api.getConversionGoals(ctx.client, [id]);
  return { dry_run: false, success: !!created, goal: created ? summarizeGoal(created) : null, partial_errors: errors };
}

export const conversionGoalHandlers: Record<string, (ctx: Ctx, args: any) => Promise<unknown>> = {
  bing_ads_list_conversion_goals: listConversionGoals,
  bing_ads_get_campaign_conversion_goals: getCampaignConversionGoals,
  bing_ads_get_conversion_goal_performance: getConversionGoalPerformance,
  bing_ads_get_offline_conversion_health: getOfflineConversionHealth,
  bing_ads_get_campaign_settings: getCampaignSettings,
  bing_ads_set_campaign_conversion_goals: setCampaignConversionGoals,
  bing_ads_update_conversion_goal: updateConversionGoal,
  bing_ads_create_offline_conversion_goal: createOfflineConversionGoal,
};
