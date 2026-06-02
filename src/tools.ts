import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const tools: Tool[] = [
  {
    name: "bing_ads_get_client_context",
    description: "Get the current client context and health status based on working directory. Call this first to confirm which Bing Ads account you're working with.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        working_directory: {
          type: "string",
          description: "The current working directory",
        },
      },
      required: ["working_directory"],
    },
  },
  {
    name: "bing_ads_get_campaigns_with_roas",
    description: `Get all active campaigns with their actual Target ROAS via Bulk Download API.

⚠️ WHY THIS EXISTS: bing_ads_list_campaigns returns BiddingScheme=null for ALL PMax campaigns
because the Bing Ads SOAP/REST API does not expose ROAS at the campaign level for PMax.
The ROAS is stored in the Bid Strategy and is ONLY accessible via the Bulk Download CSV
(column "Bid Strategy TargetRoas"). This has been confirmed experimentally — the Bing UI
shows ROAS values (e.g. 86%) while SOAP returns nil for the same campaigns.

Use this tool when you need to:
- Read current ROAS for any campaign type (PMax, Shopping, Search)
- Compare current vs target ROAS before updating
- Verify ROAS was correctly applied after bing_ads_set_campaign_bidding

Note: slower than bing_ads_list_campaigns (~15-30s) due to async Bulk download.`,
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string", description: "The account ID (uses context if not provided)" },
        status_filter: {
          type: "string",
          description: "Filter by status: 'active' (default), 'paused', 'all'",
        },
      },
    },
  },
  {
    name: "bing_ads_list_campaigns",
    description: "List campaigns for the Bing/Microsoft Advertising account. By default returns only Active campaigns. Pass status_filter='all' to include Paused/Deleted.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: {
          type: "string",
          description: "The account ID (uses context if not provided)",
        },
        status_filter: {
          type: "string",
          description: "Filter by campaign status. Options: 'active' (default), 'paused', 'all'",
        },
      },
    },
  },
  {
    name: "bing_ads_get_campaign_performance",
    description: "Get campaign performance metrics (impressions, clicks, CTR, CPC, spend, conversions, revenue) for a date range. By default returns only Active campaigns. Pass status_filter='all' to include Paused.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
        start_date: { type: "string", description: "Start date YYYY-MM-DD" },
        end_date: { type: "string", description: "End date YYYY-MM-DD" },
        status_filter: {
          type: "string",
          description: "Filter by campaign status. Options: 'active' (default), 'paused', 'all'",
        },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "bing_ads_list_ad_groups",
    description: "List ad groups within a specific campaign, including ad group name and status.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
        campaign_id: { type: "string", description: "The numeric string campaign ID to list ad groups for" },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "bing_ads_keyword_performance",
    description: "Get keyword performance report with metrics including impressions, clicks, cost, conversions, quality score. Optionally filter by campaign.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
        start_date: { type: "string", description: "Start date YYYY-MM-DD" },
        end_date: { type: "string", description: "End date YYYY-MM-DD" },
        campaign_ids: { type: "array", items: { type: "string" }, description: "Filter by numeric string campaign IDs" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "bing_ads_search_term_report",
    description: "Get search term report showing actual search queries that triggered ads, with matched keywords and performance metrics.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
        start_date: { type: "string", description: "Start date YYYY-MM-DD" },
        end_date: { type: "string", description: "End date YYYY-MM-DD" },
        campaign_ids: { type: "array", items: { type: "string" }, description: "Filter by numeric string campaign IDs" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "bing_ads_pause_keywords",
    description: "Pause one or more keywords by setting their status to Paused. Requires ad group ID and keyword IDs.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string", description: "The account ID (uses context if not provided)" },
        ad_group_id: { type: "string", description: "The ad group containing the keywords" },
        keyword_ids: { type: "array", items: { type: "string" }, description: "Array of keyword IDs to pause" },
      },
      required: ["ad_group_id", "keyword_ids"],
    },
  },
  {
    name: "bing_ads_list_shared_entities",
    description: "List shared negative keyword lists (SharedEntity type) for the account. Returns list IDs and names needed for adding negatives.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string", description: "The account ID (uses context if not provided)" },
        entity_type: { type: "string", description: "Entity type, defaults to NegativeKeywordList", default: "NegativeKeywordList" },
      },
    },
  },
  {
    name: "bing_ads_add_shared_negatives",
    description: "Add negative keywords to a shared negative keyword list. Use phrase match by default (wrap in quotes). Call bing_ads_list_shared_entities first to get list IDs.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string", description: "The account ID (uses context if not provided)" },
        shared_list_id: { type: "string", description: "The shared negative keyword list ID to add negatives to" },
        keywords: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "The negative keyword text" },
              match_type: { type: "string", enum: ["Exact", "Phrase"], description: "Match type (default: Phrase)" },
            },
            required: ["text"],
          },
          description: "Array of negative keywords to add",
        },
      },
      required: ["shared_list_id", "keywords"],
    },
  },
  {
    name: "bing_ads_update_campaign_budget",
    description: "Update a campaign's daily budget amount. Use bing_ads_list_campaigns first to get the campaign ID and current budget.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string", description: "The account ID (uses context if not provided)" },
        campaign_id: { type: "string", description: "The numeric string campaign ID to update" },
        daily_budget: { type: "number", description: "New daily budget in dollars (e.g. 50.00 for $50/day)" },
      },
      required: ["campaign_id", "daily_budget"],
    },
  },
  {
    name: "bing_ads_bulk_update_budgets",
    description: `Update daily budgets for multiple campaigns in a SINGLE Bing Ads API call.

⚠️ Write operation — requires BING_ADS_MCP_WRITE=true.

Sends all budget updates in one SOAP UpdateCampaigns request.
Returns per-campaign verified/failed breakdown.`,
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string", description: "The account ID" },
        updates: {
          type: "array",
          description: "List of campaigns to update",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              campaign_id: { type: "string", description: "Numeric campaign ID" },
              daily_budget: { type: "number", description: "New daily budget in account currency" },
            },
            required: ["campaign_id", "daily_budget"],
          },
          minItems: 1,
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "bing_ads_bulk_update_roas",
    description: `Update Target ROAS for multiple campaigns in a SINGLE Bing Ads API call.

⚠️ Write operation — requires BING_ADS_MCP_WRITE=true.

Sends all campaign updates in one SOAP UpdateCampaigns request (no per-campaign round trips),
then verifies via a single Bulk download. Use this instead of calling bing_ads_set_campaign_bidding
in a loop — it's dramatically faster for bulk ROAS syncs (e.g. 60 campaigns = 1 call vs 60).

Returns per-campaign verified/failed breakdown.`,
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string", description: "The account ID" },
        updates: {
          type: "array",
          description: "List of campaigns to update",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              campaign_id: { type: "string", description: "Numeric campaign ID" },
              target_roas: { type: "number", description: "Target ROAS (e.g. 0.87 = 87%)" },
            },
            required: ["campaign_id", "target_roas"],
          },
          minItems: 1,
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "bing_ads_set_campaign_bidding",
    description: `Change bidding strategy for a single campaign. Supports Target ROAS, Target CPA, Maximize Conversions, Maximize Clicks, Manual CPC.
⚠️ Write operation — requires BING_ADS_MCP_WRITE=true.

For bulk ROAS updates (multiple campaigns), use bing_ads_bulk_update_roas instead — it's a single API call.

Note: does NOT verify after writing (Bulk API has propagation delay). Use bing_ads_get_campaigns_with_roas separately to verify.`,
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
        campaign_id: { type: "string", description: "Numeric campaign ID" },
        strategy_type: {
          type: "string",
          enum: ["TargetRoas", "MaxConversionValue", "TargetCpa", "MaxConversions", "MaxClicks", "ManualCpc"],
          description: "Bidding strategy type. MaxConversionValue = maximize conversion value (Shopping/PMax default, supports optional ROAS target). TargetRoas = alias for MaxConversionValue+ROAS. MaxConversions = maximize conversion count (no value optimization).",
        },
        target_roas: { type: "number", description: "Target ROAS (e.g. 0.85 = 85%). Required for TargetRoas." },
        target_cpa: { type: "number", description: "Target CPA in account currency (e.g. 5.00). Required for TargetCpa." },
        max_cpc: { type: "number", description: "Optional max CPC cap in account currency." },
      },
      required: ["campaign_id", "strategy_type"],
    },
  },
  {
    name: "bing_ads_set_campaign_status",
    description: `Enable or pause a campaign. ⚠️ Write operation — requires BING_ADS_MCP_WRITE=true.`,
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
        campaign_id: { type: "string", description: "Numeric campaign ID" },
        status: { type: "string", enum: ["Active", "Paused"], description: "New status" },
      },
      required: ["campaign_id", "status"],
    },
  },
  {
    name: "bing_ads_add_responsive_search_ad",
    description: `Add a new Responsive Search Ad (RSA) to an ad group. Use this to create text ad variations for A/B testing.
Requires 3-15 headlines (max 30 chars each) and 2-4 descriptions (max 90 chars each).
⚠️ Write operation — requires BING_ADS_MCP_WRITE=true.`,
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
        ad_group_id: { type: "string", description: "Numeric ad group ID (use bing_ads_list_ad_groups to find)" },
        headlines: {
          type: "array",
          items: { type: "string" },
          description: "3-15 headlines, max 30 chars each. Google will mix and match.",
          minItems: 3,
          maxItems: 15,
        },
        descriptions: {
          type: "array",
          items: { type: "string" },
          description: "2-4 descriptions, max 90 chars each.",
          minItems: 2,
          maxItems: 4,
        },
        final_url: { type: "string", description: "Landing page URL" },
        path1: { type: "string", description: "Optional display URL path 1 (max 15 chars)" },
        path2: { type: "string", description: "Optional display URL path 2 (max 15 chars)" },
      },
      required: ["ad_group_id", "headlines", "descriptions", "final_url"],
    },
  },
  {
    name: "bing_ads_get_spend_by_hour",
    description: "Get spend, clicks, CPC broken down by hour of day for a given date. Use two dates (today + yesterday) to compare and detect anomalies. TimePeriod = 0-23 (hour).",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string", description: "The account ID (uses context if not provided)" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        campaign_ids: { type: "array", items: { type: "string" }, description: "Optional: filter to specific campaign IDs" },
      },
      required: ["date"],
    },
  },
  {
    name: "bing_ads_get_budget_pacing",
    description: "Check budget pacing for all active campaigns: actual spend vs expected linear pace for the month. Returns pacing %, gap, and status (on_track / underpacing / overpacing).",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
        month_start: { type: "string", description: "First day of month YYYY-MM-DD" },
        month_end: { type: "string", description: "Last day of month YYYY-MM-DD" },
      },
      required: ["month_start", "month_end"],
    },
  },
  {
    name: "bing_ads_get_disapproved_ads",
    description: "Find ads with Inactive/Disapproved status in the account. Returns ads with 0 impressions and 0 spend grouped by campaign — these are likely disapproved or paused.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
      },
    },
  },
  {
    name: "bing_ads_get_recommendations",
    description: "Get budget and optimization recommendations for the account. Analyzes current budget pacing to identify campaigns that are budget-limited (should increase budget) or severely underpacing (should reduce or review budget).",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
      },
    },
  },
  {
    name: "bing_ads_get_experiments",
    description: "List all A/B experiments (ad variation tests) in the account with their status, traffic split, and associated campaigns.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
      },
    },
  },
  {
    name: "bing_ads_create_experiment",
    description: "Create an A/B experiment for a Search campaign to test ad variations. Splits traffic between the base campaign and an experiment copy. Only works for Search campaigns (not Shopping/PMax). ⚠️ This creates a new campaign — confirm with user before calling.",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string" },
        name: { type: "string", description: "Experiment name" },
        base_campaign_id: { type: "string", description: "ID of the base Search campaign to test against" },
        split_percent: { type: "number", description: "% of traffic going to experiment (1-99, e.g. 50 for 50/50)" },
        start_date: { type: "string", description: "Start date YYYY-MM-DD (optional)" },
        end_date: { type: "string", description: "End date YYYY-MM-DD (optional)" },
      },
      required: ["name", "base_campaign_id", "split_percent"],
    },
  },
  {
    name: "bing_ads_get_merchant_center_health",
    description: `Get Bing Merchant Center feed health for all active stores: published vs rejected product counts per catalog,
overall reject percentage, and a sampled analysis of likely rejection causes (missing GTIN/brand, short titles, invalid prices, etc.).

Note: Bing Content API does not expose individual rejection reasons — the 'sampledIssues' field is based on
analysis of 200 sampled products per store to identify common data quality issues that typically cause rejections.`,
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: {
        account_id: { type: "string", description: "The account ID (uses context if not provided)" },
      },
    },
  },
];
