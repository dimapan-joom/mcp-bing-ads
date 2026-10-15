import { RawGoal, OfflineDaily } from "./conversionGoals.js";
export interface GoalApi {
    getConversionGoals(client: any, goalIds?: string[]): Promise<RawGoal[]>;
    getCampaignsDetailed(client: any): Promise<{
        campaigns: any[];
        errors: Array<{
            campaign_type: string;
            message: string;
        }>;
    }>;
    getGoalReportRows(client: any, startDate: string, endDate: string, options?: {
        daily?: boolean;
        campaignIds?: string[];
    }): Promise<any[]>;
    getOfflineConversionDaily(client: any, goalIds: string[], startDate: string, endDate: string): Promise<{
        daily: OfflineDaily[];
        errors: any[];
    }>;
    addCampaignConversionGoals(client: any, pairs: Array<{
        CampaignId: string;
        GoalId: string;
    }>): Promise<any[]>;
    deleteCampaignConversionGoals(client: any, pairs: Array<{
        CampaignId: string;
        GoalId: string;
    }>): Promise<any[]>;
    updateConversionGoals(client: any, goals: Array<Record<string, unknown>>): Promise<any[]>;
    addConversionGoals(client: any, goals: Array<Record<string, unknown>>): Promise<{
        ids: Array<string | null>;
        errors: any[];
    }>;
}
export interface Ctx {
    api: GoalApi;
    client: any;
    today: string;
}
export declare function listConversionGoals(ctx: Ctx, args: any): Promise<{
    account_id: any;
    account_default_goal_ids: string[];
    campaigns_on_account_default: {
        total: number;
        active: number;
    };
    metrics_window: {
        start_date: string;
        end_date: string;
    } | null;
    goals: {
        campaign_usage: {
            campaign_specific_campaigns: number;
            campaign_specific_active_campaigns: number;
            via_account_default_campaigns: number;
            via_account_default_active_campaigns: number;
        };
        metrics: {
            conversions: number;
            revenue: number;
            all_conversions: number;
            all_revenue: number;
            campaigns_with_conversions: number;
            last_conversion_date: string | null;
        } | undefined;
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
    }[];
    report_goals_not_matched_to_ids: string[];
    campaign_query_errors: {
        campaign_type: string;
        message: string;
    }[];
    notes: string[];
}>;
export declare function getCampaignConversionGoals(ctx: Ctx, args: any): Promise<{
    account_id: any;
    account_default_goals: {
        goal_id: string;
        name: string | null;
        tracking_status: string | null;
    }[];
    summary: {
        campaigns: number;
        account_default: number;
        campaign_specific: number;
        with_warnings: number;
        by_effective_goal_set: {
            selection_mode: string;
            effective_goal_ids: string[];
            campaigns: number;
        }[];
    };
    campaigns: import("./conversionGoals.js").CampaignGoalSelection[];
    missing_campaign_ids: string[];
    campaign_query_errors: {
        campaign_type: string;
        message: string;
    }[];
}>;
export declare function getCampaignSettings(ctx: Ctx, args: any): Promise<{
    account_id: any;
    campaigns: {
        campaign_id: string;
        campaign_name: any;
        campaign_type: any;
        status: any;
        budget: {
            daily_budget: any;
            budget_type: any;
            shared_budget_id: any;
        };
        bidding: {
            type: any;
            target_roas: any;
            target_cpa: any;
            max_cpc: any;
            portfolio_bid_strategy_id: any;
        };
        conversion_goal_selection: "account_default" | "campaign_specific";
        selected_goals: import("./conversionGoals.js").GoalRef[];
        effective_bidding_goals: import("./conversionGoals.js").GoalRef[];
        warnings: string[];
    }[];
    missing_campaign_ids: string[];
    campaign_query_errors: {
        campaign_type: string;
        message: string;
    }[];
    notes: string[];
}>;
export declare function getConversionGoalPerformance(ctx: Ctx, args: any): Promise<{
    account_id: any;
    period: {
        start_date: any;
        end_date: any;
        time_aggregation: string;
    };
    total_spend: number;
    goals: {
        roas_vs_total_spend: number | null;
        all_roas_vs_total_spend: number | null;
        last_conversion_date: string | null | undefined;
        goal_id: string | null;
        goal_name: string;
        conversions: number;
        revenue: number;
        all_conversions: number;
        all_revenue: number;
        campaigns_with_conversions: number;
    }[];
    rows: import("./conversionGoals.js").GoalPerfRow[] | undefined;
    rows_total: number | undefined;
    notes: string[];
}>;
export declare function getOfflineConversionHealth(ctx: Ctx, args: any): Promise<{
    account_id: any;
    goals: never[];
    message: string;
    period?: undefined;
    partial_errors?: undefined;
    notes?: undefined;
} | {
    account_id: any;
    period: {
        start_date: string;
        end_date: string;
        basis: string;
    };
    goals: import("./conversionGoals.js").OfflineHealth[];
    partial_errors: any[];
    notes: string[];
    message?: undefined;
}>;
export declare function setCampaignConversionGoals(ctx: Ctx, args: any): Promise<{
    message: string;
    dry_run: boolean;
    requested: number;
    to_change: number;
    unchanged: any[];
    rejected: any[];
    diff: any[];
    campaign_query_errors: {
        campaign_type: string;
        message: string;
    }[];
} | {
    partial_errors: {
        op: string;
        campaign_id: string;
        goal_id: string;
        code: any;
        message: any;
    }[];
    verified: string[];
    failed: any[];
    success: boolean;
    dry_run: boolean;
    requested: number;
    to_change: number;
    unchanged: any[];
    rejected: any[];
    diff: any[];
    campaign_query_errors: {
        campaign_type: string;
        message: string;
    }[];
}>;
export declare function updateConversionGoal(ctx: Ctx, args: any): Promise<{
    message: string;
    dry_run: boolean;
    diff: {
        goal_id: string;
        name: string | null;
        diff: Record<string, {
            old: unknown;
            new: unknown;
        }>;
        error?: string;
    }[];
    unchanged: string[];
    rejected: {
        goal_id: string;
        error: string | undefined;
    }[];
} | {
    partial_errors: {
        goal_id: string;
        code: any;
        message: any;
    }[];
    verified: string[];
    failed: {
        verified: boolean;
        mismatches: string[];
        goal_id: string;
    }[];
    success: boolean;
    dry_run: boolean;
    diff: {
        goal_id: string;
        name: string | null;
        diff: Record<string, {
            old: unknown;
            new: unknown;
        }>;
        error?: string;
    }[];
    unchanged: string[];
    rejected: {
        goal_id: string;
        error: string | undefined;
    }[];
}>;
export declare function createOfflineConversionGoal(ctx: Ctx, args: any): Promise<{
    dry_run: boolean;
    would_create: Record<string, unknown>;
    message: string;
    success?: undefined;
    partial_errors?: undefined;
    goal?: undefined;
} | {
    dry_run: boolean;
    success: boolean;
    partial_errors: any[];
    would_create?: undefined;
    message?: undefined;
    goal?: undefined;
} | {
    dry_run: boolean;
    success: boolean;
    goal: import("./conversionGoals.js").GoalSummary | null;
    partial_errors: any[];
    would_create?: undefined;
    message?: undefined;
}>;
export declare const conversionGoalHandlers: Record<string, (ctx: Ctx, args: any) => Promise<unknown>>;
