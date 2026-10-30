/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Activity, BookOpen, ClipboardCheck, Eye, FileBarChart2, FolderKanban,
  GraduationCap, LayoutDashboard, Lock, ShieldCheck, UserCog, X,
} from 'lucide-react';
import {
  AcademicSupportAlert, AccountStatus, AssessmentRecord, AssessmentStatus,
  AttentionModality, AuditLogEntry, CaseFollowUpState, ClinicalCaseRecord,
  EvaluationPeriod, FollowUpTask, InstrumentCode, PriorityLevel,
  PsychologySession, RoleCode, StudentRecord, UserProfile,
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

type PrimaryView = 'ARQUITECTURA_ENTREGA_1' | 'PANEL_PRINCIPAL' | 'EXPEDIENTE_UNICO' | 'ESTUDIANTES' | 'EVALUACIONES' | 'SEGUIMIENTO' | 'TUTORIAS' | 'USUARIOS' | 'REPORTES';
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
      const [profilesRes, studentsRes, casesRes, assignmentsRes] = await Promise.all([
        supabase.from('profiles').select(PROFILE_SELECT),
        supabase.from('students').select('*'),
        supabase.from('clinical_cases').select('*'),
        supabase.from('case_assignments').select('clinical_case_id, assigned_user_id, assignment_role, is_active'),
      ]);
      if (profilesRes.error || studentsRes.error) throw profilesRes.error || studentsRes.error;

      const profiles = (profilesRes.data ?? []).map(mapProfileRow);
      const profileById = new Map(profiles.map((p) => [p.id, p]));
      const activeAssignments = new Map<string, any[]>();
      (assignmentsRes.data ?? []).filter((x: any) => x.is_active).forEach((x: any) => {
        const list = activeAssignments.get(x.clinical_case_id) ?? [];
        list.push(x);
        activeAssignments.set(x.clinical_case_id, list);
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
        } as ClinicalCaseRecord;
      });

      const mappedStudents: StudentRecord[] = (studentsRes.data ?? []).map((s: any) => ({
        id: s.id, matricula: s.matricula, fullName: s.full_name, institutionalEmail: s.institutional_email,
        programId: s.academic_program_id ?? '', programName: s.program_name ?? 'Sin asignar', academicDepartment: s.academic_department ?? '',
        semester: s.semester ?? 0, group: s.group_code ?? '', entryGeneration: s.entry_generation ?? '',
        registrationStatus: s.registration_status, incorporatedAt: s.incorporated_at, entryModality: s.entry_modality,
        gender: s.gender ?? undefined, age: s.age ?? undefined, birthDate: s.birth_date ?? undefined,
        currentAddress: s.current_address ?? undefined, phone: s.phone ?? undefined, maritalStatus: s.marital_status ?? undefined,
        originCity: s.origin_city ?? undefined, 
        emergencyContact: s.emergency_contact ?? undefined, // <--- AGREGADO
      }) as StudentRecord);

      const users2 = profiles.map((u) => ({
        ...u, supervisorName: u.supervisorId ? profileById.get(u.supervisorId)?.fullName ?? null : null,
        assignedCaseIds: mappedCases.filter((c) => c.assignedPsychologistId === u.id || c.assignedInternId === u.id).map((c) => c.id),
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

       const persistStudentRecord = async (s: StudentRecord): Promise<boolean> => {
        if (!supabase) return false;
    
        let formattedBirthDate = null;
        if (s.birthDate) {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s.birthDate)) {
        const [day, month, year] = s.birthDate.split('/');
        formattedBirthDate = `${year}-${month}-${day}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(s.birthDate)) {
        formattedBirthDate = s.birthDate;
      }
    }

    const patch: Record<string, unknown> = {
      full_name: s.fullName,
      matricula: s.matricula,
      institutional_email: s.institutionalEmail,
      program_name: s.programName || 'Sin asignar',
      semester: s.semester > 0 ? s.semester : null,
      group_code: s.group || null,
      gender: s.gender ?? null, 
      age: s.age ?? null, 
      phone: s.phone ?? null,
      current_address: s.currentAddress ?? null, 
      origin_city: s.originCity ?? null,
      emergency_contact: s.emergencyContact ?? null,
    };
    if (formattedBirthDate) patch.birth_date = formattedBirthDate;

    const { data, error } = await supabase.from('students').update(patch).eq('id', s.id).select('id');
    
    if (error || !data?.length) {
      console.error("Error al guardar ficha:", error);
      throw new Error(error?.message || 'No se pudo guardar en la base de datos');
    }
    return true;
  };

  const appendAuditLog = (actionType: AuditLogEntry['actionType'], targetResource: string, targetId: string, details: string) => {
    hasUserMutatedState.current = true;
    setAuditLogs((prev) => [{
      id: `aud-${Date.now()}`, timestamp: new Date().toISOString(), actorUserId: currentUser.id,
      actorName: currentUser.fullName, actorRole: currentUser.role, actionType, targetResource, targetId, details,
      ipSimulated: 'No registrada',
    }, ...prev]);
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

   const handleCreateConsultationAssessment = async (payload: any) => {
    const config = INITIAL_INSTRUMENT_CONFIGS[payload.instrumentCode];
    const detResult = evaluateInstrumentDeterministically(payload.instrumentCode, config, payload.responses);
    const newAssessmentId = crypto.randomUUID(); // Genera un ID válido
    const nowIso = new Date().toISOString();

    // 1. GUARDAR EN SUPABASE
    const { error } = await supabase.from('assessments').insert({
      id: newAssessmentId,
      clinical_case_id: payload.clinicalCaseId,
      student_id: payload.studentId,
      instrument_code: payload.instrumentCode,
      applied_at: nowIso,
      status: detResult.isComplete ? 'CALIFICADO' : 'INCOMPLETO',
      responses: payload.responses,
      total_score: detResult.totalScore,
      psychometric_category: detResult.psychometricCategory,
      // ... otros campos requeridos por tu tabla
    });

    if (error) {
      console.error("Error guardando evaluación:", error);
      alert("No se pudo guardar la evaluación. Revisa tu conexión.");
      return;
    }

    // 2. ACTUALIZAR EL ESTADO LOCAL (para que se vea reflejado)
    setAssessments((prev) => [{
      id: newAssessmentId, clinicalCaseId: payload.clinicalCaseId, studentId: payload.studentId, 
      instrumentCode: payload.instrumentCode, appliedAt: nowIso,
      status: detResult.isComplete ? AssessmentStatus.CALIFICADO : AssessmentStatus.INCOMPLETO,
      responses: payload.responses, totalScore: detResult.totalScore, 
      psychometricCategory: detResult.psychometricCategory,
    } as any, ...prev]);

    // (El resto de tu lógica para actualizar los casos clínicos se mantiene igual)
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
    const prog = ITD_ACADEMIC_PROGRAMS.find((p) => p.id === payload.programId) || ITD_ACADEMIC_PROGRAMS[0];
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

  const handleStudentSubmitSelfAssessment = () => {};

  const authorizedCases = React.useMemo(() => filterCasesForUser(currentUser, cases, users), [currentUser, cases, users]);
  const authorizedStudents = React.useMemo(() => filterStudentsForUser(currentUser, students, authorizedCases), [currentUser, students, authorizedCases]);
  const selectedClinicalCase = authorizedCases.find((c) => c.id === selectedCaseId) || authorizedCases[0];
  const selectedStudent = students.find((s) => s.id === selectedClinicalCase?.studentId);

    const currentStudent = React.useMemo(() => {
     // 1. Intentar por ID vinculado (si el contexto ya lo cargó)
       if (currentUser.linkedStudentId) {
         const found = students.find((s) => s.id === currentUser.linkedStudentId);
         if (found) return found;
       }

    // 2. Intentar por correo electrónico (la forma más segura para alumnos nuevos)
    const email = currentUser.email.toLowerCase().trim();
    const foundByEmail = students.find(
      (s) => s.institutionalEmail.toLowerCase().trim() === email
    );
    if (foundByEmail) return foundByEmail;

    // 3. Si es un alumno recién creado y aún no se ha recargado la lista de students,
    // creamos un registro temporal en memoria para que la vista no se quede en blanco.
    if (currentUser.role === RoleCode.ESTUDIANTE) {
      return {
        id: 'temp-student-id',
        matricula: 'PENDIENTE',
        fullName: currentUser.fullName,
        institutionalEmail: currentUser.email,
        programName: 'Sin asignar',
        semester: 0,
        group: '',
        entryGeneration: '',
        registrationStatus: 'ACTIVO',
        incorporatedAt: new Date().toISOString(),
        entryModality: AttentionModality.NUEVO_INGRESO,
        academicDepartment: '',
        programId: '',
      } as StudentRecord;
    }

    return undefined;
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
    { id: 'TUTORIAS', label: 'Tutorías Académicas', icon: BookOpen },
    { id: 'USUARIOS', label: 'Usuarios y Accesos', icon: UserCog },
    { id: 'REPORTES', label: 'Reportes e Impresión', icon: FileBarChart2 },
  ] as const;

  const sidebarItems = currentUser.role === RoleCode.ESTUDIANTE ? [{ id: 'EVALUACIONES' as PrimaryView, label: 'Mis Datos y Cuestionarios', icon: ClipboardCheck }] : allSidebarItems;
  const currentViewLabel = sidebarItems.find((i) => i.id === activeView)?.label || (currentUser.role === RoleCode.ESTUDIANTE ? 'Portal del Estudiante' : 'Panel Principal');
  const isStudentView = currentUser.role === RoleCode.ESTUDIANTE || viewAsStudentMode;

  if (isStudentView) {
    const targetStudent = currentUser.role === RoleCode.ESTUDIANTE ? currentStudent : simulationStudent;
    const targetCase = currentUser.role === RoleCode.ESTUDIANTE ? currentStudentCase : simulationStudentCase;
        if (!targetStudent) {
      return (
        <div className="p-10 text-center flex flex-col items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4A6B53] mb-4"></div>
          <p className="text-[#4A6B53] font-bold">Sincronizando tus datos...</p>
          <p className="text-xs text-gray-500 mt-2">Si este mensaje no desaparece en 10 segundos, cierra sesión y vuelve a entrar.</p>
          <button onClick={onSignOut} className="mt-4 px-4 py-2 bg-white border border-[#E8E2D5] rounded-lg text-sm text-[#4A6B53] font-bold hover:bg-gray-50">
            Cerrar Sesión
          </button>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-[#FDFBF7]">
        {viewAsStudentMode && (
          <div className="bg-amber-100 p-3 text-center text-amber-900 text-xs font-bold border-b border-amber-300">
            Estás viendo la pantalla como Alumno. <button onClick={() => setViewAsStudentMode(false)} className="ml-2 underline hover:text-amber-950">Volver al Panel de Administrador</button>
          </div>
        )}
        <main className="p-2 sm:p-6 max-w-[1440px] mx-auto">
          <StudentPortalView
            currentUser={currentUser} student={targetStudent} clinicalCase={targetCase}
            assessments={assessments.filter((a) => a.studentId === targetStudent.id)}
            onUpdateStudentRecord={async (updated) => {
              if (!(await persistStudentRecord(updated))) return;
              setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            }}
            onSubmitAssessment={(instrumentCode, responses) => {
  // Si no hay expediente, creamos un ID temporal para no romper el flujo
  const caseId = targetCase ? targetCase.id : `temp-case-${targetStudent.id}`;
  
  handleCreateConsultationAssessment({
    clinicalCaseId: caseId,
    studentId: targetStudent.id,
    instrumentCode,
    applicationContextNote: `Cuestionario autoadministrado`,
    responses,
    professionalInterpretation: '',
    overridePriority: null,
    overrideReason: '',
    nextFollowUpAction: 'Revisión inicial',
    nextFollowUpDate: new Date().toISOString().slice(0, 10),
  });
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
              <span className="font-medium text-[#2F3E32] truncate max-w-[150px]">{currentUser.fullName}</span>
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
                <DashboardView currentUser={currentUser} students={authorizedStudents} cases={authorizedCases} assessments={assessments} tasks={tasks} programs={ITD_ACADEMIC_PROGRAMS} psychologists={users.filter((u) => u.role === RoleCode.PSICOLOGO)} allUsers={users} onOpenClinicalCase={handleOpenClinicalCase} onQuickAssignPsychologist={(caseId, psychId) => handleAssignCaseResponsible(caseId, psychId, null)} onNavigateModule={(modKey) => setActiveView(modKey as PrimaryView)} />
              )}
              {activeView === 'EXPEDIENTE_UNICO' && (!selectedClinicalCase || !selectedStudent ? (<div className="p-6 text-sm text-[#4A6B53] bg-white border border-[#E8E2D5] rounded-xl">Aún no hay expedientes disponibles.</div>) : (
                <ClinicalRecordView currentUser={currentUser} clinicalCase={selectedClinicalCase} student={selectedStudent} assessments={assessments} sessions={sessions} tasks={tasks} auditLogs={auditLogs} instrumentConfigs={INITIAL_INSTRUMENT_CONFIGS} psychologists={users.filter((u) => u.role === RoleCode.PSICOLOGO)} interns={users.filter((u) => u.role === RoleCode.PRACTICANTE)} onBack={() => setActiveView('PANEL_PRINCIPAL')} onCreateConsultationAssessment={handleCreateConsultationAssessment} onRegisterSession={handleRegisterSession} onManualPriorityElevation={handleManualPriorityElevation} onEmitTutorAlert={handleEmitTutorAlert} />
              ))}
              {(activeView === 'ESTUDIANTES' || activeView === 'EVALUACIONES' || activeView === 'SEGUIMIENTO' || activeView === 'TUTORIAS' || activeView === 'USUARIOS' || activeView === 'REPORTES') && (
                <ModulesView activeModule={activeView as ActiveModuleKey} currentUser={currentUser} users={users} students={authorizedStudents} cases={authorizedCases} assessments={assessments} tasks={tasks} tutorAlerts={tutorAlerts} auditLogs={auditLogs} periods={EVALUATION_PERIODS} programs={ITD_ACADEMIC_PROGRAMS} instrumentConfigs={INITIAL_INSTRUMENT_CONFIGS} onOpenClinicalCase={handleOpenClinicalCase} onRegisterStudentAndSingleCase={handleRegisterStudentAndSingleCase} onCompleteFollowUpTask={handleCompleteFollowUpTask} onAssignCaseResponsible={handleAssignCaseResponsible} onRegisterTutorAction={handleRegisterTutorAction} onCreateUserProfile={handleCreateUserProfile} onUpdateUserAccountStatus={handleUpdateUserAccountStatus} onLogReportExport={(repName, fmt, filters) => appendAuditLog('EXPORTACION_REPORTE', 'reports', repName, `Exportación ${fmt}`)} onStudentSubmitSelfAssessment={handleStudentSubmitSelfAssessment} onCreateConsultationAssessment={handleCreateConsultationAssessment} />
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