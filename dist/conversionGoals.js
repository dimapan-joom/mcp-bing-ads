// Pure logic behind the conversion-goal tools: no network, so every rule that
// decides what an audit reports can be unit-tested against recorded shapes.
//
// Facts these functions rely on were confirmed against the live API (v13):
// - Campaign.GoalIds is null when the campaign follows the account-level goal
//   set, and a list of IDs when it uses campaign-specific goals.
// - The account-level set is every Active goal with ExcludeFromBidding=false.
// - A campaign-specific selection overrides ExcludeFromBidding: a goal marked
//   ExcludeFromBidding=true still fills "Conversions" for campaigns that pick it.
// - CampaignPerformanceReport with the Goal column puts spend on a row whose
//   Goal is empty and conversions on one row per goal; the sums reconcile with
//   the plain campaign report. ConversionPerformanceReport covers Search only.
// - The offline conversion report accepts at most 7 calendar days per call.
export const QUERYABLE_GOAL_TYPES = [
    "Url",
    "Duration",
    "PagesViewedPerVisit",
    "Event",
    "AppInstall",
    "OfflineConversion",
    // InStoreTransaction and AppDownload are pilot-only: asking for them fails
    // the whole request with InStoreTransactionPilotNotEnabledForCustomer.
];
export const GOAL_ADDITIONAL_FIELDS = [
    "ViewThroughConversionWindowInMinutes",
    "IsExternallyAttributed",
    "GoalCategory",
    "AttributionModelType",
    "IsEnhancedConversionsEnabled",
    "IsAutoGoal",
];
const minutesToDays = (m) => m == null ? null : Math.round((m / 1440) * 100) / 100;
export function isAccountDefaultGoal(g) {
    return g.Status === "Active" && g.ExcludeFromBidding === false;
}
export function summarizeGoal(g) {
    return {
        goal_id: String(g.Id),
        name: g.Name ?? null,
        type: g.Type ?? null,
        category: g.GoalCategory ?? null,
        status: g.Status ?? null,
        tracking_status: g.TrackingStatus ?? null,
        include_in_conversions: g.ExcludeFromBidding === false,
        exclude_from_bidding: g.ExcludeFromBidding === true,
        is_account_default: isAccountDefaultGoal(g),
        scope: g.Scope ?? null,
        conversion_window_days: minutesToDays(g.ConversionWindowInMinutes),
        view_through_window_days: minutesToDays(g.ViewThroughConversionWindowInMinutes),
        attribution_model: g.AttributionModelType ?? null,
        count_type: g.CountType ?? null,
        revenue: g.Revenue
            ? { type: g.Revenue.Type ?? null, value: g.Revenue.Value ?? null, currency: g.Revenue.CurrencyCode ?? null }
            : null,
        tag_id: g.TagId == null ? null : String(g.TagId),
    };
}
const toRef = (id, goals) => {
    const g = goals.get(id);
    return {
        goal_id: id,
        name: g?.Name ?? null,
        status: g?.Status ?? (g ? null : "NotFound"),
        tracking_status: g?.TrackingStatus ?? null,
    };
};
const BAD_TRACKING = new Set(["NoRecentConversions", "TagUnverified", "TagInactive", "InactiveDueToTagUnavailable"]);
export function resolveCampaignGoals(campaign, goals) {
    const ids = (campaign.GoalIds ?? []).map(String);
    const campaignSpecific = ids.length > 0;
    const accountDefaults = [...goals.values()].filter(isAccountDefaultGoal).map((g) => String(g.Id));
    const selected = ids.map((id) => toRef(id, goals));
    const effectiveIds = campaignSpecific
        ? ids.filter((id) => goals.get(id)?.Status === "Active")
        : accountDefaults;
    const effective = effectiveIds.map((id) => toRef(id, goals));
    const warnings = [];
    for (const ref of selected) {
        if (ref.status === "NotFound")
            warnings.push(`selected goal ${ref.goal_id} was not returned by the API (deleted or another scope)`);
        else if (ref.status !== "Active")
            warnings.push(`selected goal ${ref.goal_id} "${ref.name}" is ${ref.status} and does not drive bidding`);
    }
    for (const ref of effective) {
        if (ref.tracking_status && BAD_TRACKING.has(ref.tracking_status)) {
            warnings.push(`bidding goal ${ref.goal_id} "${ref.name}" has tracking status ${ref.tracking_status}`);
        }
    }
    if (effective.length === 0)
        warnings.push("no active goal drives bidding for this campaign");
    return {
        campaign_id: String(campaign.Id),
        campaign_name: campaign.Name ?? null,
        campaign_type: campaign.CampaignType ?? null,
        campaign_status: campaign.Status ?? null,
        selection_mode: campaignSpecific ? "campaign_specific" : "account_default",
        selected_goals: selected,
        effective_bidding_goals: effective,
        warnings,
    };
}
const num = (v) => {
    if (typeof v === "number")
        return v;
    if (typeof v !== "string" || v === "")
        return 0;
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
};
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const ratio = (a, b, d = 4) => (b > 0 ? round(a / b, d) : null);
/**
 * Bing reports a goal by name only in this report, so names are mapped back to
 * IDs. A name shared by two goals is left unresolved rather than guessed.
 */
