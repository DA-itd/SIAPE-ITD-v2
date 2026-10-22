-- ============================================================================
-- SIAPE-ITD | MIGRACIÓN INICIAL SUPABASE POSTGRESQL (ESQUEMA + RLS + CATÁLOGOS)
-- Se ejecuta automáticamente con `npx supabase start` / `npx supabase db reset`
-- o pegándolo en el SQL Editor de Supabase Studio (Local o Cloud).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Catálogo de Roles del Sistema
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE NOT NULL CHECK (code IN (
    'ADMINISTRADOR',
    'RESPONSABLE_PSICOLOGIA',
    'PSICOLOGO',
    'PRACTICANTE',
    'ESTUDIANTE',
    'TUTOR_ACADEMICO'
  )),
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Perfiles de Usuario (Vinculados con auth.users o pruebas locales)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name VARCHAR(180) NOT NULL,
  email VARCHAR(180) UNIQUE NOT NULL,
  role_code VARCHAR(40) NOT NULL DEFAULT 'PSICOLOGO',
  account_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVA'
    CHECK (account_status IN ('ACTIVA', 'SUSPENDIDA', 'REVOCADA', 'PENDIENTE_AUTORIZACION')),
  professional_license VARCHAR(60),
  supervisor_id UUID REFERENCES public.profiles(id),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Asignación de Roles y Supervisión
CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES public.profiles(id),
  supervisor_psychologist_id UUID REFERENCES public.profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, role_id)
);

-- 4. Catálogo de Programas Académicos (Carreras ITD)
CREATE TABLE IF NOT EXISTS public.academic_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  academic_department VARCHAR(160) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Padrón Institucional de Estudiantes
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id),
  matricula VARCHAR(25) UNIQUE NOT NULL,
  full_name VARCHAR(180) NOT NULL,
  institutional_email VARCHAR(180) UNIQUE NOT NULL
    CHECK (institutional_email LIKE '%@itdurango.edu.mx'),
  academic_program_id UUID REFERENCES public.academic_programs(id),
  program_name VARCHAR(160) NOT NULL,
  academic_department VARCHAR(160) NOT NULL,
  semester SMALLINT NOT NULL CHECK (semester BETWEEN 1 AND 16),
  group_code VARCHAR(15) NOT NULL,
  entry_generation VARCHAR(20) NOT NULL,
  registration_status VARCHAR(25) NOT NULL DEFAULT 'ACTIVO'
    CHECK (registration_status IN ('ACTIVO', 'BAJA_TEMPORAL', 'EGRESADO')),
  entry_modality VARCHAR(30) NOT NULL DEFAULT 'NUEVO_INGRESO'
    CHECK (entry_modality IN ('NUEVO_INGRESO', 'ATENCION_INDIVIDUAL')),
  incorporated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Periodos de Evaluación
CREATE TABLE IF NOT EXISTS public.evaluation_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  modality VARCHAR(30) NOT NULL DEFAULT 'NUEVO_INGRESO',
  target_generation VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Instrumentos de Evaluación Psicológica (BAI / BDI)
CREATE TABLE IF NOT EXISTS public.assessment_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL CHECK (code IN ('BAI', 'BDI')),
  name VARCHAR(160) NOT NULL,
  construct_measured VARCHAR(80) NOT NULL,
  requires_institutional_license BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Versiones Autorizadas de Instrumentos
CREATE TABLE IF NOT EXISTS public.instrument_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES public.assessment_instruments(id),
  version_tag VARCHAR(60) UNIQUE NOT NULL,
  total_items SMALLINT NOT NULL CHECK (total_items > 0),
  min_score SMALLINT NOT NULL DEFAULT 0,
  max_score SMALLINT NOT NULL,
  license_verification_note TEXT NOT NULL,
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  is_current BOOLEAN NOT NULL DEFAULT true
);

-- 9. Reactivos Configurables del Instrumento
CREATE TABLE IF NOT EXISTS public.instrument_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_version_id UUID NOT NULL REFERENCES public.instrument_versions(id) ON DELETE CASCADE,
  item_number SMALLINT NOT NULL,
  item_code VARCHAR(30) NOT NULL,
  item_prompt TEXT NOT NULL,
  response_options JSONB NOT NULL,
  triggers_protocol_review BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (instrument_version_id, item_number)
);

