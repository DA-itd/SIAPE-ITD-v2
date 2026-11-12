/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Activity, ClipboardCheck, Eye, FileBarChart2, FolderKanban,
  GraduationCap, LayoutDashboard, Lock, ShieldCheck, UserCog, X,
} from 'lucide-react';
import {
  AcademicProgram, AcademicSupportAlert, AccountStatus, AssessmentRecord, AssessmentStatus,
  AttentionModality, AuditLogEntry, CaseAssignmentHistoryEntry, CaseFollowUpState, ClinicalCaseRecord,
  EvaluationPeriod, FollowUpTask, InstrumentCode, PriorityLevel,
  PsychologySession, RoleCode, StudentConsultationStatus, StudentRecord, UserProfile,
} from './types/siape';
import { ITD_ACADEMIC_PROGRAMS } from './data/academicPrograms';
import { INITIAL_INSTRUMENT_CONFIGS, evaluateInstrumentDeterministically } from './lib/scoringEngine';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { DashboardView } from './components/DashboardView';
import { ClinicalRecordView } from './components/ClinicalRecordView';
import { ActiveModuleKey, ModulesView } from './components/ModulesView';
import { StudentPortalView } from './components/StudentPortalView';
import { LoginScreen } from './components/LoginScreen';
import { AuthProvider, PROFILE_SELECT, mapProfileRow, useAuth } from './context/AuthContext';
import { filterCasesForUser, filterStudentsForUser } from './lib/permissionsEngine';

type PrimaryView = 'ARQUITECTURA_ENTREGA_1' | 'PANEL_PRINCIPAL' | 'EXPEDIENTE_UNICO' | 'ESTUDIANTES' | 'EVALUACIONES' | 'SEGUIMIENTO' | 'USUARIOS' | 'REPORTES';
const APP_VERSION = '2026.11.12-5';
const EVALUATION_PERIODS: EvaluationPeriod[] = [];

