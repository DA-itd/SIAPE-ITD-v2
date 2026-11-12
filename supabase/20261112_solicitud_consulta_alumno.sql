-- ============================================================================
-- SIAPE-ITD | SOLICITUD DE CONSULTA DEL ALUMNO
-- ----------------------------------------------------------------------------
-- QUÉ HACE:
--   1. Agrega a clinical_cases los campos para registrar que el alumno pidió
--      una consulta, cuándo la pidió y la nota opcional que escribió.
--   2. Crea request_my_consultation(p_note): el alumno la llama desde su
--      portal. Registra la solicitud y, si su semáforo psicométrico es
--      AMARILLO o ROJO y ningún profesional lo ha ajustado manualmente,
--      eleva la prioridad operativa para que Psicología la vea primero.
--   3. Crea my_consultation_status(): devuelve el estado de la solicitud del
--      alumno autenticado (si ya la envió, prioridad, si ya tiene psicólogo).
--
-- CÓMO EJECUTARLO:
--   Supabase > SQL Editor > pegar este archivo completo > Run.
--   Es idempotente: se puede ejecutar más de una vez.
-- ============================================================================

-- 1. Columnas nuevas -----------------------------------------------------------
ALTER TABLE public.clinical_cases
  ADD COLUMN IF NOT EXISTS consultation_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consultation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_request_note TEXT;

CREATE INDEX IF NOT EXISTS idx_clinical_cases_consultation_requested
  ON public.clinical_cases (consultation_requested)
  WHERE consultation_requested = true;

-- 2. Estado de la solicitud del alumno ----------------------------------------
CREATE OR REPLACE FUNCTION public.my_consultation_status()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'requested', COALESCE(cc.consultation_requested, false),
    'requestedAt', cc.consultation_requested_at,
    'note', cc.consultation_request_note,
    'priority', cc.operational_priority,
    'suggestedPriority', cc.psychometric_suggested_priority,
    'columbiaSiCount', cc.columbia_si_count,
    'assigned', EXISTS (
      SELECT 1
      FROM public.case_assignments ca
      WHERE ca.clinical_case_id = cc.id
        AND ca.is_active = true
    )
  )
  FROM public.students s
  JOIN public.clinical_cases cc ON cc.student_id = s.id
  WHERE s.auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_consultation_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_consultation_status() TO authenticated;

-- 3. Registrar la solicitud del alumno ----------------------------------------
CREATE OR REPLACE FUNCTION public.request_my_consultation(p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student UUID;
  v_case UUID;
BEGIN
  SELECT s.id
  INTO v_student
  FROM public.students s
  WHERE s.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'No encontramos tu registro de alumno. Cierra sesión y vuelve a entrar.';
  END IF;

  SELECT cc.id
  INTO v_case
  FROM public.clinical_cases cc
  WHERE cc.student_id = v_student
  LIMIT 1;

  -- Respaldo: si el expediente no existe todavía, se crea en este momento.
  IF v_case IS NULL THEN
    INSERT INTO public.clinical_cases (case_folio, student_id, modality_origin)
    SELECT
      'EXP-ITD-' || upper(substr(replace(s.id::text, '-', ''), 1, 8)),
      s.id,
      COALESCE(s.entry_modality, 'NUEVO_INGRESO')
    FROM public.students s
    WHERE s.id = v_student
    ON CONFLICT (student_id) DO NOTHING
    RETURNING id INTO v_case;

    IF v_case IS NULL THEN
      SELECT cc.id INTO v_case
      FROM public.clinical_cases cc
      WHERE cc.student_id = v_student;
    END IF;
  END IF;

  IF v_case IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear tu expediente. Avisa a la Oficina de Psicología.';
  END IF;

  UPDATE public.clinical_cases
  SET consultation_requested = true,
      consultation_requested_at = now(),
      consultation_request_note = NULLIF(trim(p_note), ''),
      updated_at = now(),
      follow_up_state = CASE
        WHEN follow_up_state IN ('SIN_ASIGNAR', 'SEGUIMIENTO_CONCLUIDO') THEN 'PENDIENTE_CONTACTO'
        ELSE follow_up_state
      END,
      -- Si el cuestionario sugirió una prioridad mayor y ningún profesional
      -- la ha ajustado manualmente, se refleja en el semáforo operativo.
      operational_priority = CASE
        WHEN priority_updated_by IS NOT NULL THEN operational_priority
        WHEN COALESCE(columbia_si_count, 0) > 0 THEN 'ROJO'
        WHEN psychometric_suggested_priority = 'ROJO' THEN 'ROJO'
        WHEN psychometric_suggested_priority = 'AMARILLO'
             AND operational_priority = 'VERDE' THEN 'AMARILLO'
        ELSE operational_priority
      END
  WHERE id = v_case;

  -- Bitácora (no debe impedir la solicitud si la tabla cambió).
  BEGIN
    INSERT INTO public.audit_logs (
      actor_name, actor_role, action_type, target_table, target_record_id, details
    )
    SELECT
      s.full_name, 'ESTUDIANTE', 'SOLICITUD_CONSULTA_ALUMNO', 'clinical_cases', v_case::text,
      CASE
        WHEN NULLIF(trim(p_note), '') IS NULL THEN 'El alumno solicitó una consulta psicológica.'
        ELSE 'El alumno solicitó una consulta psicológica. Nota: ' || left(trim(p_note), 500)
      END
    FROM public.students s
    WHERE s.id = v_student;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo registrar la solicitud en audit_logs: %', SQLERRM;
  END;

  RETURN (
    SELECT jsonb_build_object(
      'requested', cc.consultation_requested,
      'requestedAt', cc.consultation_requested_at,
      'note', cc.consultation_request_note,
      'priority', cc.operational_priority,
      'suggestedPriority', cc.psychometric_suggested_priority,
      'columbiaSiCount', cc.columbia_si_count,
      'assigned', EXISTS (
        SELECT 1
        FROM public.case_assignments ca
        WHERE ca.clinical_case_id = cc.id
          AND ca.is_active = true
      )
    )
    FROM public.clinical_cases cc
    WHERE cc.id = v_case
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_my_consultation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_my_consultation(TEXT) TO authenticated;

-- 4. Verificación --------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE consultation_requested = true) AS solicitudes_activas,
  count(*) AS expedientes_totales
FROM public.clinical_cases;
