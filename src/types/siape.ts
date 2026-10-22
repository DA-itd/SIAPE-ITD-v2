/**
 * SIAPE-ITD | Modelo de Datos Tipado (Alineado al Esquema Relacional Supabase PostgreSQL)
 * Oficina de Psicología — Desarrollo Académico — Instituto Tecnológico de Durango
 */

export enum RoleCode {
  ADMINISTRADOR = 'ADMINISTRADOR',
  RESPONSABLE_PSICOLOGIA = 'RESPONSABLE_PSICOLOGIA',
  PSICOLOGO = 'PSICOLOGO',
  PRACTICANTE = 'PRACTICANTE',
  ESTUDIANTE = 'ESTUDIANTE',
  TUTOR_ACADEMICO = 'TUTOR_ACADEMICO',
}

export enum AccountStatus {
  ACTIVA = 'ACTIVA',
  SUSPENDIDA = 'SUSPENDIDA',
  REVOCADA = 'REVOCADA',
  PENDIENTE_AUTORIZACION = 'PENDIENTE_AUTORIZACION',
}

export enum PriorityLevel {
  VERDE = 'VERDE',     // Seguimiento ordinario conforme a criterios aprobados
  AMARILLO = 'AMARILLO', // Requiere valoración o seguimiento prioritario
  ROJO = 'ROJO',       // Requiere atención prioritaria o valoración urgente según protocolo
}

export enum AttentionModality {
  NUEVO_INGRESO = 'NUEVO_INGRESO',       // Modalidad A: Evaluación de nuevo ingreso
  ATENCION_INDIVIDUAL = 'ATENCION_INDIVIDUAL', // Modalidad B: Atención psicológica individual (cualquier semestre)
}

export enum InstrumentCode {
  BAI = 'BAI', // Inventario de Ansiedad de Beck
  BDI = 'BDI', // Inventario de Depresión de Beck
}

export enum AssessmentStatus {
  INICIADO = 'INICIADO',
  INCOMPLETO = 'INCOMPLETO',
  ENVIADO = 'ENVIADO',
  CALIFICADO = 'CALIFICADO',
  REVISADO_PROFESIONAL = 'REVISADO_PROFESIONAL',
}

export enum CaseFollowUpState {
  PENDIENTE_CONTACTO = 'PENDIENTE_CONTACTO',
  SIN_ASIGNAR = 'SIN_ASIGNAR',
  CITA_PROGRAMADA = 'CITA_PROGRAMADA',
  EN_ATENCION = 'EN_ATENCION',
  REQUIERE_NUEVA_VALORACION = 'REQUIERE_NUEVA_VALORACION',
  CANALIZADO = 'CANALIZADO',
  SEGUIMIENTO_CONCLUIDO = 'SEGUIMIENTO_CONCLUIDO',
}

// 1. profiles + roles + user_role_assignments
export interface UserProfile {
  id: string; // UUID vinculado a auth.users.id en Supabase
  fullName: string;
  email: string;
  role: RoleCode;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string | null;
  supervisorId?: string | null; // Obligatorio cuando role === PRACTICANTE
  supervisorName?: string | null;
  department?: string;
  professionalLicense?: string; // Cédula profesional cuando aplica
  assignedCaseIds: string[]; // Expedientes autorizados explícitamente (RLS)
  linkedStudentId?: string | null; // Vínculo cuando role === ESTUDIANTE
}

// 2. academic_programs
export interface AcademicProgram {
  id: string;
  code: string;
  name: string;
  academicDepartment: string;
  active: boolean;
}

export interface StudentRecord {
  id: string; // UUID interno único institucional
  matricula: string; // Ej. 26040101 (Validada, nunca usada como contraseña)
  fullName: string;
  institutionalEmail: string; // @itdurango.edu.mx
  programId: string;
  programName: string;
  academicDepartment: string;
  semester: number;
  group: string;
  entryGeneration: string; // Ej. "2025" o "2026-B"
  registrationStatus: 'ACTIVO' | 'BAJA_TEMPORAL' | 'EGRESADO';
  incorporatedAt: string;
  entryModality: AttentionModality;
  gender?: string;
  age?: number;
  birthDate?: string;
  currentAddress?: string;
  phone?: string;
  maritalStatus?: string;
  originCity?: string;
  hasChildren?: string;
  careerCertainty?: string;
  works?: string;
  workHours?: string;
  parentsLiving?: string;
  parentsSeparated?: string;
  monthlyIncome?: string;
  monthlyExpenses?: string;
  houseType?: string;
  internetService?: string;
  computerAccess?: string;
  familyAtmosphere?: string;
  familyTaskDistribution?: string;
  disabilityCondition?: string;
  disabilityDetail?: string;
  middleSchool?: string;
  middleSchoolGpa?: string;
  highSchool?: string;
  highSchoolSpecialty?: string;
  highSchoolGpa?: string;
  itdFirstChoice?: string;
  studyHabits?: string;
  studyHours?: string;
  sleepHours?: string;
  sportsActivity?: string;
  alcoholFrequency?: string;
  substanceTried?: string;
  substanceFrequency?: string;
  previousPsychologicalTherapy?: string;
  previousPsychiatricTreatment?: string;
  psychiatricMedication?: string;
  emergencyContact?: string;
  suicideProtocolSiCount?: number;
}

