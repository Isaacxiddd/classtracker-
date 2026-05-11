-- Class Tracker — Supabase Schema
-- Paste this in Supabase SQL Editor (SQL Editor → New Query → Paste → Run)

CREATE TABLE IF NOT EXISTS classes (
  id bigint PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  emoji text NOT NULL DEFAULT '',
  day_of_week integer NOT NULL DEFAULT 1,
  start_time text NOT NULL DEFAULT '',
  end_time text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS surveys (
  id bigint PRIMARY KEY,
  class_id bigint NOT NULL DEFAULT 0,
  date text NOT NULL DEFAULT '',
  rating integer NOT NULL DEFAULT 3,
  notes text NOT NULL DEFAULT '',
  extra jsonb DEFAULT '{}',
  created_at text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blocks (
  id bigint PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  emoji text NOT NULL DEFAULT '',
  day_of_week integer NOT NULL DEFAULT 1,
  start_time text NOT NULL DEFAULT '',
  end_time text NOT NULL DEFAULT '',
  subjects text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS block_logs (
  id bigint PRIMARY KEY,
  block_id bigint NOT NULL DEFAULT 0,
  date text NOT NULL DEFAULT '',
  done boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  extra jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exams (
  id bigint PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  emoji text NOT NULL DEFAULT '',
  date text NOT NULL DEFAULT '',
  time text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  class_id bigint DEFAULT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config (
  id bigint PRIMARY KEY,
  key text NOT NULL DEFAULT '',
  value jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS summaries (
  id bigint PRIMARY KEY,
  week_start text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topics (
  id bigint PRIMARY KEY,
  class_id bigint NOT NULL DEFAULT 0,
  name text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topic_logs (
  id bigint PRIMARY KEY,
  topic_id bigint NOT NULL DEFAULT 0,
  date text NOT NULL DEFAULT '',
  count integer NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE surveys DISABLE ROW LEVEL SECURITY;
ALTER TABLE blocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE block_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE exams DISABLE ROW LEVEL SECURITY;
ALTER TABLE config DISABLE ROW LEVEL SECURITY;
ALTER TABLE summaries DISABLE ROW LEVEL SECURITY;
ALTER TABLE topics DISABLE ROW LEVEL SECURITY;
ALTER TABLE topic_logs DISABLE ROW LEVEL SECURITY;
