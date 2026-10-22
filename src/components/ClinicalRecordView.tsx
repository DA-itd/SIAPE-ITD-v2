import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardPlus,
  FileText,
  History,
  Lock,
  Plus,
  Printer,
  Send,
  ShieldAlert,
  TrendingDown,
  UserCheck,
} from 'lucide-react';
import {
  AssessmentRecord,
  AssessmentStatus,
  AttentionModality,
  AuditLogEntry,
  CaseFollowUpState,
  ClinicalCaseRecord,
  FollowUpTask,
  InstrumentCode,
  InstrumentVersionConfig,
  PriorityLevel,
  PsychologySession,
  RoleCode,
  StudentRecord,
  UserProfile,
} from '../types/siape';
import {
  checkRlsAccessPermission,
  evaluateInstrumentDeterministically,
} from '../lib/scoringEngine';
import ClinicalDecisionSupportBlueprint from './ClinicalDecisionSupportBlueprint';

interface ClinicalRecordViewProps {
  currentUser: UserProfile;
  clinicalCase: ClinicalCaseRecord;
  student: StudentRecord;
  assessments: AssessmentRecord[];
  sessions: PsychologySession[];
  tasks: FollowUpTask[];
  auditLogs: AuditLogEntry[];
  instrumentConfigs: Record<InstrumentCode, InstrumentVersionConfig>;
  psychologists: UserProfile[];
  interns: UserProfile[];
  onBack: () => void;
  onCreateConsultationAssessment: (payload: {
    clinicalCaseId: string;
    studentId: string;
    instrumentCode: InstrumentCode;
    applicationContextNote: string;
    responses: Record<number, number>;
    professionalInterpretation: string;
    overridePriority: PriorityLevel | null;
    overrideReason: string;
    nextFollowUpAction: string;
    nextFollowUpDate: string;
  }) => void;
  onRegisterSession: (payload: {
    clinicalCaseId: string;
    studentId: string;
    participatingInternId: string | null;
    attentionMotive: string;
    clinicalNotes: string;
    professionalObservations: string;
    agreements: string;
    nextAction: string;
    nextFollowUpDate: string;
  }) => void;
  onManualPriorityElevation: (payload: {
    clinicalCaseId: string;
    newPriority: PriorityLevel;
    urgentProtocolTriggered: boolean;
    justification: string;
    institutionalActionTaken: string;
    nextFollowUpState: CaseFollowUpState;
  }) => void;
  onEmitTutorAlert: (payload: {
    clinicalCaseId: string;
    studentId: string;
    generalRecommendations: string;
    authorizedActions: string[];
  }) => void;
}

