/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  ClipboardCheck,
  Database,
  Eye, // Nuevo icono para ver como alumno
  FileBarChart2,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Lock,
  Menu,
  RotateCcw,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import {
  AcademicSupportAlert,
  AccountStatus,
  AssessmentRecord,
  AssessmentStatus,
  AttentionModality,
  AuditLogEntry,
  CaseFollowUpState,
  ClinicalCaseRecord,
  EvaluationPeriod,
  FollowUpTask,
  InstrumentCode,
  PriorityLevel,
  PsychologySession,
  RoleCode,
  StudentRecord,
  UserProfile,
} from './types/siape';
import { ITD_ACADEMIC_PROGRAMS } from './data/academicPrograms';
import {
  INITIAL_INSTRUMENT_CONFIGS,
  evaluateInstrumentDeterministically,
} from './lib/scoringEngine';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { DashboardView } from './components/DashboardView';
import { ClinicalRecordView } from './components/ClinicalRecordView';
import { ActiveModuleKey, ModulesView } from './components/ModulesView';
import { StudentPortalView } from './components/StudentPortalView';
import { LoginScreen } from './components/LoginScreen';
import { AuthProvider, PROFILE_SELECT, mapProfileRow, useAuth } from './context/AuthContext';
import { filterCasesForUser, filterStudentsForUser } from './lib/permissionsEngine';

type PrimaryView =
  | 'ARQUITECTURA_ENTREGA_1'
  | 'PANEL_PRINCIPAL'
  | 'EXPEDIENTE_UNICO'
  | 'ESTUDIANTES'
  | 'EVALUACIONES'
  | 'SEGUIMIENTO'
  | 'TUTORIAS'
  | 'USUARIOS'
  | 'REPORTES';

const EVALUATION_PERIODS: EvaluationPeriod[] = [];

