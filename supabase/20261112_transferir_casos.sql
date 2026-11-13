-- ============================================================================
-- SIAPE-ITD | LIBERAR Y TRANSFERIR CASOS ENTRE PSICÓLOGOS
-- ----------------------------------------------------------------------------
-- QUÉ HACE:
--   1. release_case: el psicólogo responsable deja el caso. La asignación se
--      desactiva (NO se borra), el expediente queda sin responsable y vuelve a
--      la bandeja de "Registros nuevos" / "Solicitudes de consulta" para que
--      otro psicólogo lo tome.
--   2. transfer_case: el responsable actual (o el Responsable de Psicología /
--      Administrador) transfiere el caso a otro psicólogo y, opcionalmente, a
--      un practicante.
--
-- HISTORIAL:
--   Las asignaciones anteriores NO se eliminan: se marcan is_active=false y
--   conservan assigned_at/revoked_at. El expediente muestra el historial de
--   responsables (quién inició y quién dio seguimiento).
--
-- CÓMO EJECUTARLO:
--   Supabase > SQL Editor > pegar este archivo completo > Run.
--   Es idempotente.
-- ============================================================================

-- 1. Liberar un caso -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_case(
  p_case_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_name TEXT;
  v_old_psy TEXT;
  v_old_intern TEXT;
BEGIN
  SELECT p.role_code::text, p.full_name
  INTO v_role, v_name
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
    AND p.account_status = 'ACTIVA';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No se encontró tu perfil activo.';
  END IF;

  IF v_role NOT IN ('PSICOLOGO', 'RESPONSABLE_PSICOLOGIA', 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'Solo Psicología puede liberar un caso.';
  END IF;

  SELECT cc.assigned_psychologist_name, cc.assigned_intern_name
  INTO v_old_psy, v_old_intern
  FROM public.clinical_cases cc
  WHERE cc.id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El expediente no existe.';
  END IF;

  IF v_role = 'PSICOLOGO' AND NOT EXISTS (
    SELECT 1
    FROM public.case_assignments ca
    WHERE ca.clinical_case_id = p_case_id
      AND ca.assigned_user_id = auth.uid()
      AND ca.is_active = true
  ) THEN
    RAISE EXCEPTION 'Solo puedes liberar un caso que tengas asignado.';
  END IF;

  -- Evitar choque con la restricción única (caso, usuario, is_active):
  -- si el usuario ya tiene una fila histórica, una fila activa duplicada no
  -- se puede volver a marcar inactiva. Se elimina la activa y se conserva la
  -- histórica, que es el primer registro del psicólogo.
  DELETE FROM public.case_assignments ca
  WHERE ca.clinical_case_id = p_case_id
    AND ca.is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.case_assignments h
      WHERE h.clinical_case_id = ca.clinical_case_id
        AND h.assigned_user_id = ca.assigned_user_id
        AND h.is_active = false
    );

  -- Desactivar la asignación actual; la fila permanece como historial.
  UPDATE public.case_assignments
  SET is_active = false, revoked_at = now()
  WHERE clinical_case_id = p_case_id AND is_active = true;

  UPDATE public.clinical_cases
  SET assigned_psychologist_name = NULL,
      assigned_intern_name = NULL,
      follow_up_state = CASE
        WHEN follow_up_state = 'SEGUIMIENTO_CONCLUIDO' THEN follow_up_state
        ELSE 'PENDIENTE_CONTACTO'
      END,
      updated_at = now()
  WHERE id = p_case_id;

  BEGIN
    INSERT INTO public.audit_logs (
      actor_name, actor_role, action_type, target_table, target_record_id, details
    )
    VALUES (
      v_name, v_role, 'MODIFICACION_ROL_CUENTA', 'clinical_cases', p_case_id::text,
      format(
        'Caso liberado por %s. Responsable anterior: %s / practicante: %s. Nota: %s',
        v_name,
        COALESCE(v_old_psy, 'sin responsable'),
        COALESCE(v_old_intern, 'sin practicante'),
        COALESCE(NULLIF(trim(p_note), ''), 'sin nota')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo registrar la liberación en audit_logs: %', SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.release_case(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_case(UUID, TEXT) TO authenticated;

-- 2. Transferir un caso a otro psicólogo --------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_case(
  p_case_id UUID,
  p_psychologist_id UUID,
  p_intern_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_name TEXT;
  v_old_psy TEXT;
  v_old_intern TEXT;
  v_psy_name TEXT;
  v_psy_role TEXT;
  v_psy_status TEXT;
  v_intern_name TEXT;
  v_intern_role TEXT;
  v_intern_status TEXT;
BEGIN
  SELECT p.role_code::text, p.full_name
  INTO v_role, v_name
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
    AND p.account_status = 'ACTIVA';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No se encontró tu perfil activo.';
  END IF;

  IF v_role NOT IN ('PSICOLOGO', 'RESPONSABLE_PSICOLOGIA', 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'Solo Psicología puede transferir un caso.';
  END IF;

  IF v_role = 'PSICOLOGO' AND NOT EXISTS (
    SELECT 1
    FROM public.case_assignments ca
    WHERE ca.clinical_case_id = p_case_id
      AND ca.assigned_user_id = auth.uid()
      AND ca.is_active = true
  ) THEN
    RAISE EXCEPTION 'Solo puedes transferir un caso que tengas asignado.';
  END IF;

  SELECT cc.assigned_psychologist_name, cc.assigned_intern_name
  INTO v_old_psy, v_old_intern
  FROM public.clinical_cases cc
  WHERE cc.id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El expediente no existe.';
  END IF;

  SELECT p.full_name, p.role_code::text, p.account_status
  INTO v_psy_name, v_psy_role, v_psy_status
  FROM public.profiles p
  WHERE p.id = p_psychologist_id;

  IF v_psy_name IS NULL OR v_psy_role <> 'PSICOLOGO' OR v_psy_status <> 'ACTIVA' THEN
    RAISE EXCEPTION 'El psicólogo destino no existe o no está activo.';
  END IF;

  IF p_intern_id IS NOT NULL THEN
    SELECT p.full_name, p.role_code::text, p.account_status
    INTO v_intern_name, v_intern_role, v_intern_status
    FROM public.profiles p
    WHERE p.id = p_intern_id;

    IF v_intern_name IS NULL OR v_intern_role <> 'PRACTICANTE' OR v_intern_status <> 'ACTIVA' THEN
      RAISE EXCEPTION 'El practicante destino no existe o no está activo.';
    END IF;
  END IF;

  -- Evitar choque con la restricción única (caso, usuario, is_active):
  -- si el usuario ya tiene una fila histórica, una fila activa duplicada no
  -- se puede volver a marcar inactiva. Se elimina la activa y se conserva la
  -- histórica, que es el primer registro del psicólogo.
  DELETE FROM public.case_assignments ca
  WHERE ca.clinical_case_id = p_case_id
    AND ca.is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.case_assignments h
      WHERE h.clinical_case_id = ca.clinical_case_id
        AND h.assigned_user_id = ca.assigned_user_id
        AND h.is_active = false
    );

  -- Desactivar asignaciones actuales. No se borran: quedan en el historial.
  UPDATE public.case_assignments
  SET is_active = false, revoked_at = now()
  WHERE clinical_case_id = p_case_id AND is_active = true;

  -- Reactivar la fila del psicólogo destino si ya existía; si no, crearla.
  UPDATE public.case_assignments
  SET is_active = true,
      assigned_at = COALESCE(assigned_at, now()),
      revoked_at = NULL,
      assigned_by = auth.uid(),
      supervisor_psychologist_id = NULL
  WHERE clinical_case_id = p_case_id
    AND assigned_user_id = p_psychologist_id
    AND assignment_role = 'PSICOLOGO_RESPONSABLE';

  IF NOT FOUND THEN
    INSERT INTO public.case_assignments (
      clinical_case_id, assigned_user_id, assignment_role, assigned_by, is_active, assigned_at
    )
    VALUES (
      p_case_id, p_psychologist_id, 'PSICOLOGO_RESPONSABLE', auth.uid(), true, now()
    );
  END IF;

  -- Practicante opcional.
  IF p_intern_id IS NOT NULL THEN
    UPDATE public.case_assignments
    SET is_active = true,
        assigned_at = COALESCE(assigned_at, now()),
        revoked_at = NULL,
        assigned_by = auth.uid(),
        supervisor_psychologist_id = p_psychologist_id
    WHERE clinical_case_id = p_case_id
      AND assigned_user_id = p_intern_id
      AND assignment_role = 'PRACTICANTE_SUPERVISADO';

    IF NOT FOUND THEN
      INSERT INTO public.case_assignments (
        clinical_case_id, assigned_user_id, assignment_role,
        supervisor_psychologist_id, assigned_by, is_active, assigned_at
      )
      VALUES (
        p_case_id, p_intern_id, 'PRACTICANTE_SUPERVISADO',
        p_psychologist_id, auth.uid(), true, now()
      );
    END IF;
  END IF;

  UPDATE public.clinical_cases
  SET assigned_psychologist_name = v_psy_name,
      assigned_intern_name = v_intern_name,
      follow_up_state = CASE
        WHEN follow_up_state = 'SIN_ASIGNAR' THEN 'PENDIENTE_CONTACTO'
        ELSE follow_up_state
      END,
      updated_at = now()
  WHERE id = p_case_id;

  BEGIN
    INSERT INTO public.audit_logs (
      actor_name, actor_role, action_type, target_table, target_record_id, details
    )
    VALUES (
      v_name, v_role, 'MODIFICACION_ROL_CUENTA', 'clinical_cases', p_case_id::text,
      format(
        'Caso transferido de %s a %s. Practicante: %s. Nota: %s',
        COALESCE(v_old_psy, 'sin responsable'),
        v_psy_name,
        COALESCE(v_intern_name, 'sin practicante'),
        COALESCE(NULLIF(trim(p_note), ''), 'sin nota')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo registrar la transferencia en audit_logs: %', SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_case(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_case(UUID, UUID, UUID, TEXT) TO authenticated;

-- 3. Verificación --------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE is_active) AS asignaciones_activas,
  count(*) FILTER (WHERE NOT is_active) AS asignaciones_historicas
FROM public.case_assignments;