export function buildGoalNameIndex(goals) {
    const idx = new Map();
    for (const g of goals) {
        if (!g.Name)
            continue;
        idx.set(g.Name, idx.has(g.Name) ? null : String(g.Id));
    }
    return idx;
}
export function buildGoalPerformance(rows, nameIndex) {
    const keyOf = (r) => `${r["TimePeriod"] ?? ""}|${r["CampaignId"]}`;
    const spend = new Map();
    for (const r of rows)
        spend.set(keyOf(r), (spend.get(keyOf(r)) ?? 0) + num(r["Spend"]));
    const out = [];
    for (const r of rows) {
        const goalName = String(r["Goal"] ?? "");
        if (!goalName)
            continue; // the spend-only row
        const conv = num(r["Conversions"]);
        const rev = num(r["Revenue"]);
        const allConv = num(r["AllConversions"]);
        const allRev = num(r["AllRevenue"]);
        if (conv === 0 && rev === 0 && allConv === 0 && allRev === 0)
            continue;
        const s = spend.get(keyOf(r)) ?? 0;
        const row = {
            campaign_id: String(r["CampaignId"]),
            campaign_name: r["CampaignName"] ?? null,
            campaign_type: r["CampaignType"] ?? null,
            goal_id: nameIndex.get(goalName) ?? null,
            goal_name: goalName,
            goal_type: r["GoalType"] || null,
            conversions: round(conv),
            revenue: round(rev),
            all_conversions: round(allConv),
            all_revenue: round(allRev),
            campaign_spend: round(s),
            roas: ratio(rev, s),
            all_roas: ratio(allRev, s),
            cpa: ratio(s, conv, 2),
            all_cpa: ratio(s, allConv, 2),
        };
        if (r["TimePeriod"] !== undefined)
            row.time_period = String(r["TimePeriod"]);
        out.push(row);
    }
    return out;
}
export function totalsByGoal(perf) {
    const m = new Map();
    for (const r of perf) {
        let t = m.get(r.goal_name);
        if (!t) {
            t = { goal_id: r.goal_id, goal_name: r.goal_name, conversions: 0, revenue: 0, all_conversions: 0, all_revenue: 0, campaigns_with_conversions: 0, last_conversion_date: null, _campaigns: new Set() };
            m.set(r.goal_name, t);
        }
        t.conversions += r.conversions;
        t.revenue += r.revenue;
        t.all_conversions += r.all_conversions;
        t.all_revenue += r.all_revenue;
        if (r.all_conversions > 0) {
            t._campaigns.add(r.campaign_id);
            if (r.time_period && (!t.last_conversion_date || r.time_period > t.last_conversion_date))
                t.last_conversion_date = r.time_period;
        }
    }
    return [...m.values()].map(({ _campaigns, ...t }) => ({
        ...t,
        conversions: round(t.conversions),
        revenue: round(t.revenue),
        all_conversions: round(t.all_conversions),
        all_revenue: round(t.all_revenue),
        campaigns_with_conversions: _campaigns.size,
    }));
}
// ============================================
// OFFLINE CONVERSION HEALTH
// ============================================
/** Inclusive [start, end] windows of at most 7 calendar days, oldest first. */
export function weekWindows(startDate, endDate) {
    const day = 86_400_000;
    const out = [];
    let s = Date.parse(`${startDate}T00:00:00Z`);
    const e = Date.parse(`${endDate}T00:00:00Z`);
    while (s <= e) {
        const we = Math.min(s + 6 * day, e);
        out.push([new Date(s).toISOString().slice(0, 10), new Date(we).toISOString().slice(0, 10)]);
        s = we + day;
    }
    return out;
}
/**
 * "Accepted" is Bing's SuccessCount (matched to a click and attributed);
 * "rejected" is UnattributedCount, broken down by UnattributedReason.
 * Windows are by upload date (UTC), counted back from today. The report lags a
 * day or two, so last_1d is often 0 even for a healthy goal; read it together
 * with upload_latency_days.
 */
