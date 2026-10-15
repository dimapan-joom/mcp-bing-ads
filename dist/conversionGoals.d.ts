export declare const QUERYABLE_GOAL_TYPES: readonly ["Url", "Duration", "PagesViewedPerVisit", "Event", "AppInstall", "OfflineConversion"];
export declare const GOAL_ADDITIONAL_FIELDS: string[];
export interface RawGoal {
    Id: string | number;
    Name?: string | null;
    Type?: string | null;
    Status?: string | null;
    TrackingStatus?: string | null;
    ExcludeFromBidding?: boolean | null;
    Scope?: string | null;
    ConversionWindowInMinutes?: number | null;
    ViewThroughConversionWindowInMinutes?: number | null;
    AttributionModelType?: string | null;
    GoalCategory?: string | null;
    CountType?: string | null;
    Revenue?: {
        Type?: string | null;
        Value?: number | null;
        CurrencyCode?: string | null;
    } | null;
    TagId?: string | number | null;
    IsAutoGoal?: boolean | null;
    IsEnhancedConversionsEnabled?: boolean | null;
    IsExternallyAttributed?: boolean | null;
}
export interface GoalSummary {
    goal_id: string;
    name: string | null;
    type: string | null;
    category: string | null;
    status: string | null;
    tracking_status: string | null;
    include_in_conversions: boolean;
    exclude_from_bidding: boolean;
    is_account_default: boolean;
    scope: string | null;
    conversion_window_days: number | null;
    view_through_window_days: number | null;
    attribution_model: string | null;
    count_type: string | null;
    revenue: {
        type: string | null;
        value: number | null;
        currency: string | null;
    } | null;
    tag_id: string | null;
}
export declare function isAccountDefaultGoal(g: RawGoal): boolean;
export declare function summarizeGoal(g: RawGoal): GoalSummary;
export interface GoalRef {
    goal_id: string;
    name: string | null;
    status: string | null;
    tracking_status: string | null;
}
export interface CampaignGoalSelection {
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    campaign_status: string | null;
    selection_mode: "account_default" | "campaign_specific";
    selected_goals: GoalRef[];
    effective_bidding_goals: GoalRef[];
    warnings: string[];
}
export declare function resolveCampaignGoals(campaign: {
    Id: string | number;
    Name?: string | null;
    CampaignType?: string | null;
    Status?: string | null;
    GoalIds?: Array<string | number> | null;
}, goals: Map<string, RawGoal>): CampaignGoalSelection;
export interface GoalPerfRow {
    time_period?: string;
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    goal_id: string | null;
    goal_name: string;
    goal_type: string | null;
    conversions: number;
    revenue: number;
    all_conversions: number;
    all_revenue: number;
    campaign_spend: number;
    roas: number | null;
    all_roas: number | null;
    cpa: number | null;
    all_cpa: number | null;
}
/**
 * Bing reports a goal by name only in this report, so names are mapped back to
 * IDs. A name shared by two goals is left unresolved rather than guessed.
 */
export declare function buildGoalNameIndex(goals: Iterable<RawGoal>): Map<string, string | null>;
export declare function buildGoalPerformance(rows: Array<Record<string, unknown>>, nameIndex: Map<string, string | null>): GoalPerfRow[];
export interface GoalTotals {
    goal_id: string | null;
    goal_name: string;
    conversions: number;
    revenue: number;
    all_conversions: number;
    all_revenue: number;
    campaigns_with_conversions: number;
    last_conversion_date: string | null;
}
export declare function totalsByGoal(perf: GoalPerfRow[]): GoalTotals[];
/** Inclusive [start, end] windows of at most 7 calendar days, oldest first. */
export declare function weekWindows(startDate: string, endDate: string): Array<[string, string]>;
export interface OfflineDaily {
    GoalId: string | number;
    UploadDate: string;
    SuccessCount?: number | string;
    UnattributedCount?: number | string;
    Alerts?: Array<{
        UnattributedReason: string;
        Count: number | string;
    }> | null;
}
export interface OfflineHealth {
    goal_id: string;
    name: string | null;
    status: string | null;
    tracking_status: string | null;
    include_in_conversions: boolean;
    last_upload_date: string | null;
    last_successful_upload_date: string | null;
    upload_latency_days: number | null;
    accepted: {
        last_1d: number;
        last_7d: number;
        last_30d: number;
        period: number;
    };
    rejected_period: number;
    acceptance_rate_period: number | null;
    duplicates_period: number;
    rejection_reasons: Array<{
        reason: string;
        count: number;
        share: number;
    }>;
    daily: Array<{
        upload_date: string;
        accepted: number;
        rejected: number;
    }>;
    signals: string[];
}
/**
 * "Accepted" is Bing's SuccessCount (matched to a click and attributed);
 * "rejected" is UnattributedCount, broken down by UnattributedReason.
 * Windows are by upload date (UTC), counted back from today. The report lags a
 * day or two, so last_1d is often 0 even for a healthy goal; read it together
 * with upload_latency_days.
 */
export declare function computeOfflineHealth(goal: RawGoal, daily: OfflineDaily[], today: string): OfflineHealth;
export interface CampaignGoalChange {
    campaign_id: string;
    campaign_name: string | null;
    old_mode: "account_default" | "campaign_specific";
    old_goal_ids: string[];
    new_mode: "account_default" | "campaign_specific";
    new_goal_ids: string[];
    add: string[];
    remove: string[];
    unchanged: boolean;
}
/**
 * Removing every campaign-level goal returns the campaign to the account
 * default set; there is no separate "mode" flag in the API.
 */
export declare function planCampaignGoalChange(campaign: {
    Id: string | number;
    Name?: string | null;
    GoalIds?: Array<string | number> | null;
}, mode: "account_default" | "campaign_specific", goalIds: string[]): CampaignGoalChange;
export interface GoalUpdateInput {
    goal_id: string;
    name?: string;
    status?: "Active" | "Paused";
    include_in_conversions?: boolean;
    conversion_window_days?: number;
    count_type?: "All" | "Unique";
    revenue_type?: "FixedValue" | "VariableValue" | "NoValue";
    revenue_value?: number;
    currency_code?: string;
}
export interface GoalUpdatePlan {
    goal_id: string;
    name: string | null;
    diff: Record<string, {
        old: unknown;
        new: unknown;
    }>;
    payload: Record<string, unknown> | null;
    error?: string;
}
export declare function planGoalUpdate(u: GoalUpdateInput, current: RawGoal | undefined): GoalUpdatePlan;
/** Which planned fields did the read-back confirm? */
export declare function verifyGoalUpdate(plan: GoalUpdatePlan, after: RawGoal | undefined): {
    verified: boolean;
    mismatches: string[];
};
