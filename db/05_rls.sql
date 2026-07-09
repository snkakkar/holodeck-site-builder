-- 05_rls.sql — Row-Level Security: enable + policies.
-- Idempotent (ENABLE is repeatable; each policy is DROP IF EXISTS then CREATE).
--
-- Policies reproduced VERBATIM from live Neon, including their exact role
-- targets: some are TO authenticated, some TO public. PostgREST switches into
-- `authenticated` (a member of public), so public-targeted policies also apply
-- to it. `anon` has no table grants (04), so it never reaches these checks.
--
-- app.is_salesforce() gates every policy to @salesforce.com; ownership/sharing
-- keys on app.user_id() (JWT sub == owner_id) and app.current_email().

ALTER TABLE public.projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_shares    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_presence  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback          ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────── projects ───────────────────────────
DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects FOR SELECT TO public
USING (
  app.is_salesforce() AND (
    owner_id = app.user_id()
    OR visibility = 'gallery'::text
    OR EXISTS (SELECT 1 FROM public.project_shares s
               WHERE s.project_id = projects.id
                 AND lower(s.shared_with_email) = app.current_email())
  )
);

DROP POLICY IF EXISTS projects_insert ON public.projects;
CREATE POLICY projects_insert ON public.projects FOR INSERT TO authenticated
WITH CHECK (app.is_salesforce() AND (owner_id = app.user_id()));

DROP POLICY IF EXISTS projects_update ON public.projects;
CREATE POLICY projects_update ON public.projects FOR UPDATE TO public
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
CREATE POLICY projects_delete ON public.projects FOR DELETE TO authenticated
USING (app.is_salesforce() AND (owner_id = app.user_id()));

-- ──────────────────────── project_shares ────────────────────────
DROP POLICY IF EXISTS shares_select ON public.project_shares;
CREATE POLICY shares_select ON public.project_shares FOR SELECT TO public
USING (
  app.is_salesforce() AND (
    lower(shared_with_email) = app.current_email()
    OR created_by = app.user_id()
  )
);

DROP POLICY IF EXISTS shares_insert ON public.project_shares;
CREATE POLICY shares_insert ON public.project_shares FOR INSERT TO authenticated
WITH CHECK (
  app.is_salesforce() AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_shares.project_id AND p.owner_id = app.user_id()
  )
);

DROP POLICY IF EXISTS shares_update ON public.project_shares;
CREATE POLICY shares_update ON public.project_shares FOR UPDATE TO public
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
CREATE POLICY shares_delete ON public.project_shares FOR DELETE TO authenticated
USING (
  app.is_salesforce() AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_shares.project_id AND p.owner_id = app.user_id()
  )
);

-- ─────────────────────── project_presence ───────────────────────
DROP POLICY IF EXISTS presence_select ON public.project_presence;
CREATE POLICY presence_select ON public.project_presence FOR SELECT TO public
USING (
  app.is_salesforce() AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_presence.project_id
  )
);

DROP POLICY IF EXISTS presence_insert ON public.project_presence;
CREATE POLICY presence_insert ON public.project_presence FOR INSERT TO public
WITH CHECK (
  app.is_salesforce()
  AND lower(holder_email) = app.current_email()
  AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_presence.project_id)
);

DROP POLICY IF EXISTS presence_update ON public.project_presence;
CREATE POLICY presence_update ON public.project_presence FOR UPDATE TO public
USING (
  app.is_salesforce() AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_presence.project_id
  )
)
WITH CHECK (
  app.is_salesforce() AND lower(holder_email) = app.current_email()
);

DROP POLICY IF EXISTS presence_delete ON public.project_presence;
CREATE POLICY presence_delete ON public.project_presence FOR DELETE TO public
USING (app.is_salesforce() AND lower(holder_email) = app.current_email());

-- ─────────────────────────── profiles ───────────────────────────
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO public
USING (app.is_salesforce() AND (user_id = app.user_id()));

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO public
WITH CHECK (app.is_salesforce() AND (user_id = app.user_id()));

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO public
USING (app.is_salesforce() AND (user_id = app.user_id()))
WITH CHECK (app.is_salesforce() AND (user_id = app.user_id()));

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO public
USING (app.is_salesforce() AND (user_id = app.user_id()));

-- ─────────────────────────── feedback ───────────────────────────
DROP POLICY IF EXISTS feedback_insert ON public.feedback;
CREATE POLICY feedback_insert ON public.feedback FOR INSERT TO authenticated
WITH CHECK (app.is_salesforce() AND (submitter_id = app.user_id()));

DROP POLICY IF EXISTS feedback_select ON public.feedback;
CREATE POLICY feedback_select ON public.feedback FOR SELECT TO authenticated
USING (app.is_feedback_admin());

DROP POLICY IF EXISTS feedback_update ON public.feedback;
CREATE POLICY feedback_update ON public.feedback FOR UPDATE TO authenticated
USING (app.is_feedback_admin())
WITH CHECK (app.is_feedback_admin());
