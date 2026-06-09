-- Append-only audit history.
-- Drop the api_logs.api_id FK so request/response logs survive the
-- deletion of their source API (retention ≥ 365 days). api_id stays
-- as a plain indexed column for query joins; orphan rows after API
-- delete are intentional historical records.
ALTER TABLE "api_logs" DROP CONSTRAINT IF EXISTS "api_logs_api_id_fkey";