// 4. evaluation_periods
export interface EvaluationPeriod {
  id: string;
  code: string; // Ej. "2026-2-NI"
  name: string;
  startDate: string;
  endDate: string;
  modality: AttentionModality;
  isActive: boolean;
  targetGeneration: string;
  authorizedBy: string;
}

// 5. assessment_instruments + instrument_versions + instrument_items + scoring_rules
export interface ScoringCutoffBand {
  bandId: string;
  minScore: number;
  maxScore: number;
  categoryLabel: string; // Categoría psicométrica configurada por la institución
  suggestedOperationalPriority: PriorityLevel;
  operationalGuidance: string;
}

export interface InstrumentItemConfig {
  itemNumber: number; // 1 a 21
  itemCode: string;
  placeholderLabel: string; // Sin reproducir texto con derechos de autor sin verificación institucional
  domainCategory: string;
  options: {
    value: number; // 0, 1, 2, 3
    label: string;
  }[];
   triggersAlertReview?: boolean; // Si un reactivo específico requiere revisión protocolaria inmediata
}

export interface InstrumentVersionConfig {
  id: string;
  instrumentCode: InstrumentCode;
  instrumentName: string;
  versionTag: string; // Ej. "BAI-ITD-v1.0-CONFIG"
  scoringRuleVersion: string; // Ej. "RULE-BAI-2026.1"
  totalItems: number;
  minPossibleScore: number;
  maxPossibleScore: number;
  approvedBy: string;
  approvalDate: string;
  effectiveFrom: string;
  licenseStatusNote: string;
  cutoffBands: ScoringCutoffBand[];
  items: InstrumentItemConfig[];
}

// 6. assessments + assessment_responses + assessment_results
export interface AssessmentRecord {
  id: string;
  clinicalCaseId: string;
  studentId: string;
  periodId: string | null; // Puede ser null en Modalidad B (Atención Individual en consulta)
  modality: AttentionModality;
  instrumentCode: InstrumentCode;
  instrumentVersionId: string;
  versionTag: string;
  scoringRuleVersion: string;
  appliedAt: string;
  status: AssessmentStatus;
  completionPercentage: number;
  responses: Record<number, number>; // itemNumber (1..21) -> valor (0..3)
  totalScore: number | null; // null si status === INICIADO o INCOMPLETO
  psychometricCategory: string | null;
  suggestedPriority: PriorityLevel | null;
  calculatedByProcess: string;
  applicationContextNote: string; // Motivo/contexto cuando se aplica en consulta
  professionalInterpretation: string | null;
  reviewedByPsychologistId: string | null;
  reviewedByPsychologistName: string | null;
  reviewedAt: string | null;
}

// 7. psychology_sessions
export interface PsychologySession {
  id: string;
  clinicalCaseId: string;
  studentId: string;
  sessionDate: string;
  responsiblePsychologistId: string;
  responsiblePsychologistName: string;
  participatingInternId: string | null;
  participatingInternName: string | null;
  attentionMotive: string;
  clinicalNotes: string; // Protegido estrictamente por RLS (oculto a tutores y administradores sin permiso clínico)
  professionalObservations: string;
  agreements: string;
  nextAction: string;
  nextFollowUpDate: string;
  activityStatus: 'PROGRAMADA' | 'REALIZADA' | 'REPROGRAMADA' | 'INASISTENCIA';
  createdAt: string;
}

// 8. follow_up_tasks
export interface FollowUpTask {
  id: string;
  clinicalCaseId: string;
  studentId: string;
  assignedToId: string;
  assignedToName: string;
  title: string;
  actionDescription: string;
  dueDate: string;
  completedAt: string | null;
  status: 'PENDIENTE' | 'VENCIDA' | 'COMPLETADA';
  outcomeNote: string | null;
}

