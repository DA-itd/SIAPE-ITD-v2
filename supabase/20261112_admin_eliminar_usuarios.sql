-- ============================================================================
-- SIAPE-ITD | ELIMINACIÓN DEFINITIVA DE CUENTAS DE PERSONAL (SUPERADMIN)
-- ----------------------------------------------------------------------------
-- QUÉ HACE:
--   El superadministrador puede eliminar psicólogos, practicantes, responsables
--   y tutores desde "Usuarios y Accesos". La función:
--     1. Verifica que quien ejecuta sea ADMINISTRADOR activo.
--     2. Impide eliminar la propia cuenta, la última cuenta de administrador
--        y las cuentas de alumnos.
--     3. Libera sus expedientes (quedan sin responsable y regresan a la
--        bandeja de "Registros nuevos").
--     4. Quita todas las referencias (asignaciones, supervisión, roles,
--        tutorías, altas/autorizaciones) para no dejar llaves colgando.
--     5. Borra la cuenta de Google (auth.users) y el perfil.
--     6. Elimina su correo de authorized_users para que no se vuelva a crear
--        la cuenta al iniciar sesión.
--     7. Registra el movimiento en audit_logs.
--
-- CÓMO EJECUTARLO:
--   Supabase > SQL Editor > pegar este archivo completo > Run.
--   Es idempotente: se puede ejecutar más de una vez.
--
-- NOTA:
--   Si una cuenta tiene datos ligados que impiden el borrado, la operación
--   completa se cancela y la app muestra el error. En ese caso usa "Revocar",
--   que le quita el acceso sin borrar el historial.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_profile_id UUID)
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
  v_admin_count INTEGER;
BEGIN
  -- 1. Solo un administrador activo puede ejecutar esto ----------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.account_status = 'ACTIVA'
      AND p.role_code = 'ADMINISTRADOR'
  ) THEN
    RAISE EXCEPTION 'Solo el superadministrador puede eliminar cuentas.';
  END IF;

  SELECT p.role_code::text, p.auth_user_id, p.email, p.full_name
  INTO v_role, v_auth, v_email, v_name
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'La cuenta que intentas eliminar no existe.';
  END IF;

  IF v_auth = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminar tu propia cuenta.';
  END IF;

  IF v_role = 'ESTUDIANTE' THEN
    RAISE EXCEPTION 'Las cuentas de alumnos no se eliminan desde aquí.';
  END IF;

  IF v_role = 'ADMINISTRADOR' THEN
    SELECT count(*) INTO v_admin_count
    FROM public.profiles
    WHERE role_code = 'ADMINISTRADOR' AND account_status = 'ACTIVA';

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Debe quedar al menos un administrador activo.';
    END IF;
  END IF;

  -- 2. Liberar los expedientes que tenía a cargo -----------------------------
  UPDATE public.clinical_cases cc
  SET assigned_psychologist_name = NULL
  WHERE EXISTS (
    SELECT 1
    FROM public.case_assignments ca
    WHERE ca.clinical_case_id = cc.id
      AND ca.assigned_user_id = p_profile_id
      AND ca.assignment_role = 'PSICOLOGO_RESPONSABLE'
  );

  UPDATE public.clinical_cases cc
  SET assigned_intern_name = NULL
  WHERE EXISTS (
    SELECT 1
    FROM public.case_assignments ca
    WHERE ca.clinical_case_id = cc.id
      AND ca.assigned_user_id = p_profile_id
      AND ca.assignment_role = 'PRACTICANTE_SUPERVISADO'
  );

  -- Algunos expedientes solo guardan el nombre (sin fila de asignación).
  UPDATE public.clinical_cases
  SET assigned_psychologist_name = NULL
  WHERE assigned_psychologist_name = v_name;

  UPDATE public.clinical_cases
  SET assigned_intern_name = NULL
  WHERE assigned_intern_name = v_name;

  -- 3. Quitar referencias antes de borrar el perfil --------------------------
  UPDATE public.case_assignments
  SET is_active = false, revoked_at = now()
  WHERE assigned_user_id = p_profile_id AND is_active = true;

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
  UPDATE public.evaluation_periods SET created_by = NULL WHERE created_by = p_profile_id;
  UPDATE public.instrument_versions SET approved_by = NULL WHERE approved_by = p_profile_id;
  UPDATE public.scoring_rules SET approved_by = NULL WHERE approved_by = p_profile_id;

  -- 4. Evitar que la cuenta se vuelva a provisionar al iniciar sesión --------
  DELETE FROM public.authorized_users WHERE lower(email) = lower(v_email);

  -- 5. Si la persona también tenía registro de alumno, conservar el historial
  UPDATE public.students SET auth_user_id = NULL WHERE auth_user_id = v_auth;

  -- 6. Borrar la cuenta de Google y el perfil -------------------------------
  IF v_auth IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth;
  END IF;

  DELETE FROM public.profiles WHERE id = p_profile_id;

  -- 7. Bitácora (si la tabla cambió, no debe impedir el borrado) -------------
  BEGIN
    INSERT INTO public.audit_logs (
      actor_name, actor_role, action_type, target_table, target_record_id, details
    )
    SELECT
      p.full_name, p.role_code, 'MODIFICACION_ROL_CUENTA', 'profiles', p_profile_id::text,
      format('Cuenta eliminada: %s (%s) · rol %s', v_name, v_email, v_role)
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo registrar la eliminación en audit_logs: %', SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