export function computeOfflineHealth(goal, daily, today) {
    const rows = daily
        .filter((d) => String(d.GoalId) === String(goal.Id))
        .map((d) => ({
        date: d.UploadDate.slice(0, 10),
        accepted: num(d.SuccessCount),
        rejected: num(d.UnattributedCount),
        alerts: d.Alerts ?? [],
    }))
        .sort((a, b) => a.date.localeCompare(b.date));
    const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
    const uploads = rows.filter((r) => r.accepted + r.rejected > 0);
    const lastUpload = uploads.length ? uploads[uploads.length - 1].date : null;
    const successful = rows.filter((r) => r.accepted > 0);
    const lastSuccess = successful.length ? successful[successful.length - 1].date : null;
    const sinceToday = (n) => rows.filter((r) => daysBetween(r.date, today) <= n).reduce((s, r) => s + r.accepted, 0);
    const accepted = { last_1d: sinceToday(1), last_7d: sinceToday(7), last_30d: sinceToday(30), period: rows.reduce((s, r) => s + r.accepted, 0) };
    const rejected = rows.reduce((s, r) => s + r.rejected, 0);
    const reasons = new Map();
    for (const r of rows)
        for (const a of r.alerts)
            reasons.set(a.UnattributedReason, (reasons.get(a.UnattributedReason) ?? 0) + num(a.Count));
    const duplicates = reasons.get("DuplicateConversionKey") ?? 0;
    const latency = lastUpload ? daysBetween(lastUpload, today) : null;
    const signals = [];
    if (!lastUpload)
        signals.push("no_uploads_in_period");
    if (accepted.last_7d === 0)
        signals.push("no_recent_conversions");
    if (latency !== null && latency > 3)
        signals.push("stale_uploads");
    const total = accepted.period + rejected;
    if (total > 0 && accepted.period / total < 0.05)
        signals.push("low_acceptance_rate");
    if (total > 0 && duplicates / total > 0.5)
        signals.push("mostly_duplicates");
    if (goal.Status !== "Active")
        signals.push(`goal_${String(goal.Status).toLowerCase()}`);
    if (goal.TrackingStatus && goal.TrackingStatus !== "RecordingConversions")
        signals.push(`tracking_${goal.TrackingStatus}`);
    return {
        goal_id: String(goal.Id),
        name: goal.Name ?? null,
        status: goal.Status ?? null,
        tracking_status: goal.TrackingStatus ?? null,
        include_in_conversions: goal.ExcludeFromBidding === false,
        last_upload_date: lastUpload,
        last_successful_upload_date: lastSuccess,
        upload_latency_days: latency,
        accepted,
        rejected_period: rejected,
        acceptance_rate_period: total > 0 ? round(accepted.period / total, 4) : null,
        duplicates_period: duplicates,
        rejection_reasons: [...reasons.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([reason, count]) => ({ reason, count, share: rejected > 0 ? round(count / rejected, 4) : 0 })),
        daily: rows.map((r) => ({ upload_date: r.date, accepted: r.accepted, rejected: r.rejected })),
        signals,
    };
}
/**
 * Removing every campaign-level goal returns the campaign to the account
 * default set; there is no separate "mode" flag in the API.
 */