function AppShell({ authUser, onSignOut }: { authUser: UserProfile; onSignOut: () => void }) {
  const [users, setUsers] = useState<UserProfile[]>([authUser]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [cases, setCases] = useState<ClinicalCaseRecord[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [sessions, setSessions] = useState<PsychologySession[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [tutorAlerts, setTutorAlerts] = useState<AcademicSupportAlert[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // --- NUEVO ESTADO: MODO SIMULACIÓN PARA ADMINISTRADOR ---
  const [viewAsStudentMode, setViewAsStudentMode] = useState<boolean>(false);

  const [activeView, setActiveView] = useState<PrimaryView>(
    authUser.role === RoleCode.ESTUDIANTE ? 'EVALUACIONES' : 'PANEL_PRINCIPAL'
  );
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const hasUserMutatedState = useRef<boolean>(false);

  const currentUser = users.find((u) => u.id === authUser.id) || authUser;

  const loadDirectory = React.useCallback(async () => {
    if (!supabase) return;
    try {
      const [profilesRes, studentsRes, casesRes, assignmentsRes] = await Promise.all([
        supabase.from('profiles').select(PROFILE_SELECT),
        supabase.from('students').select('*'),
        supabase.from('clinical_cases').select('*'),
        supabase
          .from('case_assignments')
          .select('clinical_case_id, assigned_user_id, assignment_role, is_active'),
      ]);
      const firstError = [profilesRes, studentsRes].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      const profiles = (profilesRes.data ?? []).map(mapProfileRow);
      const profileById = new Map(profiles.map((p) => [p.id, p]));

      const activeAssignments = new Map<string, any[]>();
      (assignmentsRes.data ?? [])
        .filter((x: any) => x.is_active)
        .forEach((x: any) => {
          const list = activeAssignments.get(x.clinical_case_id) ?? [];
          list.push(x);
          activeAssignments.set(x.clinical_case_id, list);
        });

      const indicator = (score: any, version: any, category: any, at: any) => ({
        lastAssessmentId: null,
        instrumentVersion: version ?? null,
        score: score ?? null,
        category: category ?? null,
        evaluatedAt: at ?? null,
      });

      const mappedCases: ClinicalCaseRecord[] = (casesRes.data ?? []).map((c: any) => {
        const active = activeAssignments.get(c.id) ?? [];
        const psy = active.find((x: any) => x.assignment_role === 'PSICOLOGO_RESPONSABLE');
        const intern = active.find((x: any) => x.assignment_role === 'PRACTICANTE_SUPERVISADO');
        return {
          id: c.id,
          studentId: c.student_id,
          openedAt: c.opened_at,
          updatedAt: c.updated_at,
          modalityOrigin: c.modality_origin,
          anxietyIndicator: indicator(c.anxiety_score, c.anxiety_version, c.anxiety_category, c.anxiety_evaluated_at),
          depressionIndicator: indicator(
            c.depression_score,
            c.depression_version,
            c.depression_category,
            c.depression_evaluated_at
          ),
          psychometricSuggestedPriority: c.psychometric_suggested_priority,
          operationalPriority: c.operational_priority,
          urgentRiskIdentifiedByProfessional: !!c.urgent_risk_flagged,
          urgentProtocolActive: !!c.urgent_risk_flagged,
          priorityOverrideReason: c.priority_override_reason ?? null,
          priorityUpdatedBy: c.priority_updated_by ?? null,
          priorityUpdatedAt: c.priority_updated_at ?? null,
          assignedPsychologistId: psy?.assigned_user_id ?? null,
          assignedPsychologistName:
            c.assigned_psychologist_name ?? profileById.get(psy?.assigned_user_id)?.fullName ?? null,
          assignedInternId: intern?.assigned_user_id ?? null,
          assignedInternName:
            c.assigned_intern_name ?? profileById.get(intern?.assigned_user_id)?.fullName ?? null,
          followUpState: c.follow_up_state,
          lastEvaluationDate: c.anxiety_evaluated_at ?? c.depression_evaluated_at ?? null,
          nextFollowUpAction: c.next_follow_up_action ?? '',
          nextFollowUpDate: c.next_follow_up_date ?? null,
          generalClinicalSummary: c.general_clinical_summary ?? '',
          referrals: [],
          priorityHistory: [],
        } as ClinicalCaseRecord;
      });

      const mappedStudents: StudentRecord[] = (studentsRes.data ?? []).map(
        (s: any) =>
          ({
            id: s.id,
            matricula: s.matricula,
            fullName: s.full_name,
            institutionalEmail: s.institutional_email,
            programId: s.academic_program_id ?? '',
            programName: s.program_name ?? 'Sin asignar',
            academicDepartment: s.academic_department ?? '',
            semester: s.semester ?? 0,
            group: s.group_code ?? '',
            entryGeneration: s.entry_generation ?? '',
            registrationStatus: s.registration_status,
            incorporatedAt: s.incorporated_at,
            entryModality: s.entry_modality,
            gender: s.gender ?? undefined,
            age: s.age ?? undefined,
            birthDate: s.birth_date ?? undefined,
            currentAddress: s.current_address ?? undefined,
            phone: s.phone ?? undefined,
            maritalStatus: s.marital_status ?? undefined,
            originCity: s.origin_city ?? undefined,
          }) as StudentRecord
      );

      const users2 = profiles.map((u) => ({
        ...u,
        supervisorName: u.supervisorId ? profileById.get(u.supervisorId)?.fullName ?? null : null,
        assignedCaseIds: mappedCases
          .filter((c) => c.assignedPsychologistId === u.id || c.assignedInternId === u.id)
          .map((c) => c.id),
        linkedStudentId:
          mappedStudents.find((s) => s.institutionalEmail.toLowerCase() === u.email.toLowerCase())?.id ?? null,
      })) as UserProfile[];

      setUsers(users2.some((u) => u.id === authUser.id) ? users2 : [authUser, ...users2]);
      setStudents(mappedStudents);
      setCases(mappedCases);
      setSelectedCaseId((prev) => prev || mappedCases[0]?.id || '');
      setDataError(null);
    } catch (err: any) {
      setDataError(err?.message || 'No se pudieron cargar los datos desde Supabase.');
    }
  }, [authUser]);

  useEffect(() => {
    let active = true;
    loadDirectory().finally(() => active && setDataLoading(false));
    return () => {
      active = false;
    };
  }, [loadDirectory]);

  const persistStudentRecord = async (s: StudentRecord): Promise<boolean> => {
    if (!supabase) return false;
    const patch: Record<string, unknown> = {
      full_name: s.fullName,
      program_name: s.programName || 'Sin asignar',
      academic_department: s.academicDepartment || null,
      semester: s.semester > 0 ? s.semester : null,
      group_code: s.group || null,
      entry_generation: s.entryGeneration || null,
      gender: s.gender ?? null,
      age: s.age ?? null,
      phone: s.phone ?? null,
      current_address: s.currentAddress ?? null,
      marital_status: s.maritalStatus ?? null,
      origin_city: s.originCity ?? null,
    };
    if (s.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(s.birthDate)) patch.birth_date = s.birthDate;
    const { data, error } = await supabase.from('students').update(patch).eq('id', s.id).select('id');
    if (error || !data?.length) {
      window.alert(`No se pudo guardar tu información: ${error?.message ?? 'sin permiso sobre este registro'}`);
      return false;
    }
    return true;
  };

  const appendAuditLog = (
    actionType: AuditLogEntry['actionType'],
    targetResource: string,
    targetId: string,
    details: string
  ) => {
    hasUserMutatedState.current = true;
    const newEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorUserId: currentUser.id,
      actorName: currentUser.fullName,
      actorRole: currentUser.role,
      actionType,
      targetResource,
      targetId,
      details,
      ipSimulated: 'No registrada (Etapa 2: se capturará en servidor)',
    };
    setAuditLogs((prev) => [newEntry, ...prev]);
  };

  const handleOpenClinicalCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    setActiveView('EXPEDIENTE_UNICO');
    appendAuditLog(
      'CONSULTA_EXPEDIENTE',
      'clinical_cases',
      caseId,
      `Consulta de Expediente Único ${caseId.toUpperCase()} por ${currentUser.fullName} (${currentUser.role}).`
    );
  };

  const handleAssignCaseResponsible = (
    caseId: string,
    psychologistId?: string | null,
    internId?: string | null
  ) => {
    const psych = users.find((u) => u.id === psychologistId);
    const intern = users.find((u) => u.id === internId);

    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        const newPsychId = psychologistId === undefined ? c.assignedPsychologistId : (psych ? psych.id : null);
        const newPsychName = psychologistId === undefined ? c.assignedPsychologistName : (psych ? psych.fullName : null);
        const newInternId = internId === undefined ? c.assignedInternId : (intern ? intern.id : null);
        const newInternName = internId === undefined ? c.assignedInternName : (intern ? intern.fullName : null);

        return {
          ...c,
          assignedPsychologistId: newPsychId,
          assignedPsychologistName: newPsychName,
          assignedInternId: newInternId,
          assignedInternName: newInternName,
          followUpState:
            c.followUpState === CaseFollowUpState.SIN_ASIGNAR && (newPsychId || newInternId)
              ? CaseFollowUpState.PENDIENTE_CONTACTO
              : c.followUpState,
          updatedAt: new Date().toISOString(),
        };
      })
    );

    setUsers((prev) =>
      prev.map((u) => {
        let caseIds = [...u.assignedCaseIds];
        if (psych && u.id === psych.id && !caseIds.includes(caseId)) {
          caseIds.push(caseId);
        }
        if (intern && u.id === intern.id && !caseIds.includes(caseId)) {
          caseIds.push(caseId);
        }
        return { ...u, assignedCaseIds: caseIds };
      })
    );

    hasUserMutatedState.current = true;
    appendAuditLog(
      'MODIFICACION_ROL_CUENTA',
      'case_assignments',
      caseId,
      `Asignación actualizada para expediente ${caseId.toUpperCase()}: Psicólogo [${psych?.fullName || 'Sin cambios'}], Practicante [${intern?.fullName || 'Sin cambios'}].`
    );
  };

  const handleQuickAssignPsychologist = (caseId: string, psychologistId: string) => {
    handleAssignCaseResponsible(caseId, psychologistId, undefined);
  };

  const handleCreateConsultationAssessment = (payload: {
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
  }) => {
    const config = INITIAL_INSTRUMENT_CONFIGS[payload.instrumentCode];
    const detResult = evaluateInstrumentDeterministically(
      payload.instrumentCode,
      config,
      payload.responses
    );

    const newAssessmentId = `ass-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const newAssessment: AssessmentRecord = {
      id: newAssessmentId,
      clinicalCaseId: payload.clinicalCaseId,
      studentId: payload.studentId,
      periodId: null as unknown as string,
      modality: AttentionModality.ATENCION_INDIVIDUAL,
      instrumentCode: payload.instrumentCode,
      instrumentVersionId: config.id,
      versionTag: config.versionTag,
      scoringRuleVersion: config.scoringRuleVersion,
      appliedAt: nowIso,
      status: detResult.isComplete
        ? payload.professionalInterpretation.trim()
          ? AssessmentStatus.REVISADO_PROFESIONAL
          : AssessmentStatus.CALIFICADO
        : detResult.status,
      completionPercentage: Math.round(
        (detResult.answeredCount / detResult.expectedCount) * 100
      ),
      responses: payload.responses,
      totalScore: detResult.totalScore,
      psychometricCategory: detResult.psychometricCategory,
      suggestedPriority: detResult.suggestedPriority,
      calculatedByProcess: detResult.calculatedByProcess,
      applicationContextNote: payload.applicationContextNote,
      professionalInterpretation: payload.professionalInterpretation || null,
      reviewedByPsychologistId: detResult.isComplete ? currentUser.id : null,
      reviewedByPsychologistName: detResult.isComplete ? currentUser.fullName : null,
      reviewedAt: detResult.isComplete ? nowIso : null,
    };

    setAssessments((prev) => [newAssessment, ...prev]);

    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== payload.clinicalCaseId) return c;
        const updatedCase = { ...c, updatedAt: nowIso };
        if (detResult.isComplete && detResult.totalScore !== null) {
          if (payload.instrumentCode === InstrumentCode.BAI) {
            updatedCase.anxietyIndicator = {
              lastAssessmentId: newAssessmentId,
              instrumentVersion: config.versionTag,
              score: detResult.totalScore,
              category: detResult.psychometricCategory,
              evaluatedAt: nowIso.slice(0, 10),
            };
          } else {
            updatedCase.depressionIndicator = {
              lastAssessmentId: newAssessmentId,
              instrumentVersion: config.versionTag,
              score: detResult.totalScore,
              category: detResult.psychometricCategory,
              evaluatedAt: nowIso.slice(0, 10),
            };
          }
          if (detResult.suggestedPriority) {
            updatedCase.psychometricSuggestedPriority = detResult.suggestedPriority;
            if (detResult.suggestedPriority === PriorityLevel.ROJO) {
              updatedCase.operationalPriority = PriorityLevel.ROJO;
            }
          }
          updatedCase.lastEvaluationDate = nowIso.slice(0, 10);
        } else if (payload.instrumentCode === InstrumentCode.BAI && !detResult.isComplete) {
          updatedCase.anxietyIndicator = {
            ...updatedCase.anxietyIndicator,
            category: `Evaluación BAI en curso (${detResult.status} — Sin puntaje definitivo)`,
          };
        }
        updatedCase.nextFollowUpAction = payload.nextFollowUpAction;
        updatedCase.nextFollowUpDate = payload.nextFollowUpDate;
        return updatedCase;
      })
    );

    appendAuditLog(
      'CALIFICACION_DETERMINISTA',
      'assessments',
      newAssessmentId,
      `Aplicación de ${payload.instrumentCode} (${config.versionTag}) en expediente ${payload.clinicalCaseId.toUpperCase()}: Estado=${detResult.status}, Puntaje=${
        detResult.totalScore ?? 'N/A (Incompleta)'
      }.`
    );
  };

  const handleRegisterSession = (payload: {
    clinicalCaseId: string;
    studentId: string;
    participatingInternId: string | null;
    attentionMotive: string;
    clinicalNotes: string;
    professionalObservations: string;
    agreements: string;
    nextAction: string;
    nextFollowUpDate: string;
  }) => {
    const intern = users.find((u) => u.id === payload.participatingInternId);
    const nowIso = new Date().toISOString();
    const newSession: PsychologySession = {
      id: `ses-${Date.now()}`,
      clinicalCaseId: payload.clinicalCaseId,
      studentId: payload.studentId,
      sessionDate: nowIso,
      responsiblePsychologistId: currentUser.id,
      responsiblePsychologistName: currentUser.fullName,
      participatingInternId: intern ? intern.id : null,
      participatingInternName: intern ? intern.fullName : null,
      attentionMotive: payload.attentionMotive,
      clinicalNotes: payload.clinicalNotes,
      professionalObservations: payload.professionalObservations,
      agreements: payload.agreements,
      nextAction: payload.nextAction,
      nextFollowUpDate: payload.nextFollowUpDate,
      activityStatus: 'REALIZADA',
      createdAt: nowIso,
    };

    setSessions((prev) => [newSession, ...prev]);

    setCases((prev) =>
      prev.map((c) =>
        c.id === payload.clinicalCaseId
          ? {
              ...c,
              followUpState: CaseFollowUpState.EN_ATENCION,
              nextFollowUpAction: payload.nextAction,
              nextFollowUpDate: payload.nextFollowUpDate,
              updatedAt: nowIso,
            }
          : c
      )
    );

    appendAuditLog(
      'REGISTRO_SESION',
      'psychology_sessions',
      newSession.id,
      `Sesión registrada en expediente ${payload.clinicalCaseId.toUpperCase()}. Próximo seguimiento: ${payload.nextFollowUpDate}.`
    );
  };

  const handleManualPriorityElevation = (payload: {
    clinicalCaseId: string;
    newPriority: PriorityLevel;
    urgentProtocolTriggered: boolean;
    justification: string;
    institutionalActionTaken: string;
    nextFollowUpState: CaseFollowUpState;
  }) => {
    const nowIso = new Date().toISOString();
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== payload.clinicalCaseId) return c;
        const historyRecord = {
          id: `ph-${Date.now()}`,
          clinicalCaseId: c.id,
          changedAt: nowIso,
          changedByUserId: currentUser.id,
          changedByUserName: currentUser.fullName,
          previousPriority: c.operationalPriority,
          newPriority: payload.newPriority,
          isManualOverride: true,
          isUrgentProtocolTriggered: payload.urgentProtocolTriggered,
          justification: payload.justification,
          institutionalActionTaken: payload.institutionalActionTaken,
          notifiedProfessionalName:
            users.find((u) => u.role === RoleCode.RESPONSABLE_PSICOLOGIA)?.fullName ??
            'Responsable de Psicología (sin asignar)',
          acknowledgedAt: nowIso,
        };
        return {
          ...c,
          operationalPriority: payload.newPriority,
          urgentRiskIdentifiedByProfessional: payload.urgentProtocolTriggered,
          urgentProtocolActive: payload.urgentProtocolTriggered,
          priorityOverrideReason: payload.justification,
          priorityUpdatedBy: currentUser.fullName,
          priorityUpdatedAt: nowIso,
          followUpState: payload.nextFollowUpState,
          priorityHistory: [historyRecord, ...c.priorityHistory],
          updatedAt: nowIso,
        };
      })
    );

    appendAuditLog(
      payload.urgentProtocolTriggered
        ? 'ACTIVACION_PROTOCOLO_URGENTE'
        : 'CAMBIO_PRIORIDAD_MANUAL',
      'clinical_cases',
      payload.clinicalCaseId,
      `Prioridad actualizada a ${payload.newPriority} (${payload.nextFollowUpState}): ${payload.justification}`
    );
  };

  const handleEmitTutorAlert = (payload: {
    clinicalCaseId: string;
    studentId: string;
    generalRecommendations: string;
    authorizedActions: string[];
  }) => {
    const stu = students.find((s) => s.id === payload.studentId);
    if (!stu) return;
    const newAlert: AcademicSupportAlert = {
      id: `alrt-tut-${Date.now()}`,
      clinicalCaseId: payload.clinicalCaseId,
      studentId: stu.id,
      studentMatricula: stu.matricula,
      studentFullName: stu.fullName,
      studentProgram: stu.programName,
      studentSemester: stu.semester,
      studentGroup: stu.group,
      authorizedByPsychologistId: currentUser.id,
      authorizedByPsychologistName: currentUser.fullName,
      assignedTutorId: users.find((u) => u.role === RoleCode.TUTOR_ACADEMICO)?.id ?? '',
      assignedTutorName: users.find((u) => u.role === RoleCode.TUTOR_ACADEMICO)?.fullName ?? 'Sin tutor asignado',
      createdAt: new Date().toISOString(),
      requiresAcademicAccompaniment: true,
      generalAcademicRecommendations: payload.generalRecommendations,
      authorizedTutorActions: payload.authorizedActions,
      tutorRegisteredActions: [],
      status: 'ACTIVA',
    };

    setTutorAlerts((prev) => [newAlert, ...prev]);
    appendAuditLog(
      'ALERTA_TUTORIA_AUTORIZADA',
      'academic_support_alerts',
      newAlert.id,
      `Alerta de acompañamiento académico emitida para matrícula ${stu.matricula} sin exponer puntajes ni notas clínicas.`
    );
  };

  const handleRegisterStudentAndSingleCase = (payload: {
    matricula: string;
    fullName: string;
    institutionalEmail: string;
    programId: string;
    semester: number;
    group: string;
    entryGeneration: string;
    entryModality: AttentionModality;
  }): { status: 'CREATED' | 'EXISTING_RECOVERED'; caseId: string; message: string } => {
    const existingStudent = students.find(
      (s) =>
        s.matricula.toLowerCase() === payload.matricula.toLowerCase() ||
        s.institutionalEmail.toLowerCase() === payload.institutionalEmail.toLowerCase()
    );

    if (existingStudent) {
      const existingCase = cases.find((c) => c.studentId === existingStudent.id)!;
      return {
        status: 'EXISTING_RECOVERED',
        caseId: existingCase.id,
        message: `Control Anti-Duplicados Activo: El alumno ${existingStudent.fullName} (Matrícula ${existingStudent.matricula}) ya cuenta con el Expediente Institucional Único ${existingCase.id.toUpperCase()}. Se recupera su expediente existente sin duplicar registros.`,
      };
    }

    const prog =
      ITD_ACADEMIC_PROGRAMS.find((p) => p.id === payload.programId) ||
      ITD_ACADEMIC_PROGRAMS[0];
    const newStudentId = `stu-${String(students.length + 1).padStart(3, '0')}`;
    const newCaseId = `exp-itd-${String(cases.length + 1).padStart(3, '0')}`;
    const nowIso = new Date().toISOString();

    const newStudent: StudentRecord = {
      id: newStudentId,
      matricula: payload.matricula,
      fullName: payload.fullName,
      institutionalEmail: payload.institutionalEmail,
      programId: prog.id,
      programName: prog.name,
      academicDepartment: prog.academicDepartment,
      semester: payload.semester,
      group: payload.group,
      entryGeneration: payload.entryGeneration,
      registrationStatus: 'ACTIVO',
      incorporatedAt: nowIso,
      entryModality: payload.entryModality,
    };

    const newClinicalCase: ClinicalCaseRecord = {
      id: newCaseId,
      studentId: newStudentId,
      openedAt: nowIso,
      updatedAt: nowIso,
      modalityOrigin: payload.entryModality,
      anxietyIndicator: {
        lastAssessmentId: null,
        instrumentVersion: null,
        score: null,
        category: null,
        evaluatedAt: null,
      },
      depressionIndicator: {
        lastAssessmentId: null,
        instrumentVersion: null,
        score: null,
        category: null,
        evaluatedAt: null,
      },
      psychometricSuggestedPriority: PriorityLevel.VERDE,
      operationalPriority: PriorityLevel.VERDE,
      urgentRiskIdentifiedByProfessional: false,
      urgentProtocolActive: false,
      priorityOverrideReason: null,
      priorityUpdatedBy: null,
      priorityUpdatedAt: null,
      assignedPsychologistId: currentUser.role === RoleCode.PSICOLOGO ? currentUser.id : null,
      assignedPsychologistName: currentUser.role === RoleCode.PSICOLOGO ? currentUser.fullName : null,
      assignedInternId: null,
      assignedInternName: null,
      followUpState:
        currentUser.role === RoleCode.PSICOLOGO
          ? CaseFollowUpState.PENDIENTE_CONTACTO
          : CaseFollowUpState.SIN_ASIGNAR,
      lastEvaluationDate: null,
      nextFollowUpAction: 'Realizar primera entrevista o aplicar evaluación en consulta',
      nextFollowUpDate: new Date().toISOString().slice(0, 10),
      generalClinicalSummary:
        '[NOTA CLÍNICA PROTEGIDA POR RLS] Expediente único recién aperturado. Listo para registrar evaluaciones (BAI/BDI) y sesiones de atención.',
      referrals: [],
      priorityHistory: [],
    };

    setStudents((prev) => [newStudent, ...prev]);
    setCases((prev) => [newClinicalCase, ...prev]);
    setUsers((prev) =>
      prev.map((u) =>
        u.role === RoleCode.RESPONSABLE_PSICOLOGIA ||
        (currentUser.role === RoleCode.PSICOLOGO && u.id === currentUser.id)
          ? { ...u, assignedCaseIds: [...u.assignedCaseIds, newCaseId] }
          : u
      )
    );

    return {
      status: 'CREATED',
      caseId: newCaseId,
      message: `Estudiante registrado con éxito en ${payload.entryModality} y vinculado a su Expediente Institucional Único ${newCaseId.toUpperCase()}.`,
    };
  };

  const handleCompleteFollowUpTask = (
    taskId: string,
    outcomeNote: string,
    nextDate: string
  ) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: 'COMPLETADA',
              completedAt: new Date().toISOString(),
              outcomeNote,
            }
          : t
      )
    );

    setCases((prev) =>
      prev.map((c) =>
        c.id === targetTask.clinicalCaseId
          ? {
              ...c,
              followUpState: CaseFollowUpState.EN_ATENCION,
              nextFollowUpAction: outcomeNote,
              nextFollowUpDate: nextDate,
            }
          : c
      )
    );
  };

  const handleRegisterTutorAction = (alertId: string, actionSummary: string) => {
    setTutorAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              status: 'EN_SEGUIMIENTO_TUTORIAL',
              tutorRegisteredActions: [
                ...a.tutorRegisteredActions,
                {
                  id: `tact-${Date.now()}`,
                  registeredAt: new Date().toISOString(),
                  tutorName: currentUser.fullName,
                  actionSummary,
                  activityState: 'COMPLETADA',
                },
              ],
            }
          : a
      )
    );
  };

  const handleCreateUserProfile = async (payload: {
    fullName: string;
    email: string;
    role: RoleCode;
    supervisorId: string | null;
    professionalLicense: string;
  }) => {
    if (!supabase) return;
    const emailNorm = payload.email.trim().toLowerCase();
    const { error } = await supabase.rpc('create_staff_profile', {
      p_email: emailNorm,
      p_full_name: payload.fullName.trim(),
      p_role: payload.role,
      p_supervisor_id:
        payload.role === RoleCode.PRACTICANTE
          ? payload.supervisorId || (currentUser.role === RoleCode.PSICOLOGO ? currentUser.id : null)
          : null,
      p_license: payload.professionalLicense || null,
    });
    if (error) {
      window.alert(`No se pudo dar de alta la cuenta: ${error.message}`);
      return;
    }
    await loadDirectory();
    appendAuditLog(
      'MODIFICACION_ROL_CUENTA',
      'profiles',
      emailNorm,
      `Alta autorizada: ${payload.fullName} (${emailNorm}) con rol ${payload.role}. El acceso se activa al primer inicio de sesión con Google.`
    );
  };

  const handleUpdateUserAccountStatus = async (targetUserId: string, newStatus: AccountStatus) => {
    if (targetUserId === currentUser.id || !supabase) return;
    const targetUser = users.find((u) => u.id === targetUserId);
    if (!targetUser) return;
    const { error } = await supabase.rpc('admin_set_account_status', {
      p_profile: targetUserId,
      p_status: newStatus,
    });
    if (error) {
      window.alert(`No se pudo cambiar el estado: ${error.message}`);
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === targetUserId ? { ...u, status: newStatus } : u)));
    appendAuditLog(
      'MODIFICACION_ROL_CUENTA',
      'profiles',
      targetUserId,
      `Cambio de estado de cuenta de ${targetUser.email} a ${newStatus}.`
    );
  };

  const handleStudentSubmitSelfAssessment = () => {};

  const authorizedCases = React.useMemo(
    () => filterCasesForUser(currentUser, cases, users),
    [currentUser, cases, users]
  );

  const authorizedStudents = React.useMemo(
    () => filterStudentsForUser(currentUser, students, authorizedCases),
    [currentUser, students, authorizedCases]
  );

  const selectedClinicalCase =
    authorizedCases.find((c) => c.id === selectedCaseId) || authorizedCases[0];

  const selectedStudent = students.find((s) => s.id === selectedClinicalCase?.studentId);

  const currentStudent = React.useMemo(() => {
    if (currentUser.linkedStudentId) {
      const found = students.find((s) => s.id === currentUser.linkedStudentId);
      if (found) return found;
    }
    const foundByEmail = students.find(
      (s) => s.institutionalEmail.toLowerCase() === currentUser.email.toLowerCase()
    );
    return foundByEmail;
  }, [currentUser, students]);

  const currentStudentCase = React.useMemo(() => {
    return cases.find((c) => c.studentId === currentStudent?.id);
  }, [cases, currentStudent]);

  // Alumno de prueba para el Modo Simulación del Administrador
  const simulationStudent = students[0] || null;
  const simulationStudentCase = cases.find((c) => c.studentId === simulationStudent?.id) || null;

  useEffect(() => {
    if (currentUser.role === RoleCode.ESTUDIANTE && activeView !== 'EVALUACIONES') {
      setActiveView('EVALUACIONES');
    }
  }, [currentUser.role, activeView]);
    const allSidebarItems: {
    id: PrimaryView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'PANEL_PRINCIPAL', label: 'Panel Principal y Semáforo', icon: LayoutDashboard },
    { id: 'EXPEDIENTE_UNICO', label: 'Expediente Psicológico Único', icon: FolderKanban },
    { id: 'ESTUDIANTES', label: 'Padrón de Estudiantes', icon: GraduationCap },
    { id: 'EVALUACIONES', label: 'Evaluaciones (BAI y BDI)', icon: ClipboardCheck },
    { id: 'SEGUIMIENTO', label: 'Módulo de Seguimiento', icon: Activity },
    { id: 'TUTORIAS', label: 'Tutorías Académicas', icon: BookOpen },
    { id: 'USUARIOS', label: 'Usuarios y Accesos', icon: UserCog },
    { id: 'REPORTES', label: 'Reportes e Impresión', icon: FileBarChart2 },
  ];

  const sidebarItems =
    currentUser.role === RoleCode.ESTUDIANTE
      ? [
          {
            id: 'EVALUACIONES' as PrimaryView,
            label: 'Mis Datos y Cuestionarios',
            icon: ClipboardCheck,
          },
        ]
      : allSidebarItems;

  const currentViewLabel =
    sidebarItems.find((i) => i.id === activeView)?.label ||
    (currentUser.role === RoleCode.ESTUDIANTE ? 'Portal del Estudiante' : 'Panel Principal');

  return (
    <div className="min-h-screen flex bg-[#FDFBF7] text-[#3B4A3F]">
      {/* SIDEBAR INSTITUCIONAL ITD - OCULTO EN MÓVILES (hidden lg:flex) */}
      <aside
        className="hidden lg:flex flex-col w-64 bg-[#F4F0E6] text-[#3B4A3F] justify-between border-r border-[#E8E2D5] no-print shrink-0"
      >
        <div>
          <div className="px-5 py-5 border-b border-[#E8E2D5] bg-[#A3C9A8]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-bold tracking-tight text-[#2F3E32] font-display">
                  SIAPE-ITD
                </div>
                <div className="text-[11px] text-[#4A6B53] mt-0.5 font-medium">
                  Oficina de Psicología · Desarrollo Académico
                </div>
                <div className="text-[10px] text-[#4A6B53]/80 font-mono mt-0.5">
                  Instituto Tecnológico de Durango
                </div>
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveView(item.id);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                    isActive
                      ? 'bg-[#A3C9A8] text-[#2F3E32] font-bold shadow-sm'
                      : 'text-[#4A6B53] hover:bg-[#E8E2D5] hover:text-[#2F3E32]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-[#E8E2D5] text-[11px] text-[#4A6B53] space-y-2">
          <div className="font-semibold text-[#2F3E32] flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#4A6B53] shrink-0" />
            <span>
              {isSupabaseConfigured
                ? 'Supabase (Conectado)'
                : 'Supabase sin configurar'}
            </span>
          </div>
          <p className="leading-relaxed">
            {currentUser.role === RoleCode.ESTUDIANTE
              ? 'Tus respuestas son estrictamente confidenciales y protegidas por la Oficina de Psicología.'
              : currentUser.role === RoleCode.ADMINISTRADOR
              ? `Supervisión total: ${cases.length} expedientes y ${students.length} alumnos registrados.`
              : currentUser.role === RoleCode.PSICOLOGO
              ? `Vista autorizada: ${authorizedCases.length} pacientes asignados a tu equipo clínico.`
              : `Vista de practicante: ${authorizedCases.length} pacientes bajo tu atención directa.`}
          </p>
          <div className="pt-1.5 border-t border-[#E8E2D5] text-[10px] text-[#4A6B53]/70">
            Oficina de Psicología · Instituto Tecnológico de Durango
          </div>
        </div>
      </aside>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER */}
        <header className="bg-white border-b border-[#E8E2D5] px-4 md:px-6 py-3.5 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-sm font-bold text-[#2F3E32] whitespace-nowrap truncate">
              SIAPE-ITD <span className="text-[#A3C9A8] font-normal mx-1.5">/</span>{' '}
              <span className="text-[#4A6B53]">{currentViewLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 text-xs">
            {/* BOTÓN DE MODO SIMULACIÓN PARA ADMINISTRADOR */}
            {currentUser.role === RoleCode.ADMINISTRADOR && (
              <button
                onClick={() => setViewAsStudentMode(!viewAsStudentMode)}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors ${
                  viewAsStudentMode 
                    ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                    : 'bg-[#F4F0E6] text-[#4A6B53] border border-[#E8E2D5] hover:bg-[#E8E2D5]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                {viewAsStudentMode ? 'Salir de Modo Alumno' : 'Ver como Alumno'}
              </button>
            )}

            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E8E2D5] bg-[#FDFBF7] text-xs">
              {currentUser.role === RoleCode.ADMINISTRADOR && (
                <span className="font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded-md text-[11px] flex items-center gap-1">
                  👑 Nivel 1: Superadmin
                </span>
              )}
              {currentUser.role === RoleCode.PSICOLOGO && (
                <span className="font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded-md text-[11px] flex items-center gap-1">
                  🩺 Nivel 2: Psicólogo Titular
                </span>
              )}
              {currentUser.role === RoleCode.PRACTICANTE && (
                <span className="font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-md text-[11px] flex items-center gap-1">
                  🌱 Nivel 3: Practicante
                </span>
              )}
              {currentUser.role === RoleCode.ESTUDIANTE && (
                <span className="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md text-[11px] flex items-center gap-1">
                  🎓 Alumno ITD
                </span>
              )}
              <span className="font-medium text-[#2F3E32] truncate max-w-[150px]">
                {currentUser.fullName}
              </span>
            </div>

            <button
              onClick={onSignOut}
              className="px-3 py-1.5 bg-white border border-[#E8E2D5] hover:bg-[#F4F0E6] text-[#4A6B53] text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer transition-all"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </header>

        {/* CINTILLO CONTEXTUAL DE PERMISOS */}
        <div className="bg-[#F4F0E6] border-b border-[#E8E2D5] px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#4A6B53] no-print">
          <div>
            Sesión activa: <strong>{currentUser.fullName}</strong> ({currentUser.email}) ·
            {currentUser.role === RoleCode.ADMINISTRADOR && (
              <span className="text-[#2F3E32] ml-1 font-semibold">
                Superadministrador: Da de alta psicólogos y supervisa el sistema completo.
              </span>
            )}
            {currentUser.role === RoleCode.PSICOLOGO && (
              <span className="text-[#2F3E32] ml-1 font-semibold">
                Psicólogo Titular: Ve sus pacientes + pacientes de sus practicantes a cargo.
              </span>
            )}
            {currentUser.role === RoleCode.PRACTICANTE && (
              <span className="text-[#2F3E32] ml-1 font-semibold">
                Practicante: Supervisado por {currentUser.supervisorName || 'Psicólogo Titular'} (solo ve sus pacientes asignados).
              </span>
            )}
            {currentUser.role === RoleCode.ESTUDIANTE && (
              <span className="text-[#2F3E32] ml-1 font-semibold">
                Alumno ITD: Acceso exclusivo a completar sus datos personales y responder cuestionarios.
              </span>
            )}
          </div>
          <span className="text-[11px] font-semibold text-[#4A6B53] bg-[#A3C9A8]/30 px-2 py-0.5 rounded-md border border-[#A3C9A8]/50">
            Etapa 1: expedientes, evaluaciones y sesiones aún no se guardan en la base.
          </span>
        </div>

        {/* ÁREA DE CONTENIDO PRINCIPAL */}
        <main className="flex-1 p-4 md:p-6 max-w-[1440px] w-full mx-auto bg-[#FDFBF7]">
          {dataLoading ? (
            <div className="p-6 text-sm text-[#4A6B53]">Cargando información…</div>
          ) : dataError ? (
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-900">
              {dataError}
            </div>
          ) : currentUser.role === RoleCode.ESTUDIANTE || viewAsStudentMode ? (
            // VISTA DE ALUMNO (o simulación de Admin)
            (currentUser.role === RoleCode.ESTUDIANTE ? currentStudent : simulationStudent) ? (
            <StudentPortalView
              currentUser={viewAsStudentMode ? { ...currentUser, fullName: simulationStudent?.fullName || 'Alumno en Simulación' } : currentUser}
              student={(currentUser.role === RoleCode.ESTUDIANTE ? currentStudent : simulationStudent)!}
              clinicalCase={currentUser.role === RoleCode.ESTUDIANTE ? currentStudentCase : simulationStudentCase}
              assessments={assessments.filter((a) => a.studentId === (currentUser.role === RoleCode.ESTUDIANTE ? currentStudent?.id : simulationStudent?.id))}
              onUpdateStudentRecord={async (updated) => {
                if (!(await persistStudentRecord(updated))) return;
                setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
              }}
              onSubmitAssessment={(instrumentCode, responses) => {
                const targetCase = currentUser.role === RoleCode.ESTUDIANTE ? currentStudentCase : simulationStudentCase;
                const targetStudent = currentUser.role === RoleCode.ESTUDIANTE ? currentStudent : simulationStudent;
                if (!targetCase || !targetStudent) return;
                handleCreateConsultationAssessment({
                  clinicalCaseId: targetCase.id,
                  studentId: targetStudent.id,
                  instrumentCode,
                  applicationContextNote: `Cuestionario autoadministrado (${currentUser.email}).`,
                  responses,
                  professionalInterpretation: '',
                  overridePriority: null,
                  overrideReason: '',
                  nextFollowUpAction: 'Revisión y valoración inicial por la Oficina de Psicología',
                  nextFollowUpDate: new Date().toISOString().slice(0, 10),
                });
              }}
              onLogoutOrSwitchRole={onSignOut}
            />
            ) : (
              <div className="p-6 text-sm text-[#4A6B53]">
                {currentUser.role === RoleCode.ESTUDIANTE 
                  ? 'Tu registro de alumno se está preparando. Cierra sesión y vuelve a entrar; si persiste, avisa a la Oficina de Psicología.'
                  : 'No hay alumnos registrados en el sistema para simular la vista.'}
              </div>
            )
          ) : (
            // VISTA DE PERSONAL CLÍNICO / ADMIN
            <>
              {activeView === 'PANEL_PRINCIPAL' && (
                <DashboardView
                  currentUser={currentUser}
                  students={authorizedStudents}
                  cases={authorizedCases}
                  assessments={assessments}
                  tasks={tasks}
                  programs={ITD_ACADEMIC_PROGRAMS}
                  psychologists={users.filter((u) => u.role === RoleCode.PSICOLOGO)}
                  allUsers={users}
                  onOpenClinicalCase={handleOpenClinicalCase}
                  onQuickAssignPsychologist={(caseId, psychId) =>
                    handleAssignCaseResponsible(caseId, psychId, null)
                  }
                  onNavigateModule={(modKey) => setActiveView(modKey as PrimaryView)}
                />
              )}

              {activeView === 'EXPEDIENTE_UNICO' &&
                (!selectedClinicalCase || !selectedStudent ? (
                  <div className="p-6 text-sm text-[#4A6B53] bg-white border border-[#E8E2D5] rounded-xl">
                    Aún no hay expedientes disponibles para tu cuenta.
                  </div>
                ) : (
                <ClinicalRecordView
                  currentUser={currentUser}
                  clinicalCase={selectedClinicalCase}
                  student={selectedStudent}
                  assessments={assessments}
                  sessions={sessions}
                  tasks={tasks}
                  auditLogs={auditLogs}
                  instrumentConfigs={INITIAL_INSTRUMENT_CONFIGS}
                  psychologists={users.filter((u) => u.role === RoleCode.PSICOLOGO)}
                  interns={users.filter((u) => u.role === RoleCode.PRACTICANTE)}
                  onBack={() => setActiveView('PANEL_PRINCIPAL')}
                  onCreateConsultationAssessment={handleCreateConsultationAssessment}
                  onRegisterSession={handleRegisterSession}
                  onManualPriorityElevation={handleManualPriorityElevation}
                  onEmitTutorAlert={handleEmitTutorAlert}
                />
                ))}

              {(activeView === 'ESTUDIANTES' ||
                activeView === 'EVALUACIONES' ||
                activeView === 'SEGUIMIENTO' ||
                activeView === 'TUTORIAS' ||
                activeView === 'USUARIOS' ||
                activeView === 'REPORTES') && (
                <ModulesView
                  activeModule={activeView as ActiveModuleKey}
                  currentUser={currentUser}
                  users={users}
                  students={authorizedStudents}
                  cases={authorizedCases}
                  assessments={assessments}
                  tasks={tasks}
                  tutorAlerts={tutorAlerts}
                  auditLogs={auditLogs}
                  periods={EVALUATION_PERIODS}
                  programs={ITD_ACADEMIC_PROGRAMS}
                  instrumentConfigs={INITIAL_INSTRUMENT_CONFIGS}
                  onOpenClinicalCase={handleOpenClinicalCase}
                  onRegisterStudentAndSingleCase={handleRegisterStudentAndSingleCase}
                  onCompleteFollowUpTask={handleCompleteFollowUpTask}
                  onAssignCaseResponsible={handleAssignCaseResponsible}
                  onRegisterTutorAction={handleRegisterTutorAction}
                  onCreateUserProfile={handleCreateUserProfile}
                  onUpdateUserAccountStatus={handleUpdateUserAccountStatus}
                  onLogReportExport={(repName, fmt, filters) =>
                    appendAuditLog(
                      'EXPORTACION_REPORTE',
                      'reports',
                      repName,
                      `Exportación en formato ${fmt} de "${repName}" con filtros [${filters}].`
                    )
                  }
                  onStudentSubmitSelfAssessment={handleStudentSubmitSelfAssessment}
                  onCreateConsultationAssessment={handleCreateConsultationAssessment}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function AuthGate() {
  const { status, profile, signOut } = useAuth();
  if (status !== 'READY' || !profile) return <LoginScreen />;
  return <AppShell key={profile.id} authUser={profile} onSignOut={signOut} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}