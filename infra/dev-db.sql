-- Creates the local development database user and databases.
-- Run once as the postgres superuser, through `npm run db:setup`, which
-- passes the app password from apps/server/.env as :app_password.
-- Safe to run again: it only updates the password if things already exist.
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE wechiau LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wechiau') \gexec

-- CREATEDB lets `prisma migrate dev` make its temporary shadow database.
-- Development only: the VPS role does not get it.
ALTER ROLE wechiau WITH LOGIN CREATEDB PASSWORD :'app_password';

SELECT 'CREATE DATABASE wechiau_dev OWNER wechiau'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'wechiau_dev') \gexec

SELECT 'CREATE DATABASE wechiau_test OWNER wechiau'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'wechiau_test') \gexec

\echo 'Done: user wechiau with databases wechiau_dev and wechiau_test.'
