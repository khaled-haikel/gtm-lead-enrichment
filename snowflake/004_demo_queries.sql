-- 004_demo_queries.sql: the queries shown in the demo. Read-only, against views only,
-- run as the same least-privileged role n8n uses.

USE ROLE GTM_LOADER;
USE WAREHOUSE GTM_WH;
USE SCHEMA GTM_DEMO.ANALYTICS;

-- 1. Where every lead is right now.
SELECT STATUS, LEADS
FROM V_FUNNEL
ORDER BY STAGE_ORDER;

-- 2. Do reps agree with the tiers? Approval rate per tier.
SELECT TIER, APPROVED, REJECTED, APPROVAL_RATE
FROM V_APPROVAL_BY_TIER
ORDER BY TIER;

-- 3. How long leads wait for a decision.
SELECT REVIEWED_LEADS, MEDIAN_HOURS, P90_HOURS
FROM V_REVIEW_TIME;

-- 4. What enrichment costs, how fast it is, and how much model evidence the code rejects.
SELECT MODEL, RULES_VERSION, LEADS, AVG_COST_PER_LEAD_USD, MEDIAN_LATENCY_MS, DROPPED_SIGNAL_SHARE
FROM V_ENRICHMENT_COST
ORDER BY RULES_VERSION DESC, MODEL;

-- 5. The evidence check at work: quotes the model claimed that were not on the page.
--    Assumes PAYLOAD holds the service response; the n8n task decides what it stores.
SELECT
  e.LEAD_ID,
  e.OCCURRED_AT,
  d.value:signal::VARCHAR AS SIGNAL,
  d.value:quote::VARCHAR  AS QUOTE,
  d.value:reason::VARCHAR AS REASON
FROM V_ENRICHMENT_EVENTS e,
  LATERAL FLATTEN(INPUT => e.PAYLOAD:evidence:dropped) d
WHERE e.EVENT_TYPE = 'enriched'
ORDER BY e.OCCURRED_AT DESC
LIMIT 20;