export const ClinicalRecordView: React.FC<ClinicalRecordViewProps> = ({
  currentUser,
  clinicalCase,
  student,
  assessments,
  sessions,
  tasks,
  auditLogs,
  instrumentConfigs,
  interns,
  onBack,
  onCreateConsultationAssessment,
  onRegisterSession,
  onManualPriorityElevation,
  onEmitTutorAlert,
}) => {
  // Verificación RLS de acceso al expediente y a las notas clínicas
  const myInternIds = interns.filter((i) => i.supervisorId === currentUser.id).map((i) => i.id);
  const isSupervisedCase = Boolean(
    clinicalCase.assignedInternId && myInternIds.includes(clinicalCase.assignedInternId)
  );
  const actorSupervisedCaseIds = isSupervisedCase ? [clinicalCase.id] : [];

  const caseAccess = checkRlsAccessPermission({
    actorRole: currentUser.role,
    actorUserId: currentUser.id,
    actorLinkedStudentId: currentUser.linkedStudentId,
    actorAssignedCaseIds: currentUser.assignedCaseIds,
    actorSupervisedCaseIds,
    resourceType: 'CLINICAL_CASE',
    targetCaseId: clinicalCase.id,
  });

  const clinicalNotesAccess = checkRlsAccessPermission({
    actorRole: currentUser.role,
    actorUserId: currentUser.id,
    actorLinkedStudentId: currentUser.linkedStudentId,
    actorAssignedCaseIds: currentUser.assignedCaseIds,
    actorSupervisedCaseIds,
    resourceType: 'CLINICAL_NOTES',
    targetCaseId: clinicalCase.id,
  });

  const canCloseOrModifyPriority = checkRlsAccessPermission({
    actorRole: currentUser.role,
    actorUserId: currentUser.id,
    actorAssignedCaseIds: currentUser.assignedCaseIds,
    resourceType: 'CLOSE_CASE',
    targetCaseId: clinicalCase.id,
  }).allowed;

  // Estados para modales y secciones interactivas
  const [showNewEvaluationModal, setShowNewEvaluationModal] = useState<boolean>(false);
  const [showNewSessionModal, setShowNewSessionModal] = useState<boolean>(false);
  const [showPriorityModal, setShowPriorityModal] = useState<boolean>(false);
  const [showTutorAlertModal, setShowTutorAlertModal] = useState<boolean>(false);

  // Estado para "Nueva evaluación" durante la consulta (Ampliación Sección 3)
  const [evalInstrument, setEvalInstrument] = useState<InstrumentCode>(InstrumentCode.BAI);
  const [evalContextNote, setEvalContextNote] = useState<string>(
    'Aplicación durante sesión de consulta psicológica en Oficina de Psicología ITD.'
  );
  const [evalCaptureMode, setEvalCaptureMode] = useState<'COMPLETA_CONSULTA' | 'HABILITAR_INCOMPLETA'>(
    'COMPLETA_CONSULTA'
  );
  const [modalItemResponses, setModalItemResponses] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    for (let i = 1; i <= 21; i++) init[i] = 1;
    return init;
  });
  const [evalInterpretation, setEvalInterpretation] = useState<string>('');
  const [evalNextAction, setEvalNextAction] = useState<string>(
    'Sesión de seguimiento y revisión de estrategias de afrontamiento'
  );
  const [evalNextDate, setEvalNextDate] = useState<string>('2026-10-24');

  // Estado para nueva sesión psicológica
  const [sessionMotive, setSessionMotive] = useState<string>('');
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [sessionObservations, setSessionObservations] = useState<string>('');
  const [sessionAgreements, setSessionAgreements] = useState<string>('');
  const [sessionNextAction, setSessionNextAction] = useState<string>('');
  const [sessionNextDate, setSessionNextDate] = useState<string>('2026-10-20');
  const [sessionInternId, setSessionInternId] = useState<string>('');

  // Estado para cambio manual de prioridad / protocolo urgente
  const [manualPriority, setManualPriority] = useState<PriorityLevel>(
    clinicalCase.operationalPriority
  );
  const [urgentProtocolFlag, setUrgentProtocolFlag] = useState<boolean>(
    clinicalCase.urgentProtocolActive
  );
  const [manualJustification, setManualJustification] = useState<string>('');
  const [manualActionTaken, setManualActionTaken] = useState<string>(
    'Entrevista clínica de contención, notificación a coordinación y seguimiento estrecho.'
  );
  const [manualFollowUpState, setManualFollowUpState] = useState<CaseFollowUpState>(
    clinicalCase.followUpState
  );

  // Estado para alerta a Tutoría Académica (sin datos clínicos)
  const [tutorRecs, setTutorRecs] = useState<string>(
    'Se sugiere acompañamiento académico en organización de horarios de estudio y orientación sobre asesorías departamentales.'
  );
  const [tutorAction1, setTutorAction1] = useState<string>(
    'Entrevista tutorial de seguimiento académico'
  );

  const caseAssessments = useMemo(
    () =>
      assessments
        .filter((a) => a.clinicalCaseId === clinicalCase.id)
        .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)),
    [assessments, clinicalCase.id]
  );

  const caseSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.clinicalCaseId === clinicalCase.id)
        .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)),
    [sessions, clinicalCase.id]
  );

  const caseTasks = useMemo(
    () => tasks.filter((t) => t.clinicalCaseId === clinicalCase.id),
    [tasks, clinicalCase.id]
  );

  const caseAuditLogs = useMemo(
    () =>
      auditLogs.filter(
        (l) => l.targetId === clinicalCase.id || l.details.includes(student.matricula)
      ),
    [auditLogs, clinicalCase.id, student.matricula]
  );

  // Comparación longitudinal de aplicaciones sucesivas del mismo instrumento y misma versión (Ampliación Sección 6)
  const completedBaiHistory = caseAssessments
    .filter(
      (a) =>
        a.instrumentCode === InstrumentCode.BAI &&
        a.totalScore !== null &&
        (a.status === AssessmentStatus.CALIFICADO ||
          a.status === AssessmentStatus.REVISADO_PROFESIONAL)
    )
    .sort((a, b) => a.appliedAt.localeCompare(b.appliedAt));

  const completedBdiHistory = caseAssessments
    .filter(
      (a) =>
        a.instrumentCode === InstrumentCode.BDI &&
        a.totalScore !== null &&
        (a.status === AssessmentStatus.CALIFICADO ||
          a.status === AssessmentStatus.REVISADO_PROFESIONAL)
    )
    .sort((a, b) => a.appliedAt.localeCompare(b.appliedAt));

  if (!caseAccess.allowed) {
    return (
      <div className="bg-white border border-rose-300 rounded-xl p-8 text-center space-y-3">
        <Lock className="w-8 h-8 text-rose-700 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">
          No tienes acceso a este expediente
        </h2>
        <p className="text-xs text-slate-600 max-w-lg mx-auto">Este expediente no está asignado a tu cuenta. Si crees que es un error, avisa a la persona responsable de Psicología.</p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al inicio
        </button>
      </div>
    );
  }

  // Vista previa determinista en el modal "Nueva evaluación"
  const simulatedResponsesForModal: Record<number, number> = {};
  if (evalCaptureMode === 'COMPLETA_CONSULTA') {
    for (let i = 1; i <= 21; i++) {
      if (typeof modalItemResponses[i] === 'number') {
        simulatedResponsesForModal[i] = modalItemResponses[i];
      }
    }
  } else {
    // Solo 6 reactivos contestados -> INCOMPLETO
    for (let i = 1; i <= 6; i++) {
      simulatedResponsesForModal[i] = 1;
    }
  }

  const applyModalPreset = (mode: 'VERDE' | 'AMARILLO' | 'ROJO') => {
    const next: Record<number, number> = {};
    if (mode === 'VERDE') {
      for (let i = 1; i <= 21; i++) next[i] = i <= 6 ? 1 : 0;
    } else if (mode === 'AMARILLO') {
      for (let i = 1; i <= 21; i++) next[i] = 1;
    } else {
      for (let i = 1; i <= 21; i++) next[i] = i <= 14 ? 2 : 1;
    }
    setModalItemResponses(next);
  };

  const previewDeterministicEval = evaluateInstrumentDeterministically(
    evalInstrument,
    instrumentConfigs[evalInstrument],
    simulatedResponsesForModal
  );

  const handleSubmitNewEvaluation = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateConsultationAssessment({
      clinicalCaseId: clinicalCase.id,
      studentId: student.id,
      instrumentCode: evalInstrument,
      applicationContextNote: evalContextNote,
      responses: simulatedResponsesForModal,
      professionalInterpretation: evalInterpretation,
      overridePriority: null,
      overrideReason: '',
      nextFollowUpAction: evalNextAction,
      nextFollowUpDate: evalNextDate,
    });
    setShowNewEvaluationModal(false);
    setEvalInterpretation('');
  };

  const handleSubmitNewSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionMotive.trim() || !sessionNotes.trim()) return;
    onRegisterSession({
      clinicalCaseId: clinicalCase.id,
      studentId: student.id,
      participatingInternId: sessionInternId || null,
      attentionMotive: sessionMotive,
      clinicalNotes: sessionNotes,
      professionalObservations: sessionObservations,
      agreements: sessionAgreements,
      nextAction: sessionNextAction || 'Continuar seguimiento programado',
      nextFollowUpDate: sessionNextDate,
    });
    setShowNewSessionModal(false);
    setSessionMotive('');
    setSessionNotes('');
    setSessionObservations('');
    setSessionAgreements('');
  };

  const handleSubmitPriorityChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualJustification.trim()) return;
    onManualPriorityElevation({
      clinicalCaseId: clinicalCase.id,
      newPriority: manualPriority,
      urgentProtocolTriggered: urgentProtocolFlag,
      justification: manualJustification,
      institutionalActionTaken: manualActionTaken,
      nextFollowUpState: manualFollowUpState,
    });
    setShowPriorityModal(false);
    setManualJustification('');
  };

  const handleSubmitTutorAlert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorRecs.trim()) return;
    onEmitTutorAlert({
      clinicalCaseId: clinicalCase.id,
      studentId: student.id,
      generalRecommendations: tutorRecs,
      authorizedActions: [
        tutorAction1,
        'Seguimiento de asistencia e integración académica sin solicitar información clínica',
      ],
    });
    setShowTutorAlertModal(false);
  };

  return (
    <div className="space-y-6">
      {/* BARRA SUPERIOR DEL EXPEDIENTE ÚNICO */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0 mt-0.5 no-print"
              title="Volver"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-bold text-[#7C1D36]">
                  EXPEDIENTE ÚNICO: {clinicalCase.id.toUpperCase()}
                </span>
                <span>·</span>
                <span className="font-mono">Matrícula: {student.matricula}</span>
                <span>·</span>
                <span>
                  Origen:{' '}
                  {clinicalCase.modalityOrigin === AttentionModality.NUEVO_INGRESO
                    ? 'Modalidad A (Nuevo Ingreso)'
                    : 'Modalidad B (Atención Individual en Consulta)'}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">{student.fullName}</h1>
              <div className="text-xs text-slate-600 mt-0.5">
                {student.programName} · {student.semester}° Semestre · Grupo {student.group} ·{' '}
                <span className="font-mono">{student.institutionalEmail}</span>
              </div>
            </div>
          </div>

          {/* Botones de acción clínica en consulta (Ampliación Sección 3) */}
          <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
            <button
              onClick={() => setShowNewEvaluationModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <ClipboardPlus className="w-4 h-4" />
              Nueva evaluación (BAI / BDI)
            </button>

            <button
              onClick={() => setShowNewSessionModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Registrar Sesión
            </button>

            {canCloseOrModifyPriority && (
              <button
                onClick={() => setShowPriorityModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-700" />
                Prioridad / Estado del Caso
              </button>
            )}

            {canCloseOrModifyPriority && (
              <button
                onClick={() => setShowTutorAlertModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5 text-[#1E3A8A]" />
                Alerta a Tutoría
              </button>
            )}

            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
          </div>
        </div>

        {/* 5 INDICADORES INDEPENDIENTES DEL EXPEDIENTE ÚNICO (AMPLIACIÓN SECCIÓN 5) */}
        <div className="mt-5">
          <div className="text-xs font-semibold text-slate-500 mb-2.5">
            Indicadores Clínicos Independientes (Los puntajes de Ansiedad BAI y Depresión BDI nunca se suman ni combinan en un diagnóstico automático)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* 1. Indicador de Ansiedad (BAI) */}
            <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50">
              <div className="text-xs text-slate-500 font-medium">1. Indicador de Ansiedad (BAI)</div>
              {clinicalCase.anxietyIndicator.score !== null ? (
                <>
                  <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {clinicalCase.anxietyIndicator.score} / 63 pts
                  </div>
                  <div className="text-[11px] text-slate-700 mt-0.5">
                    {clinicalCase.anxietyIndicator.category}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    Versión: {clinicalCase.anxietyIndicator.instrumentVersion} ·{' '}
                    {clinicalCase.anxietyIndicator.evaluatedAt}
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500 mt-2">
                  {clinicalCase.anxietyIndicator.category || 'Sin evaluación BAI calificada'}
                </div>
              )}
            </div>

            {/* 2. Indicador de Depresión (BDI) */}
            <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50">
              <div className="text-xs text-slate-500 font-medium">2. Indicador de Depresión (BDI)</div>
              {clinicalCase.depressionIndicator.score !== null ? (
                <>
                  <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {clinicalCase.depressionIndicator.score} / 63 pts
                  </div>
                  <div className="text-[11px] text-slate-700 mt-0.5">
                    {clinicalCase.depressionIndicator.category}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    Versión: {clinicalCase.depressionIndicator.instrumentVersion} ·{' '}
                    {clinicalCase.depressionIndicator.evaluatedAt}
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400 mt-2">Sin evaluación BDI calificada</div>
              )}
            </div>

            {/* 3. Prioridad General de Atención (Diferenciando Psicométrica vs Operativa) */}
            <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50">
              <div className="text-xs text-slate-500 font-medium">3. Prioridad Operativa General</div>
              <div className="mt-1">
                {clinicalCase.operationalPriority === PriorityLevel.ROJO && (
                  <span className="text-base font-bold text-rose-700">
                    ROJO · Atención Prioritaria
                  </span>
                )}
                {clinicalCase.operationalPriority === PriorityLevel.AMARILLO && (
                  <span className="text-base font-bold text-amber-700">
                    AMARILLO · Valoración Prioritaria
                  </span>
                )}
                {clinicalCase.operationalPriority === PriorityLevel.VERDE && (
                  <span className="text-base font-bold text-emerald-700">
                    VERDE · Seguimiento Ordinario
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-600 mt-1">
                Sugerida psicométrica: <strong>{clinicalCase.psychometricSuggestedPriority}</strong>
              </div>
              {clinicalCase.urgentRiskIdentifiedByProfessional && (
                <div className="text-[11px] font-semibold text-rose-800 mt-0.5">
                  Riesgo urgente activado por psicólogo
                </div>
              )}
            </div>

            {/* 4. Fecha de Última Evaluación */}
            <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50">
              <div className="text-xs text-slate-500 font-medium">4. Última Evaluación</div>
              <div className="text-base font-bold text-slate-900 font-mono tabular-nums mt-1">
                {clinicalCase.lastEvaluationDate || 'Sin fecha'}
              </div>
              <div className="text-[11px] text-slate-600 mt-1">
                Total en expediente: {caseAssessments.length} aplicación(es)
              </div>
            </div>

            {/* 5. Próxima Acción de Seguimiento */}
            <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50">
              <div className="text-xs text-slate-500 font-medium">5. Próxima Acción Programada</div>
              <div className="text-xs font-bold text-slate-900 mt-1 line-clamp-2">
                {clinicalCase.nextFollowUpAction}
              </div>
              <div className="text-[11px] font-mono text-[#1E3A8A] mt-1">
                Fecha meta: {clinicalCase.nextFollowUpDate || 'Por programar'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL DE APOYO AL JUICIO CLÍNICO ESTILO BLUEPRINT (EVOLUCIÓN, SÍNTOMAS TOP, BIENESTAR Y GUÍA PARA PSICÓLOGOS/PRACTICANTES) */}
      <ClinicalDecisionSupportBlueprint
        currentUser={currentUser}
        clinicalCase={clinicalCase}
        student={student}
        caseAssessments={caseAssessments}
        caseSessions={caseSessions}
        caseTasks={caseTasks}
        instrumentConfigs={instrumentConfigs}
        onOpenNewEvaluationModal={() => setShowNewEvaluationModal(true)}
        onOpenNewSessionModal={() => setShowNewSessionModal(true)}
      />

      {/* SECCIONES A, C, E, I: DATOS DE IDENTIFICACIÓN, OBSERVACIONES Y ESTADO ACTUAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sección A: Datos de Identificación e Información Académica */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2.5">
            A. Datos de Identificación Académica
          </h2>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-500">Matrícula ITD:</dt>
              <dd className="font-mono font-bold text-slate-900">{student.matricula}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Correo institucional:</dt>
              <dd className="font-mono text-slate-800">{student.institutionalEmail}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Programa educativo:</dt>
              <dd className="font-medium text-slate-900 text-right">{student.programName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Departamento académico:</dt>
              <dd className="text-slate-800 text-right">{student.academicDepartment}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Semestre y Grupo:</dt>
              <dd className="font-mono text-slate-800">
                {student.semester}° Semestre · Grupo {student.group}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Generación de ingreso:</dt>
              <dd className="font-mono text-slate-800">{student.entryGeneration}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Estado de registro:</dt>
              <dd className="font-semibold text-emerald-700">{student.registrationStatus}</dd>
            </div>
          </dl>
        </div>

        {/* Sección C y E: Interpretación Profesional y Observaciones Clínicas (Protegido por RLS) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <h2 className="text-sm font-bold text-slate-900">
              C, E & I. Síntesis Clínica, Observaciones Profesionales y Estado del Seguimiento
            </h2>
            <span className="text-[11px] font-mono text-slate-500">
              Estado: {clinicalCase.followUpState}
            </span>
          </div>

          {clinicalNotesAccess.allowed ? (
            <div className="mt-3 space-y-3 text-xs text-slate-700">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg leading-relaxed">
                <div className="font-bold text-slate-900 mb-1">
                  Síntesis y Observaciones Profesionales del Expediente:
                </div>
                {clinicalCase.generalClinicalSummary}
              </div>

              {clinicalCase.priorityOverrideReason && (
                <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-lg text-rose-950">
                  <div className="font-bold">
                    Justificación de Prioridad Operativa / Protocolo de Actuación Registrado:
                  </div>
                  <p className="mt-1">{clinicalCase.priorityOverrideReason}</p>
                  <div className="mt-1 text-[11px] text-rose-800 font-mono">
                    Autorizado por: {clinicalCase.priorityUpdatedBy} · Fecha:{' '}
                    {clinicalCase.priorityUpdatedAt}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-slate-500">Psicólogo Responsable Titular:</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {clinicalCase.assignedPsychologistName || 'SIN ASIGNAR (Alerta Activa)'}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-slate-500">Practicante Autorizado bajo Supervisión:</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {clinicalCase.assignedInternName || 'Ninguno asignado a este expediente'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
              Las notas clínicas son confidenciales y solo las ve el personal de Psicología asignado.
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN D: ANTECEDENTES PSICOPEDAGÓGICOS, SOCIODEMOGRÁFICOS Y FACTORES DE RIESGO (CUESTIONARIO INSTITUCIONAL 2025) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#1E3A8A] text-white">
                CUESTIONARIO ITD 2025
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                D. Contexto Integral Psicopedagógico y Factores de Riesgo / Protectores
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Respuestas reportadas por el estudiante en el diagnóstico integral de nuevo ingreso ciclo 2025.
            </p>
          </div>
          {typeof student.suicideProtocolSiCount === 'number' && student.suicideProtocolSiCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Tamizaje Columbia (C-SSRS): {student.suicideProtocolSiCount} de 6 reactivos afirmativos</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 text-xs">
          {/* Bloque 1: Entorno Familiar y Socioeconómico */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="font-bold text-[#1E3A8A] border-b border-slate-200 pb-1">
              Entorno Familiar y Económico
            </div>
            <div>
              <span className="text-slate-500">Procedencia:</span>{' '}
              <strong className="text-slate-800">{student.originCity || 'Durango'}</strong>
            </div>
            <div>
              <span className="text-slate-500">Domicilio actual:</span>{' '}
              <span className="text-slate-800">{student.currentAddress || 'No registrado'}</span>
            </div>
            <div>
              <span className="text-slate-500">Celular de contacto:</span>{' '}
              <span className="font-mono text-slate-800">{student.phone || 'No registrado'}</span>
            </div>
            <div>
              <span className="text-slate-500">Ambiente familiar:</span>{' '}
              <span className="text-slate-800">{student.familyAtmosphere || 'No especificado'}</span>
            </div>
            <div>
              <span className="text-slate-500">Distribución de tareas:</span>{' '}
              <span className="text-slate-800">{student.familyTaskDistribution || 'No especificado'}</span>
            </div>
            <div>
              <span className="text-slate-500">Padres:</span>{' '}
              <span className="text-slate-800">
                Viven: {student.parentsLiving || 'Sí'} · Separados: {student.parentsSeparated || 'No'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Ingreso / Egreso hogar:</span>{' '}
              <span className="text-slate-800">
                ${student.monthlyIncome || 'N/D'} / ${student.monthlyExpenses || 'N/D'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Vivienda:</span>{' '}
              <span className="text-slate-800">
                {student.houseType || 'Propia'} · Internet: {student.internetService || 'Sí'}
              </span>
            </div>
          </div>

          {/* Bloque 2: Trayectoria Académica y Hábitos */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="font-bold text-[#1E3A8A] border-b border-slate-200 pb-1">
              Trayectoria Académica y Hábitos
            </div>
            <div>
              <span className="text-slate-500">Secundaria de egreso:</span>{' '}
              <span className="text-slate-800">
                {student.middleSchool || 'N/D'}{' '}
                {student.middleSchoolGpa ? `(Prom: ${student.middleSchoolGpa})` : ''}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Bachillerato / Preparatoria:</span>{' '}
              <span className="text-slate-800">
                {student.highSchool || 'N/D'}{' '}
                {student.highSchoolGpa ? `(Prom: ${student.highSchoolGpa})` : ''}
              </span>
            </div>
            {student.highSchoolSpecialty && (
              <div>
                <span className="text-slate-500">Especialidad previa:</span>{' '}
                <span className="text-slate-800">{student.highSchoolSpecialty}</span>
              </div>
            )}
            <div>
              <span className="text-slate-500">ITD primera opción:</span>{' '}
              <strong className="text-slate-800">{student.itdFirstChoice || 'Sí'}</strong>
            </div>
            <div>
              <span className="text-slate-500">Seguridad en carrera:</span>{' '}
              <span className="text-slate-800">{student.careerCertainty || 'Alta'}</span>
            </div>
            <div>
              <span className="text-slate-500">Hábitos de estudio:</span>{' '}
              <span className="text-slate-800">{student.studyHabits || 'No especificados'}</span>
            </div>
            <div>
              <span className="text-slate-500">Tiempo de estudio fuera de clase:</span>{' '}
              <span className="text-slate-800">{student.studyHours || 'No especificado'}</span>
            </div>
          </div>

          {/* Bloque 3: Estilo de Vida, Sueño y Hábitos */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="font-bold text-[#1E3A8A] border-b border-slate-200 pb-1">
              Estilo de Vida y Salud
            </div>
            <div>
              <span className="text-slate-500">Horas diarias de sueño:</span>{' '}
              <strong className="text-slate-800">{student.sleepHours || '6 a 8 horas'}</strong>
            </div>
            <div>
              <span className="text-slate-500">Actividad deportiva:</span>{' '}
              <span className="text-slate-800">{student.sportsActivity || 'No reportada'}</span>
            </div>
            <div>
              <span className="text-slate-500">Condición / Discapacidad:</span>{' '}
              <span className="text-slate-800">
                {student.disabilityCondition === 'Sí'
                  ? `Sí (${student.disabilityDetail || 'Visual/Auditiva'})`
                  : 'Ninguna'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Situación laboral:</span>{' '}
              <span className="text-slate-800">
                {student.works === 'Sí'
                  ? `Trabaja (${student.workHours || 'Medio tiempo'})`
                  : 'No trabaja'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Consumo de alcohol (AUDIT):</span>{' '}
              <span className="text-slate-800">{student.alcoholFrequency || '0 (Nunca)'}</span>
            </div>
            <div>
              <span className="text-slate-500">Sustancias probadas:</span>{' '}
              <span className="text-slate-800">
                {student.substanceTried || 'No ha consumido'}{' '}
                {student.substanceFrequency && student.substanceFrequency !== 'No consumo drogas'
                  ? `(${student.substanceFrequency})`
                  : ''}
              </span>
            </div>
          </div>

          {/* Bloque 4: Antecedentes Clínicos y Protocolo de Urgencia */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="font-bold text-[#7C1D36] border-b border-slate-200 pb-1">
              Salud Mental y Emergencias
            </div>
            <div>
              <span className="text-slate-500">Terapia psicológica previa:</span>{' '}
              <strong className="text-slate-800">{student.previousPsychologicalTherapy || 'No'}</strong>
            </div>
            <div>
              <span className="text-slate-500">Tratamiento psiquiátrico:</span>{' '}
              <strong className="text-slate-800">{student.previousPsychiatricTreatment || 'No'}</strong>
            </div>
            <div>
              <span className="text-slate-500">Medicamentos psiquiátricos:</span>{' '}
              <span className="text-slate-800">{student.psychiatricMedication || 'Ninguno'}</span>
            </div>
            <div className="pt-1 border-t border-slate-200">
              <span className="text-slate-500">Tamizaje Columbia (C-SSRS):</span>{' '}
              <strong className={student.suicideProtocolSiCount && student.suicideProtocolSiCount > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                {student.suicideProtocolSiCount || 0} / 6 reactivos afirmativos
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Contacto de emergencia:</span>{' '}
              <span className="font-mono text-slate-900 font-bold">
                {student.emergencyContact || 'No especificado en encuesta'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN B + AMPLIACIÓN SECCIÓN 6: HISTORIAL DE EVALUACIONES Y EVOLUCIÓN CRONOLÓGICA */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              B. Historial de Evaluaciones y Evolución Cronológica (BAI y BDI)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Conserva todas las aplicaciones realizadas a lo largo de los distintos semestres. Permite comparar
              aplicaciones sucesivas del <strong>mismo instrumento y versión</strong> sin emitir diagnósticos automáticos.
            </p>
          </div>
          <button
            onClick={() => setShowNewEvaluationModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#7C1D36] bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer shrink-0 no-print"
          >
            <ClipboardPlus className="w-3.5 h-3.5" />
            Aplicar Nueva Evaluación en Consulta
          </button>
        </div>

        {/* Comparador de Evolución cuando existen 2 o más aplicaciones del mismo instrumento */}
        {(completedBaiHistory.length >= 2 || completedBdiHistory.length >= 2) && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-2">
              <TrendingDown className="w-4 h-4 text-[#1E3A8A]" />
              Comparación Longitudinal de Aplicaciones Sucesivas (Mismo Instrumento y Versión)
            </div>
            {completedBaiHistory.length >= 2 && (
              <div className="text-xs text-slate-700 space-y-1">
                <div>
                  <strong>Instrumento BAI ({completedBaiHistory[0].versionTag}):</strong> Primera aplicación (
                  <span className="font-mono">{completedBaiHistory[0].appliedAt.slice(0, 10)}</span>):{' '}
                  <strong className="font-mono">{completedBaiHistory[0].totalScore} pts</strong> → Última
                  aplicación (
                  <span className="font-mono">
                    {completedBaiHistory[completedBaiHistory.length - 1].appliedAt.slice(0, 10)}
                  </span>
                  ):{' '}
                  <strong className="font-mono">
                    {completedBaiHistory[completedBaiHistory.length - 1].totalScore} pts
                  </strong>{' '}
                  (Diferencia aritmética:{' '}
                  <span className="font-mono font-bold">
                    {(completedBaiHistory[completedBaiHistory.length - 1].totalScore || 0) -
                      (completedBaiHistory[0].totalScore || 0)}{' '}
                    pts
                  </span>
                  ).
                </div>
                <div className="text-[11px] text-slate-500">
                  Nota metodológica obligatoria: La diferencia de puntuación entre aplicaciones sucesivas no se
                  interpreta automáticamente como mejoría, empeoramiento o diagnóstico sin la valoración clínica del
                  psicólogo responsable.
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                <th className="py-2.5 px-3 font-semibold">Fecha Aplicación</th>
                <th className="py-2.5 px-3 font-semibold">Instrumento y Versión</th>
                <th className="py-2.5 px-3 font-semibold">Estado Completitud</th>
                <th className="py-2.5 px-3 font-semibold">Puntuación Total</th>
                <th className="py-2.5 px-3 font-semibold">Categoría / Regla</th>
                <th className="py-2.5 px-3 font-semibold">Contexto e Interpretación Profesional</th>
                <th className="py-2.5 px-3 font-semibold">Profesional / Proceso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {caseAssessments.map((ass) => (
                <tr key={ass.id} className="hover:bg-slate-50/80">
                  <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap text-slate-800">
                    {ass.appliedAt.replace('T', ' ').slice(0, 16)}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900">{ass.instrumentCode}</div>
                    <div className="font-mono text-[11px] text-slate-500">{ass.versionTag}</div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    {ass.status === AssessmentStatus.INCOMPLETO ||
                    ass.status === AssessmentStatus.INICIADO ? (
                      <span className="text-amber-800 font-bold">
                        {ass.status} ({ass.completionPercentage}%)
                      </span>
                    ) : (
                      <span className="text-emerald-800 font-semibold">
                        {ass.status} (100%)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                    {ass.totalScore !== null ? (
                      <span className="text-sm font-bold text-slate-900">{ass.totalScore} pts</span>
                    ) : (
                      <span className="text-amber-800 font-sans text-[11px]">
                        Sin puntaje (Evaluación incompleta)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium text-slate-800">
                      {ass.psychometricCategory || 'No aplica hasta completar 21 reactivos'}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">
                      Regla: {ass.scoringRuleVersion}
                    </div>
                  </td>
                  <td className="py-3 px-3 max-w-md">
                    <div className="text-slate-600">{ass.applicationContextNote}</div>
                    {ass.professionalInterpretation && (
                      <div className="mt-1 font-medium text-slate-900">
                        Interpretación: {ass.professionalInterpretation}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-600">
                    <div className="font-medium text-slate-800">
                      {ass.reviewedByPsychologistName || 'Pendiente de revisión clínica'}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">
                      {ass.calculatedByProcess}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECCIÓN D: SESIONES DE ATENCIÓN PSICOLÓGICA (TRAZABILIDAD SIN BORRADO ORDINARIO) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              D. Sesiones de Atención Psicológica ({caseSessions.length})
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              El historial de atención no se puede borrar. Las notas clínicas son confidenciales.
            </p>
          </div>
          <button
            onClick={() => setShowNewSessionModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg cursor-pointer shrink-0 no-print"
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar Nueva Sesión
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {caseSessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Aún no se han registrado sesiones presenciales de atención en este expediente.
            </div>
          ) : (
            caseSessions.map((ses) => (
              <div key={ses.id} className="border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">
                      {ses.sessionDate.replace('T', ' ').slice(0, 16)}
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-[#1E3A8A]">
                      Responsable: {ses.responsiblePsychologistName}
                    </span>
                    {ses.participatingInternName && (
                      <>
                        <span>·</span>
                        <span className="text-slate-600">
                          Practicante autorizado: {ses.participatingInternName}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-emerald-700">
                    Estado: {ses.activityStatus}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-700">Motivo de atención:</div>
                    <p className="text-slate-800 mt-0.5">{ses.attentionMotive}</p>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-700">Notas profesionales:</div>
                    <p className="text-slate-800 mt-0.5">{ses.clinicalNotes}</p>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-700">Acuerdos y observaciones:</div>
                    <p className="text-slate-800 mt-0.5">
                      {ses.agreements} {ses.professionalObservations ? `· ${ses.professionalObservations}` : ''}
                    </p>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-700">Próxima acción y fecha de seguimiento:</div>
                    <p className="text-slate-800 mt-0.5">
                      {ses.nextAction} ·{' '}
                      <span className="font-mono font-semibold">{ses.nextFollowUpDate}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* SECCIONES F, G, H, J: SEGUIMIENTOS, CANALIZACIONES Y BITÁCORA DE AUDITORÍA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Secciones F, G y H */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
              F & G. Acuerdos, Actividades de Seguimiento y Próximas Citas ({caseTasks.length})
            </h2>
            <div className="mt-3 space-y-2.5 text-xs">
              {caseTasks.length === 0 ? (
                <div className="text-slate-500">Sin actividades pendientes registradas.</div>
              ) : (
                caseTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 border border-slate-200 rounded-lg flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{t.title}</div>
                      <div className="text-slate-600 mt-0.5">{t.actionDescription}</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Responsable: {t.assignedToName}
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div
                        className={`font-bold ${
                          t.status === 'VENCIDA'
                            ? 'text-rose-700'
                            : t.status === 'COMPLETADA'
                            ? 'text-emerald-700'
                            : 'text-[#1E3A8A]'
                        }`}
                      >
                        {t.status}
                      </div>
                      <div className="text-slate-500">{t.dueDate}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
              H. Canalizaciones Internas y Externas ({clinicalCase.referrals.length})
            </h2>
            <div className="mt-3 space-y-2.5 text-xs">
              {clinicalCase.referrals.length === 0 ? (
                <div className="text-slate-500">No se registran canalizaciones en este expediente.</div>
              ) : (
                clinicalCase.referrals.map((ref) => (
                  <div key={ref.id} className="p-3 border border-slate-200 rounded-lg">
                    <div className="flex justify-between font-semibold text-slate-900">
                      <span>{ref.destinationInstitution}</span>
                      <span className="font-mono text-slate-600">{ref.referredAt}</span>
                    </div>
                    <p className="text-slate-600 mt-1">{ref.reasonSummary}</p>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Autorizó: {ref.referredByPsychologistName} · Estado: {ref.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sección J: Historial de Modificaciones y Accesos (Trazabilidad) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <History className="w-4 h-4 text-[#7C1D36]" />
            <h2 className="text-sm font-bold text-slate-900">
              J. Historial de Modificaciones, Prioridad y Accesos Auditados
            </h2>
          </div>
          <div className="mt-3 space-y-2.5 text-xs max-h-80 overflow-y-auto">
            {clinicalCase.priorityHistory.map((ph) => (
              <div key={ph.id} className="p-3 bg-rose-50/50 border border-rose-200 rounded-lg">
                <div className="flex justify-between font-mono text-[11px] text-rose-900">
                  <span>CAMBIO DE PRIORIDAD: {ph.previousPriority} → {ph.newPriority}</span>
                  <span>{ph.changedAt.replace('T', ' ').slice(0, 16)}</span>
                </div>
                <div className="font-semibold text-slate-900 mt-1">{ph.justification}</div>
                <div className="text-slate-600 mt-0.5">
                  Acción institucional: {ph.institutionalActionTaken}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Realizado por: {ph.changedByUserName} · Notificado a: {ph.notifiedProfessionalName}
                </div>
              </div>
            ))}

            {caseAuditLogs.map((log) => (
              <div key={log.id} className="p-3 border border-slate-200 rounded-lg">
                <div className="flex justify-between font-mono text-[11px] text-slate-500">
                  <span className="font-bold text-slate-800">{log.actionType}</span>
                  <span>{log.timestamp.replace('T', ' ').slice(0, 19)}</span>
                </div>
                <div className="text-slate-700 mt-1">{log.details}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Usuario: {log.actorName} ({log.actorRole})
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL 1: BOTÓN "NUEVA EVALUACIÓN" EN CONSULTA (AMPLIACIÓN SECCIÓN 3) */}
      {showNewEvaluationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-semibold text-[#7C1D36]">
                  Aplicación durante la consulta · Expediente Único {clinicalCase.id.toUpperCase()}
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Nueva Evaluación Psicológica ({student.fullName})
                </h3>
              </div>
              <button
                onClick={() => setShowNewEvaluationModal(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleSubmitNewEvaluation} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    1. Instrumento Autorizado Independiente
                  </label>
                  <select
                    value={evalInstrument}
                    onChange={(e) => setEvalInstrument(e.target.value as InstrumentCode)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                  >
                    <option value={InstrumentCode.BAI}>
                      BAI — Inventario de Ansiedad de Beck (Versión {instrumentConfigs.BAI.versionTag})
                    </option>
                    <option value={InstrumentCode.BDI}>
                      BDI — Inventario de Depresión de Beck (Versión {instrumentConfigs.BDI.versionTag})
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    2. Modalidad de Captura / Estado del Cuestionario
                  </label>
                  <select
                    value={evalCaptureMode}
                    onChange={(e) =>
                      setEvalCaptureMode(
                        e.target.value as 'COMPLETA_CONSULTA' | 'HABILITAR_INCOMPLETA'
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                  >
                    <option value="COMPLETA_CONSULTA">
                      Completar los 21 reactivos en consulta y calificar
                    </option>
                    <option value="HABILITAR_INCOMPLETA">
                      Guardar como Iniciado / Incompleto (6/21 reactivos — Sin puntaje)
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  3. Motivo y Contexto de la Evaluación
                </label>
                <input
                  type="text"
                  required
                  value={evalContextNote}
                  onChange={(e) => setEvalContextNote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              {evalCaptureMode === 'COMPLETA_CONSULTA' && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="font-semibold text-slate-800">
                      4. Respuestas de los 21 Reactivos de {evalInstrument} (Escala 0 a 3 pts):
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyModalPreset('VERDE')}
                        className="px-2 py-1 text-[11px] font-semibold bg-emerald-100 text-emerald-900 rounded cursor-pointer"
                      >
                        Verde (6 pts)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyModalPreset('AMARILLO')}
                        className="px-2 py-1 text-[11px] font-semibold bg-amber-100 text-amber-900 rounded cursor-pointer"
                      >
                        Amarillo (21 pts)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyModalPreset('ROJO')}
                        className="px-2 py-1 text-[11px] font-semibold bg-rose-100 text-rose-900 rounded cursor-pointer"
                      >
                        Rojo (35 pts)
                      </button>
                      <span className="font-mono text-sm font-bold text-[#1E3A8A] ml-2">
                        {previewDeterministicEval.totalScore ?? 0} / 63 pts
                      </span>
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {instrumentConfigs[evalInstrument].items.map((item) => {
                      const val = modalItemResponses[item.itemNumber] ?? 0;
                      return (
                        <div
                          key={item.itemCode}
                          className="p-2.5 bg-white border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div className="text-[11px]">
                            <span className="font-mono font-bold text-[#7C1D36] mr-1.5">
                              {item.itemCode}
                            </span>
                            <span className="text-slate-800 font-medium">
                              {item.placeholderLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {[0, 1, 2, 3].map((scoreVal) => (
                              <button
                                key={scoreVal}
                                type="button"
                                onClick={() =>
                                  setModalItemResponses((prev) => ({
                                    ...prev,
                                    [item.itemNumber]: scoreVal,
                                  }))
                                }
                                className={`w-7 h-7 rounded font-mono text-xs font-bold border cursor-pointer ${
                                  val === scoreVal
                                    ? 'bg-[#7C1D36] text-white border-[#7C1D36]'
                                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                                }`}
                              >
                                {scoreVal}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200">
                    Regla aplicada: <span className="font-mono">{previewDeterministicEval.scoringRuleVersion}</span> ·
                    Categoría resultante: <strong>{previewDeterministicEval.psychometricCategory}</strong> ·
                    Prioridad sugerida: <strong>{previewDeterministicEval.suggestedPriority}</strong>
                  </div>
                </div>
              )}

              {evalCaptureMode === 'HABILITAR_INCOMPLETA' && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-950">
                  <strong>Verificación de Regla de Integridad:</strong>{' '}
                  {previewDeterministicEval.validationMessage}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  5. Interpretación Profesional del Psicólogo
                </label>
                <textarea
                  rows={2}
                  value={evalInterpretation}
                  onChange={(e) => setEvalInterpretation(e.target.value)}
                  placeholder="Documente la interpretación clínica contextualizada (el sistema no realiza diagnósticos automáticos)..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    6. Acción de Seguimiento
                  </label>
                  <input
                    type="text"
                    required
                    value={evalNextAction}
                    onChange={(e) => setEvalNextAction(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Fecha de Próximo Seguimiento
                  </label>
                  <input
                    type="date"
                    required
                    value={evalNextDate}
                    onChange={(e) => setEvalNextDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewEvaluationModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg cursor-pointer"
                >
                  Guardar y Registrar en Expediente Único
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REGISTRAR NUEVA SESIÓN PSICOLÓGICA */}
      {showNewSessionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                Registrar Sesión de Atención Psicológica
              </h3>
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleSubmitNewSession} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Motivo de atención *
                </label>
                <input
                  type="text"
                  required
                  value={sessionMotive}
                  onChange={(e) => setSessionMotive(e.target.value)}
                  placeholder="Ej. Entrevista de seguimiento clínico / Contención emocional"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Notas clínicas profesionales *
                </label>
                <textarea
                  rows={3}
                  required
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Descripción clínica de la sesión (oculta a tutores académicos y administradores)..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Observaciones profesionales
                  </label>
                  <input
                    type="text"
                    value={sessionObservations}
                    onChange={(e) => setSessionObservations(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Acuerdos con el estudiante
                  </label>
                  <input
                    type="text"
                    value={sessionAgreements}
                    onChange={(e) => setSessionAgreements(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Practicante participante
                  </label>
                  <select
                    value={sessionInternId}
                    onChange={(e) => setSessionInternId(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Ninguno</option>
                    {interns.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Próxima acción *
                  </label>
                  <input
                    type="text"
                    required
                    value={sessionNextAction}
                    onChange={(e) => setSessionNextAction(e.target.value)}
                    placeholder="Ej. Cita quincenal"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Fecha seguimiento *
                  </label>
                  <input
                    type="date"
                    required
                    value={sessionNextDate}
                    onChange={(e) => setSessionNextDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewSessionModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg cursor-pointer"
                >
                  Guardar Sesión en Expediente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MODIFICAR PRIORIDAD OPERATIVA / ACTIVAR PROTOCOLO URGENTE */}
      {showPriorityModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                Actualizar Prioridad Operativa y Estado del Seguimiento
              </h3>
              <button
                onClick={() => setShowPriorityModal(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleSubmitPriorityChange} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Nivel de Prioridad Operativa
                  </label>
                  <select
                    value={manualPriority}
                    onChange={(e) => setManualPriority(e.target.value as PriorityLevel)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    <option value={PriorityLevel.ROJO}>ROJO — Atención Prioritaria / Urgente</option>
                    <option value={PriorityLevel.AMARILLO}>AMARILLO — Valoración Prioritaria</option>
                    <option value={PriorityLevel.VERDE}>VERDE — Seguimiento Ordinario</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Estado del Seguimiento Clínico
                  </label>
                  <select
                    value={manualFollowUpState}
                    onChange={(e) => setManualFollowUpState(e.target.value as CaseFollowUpState)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value={CaseFollowUpState.PENDIENTE_CONTACTO}>PENDIENTE_CONTACTO</option>
                    <option value={CaseFollowUpState.CITA_PROGRAMADA}>CITA_PROGRAMADA</option>
                    <option value={CaseFollowUpState.EN_ATENCION}>EN_ATENCION</option>
                    <option value={CaseFollowUpState.REQUIERE_NUEVA_VALORACION}>
                      REQUIERE_NUEVA_VALORACION
                    </option>
                    <option value={CaseFollowUpState.CANALIZADO}>CANALIZADO</option>
                    <option value={CaseFollowUpState.SEGUIMIENTO_CONCLUIDO}>
                      SEGUIMIENTO_CONCLUIDO (Requiere criterio profesional)
                    </option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 p-3 border border-rose-200 bg-rose-50/50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={urgentProtocolFlag}
                  onChange={(e) => setUrgentProtocolFlag(e.target.checked)}
                />
                <span className="font-semibold text-rose-900">
                  Activar Protocolo de Atención Prioritaria por riesgo urgente identificado profesionalmente
                  (sin depender exclusivamente del puntaje de los inventarios)
                </span>
              </label>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Motivo Clínico y Justificación Obligatoria *
                </label>
                <textarea
                  rows={2}
                  required
                  value={manualJustification}
                  onChange={(e) => setManualJustification(e.target.value)}
                  placeholder="Explique la valoración profesional que sustenta el cambio de prioridad o estado..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Acción Institucional Realizada *
                </label>
                <input
                  type="text"
                  required
                  value={manualActionTaken}
                  onChange={(e) => setManualActionTaken(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowPriorityModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg cursor-pointer"
                >
                  Confirmar y Auditar Cambio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: EMITIR ALERTA DE ACOMPAÑAMIENTO ACADÉMICO A TUTORÍA */}
      {showTutorAlertModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                Autorizar Alerta de Acompañamiento para Tutoría Académica
              </h3>
              <button
                onClick={() => setShowTutorAlertModal(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-950">
              <strong>Confidencialidad:</strong> El tutor académico{' '}
              <strong>NO</strong> podrá ver reactivos, respuestas, puntuaciones BAI/BDI ni notas clínicas.
              Únicamente recibirá las recomendaciones generales de apoyo académico autorizadas aquí.
            </div>

            <form onSubmit={handleSubmitTutorAlert} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Recomendaciones Generales de Apoyo Académico *
                </label>
                <textarea
                  rows={3}
                  required
                  value={tutorRecs}
                  onChange={(e) => setTutorRecs(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Acción de Acompañamiento Autorizada para el Tutor *
                </label>
                <input
                  type="text"
                  required
                  value={tutorAction1}
                  onChange={(e) => setTutorAction1(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowTutorAlertModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg cursor-pointer"
                >
                  Emitir Alerta Auditada al Tutor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicalRecordView;