export function planCampaignGoalChange(campaign, mode, goalIds) {
    const oldIds = (campaign.GoalIds ?? []).map(String);
    const newIds = mode === "account_default" ? [] : [...new Set(goalIds.map(String))];
    const add = newIds.filter((id) => !oldIds.includes(id));
    const remove = oldIds.filter((id) => !newIds.includes(id));
    return {
        campaign_id: String(campaign.Id),
        campaign_name: campaign.Name ?? null,
        old_mode: oldIds.length ? "campaign_specific" : "account_default",
        old_goal_ids: oldIds,
        new_mode: newIds.length ? "campaign_specific" : "account_default",
        new_goal_ids: newIds,
        add,
        remove,
        unchanged: add.length === 0 && remove.length === 0,
    };
}
export function planGoalUpdate(u, current) {
    if (!current)
        return { goal_id: u.goal_id, name: null, diff: {}, payload: null, error: "goal not found in account" };
    if (u.conversion_window_days !== undefined && (u.conversion_window_days < 1 || u.conversion_window_days > 90)) {
        return { goal_id: u.goal_id, name: current.Name ?? null, diff: {}, payload: null, error: "conversion_window_days must be between 1 and 90" };
    }
    const diff = {};
    // Type is the polymorphic discriminator the REST endpoint needs to pick the
    // derived goal class; Id says which goal. Everything else is only sent when
    // it changes, so untouched settings are left as Bing has them.
    const payload = { Id: current.Id, Type: current.Type };
    const set = (field, apiField, oldV, newV, apiV = newV) => {
        if (newV === undefined || oldV === newV)
            return;
        diff[field] = { old: oldV, new: newV };
        payload[apiField] = apiV;
    };
    set("name", "Name", current.Name ?? null, u.name);
    set("status", "Status", current.Status ?? null, u.status);
    if (u.include_in_conversions !== undefined) {
        set("include_in_conversions", "ExcludeFromBidding", current.ExcludeFromBidding === false, u.include_in_conversions, !u.include_in_conversions);
    }
    if (u.conversion_window_days !== undefined) {
        set("conversion_window_days", "ConversionWindowInMinutes", minutesToDays(current.ConversionWindowInMinutes), u.conversion_window_days, Math.round(u.conversion_window_days * 1440));
    }
    set("count_type", "CountType", current.CountType ?? null, u.count_type);
    if (u.revenue_type !== undefined || u.revenue_value !== undefined || u.currency_code !== undefined) {
        const cur = current.Revenue ?? {};
        const next = {
            Type: u.revenue_type ?? cur.Type ?? null,
            Value: u.revenue_value ?? cur.Value ?? null,
            CurrencyCode: u.currency_code ?? cur.CurrencyCode ?? null,
        };
        if (next.Type !== cur.Type || next.Value !== cur.Value || next.CurrencyCode !== cur.CurrencyCode) {
            diff.revenue = { old: { type: cur.Type ?? null, value: cur.Value ?? null, currency: cur.CurrencyCode ?? null }, new: { type: next.Type, value: next.Value, currency: next.CurrencyCode } };
            payload.Revenue = next;
        }
    }
    return { goal_id: String(current.Id), name: current.Name ?? null, diff, payload: Object.keys(diff).length ? payload : null };
}
/** Which planned fields did the read-back confirm? */
export function verifyGoalUpdate(plan, after) {
    if (!after)
        return { verified: false, mismatches: ["goal missing on read-back"] };
    const s = summarizeGoal(after);
    const mismatches = [];
    for (const [field, { new: want }] of Object.entries(plan.diff)) {
        let got;
        if (field === "revenue") {
            got = s.revenue;
            const w = want;
            const g = got;
            if (!g || g.type !== w.type || Number(g.value) !== Number(w.value) || g.currency !== w.currency)
                mismatches.push(field);
            continue;
        }
        got = s[field];
        if (got !== want)
            mismatches.push(`${field}: wanted ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    }
    return { verified: mismatches.length === 0, mismatches };
}
