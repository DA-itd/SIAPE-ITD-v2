-- ============================================================================
-- SIAPE-ITD | BAJA DE CUENTAS DE PERSONAL CONSERVANDO EL HISTORIAL
-- ----------------------------------------------------------------------------
-- QUÉ HACE:
--   El superadministrador puede dar de baja psicólogos, practicantes,
--   responsables y tutores desde "Usuarios y Accesos". La función:
--     1. Verifica que quien ejecuta sea ADMINISTRADOR activo.
--     2. Impide eliminar la propia cuenta, la última cuenta de administrador
--        y las cuentas de alumnos.
--     3. Libera sus expedientes actuales (quedan sin responsable y regresan a
--        la bandeja de "Registros nuevos").
--     4. DESACTIVA sus asignaciones, roles y tutorías, pero NO las borra:
--        el perfil, las asignaciones históricas, las sesiones, las tareas y
--        la bitácora se conservan para consultar el historial.
--     5. Borra la cuenta de Google (auth.users) para que no pueda volver a
--        entrar, y elimina su correo de authorized_users.
--     6. Deja el perfil con estado REVOCADA y sin auth_user_id. Así sigue
--        apareciendo en "Usuarios y Accesos" como cuenta eliminada con
--        historial, pero sin acceso al sistema.
--     7. Registra el movimiento en audit_logs.
--
-- CÓMO EJECUTARLO:
--   Supabase > SQL Editor > pegar este archivo completo > Run.
--   Es idempotente: se puede ejecutar más de una vez.
--
-- NOTA:
--   El nombre y el correo del perfil se conservan para identificar quién
--   atendió, supervisó o asignó cada expediente. Lo único que se elimina es
--   el acceso (cuenta de Google y roles activos).
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
    RAISE EXCEPTION 'Solo el superadministrador puede dar de baja cuentas.';
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
  --    Se limpia el responsable ACTUAL para que el caso regrese a la bandeja.
  --    La asignación histórica se conserva en case_assignments (is_active=false).
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

  -- 3. Baja lógica: desactivar, NO borrar -----------------------------------
  UPDATE public.case_assignments
  SET is_active = false, revoked_at = now()
  WHERE assigned_user_id = p_profile_id AND is_active = true;

  UPDATE public.user_role_assignments
  SET is_active = false, revoked_at = now()
  WHERE user_id = p_profile_id AND is_active = true;

  UPDATE public.tutor_assignments
  SET is_active = false
  WHERE tutor_user_id = p_profile_id AND is_active = true;

  -- 4. Supervisión activa: los practicantes quedan sin supervisor vigente,
  --    pero el vínculo histórico se conserva en las filas desactivadas.
  UPDATE public.profiles
  SET supervisor_id = NULL
  WHERE supervisor_id = p_profile_id;

  UPDATE public.case_assignments
  SET supervisor_psychologist_id = NULL
  WHERE supervisor_psychologist_id = p_profile_id AND is_active = true;

  UPDATE public.user_role_assignments
  SET supervisor_psychologist_id = NULL
  WHERE supervisor_psychologist_id = p_profile_id AND is_active = true;

  -- 5. Evitar que la cuenta se vuelva a provisionar al iniciar sesión --------
  DELETE FROM public.authorized_users WHERE lower(email) = lower(v_email);

  -- 6. Si la persona también tenía registro de alumno, conservar el historial
  UPDATE public.students SET auth_user_id = NULL WHERE auth_user_id = v_auth;

  -- 7. Quitar el acceso con Google (NO se borra el perfil) -------------------
  IF v_auth IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth;
  END IF;

  UPDATE public.profiles
  SET auth_user_id = NULL,
      account_status = 'REVOCADA',
      updated_at = now()
  WHERE id = p_profile_id;

  -- 8. Bitácora (si la tabla cambió, no debe impedir la baja) ----------------
  BEGIN
    INSERT INTO public.audit_logs (
      actor_name, actor_role, action_type, target_table, target_record_id, details
    )
    SELECT
      p.full_name, p.role_code, 'MODIFICACION_ROL_CUENTA', 'profiles', p_profile_id::text,
      format('Cuenta dada de baja (historial conservado): %s (%s) · rol %s', v_name, v_email, v_role)
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo registrar la baja en audit_logs: %', SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