-- 10. Reglas Deterministas de Puntuación
CREATE TABLE IF NOT EXISTS public.scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_version_id UUID NOT NULL REFERENCES public.instrument_versions(id) ON DELETE CASCADE,
  rule_version VARCHAR(50) NOT NULL,
  min_score SMALLINT NOT NULL,
  max_score SMALLINT NOT NULL,
  category_label VARCHAR(100) NOT NULL,
  suggested_priority VARCHAR(15) NOT NULL CHECK (suggested_priority IN ('VERDE', 'AMARILLO', 'ROJO')),
  operational_guidance TEXT NOT NULL,
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 11. Expediente Psicológico Único por Estudiante (1:1 con students)
CREATE TABLE IF NOT EXISTS public.clinical_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_folio VARCHAR(40) UNIQUE NOT NULL,
  student_id UUID UNIQUE NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  modality_origin VARCHAR(30) NOT NULL CHECK (modality_origin IN ('NUEVO_INGRESO', 'ATENCION_INDIVIDUAL')),
  anxiety_score SMALLINT,
  anxiety_category VARCHAR(120),
  anxiety_version VARCHAR(60),
  anxiety_evaluated_at DATE,
  depression_score SMALLINT,
  depression_category VARCHAR(120),
  depression_version VARCHAR(60),
  depression_evaluated_at DATE,
  psychometric_suggested_priority VARCHAR(15) NOT NULL DEFAULT 'VERDE'
    CHECK (psychometric_suggested_priority IN ('VERDE', 'AMARILLO', 'ROJO')),
  operational_priority VARCHAR(15) NOT NULL DEFAULT 'VERDE'
    CHECK (operational_priority IN ('VERDE', 'AMARILLO', 'ROJO')),
  urgent_risk_flagged BOOLEAN NOT NULL DEFAULT false,
  priority_override_reason TEXT,
  priority_updated_by VARCHAR(180),
  priority_updated_at TIMESTAMPTZ,
  assigned_psychologist_name VARCHAR(180),
  assigned_intern_name VARCHAR(180),
  follow_up_state VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE_CONTACTO'
    CHECK (follow_up_state IN (
      'PENDIENTE_CONTACTO',
      'SIN_ASIGNAR',
      'CITA_PROGRAMADA',
      'EN_ATENCION',
      'REQUIERE_NUEVA_VALORACION',
      'CANALIZADO',
      'SEGUIMIENTO_CONCLUIDO'
    )),
  next_follow_up_action TEXT,
  next_follow_up_date DATE,
  general_clinical_summary TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Asignaciones de Expedientes a Psicólogos y Practicantes
CREATE TABLE IF NOT EXISTS public.case_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_case_id UUID NOT NULL REFERENCES public.clinical_cases(id) ON DELETE CASCADE,
  assigned_user_id UUID NOT NULL REFERENCES public.profiles(id),
  assignment_role VARCHAR(30) NOT NULL CHECK (assignment_role IN ('PSICOLOGO_RESPONSABLE', 'PRACTICANTE_SUPERVISADO')),
  supervisor_psychologist_id UUID REFERENCES public.profiles(id),
  assigned_by UUID REFERENCES public.profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (clinical_case_id, assigned_user_id, is_active)
);

-- 13. Aplicaciones de Evaluaciones Psicológicas (BAI / BDI)
CREATE TABLE IF NOT EXISTS public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_case_id UUID NOT NULL REFERENCES public.clinical_cases(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  evaluation_period_id UUID REFERENCES public.evaluation_periods(id),
  instrument_code VARCHAR(20) NOT NULL CHECK (instrument_code IN ('BAI', 'BDI')),
  version_tag VARCHAR(60) NOT NULL,
  scoring_rule_version VARCHAR(50) NOT NULL,
  modality VARCHAR(30) NOT NULL CHECK (modality IN ('NUEVO_INGRESO', 'ATENCION_INDIVIDUAL')),
  status VARCHAR(30) NOT NULL DEFAULT 'INICIADO'
    CHECK (status IN ('INICIADO', 'INCOMPLETO', 'ENVIADO', 'CALIFICADO', 'REVISADO_PROFESIONAL')),
  completion_percentage SMALLINT NOT NULL DEFAULT 0,
  responses_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score SMALLINT,
  psychometric_category VARCHAR(120),
  suggested_priority VARCHAR(15),
  application_context_note TEXT,
  professional_interpretation TEXT,
  reviewed_by_psychologist_name VARCHAR(180),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
);

-- 14. Respuestas por Reactivo Normalizadas
CREATE TABLE IF NOT EXISTS public.assessment_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  item_number SMALLINT NOT NULL,
  selected_value SMALLINT NOT NULL CHECK (selected_value BETWEEN 0 AND 3),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, item_number)
);

-- 15. Resultados Psicométricos Deterministas
CREATE TABLE IF NOT EXISTS public.assessment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID UNIQUE NOT NULL REFERENCES public.assessments(id) ON DELETE RESTRICT,
  scoring_rule_version VARCHAR(50) NOT NULL,
  total_score SMALLINT NOT NULL,
  psychometric_category VARCHAR(100) NOT NULL,
  suggested_priority VARCHAR(15) NOT NULL CHECK (suggested_priority IN ('VERDE', 'AMARILLO', 'ROJO')),
  calculated_by_process VARCHAR(100) NOT NULL DEFAULT 'MOTOR_DETERMINISTA_SIAPE_V1',
  professional_interpretation TEXT,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. Sesiones de Atención Psicológica y Notas Clínicas
