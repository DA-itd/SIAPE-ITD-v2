-- ============================================================================
-- SIAPE-ITD | IMPORTAR ALUMNOS DESDE CSV O ALTA INDIVIDUAL
-- ----------------------------------------------------------------------------
-- QUÉ HACE:
--   1. Recibe una lista de alumnos (JSON) desde la app.
--   2. Por cada matrícula/correo:
--      - Si el alumno ya existe, actualiza sus datos académicos.
--      - Si no existe, lo crea en public.students.
--      - Si no tiene Expediente Único, se lo crea (con folio automático).
--   3. Devuelve un resumen: nuevos, actualizados, expedientes creados y errores.
--
-- SEGURIDAD:
--   Solo ADMINISTRADOR y RESPONSABLE_PSICOLOGIA pueden ejecutarla.
--   Es idempotente: volver a importar el mismo CSV no duplica alumnos.
--
-- CÓMO EJECUTARLO:
--   Supabase > SQL Editor > pegar este archivo completo > Run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_import_students(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_total INTEGER := 0;
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
  v_cases INTEGER := 0;
  v_errors JSONB := '[]'::jsonb;
  v_results JSONB := '[]'::jsonb;
  v_student_id UUID;
  v_case_id UUID;
  v_program_id UUID;
  v_program_name TEXT;
  v_department TEXT;
  v_csv_program TEXT;
  v_modality TEXT;
  v_semester INTEGER;
  v_generation TEXT;
  v_status TEXT;
  v_fila INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.account_status = 'ACTIVA'
      AND p.role_code IN ('ADMINISTRADOR', 'RESPONSABLE_PSICOLOGIA')
  ) THEN
    RAISE EXCEPTION 'Solo el superadministrador o el Responsable de Psicología pueden importar alumnos.';
  END IF;

  FOR r IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS x(
      fila INTEGER,
      matricula TEXT,
      full_name TEXT,
      email TEXT,
      program_name TEXT,
      program_code TEXT,
      semester INTEGER,
      group_code TEXT,
      entry_generation TEXT,
      modality TEXT
    )
  LOOP
    v_total := v_total + 1;
    v_fila := COALESCE(r.fila, v_total);

    BEGIN
      IF NULLIF(btrim(r.matricula), '') IS NULL THEN
        RAISE EXCEPTION 'Matrícula vacía.';
      END IF;
      IF NULLIF(btrim(r.full_name), '') IS NULL THEN
        RAISE EXCEPTION 'Nombre vacío.';
      END IF;
      IF NULLIF(btrim(r.email), '') IS NULL OR position('@' IN r.email) = 0 THEN
        RAISE EXCEPTION 'Correo inválido.';
      END IF;

      v_modality := CASE
        WHEN upper(COALESCE(r.modality, '')) = 'ATENCION_INDIVIDUAL' THEN 'ATENCION_INDIVIDUAL'
        WHEN upper(COALESCE(r.modality, '')) = 'NUEVO_INGRESO' THEN 'NUEVO_INGRESO'
        ELSE NULL
      END;
      v_semester := CASE WHEN r.semester BETWEEN 1 AND 16 THEN r.semester ELSE NULL END;
      v_generation := COALESCE(
        NULLIF(btrim(r.entry_generation), ''),
        EXTRACT(YEAR FROM now())::INTEGER::TEXT
      );

      -- Buscar la carrera en el catálogo por código o nombre.
      v_program_id := NULL;
      v_program_name := NULL;
      v_department := NULL;
      v_csv_program := NULLIF(btrim(r.program_name), '');

      SELECT ap.id, ap.name, ap.academic_department
      INTO v_program_id, v_program_name, v_department
      FROM public.academic_programs ap
      WHERE (r.program_code IS NOT NULL AND lower(ap.code) = lower(btrim(r.program_code)))
         OR (v_csv_program IS NOT NULL AND lower(ap.name) = lower(v_csv_program))
      LIMIT 1;

      IF v_program_name IS NULL THEN
        v_program_name := COALESCE(v_csv_program, 'Sin asignar');
      END IF;

      -- Buscar alumno por matrícula o correo.
      SELECT s.id
      INTO v_student_id
      FROM public.students s
      WHERE lower(btrim(s.matricula)) = lower(btrim(r.matricula))
         OR lower(btrim(s.institutional_email)) = lower(btrim(r.email))
      LIMIT 1;

      IF v_student_id IS NOT NULL THEN
        UPDATE public.students s
        SET
          full_name = COALESCE(NULLIF(btrim(r.full_name), ''), s.full_name),
          program_name = COALESCE(NULLIF(v_program_name, ''), s.program_name, 'Sin asignar'),
          academic_program_id = COALESCE(v_program_id, s.academic_program_id),
          academic_department = COALESCE(v_department, s.academic_department),
          semester = COALESCE(v_semester, s.semester),
          group_code = COALESCE(NULLIF(btrim(r.group_code), ''), s.group_code),
          entry_generation = COALESCE(
            NULLIF(btrim(r.entry_generation), ''),
            s.entry_generation,
            v_generation
          ),
          entry_modality = COALESCE(v_modality, s.entry_modality),
          updated_at = now()
        WHERE s.id = v_student_id;

        v_updated := v_updated + 1;
        v_status := 'UPDATED';
      ELSE
        INSERT INTO public.students (
          matricula,
          full_name,
          institutional_email,
          academic_program_id,
          program_name,
          academic_department,
          semester,
          group_code,
          entry_generation,
          registration_status,
          entry_modality
        )
        VALUES (
          btrim(r.matricula),
          btrim(r.full_name),
          lower(btrim(r.email)),
          v_program_id,
          COALESCE(NULLIF(v_program_name, ''), 'Sin asignar'),
          v_department,
          v_semester,
          NULLIF(btrim(r.group_code), ''),
          COALESCE(NULLIF(btrim(r.entry_generation), ''), v_generation),
          'ACTIVO',
          COALESCE(v_modality, 'NUEVO_INGRESO')
        )
        RETURNING id INTO v_student_id;

        v_inserted := v_inserted + 1;
        v_status := 'CREATED';
      END IF;

      -- Expediente Único: se crea si el alumno aún no lo tiene.
      SELECT cc.id
      INTO v_case_id
      FROM public.clinical_cases cc
      WHERE cc.student_id = v_student_id;

      IF v_case_id IS NULL THEN
        INSERT INTO public.clinical_cases (case_folio, student_id, modality_origin)
        VALUES (
          'PENDIENTE-' || upper(substr(replace(v_student_id::text, '-', ''), 1, 8)),
          v_student_id,
          COALESCE(v_modality, 'NUEVO_INGRESO')
        )
        RETURNING id INTO v_case_id;

        v_cases := v_cases + 1;
      END IF;

      v_results := v_results || jsonb_build_object(
        'fila', v_fila,
        'matricula', btrim(r.matricula),
        'studentId', v_student_id,
        'caseId', v_case_id,
        'status', v_status
      );
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'fila', v_fila,
        'matricula', COALESCE(btrim(r.matricula), ''),
        'message', SQLERRM
      );
    END;
  END LOOP;

  BEGIN
    INSERT INTO public.audit_logs (
      actor_name, actor_role, action_type, target_table, target_record_id, details
    )
    SELECT
      p.full_name, p.role_code, 'IMPORTACION_ALUMNOS', 'students', NULL,
      format(
        'Importación de alumnos: %s fila(s), %s nuevo(s), %s actualizado(s), %s expediente(s) creado(s), %s error(es).',
        v_total, v_inserted, v_updated, v_cases, jsonb_array_length(v_errors)
      )
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo registrar la importación en audit_logs: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'total', v_total,
    'inserted', v_inserted,
    'updated', v_updated,
    'casesCreated', v_cases,
    'errors', v_errors,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_import_students(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_students(JSONB) TO authenticated;

-- Verificación rápida de alumnos y expedientes.
SELECT
  (SELECT count(*) FROM public.students) AS alumnos,
  (SELECT count(*) FROM public.clinical_cases) AS expedientes;
