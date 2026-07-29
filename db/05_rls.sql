-- 05_rls.sql — Row-Level Security: enable + FORCE + policies.
-- Idempotent (ENABLE/FORCE are repeatable; each policy is DROP IF EXISTS then CREATE).
--
-- Single-role model (Heroku): PostgREST connects as the app login role, which
-- also OWNS these tables. Table owners bypass ordinary RLS, so we FORCE RLS to
-- make the owner subject to policies too. There is no `authenticated`/`anon`
-- role on Heroku (the login role lacks CREATEROLE), so every policy targets
-- TO PUBLIC — the login role is a member of PUBLIC and FORCE binds it.
--
-- Authorization depends ONLY on JWT claims read via app.*, never on the
-- Postgres role: app.is_salesforce() gates every policy to @salesforce.com;
-- ownership/sharing keys on app.user_id() (JWT sub == owner_id) and
-- app.current_email(). With no anon role configured, PostgREST rejects
-- token-less requests with 401 before RLS is even reached.

ALTER TABLE public.projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_shares    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_presence  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback          ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_shares    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_presence  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.feedback          FORCE ROW LEVEL SECURITY;

-- ─────────────────────────── projects ───────────────────────────
DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects FOR SELECT TO PUBLIC
USING (
  -- Reporting admin sees ALL rows (org-wide metrics need cross-user counts;
  -- forced RLS otherwise hides every other user's rows even from the owner
  -- login role). Same single-admin gate as feedback_select — no separate
  -- surface. User-facing lists still filter by owner_id in the query, so this
  -- does NOT change the Projects/gallery/shared views; only /api/metrics
  -- issues unfiltered count(*) and relies on this branch.
  app.is_feedback_admin()
  OR (app.is_salesforce() AND (
    owner_id = app.user_id()
    OR visibility = 'gallery'::text
    OR EXISTS (SELECT 1 FROM public.project_shares s
               WHERE s.project_id = projects.id
                 AND lower(s.shared_with_email) = app.current_email())
  ))
);

DROP POLICY IF EXISTS projects_insert ON public.projects;
CREATE POLICY projects_insert ON public.projects FOR INSERT TO PUBLIC
WITH CHECK (app.is_salesforce() AND (owner_id = app.user_id()));

DROP POLICY IF EXISTS projects_update ON public.projects;
CREATE POLICY projects_update ON public.projects FOR UPDATE TO PUBLIC
USING (
  app.is_salesforce() AND (
    owner_id = app.user_id()
    OR EXISTS (SELECT 1 FROM public.project_shares s
               WHERE s.project_id = projects.id
                 AND lower(s.shared_with_email) = app.current_email()
                 AND s.permission = 'edit'::text)
  )
)
WITH CHECK (
  app.is_salesforce() AND (
    owner_id = app.user_id()
    OR EXISTS (SELECT 1 FROM public.project_shares s
               WHERE s.project_id = projects.id
                 AND lower(s.shared_with_email) = app.current_email()
                 AND s.permission = 'edit'::text)
  )
);

DROP POLICY IF EXISTS projects_delete ON public.projects;
CREATE POLICY projects_delete ON public.projects FOR DELETE TO PUBLIC
USING (app.is_salesforce() AND (owner_id = app.user_id()));

-- ──────────────────────── project_shares ────────────────────────
DROP POLICY IF EXISTS shares_select ON public.project_shares;
CREATE POLICY shares_select ON public.project_shares FOR SELECT TO PUBLIC
USING (
  -- Reporting admin sees ALL shares for org-wide collaboration counts (see
  -- projects_select). Same single-admin gate; user-facing share reads are
  -- unaffected.
  app.is_feedback_admin()
  OR (app.is_salesforce() AND (
    lower(shared_with_email) = app.current_email()
    OR created_by = app.user_id()
  ))
);

DROP POLICY IF EXISTS shares_insert ON public.project_shares;
CREATE POLICY shares_insert ON public.project_shares FOR INSERT TO PUBLIC
WITH CHECK (
  app.is_salesforce() AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_shares.project_id AND p.owner_id = app.user_id()
  )
);

DROP POLICY IF EXISTS shares_update ON public.project_shares;
CREATE POLICY shares_update ON public.project_shares FOR UPDATE TO PUBLIC
USING (
  app.is_salesforce() AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_shares.project_id AND p.owner_id = app.user_id()
  )
)
WITH CHECK (
  app.is_salesforce() AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_shares.project_id AND p.owner_id = app.user_id()
  )
);

DROP POLICY IF EXISTS shares_delete ON public.project_shares;
CREATE POLICY shares_delete ON public.project_shares FOR DELETE TO PUBLIC
USING (
  app.is_salesforce() AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_shares.project_id AND p.owner_id = app.user_id()
  )
);

-- ─────────────────────── project_presence ───────────────────────
DROP POLICY IF EXISTS presence_select ON public.project_presence;
CREATE POLICY presence_select ON public.project_presence FOR SELECT TO PUBLIC
USING (
  app.is_salesforce() AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_presence.project_id
  )
);

DROP POLICY IF EXISTS presence_insert ON public.project_presence;
CREATE POLICY presence_insert ON public.project_presence FOR INSERT TO PUBLIC
WITH CHECK (
  app.is_salesforce()
  AND lower(holder_email) = app.current_email()
  AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_presence.project_id)
);

DROP POLICY IF EXISTS presence_update ON public.project_presence;
CREATE POLICY presence_update ON public.project_presence FOR UPDATE TO PUBLIC
USING (
  app.is_salesforce() AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_presence.project_id
  )
)
WITH CHECK (
  app.is_salesforce() AND lower(holder_email) = app.current_email()
);

DROP POLICY IF EXISTS presence_delete ON public.project_presence;
CREATE POLICY presence_delete ON public.project_presence FOR DELETE TO PUBLIC
USING (app.is_salesforce() AND lower(holder_email) = app.current_email());

-- ─────────────────────────── profiles ───────────────────────────
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO PUBLIC
USING (app.is_salesforce() AND (user_id = app.user_id()));

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO PUBLIC
WITH CHECK (app.is_salesforce() AND (user_id = app.user_id()));

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO PUBLIC
USING (app.is_salesforce() AND (user_id = app.user_id()))
WITH CHECK (app.is_salesforce() AND (user_id = app.user_id()));

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO PUBLIC
USING (app.is_salesforce() AND (user_id = app.user_id()));

-- ─────────────────────────── feedback ───────────────────────────
DROP POLICY IF EXISTS feedback_insert ON public.feedback;
CREATE POLICY feedback_insert ON public.feedback FOR INSERT TO PUBLIC
WITH CHECK (app.is_salesforce() AND (submitter_id = app.user_id()));

DROP POLICY IF EXISTS feedback_select ON public.feedback;
CREATE POLICY feedback_select ON public.feedback FOR SELECT TO PUBLIC
USING (app.is_feedback_admin());

DROP POLICY IF EXISTS feedback_update ON public.feedback;
CREATE POLICY feedback_update ON public.feedback FOR UPDATE TO PUBLIC
USING (app.is_feedback_admin())
WITH CHECK (app.is_feedback_admin());
