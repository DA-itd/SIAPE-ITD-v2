-- ============================================================================
-- SIAPE-ITD | BORRAR DEFINITIVAMENTE USUARIOS DE PRUEBA (SUPERADMIN)
-- ----------------------------------------------------------------------------
-- DIFERENCIA CON "ELIMINAR":
--   * "Eliminar" (admin_delete_user) = baja lógica. Borra el acceso, deja el
--     perfil REVOCADA y conserva el historial. Se usa con personal real.
--   * "Borrar prueba" (admin_hard_delete_user) = eliminación definitiva para
--     cuentas ficticias de prueba. Borra la cuenta de Google, el perfil, sus
--     asignaciones y roles. NO deja el perfil REVOCADA ni el historial de ese
--     usuario.
--
-- SEGURIDAD:
--   * Solo un ADMINISTRADOR activo puede ejecutarla.
--   * No permite borrar la propia cuenta, alumnos ni administradores.
--   * Solo aplica a PSICOLOGO, PRACTICANTE, RESPONSABLE_PSICOLOGIA y
--     TUTOR_ACADEMICO (cuentas de personal de prueba).
--
-- CÓMO EJECUTARLO:
--   Supabase > SQL Editor > pegar este archivo completo > Run.
--   Es idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT;
  v_auth UUID;
  v_email TEXT;
  v_name TEXT;
BEGIN
  -- 1. Solo un administrador activo ------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.account_status = 'ACTIVA'
      AND p.role_code = 'ADMINISTRADOR'
  ) THEN
    RAISE EXCEPTION 'Solo el superadministrador puede borrar usuarios de prueba.';
  END IF;

  SELECT p.role_code::text, p.auth_user_id, p.email, p.full_name
  INTO v_role, v_auth, v_email, v_name
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'La cuenta que intentas borrar no existe.';
  END IF;

  IF v_auth = auth.uid() THEN
    RAISE EXCEPTION 'No puedes borrar tu propia cuenta.';
  END IF;

  IF v_role NOT IN ('PSICOLOGO', 'PRACTICANTE', 'RESPONSABLE_PSICOLOGIA', 'TUTOR_ACADEMICO') THEN
    RAISE EXCEPTION 'Solo se pueden borrar definitivamente cuentas de personal de prueba (no alumnos ni administradores).';
  END IF;

  -- 2. Liberar expedientes que tenía a cargo ---------------------------------
  UPDATE public.clinical_cases cc
  SET assigned_psychologist_name = NULL
  WHERE EXISTS (
    SELECT 1 FROM public.case_assignments ca
    WHERE ca.clinical_case_id = cc.id
      AND ca.assigned_user_id = p_profile_id
      AND ca.assignment_role = 'PSICOLOGO_RESPONSABLE'
  );

  UPDATE public.clinical_cases cc
  SET assigned_intern_name = NULL
  WHERE EXISTS (
    SELECT 1 FROM public.case_assignments ca
    WHERE ca.clinical_case_id = cc.id
      AND ca.assigned_user_id = p_profile_id
      AND ca.assignment_role = 'PRACTICANTE_SUPERVISADO'
  );

  UPDATE public.clinical_cases
  SET assigned_psychologist_name = NULL
  WHERE assigned_psychologist_name = v_name;

  UPDATE public.clinical_cases
  SET assigned_intern_name = NULL
  WHERE assigned_intern_name = v_name;

  UPDATE public.clinical_cases cc
  SET follow_up_state = CASE
        WHEN cc.follow_up_state = 'SEGUIMIENTO_CONCLUIDO' THEN cc.follow_up_state
        ELSE 'PENDIENTE_CONTACTO'
      END,
      updated_at = now()
  WHERE (cc.assigned_psychologist_name IS NULL AND cc.assigned_intern_name IS NULL)
    AND EXISTS (
      SELECT 1 FROM public.case_assignments ca
      WHERE ca.clinical_case_id = cc.id
        AND ca.assigned_user_id = p_profile_id
    );

  -- 3. Borrar asignaciones y referencias del usuario --------------------------
  DELETE FROM public.case_assignments WHERE assigned_user_id = p_profile_id;

  UPDATE public.case_assignments
  SET supervisor_psychologist_id = NULL
  WHERE supervisor_psychologist_id = p_profile_id;

  UPDATE public.case_assignments
  SET assigned_by = NULL
  WHERE assigned_by = p_profile_id;

  UPDATE public.profiles
  SET supervisor_id = NULL
  WHERE supervisor_id = p_profile_id;

  UPDATE public.user_role_assignments
  SET supervisor_psychologist_id = NULL
  WHERE supervisor_psychologist_id = p_profile_id;

  UPDATE public.user_role_assignments
  SET assigned_by = NULL
  WHERE assigned_by = p_profile_id;

  DELETE FROM public.user_role_assignments WHERE user_id = p_profile_id;

  DELETE FROM public.tutor_assignments WHERE tutor_user_id = p_profile_id;

  UPDATE public.authorized_users SET added_by = NULL WHERE added_by = p_profile_id;
  DELETE FROM public.authorized_users WHERE lower(email) = lower(v_email);

  UPDATE public.evaluation_periods SET created_by = NULL WHERE created_by = p_profile_id;
  UPDATE public.instrument_versions SET approved_by = NULL WHERE approved_by = p_profile_id;
  UPDATE public.scoring_rules SET approved_by = NULL WHERE approved_by = p_profile_id;

  -- Quitar el nombre de la cuenta ficticia de registros clínicos históricos
  -- (sesiones, tareas, alertas, revisiones) para que no quede rastro lógico.
  UPDATE public.psychology_sessions
  SET responsible_psychologist_name = 'Cuenta de prueba eliminada'
  WHERE responsible_psychologist_name = v_name;

  UPDATE public.psychology_sessions
  SET participating_intern_name = NULL
  WHERE participating_intern_name = v_name;

  UPDATE public.follow_up_tasks
  SET assigned_to_name = 'Cuenta de prueba eliminada'
  WHERE assigned_to_name = v_name;

  UPDATE public.academic_support_alerts
  SET authorized_by_psychologist_name = 'Cuenta de prueba eliminada'
  WHERE authorized_by_psychologist_name = v_name;

  UPDATE public.academic_support_alerts
  SET assigned_tutor_name = 'Cuenta de prueba eliminada'
  WHERE assigned_tutor_name = v_name;

  UPDATE public.assessments
  SET reviewed_by_psychologist_name = NULL
  WHERE reviewed_by_psychologist_name = v_name;

  UPDATE public.clinical_cases
  SET priority_updated_by = NULL
  WHERE priority_updated_by = v_name;

  -- Si la persona también tuviera un registro de alumno, se conserva el
  -- registro académico pero se desvincula de la cuenta borrada.
  UPDATE public.students SET auth_user_id = NULL WHERE auth_user_id = v_auth;

  -- 4. Borrar la cuenta de Google y el perfil --------------------------------
  IF v_auth IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth;
  END IF;

  DELETE FROM public.profiles WHERE id = p_profile_id;

  -- Sin INSERT en audit_logs: se trata de una limpieza de cuentas ficticias
  -- y el usuario pidió que no quede registro lógico de ellas.
END;
$$;

REVOKE ALL ON FUNCTION public.admin_hard_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user(UUID) TO authenticated;

-- Verificación: muestra cuántos perfiles quedan por rol.
SELECT role_code, count(*) AS cuentas
FROM public.profiles
GROUP BY role_code
ORDER BY role_code;