// 9. Referral / Canalización
export interface CaseReferral {
  id: string;
  clinicalCaseId: string;
  referredAt: string;
  referredByPsychologistName: string;
  destinationInstitution: string; // Ej. "Servicios de Salud de Durango / Psiquiatría", "Tutoría Académica ITD"
  reasonSummary: string;
  status: 'ENVIADA' | 'EN_PROCESO' | 'ATENDIDA';
}

// 10. Priority Change / Urgent Alert Protocol Record
export interface PriorityChangeRecord {
  id: string;
  clinicalCaseId: string;
  changedAt: string;
  changedByUserId: string;
  changedByUserName: string;
  previousPriority: PriorityLevel;
  newPriority: PriorityLevel;
  isManualOverride: boolean;
  isUrgentProtocolTriggered: boolean;
  justification: string;
  institutionalActionTaken: string;
  notifiedProfessionalName: string;
  acknowledgedAt: string | null;
}

// 11. clinical_cases (EXPEDIENTE PSICOLÓGICO ÚNICO POR ESTUDIANTE)
export interface ClinicalCaseRecord {
  id: string; // Identificador interno del expediente único (ej. EXP-ITD-2026-001)
  studentId: string; // Relación 1:1 con students.id (Expediente Único)
  openedAt: string;
  updatedAt: string;
  modalityOrigin: AttentionModality;
  // Indicadores independientes vinculados a cada instrumento y su versión
  anxietyIndicator: {
    lastAssessmentId: string | null;
    instrumentVersion: string | null;
    score: number | null;
    category: string | null;
    evaluatedAt: string | null;
  };
  depressionIndicator: {
    lastAssessmentId: string | null;
    instrumentVersion: string | null;
    score: number | null;
    category: string | null;
    evaluatedAt: string | null;
  };
  // Semáforo y prioridad operativa separada del resultado psicométrico
  psychometricSuggestedPriority: PriorityLevel;
  operationalPriority: PriorityLevel;
  urgentRiskIdentifiedByProfessional: boolean;
  urgentProtocolActive: boolean;
  priorityOverrideReason: string | null;
  priorityUpdatedBy: string | null;
  priorityUpdatedAt: string | null;
  // Asignación y estado actual
  assignedPsychologistId: string | null;
  assignedPsychologistName: string | null;
  assignedInternId: string | null;
  assignedInternName: string | null;
  followUpState: CaseFollowUpState;
  lastEvaluationDate: string | null;
  nextFollowUpAction: string;
  nextFollowUpDate: string | null;
  generalClinicalSummary: string; // Protegido por RLS clínico
  referrals: CaseReferral[];
  priorityHistory: PriorityChangeRecord[];
}

// 12. tutor_assignments + academic_support_alerts (Módulo de Tutorías con aislamiento estricto)
export interface AcademicSupportAlert {
  id: string;
  clinicalCaseId: string;
  studentId: string;
  studentMatricula: string;
  studentFullName: string;
  studentProgram: string;
  studentSemester: number;
  studentGroup: string;
  authorizedByPsychologistId: string;
  authorizedByPsychologistName: string;
  assignedTutorId: string;
  assignedTutorName: string;
  createdAt: string;
  requiresAcademicAccompaniment: boolean;
  generalAcademicRecommendations: string; // NUNCA incluye notas clínicas, reactivos ni puntajes BAI/BDI
  authorizedTutorActions: string[];
  tutorRegisteredActions: {
    id: string;
    registeredAt: string;
    tutorName: string;
    actionSummary: string;
    activityState: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADA';
  }[];
  status: 'ACTIVA' | 'EN_SEGUIMIENTO_TUTORIAL' | 'ATENDIDA';
}

// 13. audit_logs
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorRole: RoleCode;
  actionType:
    | 'CONSULTA_EXPEDIENTE'
    | 'NUEVA_EVALUACION'
    | 'CALIFICACION_DETERMINISTA'
    | 'CAMBIO_PRIORIDAD_MANUAL'
    | 'REGISTRO_SESION'
    | 'ALERTA_TUTORIA_AUTORIZADA'
    | 'EXPORTACION_REPORTE'
    | 'MODIFICACION_ROL_CUENTA'
    | 'INTENTO_ACCESO_DENEGADO_RLS'
    | 'ACTIVACION_PROTOCOLO_URGENTE';
  targetResource: string;
  targetId: string;
  details: string;
  ipSimulated: string;
}
