# Snowflake

- **RAW** holds what n8n loads, as it arrived: `ENRICHMENT_EVENTS` (one row per enrichment) and `SF_LEAD_SNAPSHOT` (each lead's Salesforce state, copied once per run).
- RAW is append-only: rows are inserted once per n8n run and never updated or deleted, and the `GTM_LOADER` role has no UPDATE or DELETE to make sure of it.
- **ANALYTICS** holds only views, so every metric is recomputed from RAW and can be fixed or changed without touching data.
- Retries and repeated snapshots are resolved in the views with `QUALIFY`: one row per `EVENT_ID`, and the latest snapshot per lead.
- Run the files in order, `001` to `004`, in a Snowsight worksheet; each one is safe to re-run.