CREATE TABLE IF NOT EXISTS public.psychology_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_case_id UUID NOT NULL REFERENCES public.clinical_cases(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  session_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  responsible_psychologist_name VARCHAR(180) NOT NULL,
  participating_intern_name VARCHAR(180),
  attention_motive TEXT NOT NULL,
  clinical_notes TEXT NOT NULL,
  professional_observations TEXT,
  agreements TEXT,
  next_action TEXT NOT NULL,
  next_follow_up_date DATE,
  activity_status VARCHAR(25) NOT NULL DEFAULT 'REALIZADA'
    CHECK (activity_status IN ('PROGRAMADA', 'REALIZADA', 'REPROGRAMADA', 'INASISTENCIA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. Tareas y Actividades de Seguimiento
CREATE TABLE IF NOT EXISTS public.follow_up_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_case_id UUID NOT NULL REFERENCES public.clinical_cases(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  assigned_to_name VARCHAR(180) NOT NULL,
  title VARCHAR(180) NOT NULL,
  action_description TEXT NOT NULL,
  due_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE', 'VENCIDA', 'COMPLETADA')),
  outcome_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. Asignación de Tutores Académicos
CREATE TABLE IF NOT EXISTS public.tutor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_user_id UUID NOT NULL REFERENCES public.profiles(id),
  student_id UUID NOT NULL REFERENCES public.students(id),
  academic_period VARCHAR(30) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tutor_user_id, student_id, academic_period)
);

-- 19. Alertas de Acompañamiento Académico para Tutores
CREATE TABLE IF NOT EXISTS public.academic_support_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_case_id UUID NOT NULL REFERENCES public.clinical_cases(id),
  student_id UUID NOT NULL REFERENCES public.students(id),
  authorized_by_psychologist_name VARCHAR(180) NOT NULL,
  assigned_tutor_name VARCHAR(180) NOT NULL,
  general_recommendations TEXT NOT NULL,
  authorized_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  tutor_actions_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(35) NOT NULL DEFAULT 'ACTIVA'
    CHECK (status IN ('ACTIVA', 'EN_SEGUIMIENTO_TUTORIAL', 'ATENDIDA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. Bitácora Inmutable de Auditoría Institucional
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_name VARCHAR(180) NOT NULL,
  actor_role VARCHAR(40) NOT NULL,
  action_type VARCHAR(60) NOT NULL,
  target_table VARCHAR(60) NOT NULL,
  target_record_id VARCHAR(80),
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insertar catálogos base del ITD
INSERT INTO public.roles (code, name, description) VALUES
  ('ADMINISTRADOR', 'Administrador del Sistema', 'Gestión de usuarios, roles, periodos y catálogos académicos sin acceso a notas clínicas.'),
  ('RESPONSABLE_PSICOLOGIA', 'Responsable de Psicología', 'Coordinación clínica, asignación de casos, supervisión y aprobación de criterios.'),
  ('PSICOLOGO', 'Psicólogo Clínico', 'Atención de expedientes asignados, aplicación de evaluaciones, registro de sesiones y seguimiento.'),
  ('PRACTICANTE', 'Practicante de Psicología', 'Acceso restringido a expedientes asignados bajo supervisión de un psicólogo responsable.'),
  ('ESTUDIANTE', 'Estudiante ITD', 'Acceso exclusivo con correo @itdurango.edu.mx a sus propias evaluaciones habilitadas.'),
  ('TUTOR_ACADEMICO', 'Tutor Académico', 'Consulta exclusiva de alertas de acompañamiento académico sin acceso a datos clínicos.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.academic_programs (code, name, academic_department) VALUES
  ('ISC-2020-224', 'Ingeniería en Sistemas Computacionales', 'Sistemas y Computación'),
  ('IIND-2020-227', 'Ingeniería Industrial', 'Ingeniería Industrial'),
  ('IMCT-2020-229', 'Ingeniería Mecatrónica', 'Metal-Mecánica'),
  ('IQUI-2020-232', 'Ingeniería Química', 'Ingenierías Química y Bioquímica'),
  ('ICIV-2020-224', 'Ingeniería Civil', 'Ciencias de la Tierra'),
  ('ARQU-2020-201', 'Arquitectura', 'Ciencias de la Tierra'),
  ('LADM-2020-234', 'Licenciatura en Administración', 'Ciencias Económico-Administrativas')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.assessment_instruments (code, name, construct_measured, requires_institutional_license) VALUES
  ('BAI', 'Inventario de Ansiedad de Beck (BAI)', 'ANSIEDAD', true),
  ('BDI', 'Inventario de Depresión de Beck (BDI)', 'DEPRESION', true)
ON CONFLICT (code) DO NOTHING;