function AppShell({ authUser, onSignOut }: { authUser: UserProfile; onSignOut: () => void }) {
  const [users, setUsers] = useState<UserProfile[]>([authUser]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [programs, setPrograms] = useState<AcademicProgram[]>(ITD_ACADEMIC_PROGRAMS);
  const [cases, setCases] = useState<ClinicalCaseRecord[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [consultationStatus, setConsultationStatus] = useState<StudentConsultationStatus | null>(null);
  const [sessions, setSessions] = useState<PsychologySession[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [tutorAlerts, setTutorAlerts] = useState<AcademicSupportAlert[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [viewAsStudentMode, setViewAsStudentMode] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<PrimaryView>(authUser.role === RoleCode.ESTUDIANTE ? 'EVALUACIONES' : 'PANEL_PRINCIPAL');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const hasUserMutatedState = useRef<boolean>(false);

  const currentUser = users.find((u) => u.id === authUser.id) || authUser;

  const loadDirectory = React.useCallback(async () => {
    if (!supabase) return;
    try {
      const assessmentsQuery: any = authUser.role === RoleCode.ESTUDIANTE
        ? Promise.resolve({ data: [], error: null })
        : supabase.from('assessments').select('*').order('submitted_at', { ascending: false }).limit(500);

      const [profilesRes, studentsRes, casesRes, assignmentsRes, programsRes, assessmentsRes] = await Promise.all([
        supabase.from('profiles').select(PROFILE_SELECT),
        supabase.from('students').select('*'),
        supabase.from('clinical_cases').select('*'),
        supabase.from('case_assignments').select('id, clinical_case_id, assigned_user_id, assignment_role, is_active, assigned_at, revoked_at'),
        supabase.from('academic_programs').select('id, code, name, academic_department, is_active').order('name'),
        assessmentsQuery,
      ]);
      if (profilesRes.error || studentsRes.error) throw profilesRes.error || studentsRes.error;

      const dbPrograms: AcademicProgram[] = (programsRes.data ?? []).map((p: any) => ({
        id: p.id, code: p.code, name: p.name,
        academicDepartment: p.academic_department ?? '', active: p.is_active !== false,
      }));
      if (!programsRes.error && dbPrograms.length > 0) setPrograms(dbPrograms);

      const profiles = (profilesRes.data ?? []).map(mapProfileRow);
      const profileById = new Map(profiles.map((p) => [p.id, p]));
      const activeAssignments = new Map<string, any[]>();
      (assignmentsRes.data ?? []).filter((x: any) => x.is_active).forEach((x: any) => {
        const list = activeAssignments.get(x.clinical_case_id) ?? [];
        list.push(x);
        activeAssignments.set(x.clinical_case_id, list);
      });

      // Historial completo (activo e inactivo). Se conserva aunque la cuenta
      // del psicólogo o practicante se haya dado de baja.
      const historyByCase = new Map<string, CaseAssignmentHistoryEntry[]>();
      (assignmentsRes.data ?? []).forEach((x: any) => {
        const prof = profileById.get(x.assigned_user_id);
        const list = historyByCase.get(x.clinical_case_id) ?? [];
        list.push({
          id: x.id ?? `${x.clinical_case_id}-${x.assigned_user_id}-${x.assignment_role}`,
          userId: x.assigned_user_id,
          userName: prof?.fullName ?? 'Usuario no disponible',
          role: x.assignment_role,
          isActive: !!x.is_active,
          assignedAt: x.assigned_at ?? null,
          revokedAt: x.revoked_at ?? null,
        });
        historyByCase.set(x.clinical_case_id, list);
      });
      historyByCase.forEach((list) => {
        list.sort((a, b) => (b.assignedAt ?? '').localeCompare(a.assignedAt ?? ''));
      });

      const indicator = (s: any, v: any, c: any, a: any) => ({ lastAssessmentId: null, instrumentVersion: v ?? null, score: s ?? null, category: c ?? null, evaluatedAt: a ?? null });

      const mappedCases: ClinicalCaseRecord[] = (casesRes.data ?? []).map((c: any) => {
        const active = activeAssignments.get(c.id) ?? [];
        const psy = active.find((x: any) => x.assignment_role === 'PSICOLOGO_RESPONSABLE');
        const intern = active.find((x: any) => x.assignment_role === 'PRACTICANTE_SUPERVISADO');
        return {
          id: c.id, studentId: c.student_id, openedAt: c.opened_at, updatedAt: c.updated_at, modalityOrigin: c.modality_origin,
          anxietyIndicator: indicator(c.anxiety_score, c.anxiety_version, c.anxiety_category, c.anxiety_evaluated_at),
          depressionIndicator: indicator(c.depression_score, c.depression_version, c.depression_category, c.depression_evaluated_at),
          psychometricSuggestedPriority: c.psychometric_suggested_priority, operationalPriority: c.operational_priority,
          urgentRiskIdentifiedByProfessional: !!c.urgent_risk_flagged, urgentProtocolActive: !!c.urgent_risk_flagged,
          priorityOverrideReason: c.priority_override_reason ?? null, priorityUpdatedBy: c.priority_updated_by ?? null, priorityUpdatedAt: c.priority_updated_at ?? null,
          assignedPsychologistId: psy?.assigned_user_id ?? null, assignedPsychologistName: c.assigned_psychologist_name ?? profileById.get(psy?.assigned_user_id)?.fullName ?? null,
          assignedInternId: intern?.assigned_user_id ?? null, assignedInternName: c.assigned_intern_name ?? profileById.get(intern?.assigned_user_id)?.fullName ?? null,
          followUpState: c.follow_up_state, lastEvaluationDate: c.anxiety_evaluated_at ?? c.depression_evaluated_at ?? null,
          nextFollowUpAction: c.next_follow_up_action ?? '', nextFollowUpDate: c.next_follow_up_date ?? null,
          generalClinicalSummary: c.general_clinical_summary ?? '', referrals: [], priorityHistory: [],
          assignmentHistory: historyByCase.get(c.id) ?? [],
          consultationRequested: !!c.consultation_requested,
          consultationRequestedAt: c.consultation_requested_at ?? null,
          consultationRequestNote: c.consultation_request_note ?? null,
        } as ClinicalCaseRecord;
      });

      // Evaluaciones reales de la base. RLS entrega solo las que el usuario puede ver.
      const mappedAssessments: AssessmentRecord[] = (assessmentsRes.data ?? []).map((a: any) => ({
        id: a.id, clinicalCaseId: a.clinical_case_id, studentId: a.student_id,
        periodId: a.evaluation_period_id ?? null, modality: a.modality,
        instrumentCode: a.instrument_code, instrumentVersionId: a.instrument_version_id ?? '',
        versionTag: a.version_tag, scoringRuleVersion: a.scoring_rule_version,
        appliedAt: a.submitted_at ?? a.started_at ?? new Date().toISOString(),
        status: a.total_score !== null && a.status !== AssessmentStatus.REVISADO_PROFESIONAL
          ? AssessmentStatus.CALIFICADO
          : a.status,
        completionPercentage: a.completion_percentage ?? 0,
        responses: a.responses_json ?? a.responses ?? {},
        totalScore: a.total_score ?? null, psychometricCategory: a.psychometric_category ?? null,
        suggestedPriority: a.suggested_priority ?? null,
        calculatedByProcess: 'MOTOR_DETERMINISTA_SIAPE_V1',
        applicationContextNote: a.application_context_note ?? '',
        professionalInterpretation: a.professional_interpretation ?? null,
        reviewedByPsychologistId: null,
        reviewedByPsychologistName: a.reviewed_by_psychologist_name ?? null,
        reviewedAt: a.reviewed_at ?? null,
      })) as AssessmentRecord[];

      if (!assessmentsRes.error && authUser.role !== RoleCode.ESTUDIANTE) {
        // Red de seguridad: si el expediente aún no tiene el puntaje, se toma de la última
        // evaluación calificada del alumno (así el semáforo no se queda en blanco).
        const lastScore = (studentId: string, code: string) => mappedAssessments
          .filter((a) => a.studentId === studentId && (a.instrumentCode as unknown as string) === code && a.totalScore !== null)
          .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))[0];
        mappedCases.forEach((c) => {
          const bai = lastScore(c.studentId, 'BAI');
          const bdi = lastScore(c.studentId, 'BDI');
          if (c.anxietyIndicator.score === null && bai) {
            c.anxietyIndicator = { lastAssessmentId: bai.id, instrumentVersion: bai.versionTag, score: bai.totalScore, category: bai.psychometricCategory, evaluatedAt: bai.appliedAt.slice(0, 10) };
          }
          if (c.depressionIndicator.score === null && bdi) {
            c.depressionIndicator = { lastAssessmentId: bdi.id, instrumentVersion: bdi.versionTag, score: bdi.totalScore, category: bdi.psychometricCategory, evaluatedAt: bdi.appliedAt.slice(0, 10) };
          }
          if (!c.lastEvaluationDate) {
            c.lastEvaluationDate = c.anxietyIndicator.evaluatedAt ?? c.depressionIndicator.evaluatedAt ?? null;
          }
          // Red de seguridad: si el expediente no refleja la prioridad sugerida por
          // los cuestionarios, se toma la más alta de las últimas aplicaciones.
          const rank: Record<string, number> = { VERDE: 1, AMARILLO: 2, ROJO: 3 };
          const candidates = [bai?.suggestedPriority, bdi?.suggestedPriority]
            .filter((p): p is PriorityLevel => Boolean(p));
          const highest = candidates.sort((a, b) => (rank[b] ?? 0) - (rank[a] ?? 0))[0];
          if (highest && (rank[highest] ?? 0) > (rank[c.psychometricSuggestedPriority as string] ?? 0)) {
            c.psychometricSuggestedPriority = highest;
          }
        });
        setAssessments(mappedAssessments);
      } else {
        console.warn('No se pudieron cargar las evaluaciones clínicas', assessmentsRes.error);
      }

      const columbiaByStudent = new Map<string, number>();
      (casesRes.data ?? []).forEach((c: any) => {
        if (typeof c.columbia_si_count === 'number') columbiaByStudent.set(c.student_id, c.columbia_si_count);
      });

      const mappedStudents: StudentRecord[] = (studentsRes.data ?? []).map((s: any) => ({
        id: s.id, matricula: s.matricula, fullName: s.full_name, institutionalEmail: s.institutional_email,
        programId: s.academic_program_id ?? '', programName: s.program_name ?? 'Sin asignar', academicDepartment: s.academic_department ?? '',
        semester: s.semester ?? 0, group: s.group_code ?? '', entryGeneration: s.entry_generation ?? '',
        registrationStatus: s.registration_status, incorporatedAt: s.incorporated_at, entryModality: s.entry_modality,
        gender: s.gender ?? undefined, age: s.age ?? undefined, birthDate: s.birth_date ?? undefined,
        currentAddress: s.current_address ?? undefined, phone: s.phone ?? undefined, maritalStatus: s.marital_status ?? undefined,
        originCity: s.origin_city ?? undefined, 
        emergencyContact: s.emergency_contact ?? undefined,
        suicideProtocolSiCount: columbiaByStudent.get(s.id),
      }) as StudentRecord);

      const users2 = profiles.map((u) => ({
        ...u, supervisorName: u.supervisorId ? profileById.get(u.supervisorId)?.fullName ?? null : null,
        assignedCaseIds: mappedCases.filter((c) =>
          c.assignedPsychologistId === u.id ||
          c.assignedInternId === u.id ||
          ((u.role === RoleCode.PSICOLOGO) && c.assignedPsychologistName?.trim().toLowerCase() === u.fullName.trim().toLowerCase()) ||
          ((u.role === RoleCode.PSICOLOGO || u.role === RoleCode.RESPONSABLE_PSICOLOGIA) &&
            !c.assignedPsychologistId && !c.assignedInternId && !c.assignedPsychologistName && !c.assignedInternName)
        ).map((c) => c.id),
        linkedStudentId: mappedStudents.find((s) => s.institutionalEmail.toLowerCase() === u.email.toLowerCase())?.id ?? null,
      })) as UserProfile[];

      setUsers(users2.some((u) => u.id === authUser.id) ? users2 : [authUser, ...users2]);
      setStudents(mappedStudents); setCases(mappedCases);
      setSelectedCaseId((prev) => prev || mappedCases[0]?.id || '');
      setDataError(null);
    } catch (err: any) {
      setDataError(err?.message || 'No se pudieron cargar los datos.');
    }
  }, [authUser]);

  useEffect(() => {
    let active = true;
    loadDirectory().finally(() => active && setDataLoading(false));
    return () => { active = false; };
  }, [loadDirectory]);

  // Carga el estado de los cuestionarios del propio alumno (solo instrumento y fecha, sin puntajes)
  const loadMyAssessments = React.useCallback(async () => {
    if (!supabase || authUser.role !== RoleCode.ESTUDIANTE) return;
    const { data, error } = await supabase.rpc('my_assessment_status');
    if (error) { console.error('No se pudo cargar el estado de los cuestionarios', error); return; }
    setAssessments((data ?? []).map((r: any) => ({
      id: r.id, studentId: r.student_id, instrumentCode: r.instrument_code, appliedAt: r.submitted_at,
    })) as any);
  }, [authUser]);

  useEffect(() => { loadMyAssessments(); }, [loadMyAssessments]);

  // Estado de la solicitud de consulta del alumno (si ya la envió, prioridad, etc.)
  const loadMyConsultation = React.useCallback(async () => {
    if (!supabase || authUser.role !== RoleCode.ESTUDIANTE) return;
    const { data, error } = await supabase.rpc('my_consultation_status');
    if (error) {
      console.warn('No se pudo cargar el estado de la solicitud de consulta', error);
      return;
    }
    setConsultationStatus((data as StudentConsultationStatus) ?? null);
  }, [authUser]);

  useEffect(() => { loadMyConsultation(); }, [loadMyConsultation]);

  const handleRequestConsultation = async (note?: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.rpc('request_my_consultation', {
      p_note: note?.trim() ? note.trim() : null,
    });
    if (error) throw new Error(error.message || 'No se pudo enviar la solicitud.');
    setConsultationStatus((data as StudentConsultationStatus) ?? null);
    await loadMyConsultation();
  };

  // Guarda la ficha del alumno. Lanza un error si algo falla, para que el portal lo muestre.
  const persistStudentRecord = async (s: StudentRecord): Promise<void> => {
    if (!supabase) throw new Error('Supabase no está configurado.');

    // Convertir fecha DD/MM/AAAA a AAAA-MM-DD (el selector de fecha ya entrega AAAA-MM-DD)
    let birthDate: string | null = null;
    if (s.birthDate) {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s.birthDate)) {
        const [day, month, year] = s.birthDate.split('/');
        birthDate = `${year}-${month}-${day}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(s.birthDate)) {
        birthDate = s.birthDate;
      }
    }

    const patch: Record<string, unknown> = {
      full_name: s.fullName,
      matricula: s.matricula,
      program_name: s.programName?.trim() || 'Sin asignar',
      academic_department: s.academicDepartment || null,
      semester: s.semester > 0 ? s.semester : null,
      gender: s.gender ?? null,
      age: s.age ?? null,
      phone: s.phone ?? null,
      origin_city: s.originCity ?? null,
      current_address: s.currentAddress ?? null,
      emergency_contact: s.emergencyContact ?? null,
    };
    // academic_program_id es un UUID que apunta al catálogo de Supabase. Si el catálogo
    // no cargó y solo tenemos el id local, no se envía para no romper la llave foránea.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.programId || '')) {
      patch.academic_program_id = s.programId;
    }
    if (birthDate) patch.birth_date = birthDate;

    let { data, error } = await supabase.from('students').update(patch).eq('id', s.id).select('id');

    // Si la base solo permite actualizar ciertas columnas, se reintenta sin la carrera
    // para no perder el resto de la ficha.
    if (error && (error.code === '42501' || /permission denied/i.test(error.message || ''))) {
      const fallback = { ...patch };
      delete fallback.academic_program_id;
      delete fallback.academic_department;
      ({ data, error } = await supabase.from('students').update(fallback).eq('id', s.id).select('id'));
    }

    if (error) {
      console.error('Error al guardar ficha:', error);
      if (error.code === '23505') {
        throw new Error('Esa matrícula ya está registrada con otra cuenta. Avisa a Psicología.');
      }
      throw new Error(error.message || 'No se pudo guardar en la base de datos.');
    }
    if (!data || data.length === 0) {
      throw new Error('No se encontró tu registro de alumno. Cierra sesión y vuelve a entrar.');
    }
  };

  const appendAuditLog = (actionType: AuditLogEntry['actionType'], targetResource: string, targetId: string, details: string) => {
    hasUserMutatedState.current = true;
    setAuditLogs((prev) => [{
      id: `aud-${Date.now()}`, timestamp: new Date().toISOString(), actorUserId: currentUser.id,
      actorName: currentUser.fullName, actorRole: currentUser.role, actionType, targetResource, targetId, details,
      ipSimulated: 'No registrada',
    }, ...prev]);
  };

  // Toma un caso nuevo (sin responsable) y lo asigna al psicólogo que lo atiende.
  const handleClaimCase = async (caseId: string) => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { error } = await supabase.rpc('claim_case', { p_case_id: caseId });
    if (error) throw new Error(error.message || 'No se pudo tomar el caso.');
    await loadDirectory();
  };

  const handleRegisterCaseContact = async (caseId: string, outcome: 'CITA_PROGRAMADA' | 'EN_ATENCION') => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { error } = await supabase.rpc('register_case_contact', { p_case: caseId, p_outcome: outcome });
    if (error) throw new Error(error.message || 'No se pudo registrar el contacto.');
    await loadDirectory();
  };

  const handleOpenClinicalCase = (caseId: string) => {
    setSelectedCaseId(caseId); setActiveView('EXPEDIENTE_UNICO');
    appendAuditLog('CONSULTA_EXPEDIENTE', 'clinical_cases', caseId, `Consulta de Expediente ${caseId.toUpperCase()}`);
  };

  const handleAssignCaseResponsible = (caseId: string, psychologistId?: string | null, internId?: string | null) => {
    const psych = users.find((u) => u.id === psychologistId);
    const intern = users.find((u) => u.id === internId);
    setCases((prev) => prev.map((c) => {
        if (c.id !== caseId) return c;
        const newPsychId = psychologistId === undefined ? c.assignedPsychologistId : (psych ? psych.id : null);
        const newPsychName = psychologistId === undefined ? c.assignedPsychologistName : (psych ? psych.fullName : null);
        const newInternId = internId === undefined ? c.assignedInternId : (intern ? intern.id : null);
        const newInternName = internId === undefined ? c.assignedInternName : (intern ? intern.fullName : null);
        return { ...c, assignedPsychologistId: newPsychId, assignedPsychologistName: newPsychName, assignedInternId: newInternId, assignedInternName: newInternName, followUpState: c.followUpState === CaseFollowUpState.SIN_ASIGNAR && (newPsychId || newInternId) ? CaseFollowUpState.PENDIENTE_CONTACTO : c.followUpState, updatedAt: new Date().toISOString() };
    }));
    setUsers((prev) => prev.map((u) => {
        let caseIds = [...u.assignedCaseIds];
        if (psych && u.id === psych.id && !caseIds.includes(caseId)) caseIds.push(caseId);
        if (intern && u.id === intern.id && !caseIds.includes(caseId)) caseIds.push(caseId);
        return { ...u, assignedCaseIds: caseIds };
    }));
    hasUserMutatedState.current = true;
    appendAuditLog('MODIFICACION_ROL_CUENTA', 'case_assignments', caseId, `Asignación actualizada para ${caseId}`);
  };

  const handleQuickAssignPsychologist = (caseId: string, psychologistId: string) => {
    handleAssignCaseResponsible(caseId, psychologistId, undefined);
  };

  const handleCreateConsultationAssessment = (payload: any) => {
    const config = INITIAL_INSTRUMENT_CONFIGS[payload.instrumentCode as InstrumentCode];
    const detResult = evaluateInstrumentDeterministically(payload.instrumentCode, config, payload.responses);
    const newAssessmentId = `ass-${Date.now()}`;
    const nowIso = new Date().toISOString();

    setAssessments((prev) => [{
      id: newAssessmentId, clinicalCaseId: payload.clinicalCaseId, studentId: payload.studentId, periodId: null as any,
      modality: AttentionModality.ATENCION_INDIVIDUAL, instrumentCode: payload.instrumentCode, instrumentVersionId: config.id,
      versionTag: config.versionTag, scoringRuleVersion: config.scoringRuleVersion, appliedAt: nowIso,
      status: detResult.isComplete ? (payload.professionalInterpretation.trim() ? AssessmentStatus.REVISADO_PROFESIONAL : AssessmentStatus.CALIFICADO) : detResult.status,
      completionPercentage: Math.round((detResult.answeredCount / detResult.expectedCount) * 100), responses: payload.responses,
      totalScore: detResult.totalScore, psychometricCategory: detResult.psychometricCategory, suggestedPriority: detResult.suggestedPriority,
      calculatedByProcess: detResult.calculatedByProcess, applicationContextNote: payload.applicationContextNote,
      professionalInterpretation: payload.professionalInterpretation || null, reviewedByPsychologistId: detResult.isComplete ? currentUser.id : null,
      reviewedByPsychologistName: detResult.isComplete ? currentUser.fullName : null, reviewedAt: detResult.isComplete ? nowIso : null,
    }, ...prev]);

    setCases((prev) => prev.map((c) => {
        if (c.id !== payload.clinicalCaseId) return c;
        const updatedCase = { ...c, updatedAt: nowIso };
        if (detResult.isComplete && detResult.totalScore !== null) {
          if (payload.instrumentCode === InstrumentCode.BAI) updatedCase.anxietyIndicator = { lastAssessmentId: newAssessmentId, instrumentVersion: config.versionTag, score: detResult.totalScore, category: detResult.psychometricCategory, evaluatedAt: nowIso.slice(0, 10) };
          else updatedCase.depressionIndicator = { lastAssessmentId: newAssessmentId, instrumentVersion: config.versionTag, score: detResult.totalScore, category: detResult.psychometricCategory, evaluatedAt: nowIso.slice(0, 10) };
          if (detResult.suggestedPriority) { updatedCase.psychometricSuggestedPriority = detResult.suggestedPriority; if (detResult.suggestedPriority === PriorityLevel.ROJO) updatedCase.operationalPriority = PriorityLevel.ROJO; }
          updatedCase.lastEvaluationDate = nowIso.slice(0, 10);
        }
        updatedCase.nextFollowUpAction = payload.nextFollowUpAction; updatedCase.nextFollowUpDate = payload.nextFollowUpDate;
        return updatedCase;
    }));
    appendAuditLog('CALIFICACION_DETERMINISTA', 'assessments', newAssessmentId, `Aplicación de ${payload.instrumentCode} en ${payload.clinicalCaseId}`);
  };

  const handleRegisterSession = (payload: any) => {
    const intern = users.find((u) => u.id === payload.participatingInternId);
    const nowIso = new Date().toISOString();
    setSessions((prev) => [{
      id: `ses-${Date.now()}`, clinicalCaseId: payload.clinicalCaseId, studentId: payload.studentId, sessionDate: nowIso,
      responsiblePsychologistId: currentUser.id, responsiblePsychologistName: currentUser.fullName,
      participatingInternId: intern ? intern.id : null, participatingInternName: intern ? intern.fullName : null,
      attentionMotive: payload.attentionMotive, clinicalNotes: payload.clinicalNotes, professionalObservations: payload.professionalObservations,
      agreements: payload.agreements, nextAction: payload.nextAction, nextFollowUpDate: payload.nextFollowUpDate, activityStatus: 'REALIZADA', createdAt: nowIso,
    }, ...prev]);
    setCases((prev) => prev.map((c) => c.id === payload.clinicalCaseId ? { ...c, followUpState: CaseFollowUpState.EN_ATENCION, nextFollowUpAction: payload.nextAction, nextFollowUpDate: payload.nextFollowUpDate, updatedAt: nowIso } : c));
    appendAuditLog('REGISTRO_SESION', 'psychology_sessions', `ses-${Date.now()}`, `Sesión registrada en ${payload.clinicalCaseId}`);
  };

  const handleManualPriorityElevation = (payload: any) => {
    const nowIso = new Date().toISOString();
    setCases((prev) => prev.map((c) => {
        if (c.id !== payload.clinicalCaseId) return c;
        return {
          ...c, operationalPriority: payload.newPriority, urgentRiskIdentifiedByProfessional: payload.urgentProtocolTriggered, urgentProtocolActive: payload.urgentProtocolTriggered,
          priorityOverrideReason: payload.justification, priorityUpdatedBy: currentUser.fullName, priorityUpdatedAt: nowIso, followUpState: payload.nextFollowUpState,
          priorityHistory: [{ id: `ph-${Date.now()}`, clinicalCaseId: c.id, changedAt: nowIso, changedByUserId: currentUser.id, changedByUserName: currentUser.fullName, previousPriority: c.operationalPriority, newPriority: payload.newPriority, isManualOverride: true, isUrgentProtocolTriggered: payload.urgentProtocolTriggered, justification: payload.justification, institutionalActionTaken: payload.institutionalActionTaken, notifiedProfessionalName: users.find((u) => u.role === RoleCode.RESPONSABLE_PSICOLOGIA)?.fullName ?? 'Responsable', acknowledgedAt: nowIso }, ...c.priorityHistory], updatedAt: nowIso,
        };
    }));
    appendAuditLog(payload.urgentProtocolTriggered ? 'ACTIVACION_PROTOCOLO_URGENTE' : 'CAMBIO_PRIORIDAD_MANUAL', 'clinical_cases', payload.clinicalCaseId, payload.justification);
  };

  const handleEmitTutorAlert = (payload: any) => {
    const stu = students.find((s) => s.id === payload.studentId);
    if (!stu) return;
    setTutorAlerts((prev) => [{
      id: `alrt-tut-${Date.now()}`, clinicalCaseId: payload.clinicalCaseId, studentId: stu.id, studentMatricula: stu.matricula, studentFullName: stu.fullName, studentProgram: stu.programName, studentSemester: stu.semester, studentGroup: stu.group, authorizedByPsychologistId: currentUser.id, authorizedByPsychologistName: currentUser.fullName, assignedTutorId: users.find((u) => u.role === RoleCode.TUTOR_ACADEMICO)?.id ?? '', assignedTutorName: users.find((u) => u.role === RoleCode.TUTOR_ACADEMICO)?.fullName ?? 'Sin tutor', createdAt: new Date().toISOString(), requiresAcademicAccompaniment: true, generalAcademicRecommendations: payload.generalRecommendations, authorizedTutorActions: payload.authorizedActions, tutorRegisteredActions: [], status: 'ACTIVA',
    }, ...prev]);
    appendAuditLog('ALERTA_TUTORIA_AUTORIZADA', 'academic_support_alerts', `alrt-${Date.now()}`, `Alerta emitida para ${stu.matricula}`);
  };

  const handleRegisterStudentAndSingleCase = (payload: any): any => {
    const existingStudent = students.find((s) => s.matricula.toLowerCase() === payload.matricula.toLowerCase() || s.institutionalEmail.toLowerCase() === payload.institutionalEmail.toLowerCase());
    if (existingStudent) {
      const existingCase = cases.find((c) => c.studentId === existingStudent.id)!;
      return { status: 'EXISTING_RECOVERED', caseId: existingCase.id, message: `Alumno ${existingStudent.fullName} ya cuenta con Expediente ${existingCase.id.toUpperCase()}.` };
    }
    const prog = programs.find((p) => p.id === payload.programId) || programs[0] || ITD_ACADEMIC_PROGRAMS[0];
    const newStudentId = `stu-${String(students.length + 1).padStart(3, '0')}`;
    const newCaseId = `exp-itd-${String(cases.length + 1).padStart(3, '0')}`;
    const nowIso = new Date().toISOString();

    setStudents((prev) => [{ id: newStudentId, matricula: payload.matricula, fullName: payload.fullName, institutionalEmail: payload.institutionalEmail, programId: prog.id, programName: prog.name, academicDepartment: prog.academicDepartment, semester: payload.semester, group: payload.group, entryGeneration: payload.entryGeneration, registrationStatus: 'ACTIVO', incorporatedAt: nowIso, entryModality: payload.entryModality }, ...prev]);
    setCases((prev) => [{ id: newCaseId, studentId: newStudentId, openedAt: nowIso, updatedAt: nowIso, modalityOrigin: payload.entryModality, anxietyIndicator: { lastAssessmentId: null, instrumentVersion: null, score: null, category: null, evaluatedAt: null }, depressionIndicator: { lastAssessmentId: null, instrumentVersion: null, score: null, category: null, evaluatedAt: null }, psychometricSuggestedPriority: PriorityLevel.VERDE, operationalPriority: PriorityLevel.VERDE, urgentRiskIdentifiedByProfessional: false, urgentProtocolActive: false, priorityOverrideReason: null, priorityUpdatedBy: null, priorityUpdatedAt: null, assignedPsychologistId: currentUser.role === RoleCode.PSICOLOGO ? currentUser.id : null, assignedPsychologistName: currentUser.role === RoleCode.PSICOLOGO ? currentUser.fullName : null, assignedInternId: null, assignedInternName: null, followUpState: currentUser.role === RoleCode.PSICOLOGO ? CaseFollowUpState.PENDIENTE_CONTACTO : CaseFollowUpState.SIN_ASIGNAR, lastEvaluationDate: null, nextFollowUpAction: 'Realizar primera entrevista', nextFollowUpDate: nowIso.slice(0, 10), generalClinicalSummary: 'Expediente recién aperturado.', referrals: [], priorityHistory: [] }, ...prev]);
    setUsers((prev) => prev.map((u) => u.role === RoleCode.RESPONSABLE_PSICOLOGIA || (currentUser.role === RoleCode.PSICOLOGO && u.id === currentUser.id) ? { ...u, assignedCaseIds: [...u.assignedCaseIds, newCaseId] } : u));
    return { status: 'CREATED', caseId: newCaseId, message: `Estudiante registrado y vinculado a Expediente ${newCaseId.toUpperCase()}.` };
  };

  const handleCompleteFollowUpTask = (taskId: string, outcomeNote: string, nextDate: string) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return;
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: 'COMPLETADA', completedAt: new Date().toISOString(), outcomeNote } : t));
    setCases((prev) => prev.map((c) => c.id === targetTask.clinicalCaseId ? { ...c, followUpState: CaseFollowUpState.EN_ATENCION, nextFollowUpAction: outcomeNote, nextFollowUpDate: nextDate } : c));
  };

  const handleRegisterTutorAction = (alertId: string, actionSummary: string) => {
    setTutorAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, status: 'EN_SEGUIMIENTO_TUTORIAL', tutorRegisteredActions: [...a.tutorRegisteredActions, { id: `tact-${Date.now()}`, registeredAt: new Date().toISOString(), tutorName: currentUser.fullName, actionSummary, activityState: 'COMPLETADA' }] } : a));
  };

  const handleCreateUserProfile = async (payload: any) => {
    if (!supabase) return;
    const { error } = await supabase.rpc('create_staff_profile', { p_email: payload.email.trim().toLowerCase(), p_full_name: payload.fullName.trim(), p_role: payload.role, p_supervisor_id: payload.role === RoleCode.PRACTICANTE ? payload.supervisorId || (currentUser.role === RoleCode.PSICOLOGO ? currentUser.id : null) : null, p_license: payload.professionalLicense || null });
    if (error) { window.alert(`No se pudo dar de alta: ${error.message}`); return; }
    await loadDirectory(); appendAuditLog('MODIFICACION_ROL_CUENTA', 'profiles', payload.email, `Alta autorizada`);
  };

  const handleUpdateUserAccountStatus = async (targetUserId: string, newStatus: AccountStatus) => {
    if (targetUserId === currentUser.id || !supabase) return;
    const { error } = await supabase.rpc('admin_set_account_status', { p_profile: targetUserId, p_status: newStatus });
    if (error) { window.alert(`No se pudo cambiar estado: ${error.message}`); return; }
    setUsers((prev) => prev.map((u) => (u.id === targetUserId ? { ...u, status: newStatus } : u)));
    appendAuditLog('MODIFICACION_ROL_CUENTA', 'profiles', targetUserId, `Cambio de estado a ${newStatus}`);
  };

  const handleDeleteUser = async (targetUserId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    if (targetUserId === currentUser.id) throw new Error('No puedes eliminar tu propia cuenta.');
    const target = users.find((u) => u.id === targetUserId);
    const { error } = await supabase.rpc('admin_delete_user', { p_profile_id: targetUserId });
    if (error) throw new Error(error.message || 'No se pudo eliminar la cuenta.');
    setUsers((prev) => prev.map((u) => (
      u.id === targetUserId
        ? { ...u, status: AccountStatus.REVOCADA, hasAuthAccount: false }
        : u
    )));
    appendAuditLog('MODIFICACION_ROL_CUENTA', 'profiles', targetUserId, `Cuenta dada de baja (historial conservado): ${target?.email ?? targetUserId}`);
    await loadDirectory();
  };

  const handleStudentSubmitSelfAssessment = () => {};

  const authorizedCases = React.useMemo(() => filterCasesForUser(currentUser, cases, users), [currentUser, cases, users]);
  const authorizedStudents = React.useMemo(() => filterStudentsForUser(currentUser, students, authorizedCases), [currentUser, students, authorizedCases]);
  const selectedClinicalCase = authorizedCases.find((c) => c.id === selectedCaseId) || authorizedCases[0];
  const selectedStudent = students.find((s) => s.id === selectedClinicalCase?.studentId);

  // El registro del alumno lo crea el servidor al iniciar sesión (sync_my_authorization).
  const currentStudent = React.useMemo(() => {
    if (currentUser.linkedStudentId) {
      const found = students.find((s) => s.id === currentUser.linkedStudentId);
      if (found) return found;
    }
    const email = currentUser.email.toLowerCase().trim();
    return students.find((s) => s.institutionalEmail.toLowerCase().trim() === email);
  }, [currentUser, students]);

  const currentStudentCase = React.useMemo(() => cases.find((c) => c.studentId === currentStudent?.id), [cases, currentStudent]);
  const simulationStudent = students[0] || null;
  const simulationStudentCase = cases.find((c) => c.studentId === simulationStudent?.id) || null;

  useEffect(() => {
    if (currentUser.role === RoleCode.ESTUDIANTE && activeView !== 'EVALUACIONES') setActiveView('EVALUACIONES');
  }, [currentUser.role, activeView]);

  const allSidebarItems = [
    { id: 'PANEL_PRINCIPAL', label: 'Panel Principal y Semáforo', icon: LayoutDashboard },
    { id: 'EXPEDIENTE_UNICO', label: 'Expediente Psicológico Único', icon: FolderKanban },
    { id: 'ESTUDIANTES', label: 'Padrón de Estudiantes', icon: GraduationCap },
    { id: 'EVALUACIONES', label: 'Evaluaciones (BAI y BDI)', icon: ClipboardCheck },
    { id: 'SEGUIMIENTO', label: 'Módulo de Seguimiento', icon: Activity },
    { id: 'USUARIOS', label: 'Usuarios y Accesos', icon: UserCog },
    { id: 'REPORTES', label: 'Reportes e Impresión', icon: FileBarChart2 },
  ] as const;

  const sidebarItems = currentUser.role === RoleCode.ESTUDIANTE ? [{ id: 'EVALUACIONES' as PrimaryView, label: 'Mis Datos y Cuestionarios', icon: ClipboardCheck }] : allSidebarItems;
  const currentViewLabel = sidebarItems.find((i) => i.id === activeView)?.label || (currentUser.role === RoleCode.ESTUDIANTE ? 'Portal del Estudiante' : 'Panel Principal');
  const isStudentView = currentUser.role === RoleCode.ESTUDIANTE || viewAsStudentMode;

  if (isStudentView) {
    const targetStudent = currentUser.role === RoleCode.ESTUDIANTE ? currentStudent : simulationStudent;
    const targetCase = currentUser.role === RoleCode.ESTUDIANTE ? currentStudentCase : simulationStudentCase;
    if (dataLoading || !targetStudent) {
      return (
        <div className="p-10 text-center flex flex-col items-center justify-center min-h-[50vh]">
          {dataLoading && <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4A6B53] mb-4"></div>}
          <p className="text-[#4A6B53] font-bold">
            {dataLoading
              ? 'Sincronizando tus datos...'
              : viewAsStudentMode
                ? 'No hay un alumno de ejemplo disponible para la vista previa.'
                : 'No encontramos tu registro de alumno.'}
          </p>
          {dataError && <p className="text-xs text-rose-700 mt-2 max-w-md">{dataError}</p>}
          {!dataLoading && !viewAsStudentMode && (
            <p className="text-xs text-gray-500 mt-2">Cierra sesión y vuelve a entrar. Si el problema continúa, avisa al administrador.</p>
          )}
          {viewAsStudentMode ? (
            <button onClick={() => setViewAsStudentMode(false)} className="mt-4 px-4 py-2 bg-white border border-[#E8E2D5] rounded-lg text-sm text-[#4A6B53] font-bold hover:bg-gray-50">
              Volver al Panel de Administrador
            </button>
          ) : (
            <button onClick={onSignOut} className="mt-4 px-4 py-2 bg-white border border-[#E8E2D5] rounded-lg text-sm text-[#4A6B53] font-bold hover:bg-gray-50">
              Cerrar Sesión
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-[#FDFBF7]">
        {viewAsStudentMode && (
          <div className="bg-amber-100 p-3 text-center text-amber-900 text-xs font-bold border-b border-amber-300">
            Estás viendo la pantalla como Alumno (vista previa: no se guarda nada). <button onClick={() => setViewAsStudentMode(false)} className="ml-2 underline hover:text-amber-950">Volver al Panel de Administrador</button>
          </div>
        )}
        <main className="p-2 sm:p-6 max-w-[1440px] mx-auto">
          <StudentPortalView
            key={targetStudent.id}
            currentUser={currentUser} student={targetStudent} clinicalCase={targetCase ?? undefined}
            programs={programs}
            assessments={assessments.filter((a) => a.studentId === targetStudent.id)}
            consultationStatus={consultationStatus}
            onRequestConsultation={async (note) => {
              if (viewAsStudentMode) throw new Error('Vista previa: no se envía la solicitud.');
              await handleRequestConsultation(note);
            }}
            onUpdateStudentRecord={async (updated) => {
              if (viewAsStudentMode) throw new Error('Vista previa: no se guardan cambios.');
              await persistStudentRecord(updated);
              setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            }}
            onSubmitAssessment={async (instrumentCode, responses) => {
              if (!supabase) throw new Error('Supabase no está configurado.');
              if (viewAsStudentMode) throw new Error('Vista previa: no se guardan cuestionarios.');
              const { error } = await supabase.rpc('submit_my_assessment', {
                p_instrument: instrumentCode,
                p_responses: responses,
              });
              if (error) throw new Error(error.message || 'No se pudo guardar el cuestionario.');
              await loadMyAssessments();
              await loadMyConsultation();
            }}
            onSubmitColumbia={async (responses) => {
              if (!supabase) throw new Error('Supabase no está configurado.');
              if (viewAsStudentMode) throw new Error('Vista previa: no se guardan cuestionarios.');
              const { error } = await supabase.rpc('submit_my_columbia', { p_responses: responses });
              if (error) throw new Error(error.message || 'No se pudo guardar el cuestionario.');
              await loadMyAssessments();
              await loadMyConsultation();
            }}
            onLogoutOrSwitchRole={onSignOut}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#FDFBF7] text-[#3B4A3F]">
      <aside className="hidden lg:flex flex-col w-64 bg-[#F4F0E6] text-[#3B4A3F] justify-between border-r border-[#E8E2D5] no-print shrink-0">
        <div>
          <div className="px-5 py-5 border-b border-[#E8E2D5] bg-[#A3C9A8]">
            <div className="text-base font-bold tracking-tight text-[#2F3E32] font-display">SIAPE-ITD</div>
            <div className="text-[11px] text-[#4A6B53] mt-0.5 font-medium">Oficina de Psicología</div>
          </div>
          <nav className="p-3 space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button key={item.id} onClick={() => setActiveView(item.id)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${isActive ? 'bg-[#A3C9A8] text-[#2F3E32] font-bold shadow-sm' : 'text-[#4A6B53] hover:bg-[#E8E2D5] hover:text-[#2F3E32]'}`}>
                  <Icon className="w-4 h-4 shrink-0" /><span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="p-4 border-t border-[#E8E2D5] text-[11px] text-[#4A6B53]">
          <div className="font-semibold text-[#2F3E32] flex items-center gap-1.5 mb-2"><ShieldCheck className="w-3.5 h-3.5" /> Supabase (Conectado)</div>
          <div className="font-mono text-[10px] text-[#4A6B53]/80">Versión {APP_VERSION}</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-[#E8E2D5] px-4 md:px-6 py-3.5 flex items-center justify-between gap-4 no-print">
          <div className="text-sm font-bold text-[#2F3E32] truncate">
            SIAPE-ITD <span className="text-[#A3C9A8] mx-1.5">/</span> <span className="text-[#4A6B53]">{currentViewLabel}</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3 text-xs">
            {currentUser.role === RoleCode.ADMINISTRADOR && (
              <button onClick={() => setViewAsStudentMode(true)} className="px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 bg-[#F4F0E6] text-[#4A6B53] border border-[#E8E2D5] hover:bg-[#E8E2D5]">
                <Eye className="w-3.5 h-3.5" /> Ver como Alumno
              </button>
            )}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E8E2D5] bg-[#FDFBF7]">
              {currentUser.role === RoleCode.ADMINISTRADOR && <span className="font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded-md text-[11px]">👑 Superadmin</span>}
              <span className="font-medium text-[#2F3E32] truncate max-w-[150px] md:max-w-[260px]">{currentUser.fullName}</span>
            </div>
            <button onClick={onSignOut} className="px-3 py-1.5 bg-white border border-[#E8E2D5] hover:bg-[#F4F0E6] text-[#4A6B53] font-bold rounded-xl flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" /><span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-[1440px] w-full mx-auto bg-[#FDFBF7]">
          {dataLoading ? (<div className="p-6 text-sm text-[#4A6B53]">Cargando información…</div>) : dataError ? (<div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-900">{dataError}</div>) : (
            <>
              {activeView === 'PANEL_PRINCIPAL' && (
                <DashboardView currentUser={currentUser} students={authorizedStudents} cases={authorizedCases} assessments={assessments} tasks={tasks} programs={programs} psychologists={users.filter((u) => u.role === RoleCode.PSICOLOGO && u.status === AccountStatus.ACTIVA)} allUsers={users} onOpenClinicalCase={handleOpenClinicalCase} onClaimCase={handleClaimCase} onQuickAssignPsychologist={(caseId, psychId) => handleAssignCaseResponsible(caseId, psychId, null)} onNavigateModule={(modKey) => setActiveView(modKey as PrimaryView)} />
              )}
              {activeView === 'EXPEDIENTE_UNICO' && (!selectedClinicalCase || !selectedStudent ? (<div className="p-6 text-sm text-[#4A6B53] bg-white border border-[#E8E2D5] rounded-xl">Aún no hay expedientes disponibles.</div>) : (
                <ClinicalRecordView currentUser={currentUser} clinicalCase={selectedClinicalCase} student={selectedStudent} assessments={assessments} sessions={sessions} tasks={tasks} auditLogs={auditLogs} instrumentConfigs={INITIAL_INSTRUMENT_CONFIGS} psychologists={users.filter((u) => u.role === RoleCode.PSICOLOGO && u.status === AccountStatus.ACTIVA)} interns={users.filter((u) => u.role === RoleCode.PRACTICANTE && u.status === AccountStatus.ACTIVA)} onBack={() => setActiveView('PANEL_PRINCIPAL')} onCreateConsultationAssessment={handleCreateConsultationAssessment} onRegisterSession={handleRegisterSession} onManualPriorityElevation={handleManualPriorityElevation} onEmitTutorAlert={handleEmitTutorAlert} />
              ))}
              {(activeView === 'ESTUDIANTES' || activeView === 'EVALUACIONES' || activeView === 'SEGUIMIENTO' || activeView === 'USUARIOS' || activeView === 'REPORTES') && (
                <ModulesView activeModule={activeView as ActiveModuleKey} currentUser={currentUser} users={users} students={authorizedStudents} cases={authorizedCases} assessments={assessments} tasks={tasks} tutorAlerts={tutorAlerts} auditLogs={auditLogs} periods={EVALUATION_PERIODS} programs={programs} instrumentConfigs={INITIAL_INSTRUMENT_CONFIGS} onOpenClinicalCase={handleOpenClinicalCase} onRegisterStudentAndSingleCase={handleRegisterStudentAndSingleCase} onCompleteFollowUpTask={handleCompleteFollowUpTask} onAssignCaseResponsible={handleAssignCaseResponsible} onRegisterTutorAction={handleRegisterTutorAction} onCreateUserProfile={handleCreateUserProfile} onUpdateUserAccountStatus={handleUpdateUserAccountStatus} onDeleteUser={handleDeleteUser} onLogReportExport={(repName, fmt, filters) => appendAuditLog('EXPORTACION_REPORTE', 'reports', repName, `Exportación ${fmt}`)} onStudentSubmitSelfAssessment={handleStudentSubmitSelfAssessment} onCreateConsultationAssessment={handleCreateConsultationAssessment} />
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