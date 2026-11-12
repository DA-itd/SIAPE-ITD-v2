-- ============================================================================
-- SIAPE-ITD | VISIBILIDAD DE REGISTROS NUEVOS PARA PSICOLOGÍA
-- ----------------------------------------------------------------------------
-- PROBLEMA QUE CORRIGE:
--   Cuando un alumno se registra, sync_my_authorization() le crea su expediente
--   en clinical_cases, pero ese expediente nace SIN psicólogo asignado.
--   Las políticas RLS originales sólo permiten al PSICOLOGO ver expedientes
--   asignados, así que el registro nuevo no aparece ni en el semáforo ni en la
--   bandeja del psicólogo.
--
-- QUÉ HACE:
--   1. Permite al PSICOLOGO y al RESPONSABLE ver los expedientes SIN asignar.
--   2. Permite ver el registro del alumno de esos expedientes.
--   3. Permite leer las evaluaciones (BAI/BDI/Columbia) de los expedientes visibles.
--   4. Permite leer las asignaciones de esos expedientes (para mostrar el responsable).
--   5. Asegura la lectura del catálogo de carreras.
--   6. Asegura que el alumno pueda guardar su carrera (academic_program_id).
--
-- CÓMO EJECUTARLO:
--   Supabase > SQL Editor > pegar este archivo completo > Run.
--   Es idempotente: se puede ejecutar más de una vez sin romper nada.
-- ============================================================================

-- 0. Helpers SECURITY DEFINER (evitan recursión entre políticas RLS) ----------

CREATE OR REPLACE FUNCTION public.siape_current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role_code::text
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
    AND p.account_status = 'ACTIVA'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.siape_current_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.siape_current_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.siape_case_is_unassigned(p_case UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.case_assignments ca
    WHERE ca.clinical_case_id = p_case
      AND ca.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.siape_case_is_unassigned(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.siape_case_is_unassigned(UUID) TO authenticated;

-- 1. Expedientes nuevos sin psicólogo -----------------------------------------

ALTER TABLE public.clinical_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "siape_staff_ve_casos_nuevos" ON public.clinical_cases;
CREATE POLICY "siape_staff_ve_casos_nuevos"
ON public.clinical_cases
FOR SELECT
TO authenticated
USING (
  public.siape_current_role() IN ('PSICOLOGO', 'RESPONSABLE_PSICOLOGIA')
  AND public.siape_case_is_unassigned(id)
);

-- 2. Alumnos de esos expedientes nuevos ---------------------------------------

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "siape_staff_ve_alumnos_casos_nuevos" ON public.students;
CREATE POLICY "siape_staff_ve_alumnos_casos_nuevos"
ON public.students
FOR SELECT
TO authenticated
USING (
  public.siape_current_role() IN ('PSICOLOGO', 'RESPONSABLE_PSICOLOGIA')
  AND EXISTS (
    SELECT 1
    FROM public.clinical_cases cc
    WHERE cc.student_id = students.id
      AND public.siape_case_is_unassigned(cc.id)
  )
);

-- 3. Evaluaciones de los expedientes visibles ---------------------------------

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "siape_staff_ve_evaluaciones_casos" ON public.assessments;
CREATE POLICY "siape_staff_ve_evaluaciones_casos"
ON public.assessments
FOR SELECT
TO authenticated
USING (
  public.siape_current_role() IN ('PSICOLOGO', 'RESPONSABLE_PSICOLOGIA', 'PRACTICANTE')
  AND EXISTS (
    SELECT 1
    FROM public.clinical_cases cc
    WHERE cc.id = assessments.clinical_case_id
  )
);

-- 4. Asignaciones de los expedientes visibles ---------------------------------

ALTER TABLE public.case_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "siape_staff_ve_asignaciones" ON public.case_assignments;
CREATE POLICY "siape_staff_ve_asignaciones"
ON public.case_assignments
FOR SELECT
TO authenticated
USING (
  public.siape_current_role() IN ('PSICOLOGO', 'RESPONSABLE_PSICOLOGIA', 'PRACTICANTE')
  AND EXISTS (
    SELECT 1
    FROM public.clinical_cases cc
    WHERE cc.id = case_assignments.clinical_case_id
  )
);

-- 5. Catálogo de carreras legible por cualquier usuario autenticado -----------

ALTER TABLE public.academic_programs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.academic_programs TO authenticated;

DROP POLICY IF EXISTS "programas_lectura" ON public.academic_programs;
CREATE POLICY "programas_lectura"
ON public.academic_programs
FOR SELECT
TO authenticated
USING (true);

-- 6. El alumno puede guardar su carrera y su ficha ---------------------------
--    (sólo sobre su propia fila: lo limita la política students_actualiza_propio)

DO $$
DECLARE
  cols TEXT;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ')
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'students'
    AND column_name IN (
      'full_name', 'matricula', 'program_name', 'academic_program_id',
      'academic_department', 'semester', 'group_code', 'entry_generation',
      'gender', 'age', 'birth_date', 'phone', 'current_address',
      'emergency_contact', 'origin_city'
    );

  IF cols IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.students TO authenticated', cols);
  END IF;
END $$;

-- 7. Respaldo: crear el expediente de alumnos que se registraron pero que por
--    alguna razón quedaron sin clinical_cases (por ejemplo, si el trigger de
--    alta falló). No toca a quien ya tiene expediente.

INSERT INTO public.clinical_cases (case_folio, student_id, modality_origin)
SELECT
  'EXP-ITD-' || upper(substr(replace(s.id::text, '-', ''), 1, 8)),
  s.id,
  COALESCE(s.entry_modality, 'NUEVO_INGRESO')
FROM public.students s
WHERE NOT EXISTS (
  SELECT 1 FROM public.clinical_cases cc WHERE cc.student_id = s.id
)
ON CONFLICT (student_id) DO NOTHING;

-- 8. Verificación rápida ------------------------------------------------------
-- Muestra cuántos expedientes están sin responsable y cuántos alumnos
-- registrados tienen expediente. Ejecuta esto para confirmar que el registro
-- del alumno de ayer sí existe en la base.

SELECT
  (SELECT count(*) FROM public.students) AS alumnos_registrados,
  (SELECT count(*) FROM public.clinical_cases) AS expedientes_totales,
  (SELECT count(*) FROM public.clinical_cases cc
     WHERE NOT EXISTS (SELECT 1 FROM public.case_assignments ca
                       WHERE ca.clinical_case_id = cc.id AND ca.is_active)) AS expedientes_sin_responsable;
