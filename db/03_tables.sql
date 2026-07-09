-- 03_tables.sql — application tables (public schema).
-- Idempotent (CREATE TABLE IF NOT EXISTS + guarded index creation).
-- Reproduced verbatim from live Neon: column order, types, defaults,
-- constraints, and indexes. Defaults reference app.user_id()/app.current_email()
-- (02_functions.sql), so this file must run after 02.

CREATE TABLE IF NOT EXISTS public.projects (
  id          text NOT NULL,
  owner_id    text NOT NULL DEFAULT app.user_id(),
  name        text NOT NULL DEFAULT 'Untitled project'::text,
  summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility  text NOT NULL DEFAULT 'private'::text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_visibility_check CHECK (visibility = ANY (ARRAY['private'::text, 'gallery'::text]))
);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON public.projects USING btree (owner_id);
CREATE INDEX IF NOT EXISTS projects_visibility_idx ON public.projects USING btree (visibility);

CREATE TABLE IF NOT EXISTS public.project_shares (
  project_id         text NOT NULL,
  shared_with_id     text,
  permission         text NOT NULL DEFAULT 'view'::text,
  created_by         text NOT NULL DEFAULT app.user_id(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  shared_with_email  text NOT NULL,
  CONSTRAINT project_shares_pkey PRIMARY KEY (project_id, shared_with_email),
  CONSTRAINT project_shares_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT project_shares_permission_check CHECK (permission = ANY (ARRAY['view'::text, 'edit'::text]))
);
CREATE INDEX IF NOT EXISTS shares_shared_with_idx ON public.project_shares USING btree (shared_with_id);
CREATE INDEX IF NOT EXISTS project_shares_email_idx ON public.project_shares USING btree (lower(shared_with_email));

CREATE TABLE IF NOT EXISTS public.project_presence (
  project_id    text NOT NULL,
  holder_email  text NOT NULL,
  holder_name   text,
  expires_at    timestamptz NOT NULL DEFAULT (now() + '00:01:30'::interval),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_presence_pkey PRIMARY KEY (project_id),
  CONSTRAINT project_presence_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id     text NOT NULL DEFAULT app.user_id(),
  name        text NOT NULL DEFAULT ''::text,
  title       text NOT NULL DEFAULT ''::text,
  role        text NOT NULL DEFAULT ''::text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS public.feedback (
  id               text NOT NULL,
  submitter_id     text NOT NULL DEFAULT app.user_id(),
  submitter_email  text NOT NULL DEFAULT app.current_email(),
  type             text NOT NULL,
  message          text NOT NULL,
  rating           integer,
  context          text,
  status           text NOT NULL DEFAULT 'new'::text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_pkey PRIMARY KEY (id),
  CONSTRAINT feedback_rating_check CHECK ((rating IS NULL) OR ((rating >= 1) AND (rating <= 5))),
  CONSTRAINT feedback_status_check CHECK (status = ANY (ARRAY['new'::text, 'in_progress'::text, 'resolved'::text])),
  CONSTRAINT feedback_type_check CHECK (type = ANY (ARRAY['like'::text, 'dislike'::text, 'bug'::text, 'complaint'::text]))
);
