-- 001_setup.sql: warehouse, database, schemas, loader role and the n8n service user.
-- Run in a Snowsight worksheet as ACCOUNTADMIN (it switches to SYSADMIN and SECURITYADMIN
-- below). Safe to re-run: every statement creates only if missing or converges to the same
-- state.

------------------------------------------------------------------------------------------
-- Compute and storage (owned by SYSADMIN)
------------------------------------------------------------------------------------------
USE ROLE SYSADMIN;

CREATE WAREHOUSE IF NOT EXISTS GTM_WH
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'gtm-lead-enrichment: n8n loads and analytics queries';

-- Re-applies the settings if the warehouse already existed with different ones.
ALTER WAREHOUSE GTM_WH SET
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE;

CREATE DATABASE IF NOT EXISTS GTM_DEMO
  COMMENT = 'gtm-lead-enrichment demo data';

CREATE SCHEMA IF NOT EXISTS GTM_DEMO.RAW
  COMMENT = 'Append-only data loaded by n8n. Never updated or deleted.';

CREATE SCHEMA IF NOT EXISTS GTM_DEMO.ANALYTICS
  COMMENT = 'Views only: deduplication, latest state and metrics over RAW.';

------------------------------------------------------------------------------------------
-- Loader role
------------------------------------------------------------------------------------------
USE ROLE SECURITYADMIN;

CREATE ROLE IF NOT EXISTS GTM_LOADER
  COMMENT = 'n8n service role: insert and read RAW, read ANALYTICS';

-- Keep the role in the standard hierarchy so admins can use and manage it.
GRANT ROLE GTM_LOADER TO ROLE SYSADMIN;

GRANT USAGE ON WAREHOUSE GTM_WH TO ROLE GTM_LOADER;
GRANT USAGE ON DATABASE GTM_DEMO TO ROLE GTM_LOADER;
GRANT USAGE ON SCHEMA GTM_DEMO.RAW TO ROLE GTM_LOADER;
GRANT USAGE ON SCHEMA GTM_DEMO.ANALYTICS TO ROLE GTM_LOADER;

-- RAW: insert and read only. No UPDATE, DELETE or TRUNCATE: that is what keeps RAW
-- append-only. Future grants cover the tables 002_raw.sql creates; the ALL grants cover
-- tables that already exist when this file is re-run.
GRANT INSERT, SELECT ON ALL TABLES IN SCHEMA GTM_DEMO.RAW TO ROLE GTM_LOADER;
GRANT INSERT, SELECT ON FUTURE TABLES IN SCHEMA GTM_DEMO.RAW TO ROLE GTM_LOADER;

-- ANALYTICS: read the views.
GRANT SELECT ON ALL VIEWS IN SCHEMA GTM_DEMO.ANALYTICS TO ROLE GTM_LOADER;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA GTM_DEMO.ANALYTICS TO ROLE GTM_LOADER;

------------------------------------------------------------------------------------------
-- Service user for n8n: key-pair authentication only (TYPE = SERVICE has no password)
------------------------------------------------------------------------------------------
CREATE USER IF NOT EXISTS N8N_SVC
  TYPE = SERVICE
  DEFAULT_ROLE = GTM_LOADER
  DEFAULT_WAREHOUSE = GTM_WH
  COMMENT = 'n8n workflow: loads RAW once per run';

-- Re-applies the settings if the user already existed.
ALTER USER N8N_SVC SET
  TYPE = SERVICE
  DEFAULT_ROLE = GTM_LOADER
  DEFAULT_WAREHOUSE = GTM_WH;

GRANT ROLE GTM_LOADER TO USER N8N_SVC;

-- ======================================================================================
-- PLACEHOLDER: the public key. Generate the key pair on your own machine (the private key
-- never goes into this repository, this worksheet or a chat):
--
--   openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -v2 aes256 -out rsa_key.p8
--   openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
--
-- The first command asks for a passphrase that encrypts the private key. If the n8n
-- credential cannot take a passphrase, use "-nocrypt" instead of "-v2 aes256".
--
-- Paste the contents of rsa_key.pub below WITHOUT the "-----BEGIN PUBLIC KEY-----" and
-- "-----END PUBLIC KEY-----" lines, as one line. In your worksheet only: keep the
-- placeholder in the committed file. Until it is replaced, this statement fails on
-- purpose; everything above it has already run.
--
-- To check afterwards that Snowflake holds the key you generated, compare
--   DESC USER N8N_SVC;   (property RSA_PUBLIC_KEY_FP)
-- with
--   openssl rsa -pubin -in rsa_key.pub -outform DER | openssl dgst -sha256 -binary | openssl enc -base64
-- (the fingerprint in Snowflake is prefixed with "SHA256:").
-- ======================================================================================
ALTER USER N8N_SVC SET RSA_PUBLIC_KEY = '<PASTE_PUBLIC_KEY_HERE>';
