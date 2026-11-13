import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileSpreadsheet,
  HeartHandshake,
  Search,
  ShieldAlert,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import {
  AcademicProgram,
  AssessmentRecord,
  AssessmentStatus,
  AttentionModality,
  CaseFollowUpState,
  ClinicalCaseRecord,
  FollowUpTask,
  PriorityLevel,
  RoleCode,
  StudentRecord,
  UserProfile,
} from '../types/siape';
import { checkRlsAccessPermission } from '../lib/scoringEngine';

const PRIORITY_RANK: Record<PriorityLevel, number> = {
  [PriorityLevel.VERDE]: 1,
  [PriorityLevel.AMARILLO]: 2,
  [PriorityLevel.ROJO]: 3,
};

const highestPriority = (...values: (PriorityLevel | null | undefined)[]): PriorityLevel => {
  const valid = values.filter((v): v is PriorityLevel => Boolean(v));
  if (valid.length === 0) return PriorityLevel.VERDE;
  return valid.sort((a, b) => PRIORITY_RANK[b] - PRIORITY_RANK[a])[0];
};

interface DashboardViewProps {
  currentUser: UserProfile;
  students: StudentRecord[];
  cases: ClinicalCaseRecord[];
  assessments: AssessmentRecord[];
  tasks: FollowUpTask[];
  programs: AcademicProgram[];
  psychologists: UserProfile[];
  allUsers?: UserProfile[];
  onOpenClinicalCase: (caseId: string) => void;
  onClaimCase?: (caseId: string) => Promise<void>;
  onReleaseCase?: (caseId: string, note?: string) => Promise<void>;
  onQuickAssignPsychologist: (caseId: string, psychologistId: string) => void;
  onNavigateModule: (moduleKey: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  students,
  cases,
  assessments,
  tasks,
  programs,
  psychologists,
  allUsers,
  onOpenClinicalCase,
  onClaimCase,
  onReleaseCase,
  onQuickAssignPsychologist,
  onNavigateModule,
}) => {
  const [priorityFilter, setPriorityFilter] = useState<'TODOS' | PriorityLevel>('TODOS');
  const [modalityFilter, setModalityFilter] = useState<'TODAS' | AttentionModality>('TODAS');
  const [programFilter, setProgramFilter] = useState<string>('TODAS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'PRIORITY' | 'MATRICULA' | 'LAST_EVAL'>('PRIORITY');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [claimingCaseId, setClaimingCaseId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const pageSize = 5;

  // App.tsx ya entrega únicamente los expedientes autorizados para este usuario
  // (incluidos los casos nuevos sin responsable, que el psicólogo debe poder tomar).
  const authorizedCases = cases;

  const completedAssessmentsCount = assessments.filter(
    (a) =>
      authorizedCases.some((c) => c.studentId === a.studentId) &&
      (a.status === AssessmentStatus.CALIFICADO ||
        a.status === AssessmentStatus.REVISADO_PROFESIONAL)
  ).length;

  const pendingOrIncompleteAssessmentsCount = assessments.filter(
    (a) =>
      authorizedCases.some((c) => c.studentId === a.studentId) &&
      (a.status === AssessmentStatus.INICIADO ||
        a.status === AssessmentStatus.INCOMPLETO ||
        a.status === AssessmentStatus.ENVIADO)
  ).length;

  const redCasesCount = authorizedCases.filter((c) => c.operationalPriority === PriorityLevel.ROJO).length;
  const yellowCasesCount = authorizedCases.filter(
    (c) => c.operationalPriority === PriorityLevel.AMARILLO
  ).length;
  const greenCasesCount = authorizedCases.filter((c) => c.operationalPriority === PriorityLevel.VERDE).length;

  const isUnassignedCase = (c: ClinicalCaseRecord) =>
    !c.assignedPsychologistId && !c.assignedInternId && !c.assignedPsychologistName && !c.assignedInternName;

  const unassignedCasesCount = authorizedCases.filter(isUnassignedCase).length;
  const unassignedPriorityCases = authorizedCases.filter(
    (c) =>
      isUnassignedCase(c) &&
      (c.operationalPriority === PriorityLevel.ROJO ||
        c.operationalPriority === PriorityLevel.AMARILLO)
  );

  // Casos nuevos (alumno ya registrado y con cuestionarios) que aún no tienen
  // psicólogo. Son los que antes no aparecían en ningún lado.
  const unassignedCasesWithStudent = useMemo(() => {
    return authorizedCases
      .filter(isUnassignedCase)
      .map((clinicalCase) => ({
        clinicalCase,
        student: students.find((s) => s.id === clinicalCase.studentId),
      }))
      .filter((row): row is { clinicalCase: ClinicalCaseRecord; student: StudentRecord } => Boolean(row.student))
      .sort((a, b) => (b.clinicalCase.openedAt || '').localeCompare(a.clinicalCase.openedAt || ''));
  }, [authorizedCases, students]);

  // Solicitudes de consulta visibles para el usuario: primero las que ya tomó
  // (para darles seguimiento) y después las que siguen sin responsable.
  const requestedVisibleCases = useMemo(() => {
    return authorizedCases
      .filter((c) => c.consultationRequested)
      .map((clinicalCase) => {
        const student = students.find((s) => s.id === clinicalCase.studentId);
        const unassigned = isUnassignedCase(clinicalCase);
        const assignedToMe =
          clinicalCase.assignedPsychologistId === currentUser.id ||
          clinicalCase.assignedInternId === currentUser.id;
        return {
          clinicalCase,
          student,
          unassigned,
          assignedToMe,
          priority: highestPriority(
            clinicalCase.operationalPriority,
            clinicalCase.psychometricSuggestedPriority,
            (student?.suicideProtocolSiCount ?? 0) > 0 ? PriorityLevel.ROJO : undefined
          ),
        };
      })
      .filter(
        (row): row is {
          clinicalCase: ClinicalCaseRecord;
          student: StudentRecord;
          unassigned: boolean;
          assignedToMe: boolean;
          priority: PriorityLevel;
        } => Boolean(row.student)
      )
      .sort(
        (a, b) =>
          Number(b.assignedToMe) - Number(a.assignedToMe) ||
          Number(a.unassigned) - Number(b.unassigned) ||
          PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
          (b.clinicalCase.consultationRequestedAt || '').localeCompare(
            a.clinicalCase.consultationRequestedAt || ''
          )
      );
  }, [authorizedCases, students, currentUser.id]);

  const unassignedCasesWithoutRequest = unassignedCasesWithStudent.filter(
    (row) => !row.clinicalCase.consultationRequested
  );

  const handleClaim = async (caseId: string) => {
    if (!onClaimCase) return;
    setClaimingCaseId(caseId);
    setClaimError(null);
    try {
      await onClaimCase(caseId);
    } catch (err: any) {
      console.error('No se pudo tomar el caso', err);
      setClaimError(err?.message || 'No se pudo tomar el caso. Inténtalo de nuevo.');
    } finally {
      setClaimingCaseId(null);
    }
  };

  const handleRelease = async (caseId: string) => {
    if (!onReleaseCase) return;
    const ok = window.confirm(
      '¿Liberar este caso? Volverá a la bandeja para que otro psicólogo lo tome. ' +
      'El registro del psicólogo que lo inició se conserva en el historial del expediente.'
    );
    if (!ok) return;
    setClaimingCaseId(caseId);
    setClaimError(null);
    try {
      await onReleaseCase(caseId);
    } catch (err: any) {
      console.error('No se pudo liberar el caso', err);
      setClaimError(err?.message || 'No se pudo liberar el caso. Inténtalo de nuevo.');
    } finally {
      setClaimingCaseId(null);
    }
  };

  const overdueTasks = tasks.filter((t) => t.status === 'VENCIDA');
  const upcomingTasks = tasks.filter((t) => t.status === 'PENDIENTE');

  const programStats = useMemo(() => {
    return programs.map((prog) => {
      const progStudents = students.filter(
        (s) =>
          s.programId === prog.id ||
          (!s.programId && s.programName?.trim().toLowerCase() === prog.name.trim().toLowerCase())
      );
      const evaluatedStudents = progStudents.filter((s) =>
        assessments.some(
          (a) =>
            a.studentId === s.id &&
            (a.status === AssessmentStatus.CALIFICADO ||
              a.status === AssessmentStatus.REVISADO_PROFESIONAL)
        )
      );
      const pct =
        progStudents.length > 0
          ? Math.round((evaluatedStudents.length / progStudents.length) * 100)
          : 0;
      return {
        id: prog.id,
        name: prog.name,
        code: prog.code,
        registered: progStudents.length,
        evaluated: evaluatedStudents.length,
        percentage: pct,
      };
    });
  }, [programs, students, assessments]);

  const authorizedCasesWithStudent = useMemo(() => {
    return authorizedCases
      .map((c) => {
        const stu = students.find((s) => s.id === c.studentId)!;
        return { clinicalCase: c, student: stu };
      })
      .filter(({ clinicalCase, student }) => {
        if (!student) return false;
        if (priorityFilter !== 'TODOS' && clinicalCase.operationalPriority !== priorityFilter) {
          return false;
        }
        if (modalityFilter !== 'TODAS' && clinicalCase.modalityOrigin !== modalityFilter) {
          return false;
        }
        if (programFilter !== 'TODAS') {
          const prog = programs.find((p) => p.id === programFilter);
          const matchesId = student.programId === programFilter;
          const matchesName = Boolean(prog && student.programName?.trim().toLowerCase() === prog.name.trim().toLowerCase());
          if (!matchesId && !matchesName) return false;
        }
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          const matchMatricula = student.matricula.toLowerCase().includes(q);
          const matchName = student.fullName.toLowerCase().includes(q);
          const matchEmail = student.institutionalEmail.toLowerCase().includes(q);
          const matchFolio = `${clinicalCase.caseFolio ?? clinicalCase.id} ${clinicalCase.id}`.toLowerCase().includes(q);
          if (!matchMatricula && !matchName && !matchEmail && !matchFolio) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'PRIORITY') {
          const weight = { [PriorityLevel.ROJO]: 3, [PriorityLevel.AMARILLO]: 2, [PriorityLevel.VERDE]: 1 };
          return weight[b.clinicalCase.operationalPriority] - weight[a.clinicalCase.operationalPriority];
        }
        if (sortBy === 'MATRICULA') {
          return a.student.matricula.localeCompare(b.student.matricula);
        }
        return (b.clinicalCase.lastEvaluationDate || '').localeCompare(
          a.clinicalCase.lastEvaluationDate || ''
        );
      });
  }, [
    cases,
    students,
    currentUser,
    priorityFilter,
    modalityFilter,
    programFilter,
    searchQuery,
    sortBy,
    programs,
  ]);

  const totalPages = Math.max(1, Math.ceil(authorizedCasesWithStudent.length / pageSize));
  const paginatedRows = authorizedCasesWithStudent.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const canViewNominalClinicalCases =
    currentUser.role === RoleCode.RESPONSABLE_PSICOLOGIA ||
    currentUser.role === RoleCode.PSICOLOGO ||
    currentUser.role === RoleCode.PRACTICANTE;

  return (
    <div className="space-y-6">
      {/* SOLICITUDES DE CONSULTA DEL ALUMNADO (PENDIENTES DE TOMAR) */}
      {canViewNominalClinicalCases && requestedVisibleCases.length > 0 && (
        <div className="bg-gradient-to-br from-rose-50 via-white to-amber-50 border-2 border-rose-300 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-rose-600 text-white shrink-0 mt-0.5 shadow-sm">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-rose-800">Solicitudes de consulta</div>
                <h2 className="text-base font-bold text-[#2F3E32] mt-0.5">
                  {requestedVisibleCases.length} solicitud(es) de consulta
                </h2>
                <p className="text-xs text-[#4A6B53] mt-1 leading-relaxed">
                  Las solicitudes que ya tomaste permanecen aquí, arriba de los demás registros, para que les des
                  seguimiento. Las que no tienen responsable puede tomarlas cualquier psicólogo. El color muestra
                  el semáforo más alto entre la prioridad operativa y la sugerida por los cuestionarios.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">
                A tu cargo: {requestedVisibleCases.filter((r) => r.assignedToMe).length}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white border border-rose-200 text-[11px] font-bold text-rose-800">
                Sin responsable: {requestedVisibleCases.filter((r) => r.unassigned).length}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white border border-rose-200 text-[11px] font-bold text-rose-800">
                {requestedVisibleCases.filter((r) => r.priority === PriorityLevel.ROJO).length} en ROJO
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white border border-amber-200 text-[11px] font-bold text-amber-800">
                {requestedVisibleCases.filter((r) => r.priority === PriorityLevel.AMARILLO).length} en AMARILLO
              </span>
            </div>
          </div>

          {claimError && (
            <div className="mt-3 p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-900">
              {claimError}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {requestedVisibleCases.slice(0, 6).map(({ clinicalCase, student, priority, unassigned, assignedToMe }) => (
              <div key={clinicalCase.id} className="bg-white border border-rose-200 rounded-xl p-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-[#2F3E32]">{student.fullName}</span>
                      {priority === PriorityLevel.ROJO && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[11px] font-bold">
                          ROJO · Atención prioritaria
                        </span>
                      )}
                      {priority === PriorityLevel.AMARILLO && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-bold">
                          AMARILLO · Valoración
                        </span>
                      )}
                      {priority === PriorityLevel.VERDE && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                          VERDE · Orientación
                        </span>
                      )}
                      {assignedToMe ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[11px] font-bold">
                          A TU CARGO
                        </span>
                      ) : unassigned ? (
                        <span className="px-2 py-0.5 rounded-md border border-rose-300 text-rose-800 text-[11px] font-bold">
                          SIN RESPONSABLE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold">
                          ASIGNADO A {clinicalCase.assignedPsychologistName || clinicalCase.assignedInternName || 'OTRO PROFESIONAL'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#4A6B53] mt-0.5">
                      Mat. <span className="font-mono">{student.matricula}</span> · {student.programName}
                      {student.semester ? ` · ${student.semester}° Sem` : ''}
                    </div>
                    <div className="text-[11px] text-[#4A6B53] mt-0.5">
                      Solicitó consulta el{' '}
                      {clinicalCase.consultationRequestedAt
                        ? new Date(clinicalCase.consultationRequestedAt).toLocaleDateString('es-MX', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'una fecha no registrada'}
                      {' · '}expediente{' '}
                      <span className="font-mono">{clinicalCase.caseFolio ?? clinicalCase.id}</span>
                    </div>
                    {clinicalCase.consultationRequestNote && (
                      <p className="mt-2 text-xs text-rose-950 bg-rose-50 border border-rose-100 rounded-lg p-2.5 leading-relaxed whitespace-pre-wrap break-words">
                        “{clinicalCase.consultationRequestNote}”
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {unassigned && onClaimCase && (
                      <button
                        onClick={() => handleClaim(clinicalCase.id)}
                        disabled={claimingCaseId === clinicalCase.id}
                        className="px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap shadow-sm transition-colors"
                      >
                        {claimingCaseId === clinicalCase.id ? 'Tomando…' : 'Tomar caso'}
                      </button>
                    )}
                    {assignedToMe && onReleaseCase && (
                      <button
                        onClick={() => handleRelease(clinicalCase.id)}
                        disabled={claimingCaseId === clinicalCase.id}
                        className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                      >
                        {claimingCaseId === clinicalCase.id ? 'Liberando…' : 'Liberar caso'}
                      </button>
                    )}
                    <button
                      onClick={() => onOpenClinicalCase(clinicalCase.id)}
                      className="px-3.5 py-2 text-xs font-bold text-[#4A6B53] bg-[#F4F0E6] hover:bg-[#E8E2D5] rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                    >
                      {assignedToMe ? 'Dar seguimiento' : 'Ver expediente'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {requestedVisibleCases.length > 6 && (
            <div className="mt-2 text-[11px] text-[#4A6B53]">
              Se muestran las 6 solicitudes más prioritarias. Las demás están en la tabla de expedientes.
            </div>
          )}
        </div>
      )}

      {/* BANNER DE ALERTAS OPERATIVAS */}
      {(unassignedPriorityCases.length > 0 || overdueTasks.length > 0) &&
        canViewNominalClinicalCases && (
          <div className="bg-white border border-rose-200 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 shrink-0 mt-0.5">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-rose-800">
                    Alertas Activas del Protocolo Institucional de Actuación
                  </div>
                  <h2 className="text-base font-bold text-[#2F3E32] mt-0.5">
                    Atención prioritaria requerida: {unassignedPriorityCases.length} caso(s) prioritario(s) sin
                    responsable · {overdueTasks.length} seguimiento(s) vencido(s)
                  </h2>
                  <p className="text-xs text-[#4A6B53] mt-1 leading-relaxed">
                    Conforme al Protocolo de Atención Prioritaria de la Oficina de Psicología del ITD, los casos en
                    nivel <strong>ROJO</strong> sin responsable asignado y las actividades de seguimiento vencidas
                    requieren asignación o intervención inmediata.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onNavigateModule('ESTUDIANTES')}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
                >
                  Ver expedientes de alumnos
                </button>
                <button
                  onClick={() => onNavigateModule('SEGUIMIENTO')}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
                >
                  Atender Seguimientos y Asignaciones
                </button>
              </div>
            </div>

            {unassignedPriorityCases.length > 0 &&
              currentUser.role === RoleCode.RESPONSABLE_PSICOLOGIA && (
                <div className="mt-4 pt-4 border-t border-[#E8E2D5] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-xs text-[#3B4A3F]">
                    <strong>Escalamiento activo:</strong> Expediente{' '}
                    <span className="font-mono font-semibold">{unassignedPriorityCases[0].id}</span> en prioridad{' '}
                    <strong className="text-rose-700">ROJO</strong> sin psicólogo titular asignado.
                  </div>
                  <div className="flex items-center gap-2">
                    {psychologists.length > 0 && (
                      <button
                        onClick={() =>
                          onQuickAssignPsychologist(unassignedPriorityCases[0].id, psychologists[0].id)
                        }
                        className="px-3 py-1.5 text-xs font-bold text-[#4A6B53] bg-[#F4F0E6] hover:bg-[#E8E2D5] rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                      >
                        Asignar a {psychologists[0].fullName}
                      </button>
                    )}
                    <button
                      onClick={() => onOpenClinicalCase(unassignedPriorityCases[0].id)}
                      className="px-3 py-1.5 text-xs font-bold text-[#4A6B53] bg-[#A3C9A8]/30 hover:bg-[#A3C9A8]/50 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                    >
                      Abrir Expediente Único
                    </button>
                  </div>
                </div>
              )}
          </div>
        )}

      {/* BANDEJA DE REGISTROS NUEVOS: alumnos que ya contestaron y aún no tienen psicólogo */}
      {canViewNominalClinicalCases && unassignedCasesWithoutRequest.length > 0 && (
        <div className="bg-white border-2 border-[#A3C9A8] rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-[#A3C9A8]/30 text-[#4A6B53] shrink-0 mt-0.5">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#4A6B53]">Registros nuevos</div>
                <h2 className="text-base font-bold text-[#2F3E32] mt-0.5">
                  {unassignedCasesWithoutRequest.length} alumno(s) registrado(s) sin psicólogo asignado
                </h2>
                <p className="text-xs text-[#4A6B53] mt-1 leading-relaxed">
                  Estos expedientes ya existen en el sistema. Si el alumno ya contestó sus cuestionarios, aquí
                  aparecen sus puntajes; toma el caso para que quede a tu cargo y revisa su semáforo.
                </p>
              </div>
            </div>
          </div>

          {claimError && (
            <div className="mt-3 p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-900">
              {claimError}
            </div>
          )}

          <div className="mt-4 divide-y divide-[#E8E2D5] border border-[#E8E2D5] rounded-xl overflow-hidden">
            {unassignedCasesWithoutRequest.slice(0, 6).map(({ clinicalCase, student }) => (
              <div key={clinicalCase.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FDFBF7]">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-[#2F3E32] truncate">{student.fullName}</div>
                  <div className="text-xs text-[#4A6B53]">
                    Mat. <span className="font-mono">{student.matricula}</span> · {student.programName}
                    {student.semester ? ` · ${student.semester}° Sem` : ''}
                  </div>
                  <div className="text-[11px] text-[#4A6B53] mt-0.5">
                    Expediente <span className="font-mono">{clinicalCase.caseFolio ?? clinicalCase.id}</span> · Alta:{' '}
                    {clinicalCase.openedAt ? new Date(clinicalCase.openedAt).toLocaleDateString() : 'sin fecha'} · BAI:{' '}
                    {clinicalCase.anxietyIndicator.score ?? '—'} · BDI: {clinicalCase.depressionIndicator.score ?? '—'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {clinicalCase.operationalPriority === PriorityLevel.ROJO && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[11px] font-bold">ROJO</span>
                  )}
                  {clinicalCase.operationalPriority === PriorityLevel.AMARILLO && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-bold">AMARILLO</span>
                  )}
                  {clinicalCase.operationalPriority === PriorityLevel.VERDE && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">VERDE</span>
                  )}
                  {onClaimCase && (
                    <button
                      onClick={() => handleClaim(clinicalCase.id)}
                      disabled={claimingCaseId === clinicalCase.id}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                    >
                      {claimingCaseId === clinicalCase.id ? 'Tomando…' : 'Tomar caso'}
                    </button>
                  )}
                  <button
                    onClick={() => onOpenClinicalCase(clinicalCase.id)}
                    className="px-3 py-1.5 text-xs font-bold text-[#4A6B53] bg-[#F4F0E6] hover:bg-[#E8E2D5] rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                  >
                    Ver expediente
                  </button>
                </div>
              </div>
            ))}
          </div>
          {unassignedCasesWithoutRequest.length > 6 && (
            <div className="mt-2 text-[11px] text-[#4A6B53]">
              Se muestran los 6 más recientes. Los demás están en la tabla de expedientes.
            </div>
          )}
        </div>
      )}

      {/* 7 TARJETAS DE INDICADORES OPERATIVOS DEL PANEL PRINCIPAL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 text-[#4A6B53] text-xs font-bold leading-snug">
            <span>Alumnos Registrados</span>
            <Users className="w-4 h-4 text-[#4A6B53]" />
          </div>
          <div className="text-2xl font-bold text-[#2F3E32] font-mono tabular-nums mt-2">
            {students.length}
          </div>
          <div className="text-[11px] text-[#4A6B53] mt-1 font-medium">
            Nuevo ingreso · Consulta individual
          </div>
        </div>

        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 text-[#4A6B53] text-xs font-bold leading-snug">
            <span>Evaluaciones Completadas</span>
            <ClipboardCheck className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-[#2F3E32] font-mono tabular-nums mt-2">
            {completedAssessmentsCount}
          </div>
          <div className="text-[11px] text-[#4A6B53] mt-1 font-medium">
            Con resultado calculado
          </div>
        </div>

        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 text-[#4A6B53] text-xs font-bold leading-snug">
            <span>Evaluaciones Pendientes</span>
            <Clock className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-2xl font-bold text-[#2F3E32] font-mono tabular-nums mt-2">
            {pendingOrIncompleteAssessmentsCount}
          </div>
          <div className="text-[11px] text-[#4A6B53] mt-1 font-medium">
            Incompletas no generan puntaje
          </div>
        </div>

        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 text-[#4A6B53] text-xs font-bold leading-snug">
            <span>Por Nivel de Prioridad</span>
            <AlertTriangle className="w-4 h-4 text-[#4A6B53]" />
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 mt-2 font-mono tabular-nums">
            <span className="text-lg font-bold text-rose-700" title="Prioridad Rojo">
              R:{redCasesCount}
            </span>
            <span className="text-[#E8E2D5]">·</span>
            <span className="text-lg font-bold text-amber-700" title="Prioridad Amarillo">
              A:{yellowCasesCount}
            </span>
            <span className="text-[#E8E2D5]">·</span>
            <span className="text-lg font-bold text-emerald-700" title="Prioridad Verde">
              V:{greenCasesCount}
            </span>
          </div>
          <div className="text-[11px] text-[#4A6B53] mt-1 font-medium">
            Semáforo operativo vigente
          </div>
        </div>

        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 text-[#4A6B53] text-xs font-bold leading-snug">
            <span>Casos Sin Responsable</span>
            <UserX className="w-4 h-4 text-rose-700" />
          </div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums mt-2 ${
              unassignedCasesCount > 0 ? 'text-rose-700' : 'text-[#2F3E32]'
            }`}
          >
            {unassignedCasesCount}
          </div>
          <div className="text-[11px] text-[#4A6B53] mt-1 font-medium">
            Pendientes de asignación
          </div>
        </div>

        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 text-[#4A6B53] text-xs font-bold leading-snug">
            <span>Seguimientos Próximos</span>
            <CalendarClock className="w-4 h-4 text-[#4A6B53]" />
          </div>
          <div className="text-2xl font-bold text-[#2F3E32] font-mono tabular-nums mt-2">
            {upcomingTasks.length}
          </div>
          <div className="text-[11px] text-[#4A6B53] mt-1 font-medium">
            Citas y acciones programadas
          </div>
        </div>

        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 text-[#4A6B53] text-xs font-bold leading-snug">
            <span>Seguimientos Vencidos</span>
            <ShieldAlert className="w-4 h-4 text-rose-700" />
          </div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums mt-2 ${
              overdueTasks.length > 0 ? 'text-rose-700' : 'text-[#2F3E32]'
            }`}
          >
            {overdueTasks.length}
          </div>
          <div className="text-[11px] text-[#4A6B53] mt-1 font-medium">
            Requieren contacto inmediato
          </div>
        </div>
      </div>
            {/* SEMÁFORO OPERATIVO DE PRIORIDAD DE ATENCIÓN (SECCIÓN 10) */}
      <div className="bg-white border border-[#E8E2D5] rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-[#E8E2D5]">
          <div>
            <h2 className="text-lg font-bold text-[#2F3E32]">
              Semáforo de prioridad de atención
            </h2>
            <p className="text-xs text-[#4A6B53] mt-0.5">
              Se muestran por separado el <strong>resultado de los cuestionarios</strong>, la <strong>prioridad de atención</strong> y el <strong>riesgo urgente</strong> identificado por psicología.
            </p>
          </div>
          <div className="text-xs text-[#4A6B53] font-mono">
            Criterios 2026
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {/* Nivel ROJO */}
          <div className="border border-rose-200 bg-rose-50/40 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                <span className="text-sm font-bold text-rose-900 leading-snug break-words">
                  NIVEL ROJO · Atención Prioritaria / Valoración Urgente
                </span>
              </div>
              <span className="text-xl font-bold font-mono tabular-nums text-rose-800 shrink-0">
                {redCasesCount}
              </span>
            </div>
            <p className="text-xs text-rose-900/90 mt-2 leading-relaxed">
              Casos que requieren contacto prioritario o valoración urgente según el protocolo profesional
              aprobado, ya sea por puntuación en el instrumento (BAI o BDI) o por elevación manual de un psicólogo.
            </p>
            <div className="mt-3 pt-2.5 border-t border-rose-200/70 text-[11px] text-rose-900 font-medium">
              No se retrasa una atención urgente por falta de puntuación o evaluación incompleta.
            </div>
          </div>

          {/* Nivel AMARILLO */}
          <div className="border border-amber-200 bg-amber-50/40 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span className="text-sm font-bold text-amber-900 leading-snug break-words">
                  NIVEL AMARILLO · Valoración o Seguimiento Prioritario
                </span>
              </div>
              <span className="text-xl font-bold font-mono tabular-nums text-amber-800 shrink-0">
                {yellowCasesCount}
              </span>
            </div>
            <p className="text-xs text-amber-900/90 mt-2 leading-relaxed">
              Estudiantes que requieren programación de entrevista de valoración o continuidad de sesiones de
              seguimiento por indicadores moderados en BAI o BDI o por seguimiento en curso.
            </p>
            <div className="mt-3 pt-2.5 border-t border-amber-200/70 text-[11px] text-amber-900 font-medium">
              Un caso no se cierra automáticamente porque disminuya el puntaje en una aplicación posterior.
            </div>
          </div>

          {/* Nivel VERDE */}
          <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span className="text-sm font-bold text-emerald-900 leading-snug break-words">
                  NIVEL VERDE · Seguimiento Ordinario
                </span>
              </div>
              <span className="text-xl font-bold font-mono tabular-nums text-emerald-800 shrink-0">
                {greenCasesCount}
              </span>
            </div>
            <p className="text-xs text-emerald-900/90 mt-2 leading-relaxed">
              Seguimiento ordinario y orientación preventiva conforme a los criterios definidos por la Oficina de
              Psicología del ITD.
            </p>
            <div className="mt-3 pt-2.5 border-t border-emerald-200/70 text-[11px] font-medium text-emerald-950">
              Advertencia clínica: El color verde NO implica ausencia garantizada de riesgo ni diagnóstico automático.
            </div>
          </div>
        </div>
      </div>

      {/* GRÁFICAS AGREGADAS (SIN NOMBRES NI DATOS CLÍNICOS EN GRÁFICAS GENERALES) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfica 1: Participación y Cobertura por Carrera ITD */}
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-[#2F3E32]">
                Participación y Cobertura por Programa Académico
              </h3>
              <p className="text-xs text-[#4A6B53] mt-0.5">
                Estadística agregada sin exposición de nombres ni resultados clínicos individuales.
              </p>
            </div>
            <FileSpreadsheet className="w-4 h-4 text-[#A3C9A8]" />
          </div>

          <div className="space-y-3">
            {programStats.map((prog) => (
              <div key={prog.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#3B4A3F] truncate pr-2">{prog.name}</span>
                  <span className="font-mono tabular-nums text-[#4A6B53] shrink-0">
                    {prog.evaluated}/{prog.registered} evaluados ({prog.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-[#F4F0E6] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#4A6B53] rounded-full transition-all"
                    style={{ width: `${Math.max(6, prog.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gráfica 2: Distribución Agregada por Estado de Seguimiento e Instrumento */}
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-bold text-[#2F3E32]">
              Distribución Agregada del Seguimiento y Modalidades
            </h3>
            <p className="text-xs text-[#4A6B53] mt-0.5">
              Resumen operativo para Desarrollo Académico y Coordinación de Psicología.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="border border-[#E8E2D5] bg-[#FDFBF7] rounded-xl p-3">
              <div className="text-xs text-[#4A6B53] font-semibold">Modalidad A · Nuevo Ingreso</div>
              <div className="text-xl font-bold text-[#2F3E32] font-mono tabular-nums mt-1">
                {cases.filter((c) => c.modalityOrigin === AttentionModality.NUEVO_INGRESO).length} casos
              </div>
              <div className="text-[11px] text-[#4A6B53] mt-0.5">Cohorte de ingreso 2026-B</div>
            </div>
            <div className="border border-[#E8E2D5] bg-[#FDFBF7] rounded-xl p-3">
              <div className="text-xs text-[#4A6B53] font-semibold">Modalidad B · Consulta Individual</div>
              <div className="text-xl font-bold text-[#2F3E32] font-mono tabular-nums mt-1">
                {
                  cases.filter((c) => c.modalityOrigin === AttentionModality.ATENCION_INDIVIDUAL)
                    .length
                }{' '}
                casos
              </div>
              <div className="text-[11px] text-[#4A6B53] mt-0.5">Alumnos de 1° a 12° semestre</div>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            {[
              {
                label: 'En atención clínica activa / cita programada',
                count: cases.filter(
                  (c) =>
                    c.followUpState === CaseFollowUpState.EN_ATENCION ||
                    c.followUpState === CaseFollowUpState.CITA_PROGRAMADA
                ).length,
                barColor: 'bg-[#4A6B53]',
              },
              {
                label: 'Pendientes de contacto / sin profesional asignado',
                count: cases.filter(
                  (c) =>
                    c.followUpState === CaseFollowUpState.PENDIENTE_CONTACTO ||
                    c.followUpState === CaseFollowUpState.SIN_ASIGNAR
                ).length,
                barColor: 'bg-[#7C1D36]',
              },
              {
                label: 'Requieren nueva valoración / canalizados',
                count: cases.filter(
                  (c) =>
                    c.followUpState === CaseFollowUpState.REQUIERE_NUEVA_VALORACION ||
                    c.followUpState === CaseFollowUpState.CANALIZADO
                ).length,
                barColor: 'bg-amber-600',
              },
              {
                label: 'Seguimientos ordinarios concluidos',
                count: cases.filter(
                  (c) => c.followUpState === CaseFollowUpState.SEGUIMIENTO_CONCLUIDO
                ).length,
                barColor: 'bg-emerald-600',
              },
            ].map((item) => {
              const pct = cases.length > 0 ? Math.round((item.count / cases.length) * 100) : 0;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[#3B4A3F] font-medium">{item.label}</span>
                    <span className="font-mono tabular-nums font-bold text-[#2F3E32]">
                      {item.count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#F4F0E6] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.barColor} rounded-full`}
                      style={{ width: `${Math.max(6, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TABLA ORDENABLE DE EXPEDIENTES CON FILTROS, BÚSQUEDA AUTORIZADA Y PAGINACIÓN */}
      <div className="bg-white border border-[#E8E2D5] rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-[#E8E2D5]">
          <div>
            <h3 className="text-base font-bold text-[#2F3E32]">
              Expedientes
            </h3>
            <p className="text-xs text-[#4A6B53] mt-0.5">
              {canViewNominalClinicalCases
                ? 'Aquí ves los expedientes que te corresponden.'
                : 'Tu perfil no incluye el listado de expedientes clínicos.'}
            </p>
          </div>

          {canViewNominalClinicalCases && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#4A6B53] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Buscar matrícula, nombre o correo..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8] w-60"
                />
              </div>

              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value as 'TODOS' | PriorityLevel);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
              >
                <option value="TODOS">Prioridad: Todas</option>
                <option value={PriorityLevel.ROJO}>Prioridad: ROJO (Urgente)</option>
                <option value={PriorityLevel.AMARILLO}>Prioridad: AMARILLO</option>
                <option value={PriorityLevel.VERDE}>Prioridad: VERDE</option>
              </select>

              <select
                value={modalityFilter}
                onChange={(e) => {
                  setModalityFilter(e.target.value as 'TODAS' | AttentionModality);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
              >
                <option value="TODAS">Modalidad: Ambas</option>
                <option value={AttentionModality.NUEVO_INGRESO}>Modalidad A: Nuevo Ingreso</option>
                <option value={AttentionModality.ATENCION_INDIVIDUAL}>
                  Modalidad B: Consulta Individual
                </option>
              </select>

              <select
                value={programFilter}
                onChange={(e) => {
                  setProgramFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
              >
                <option value="TODAS">Carrera: Todas</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <button
                onClick={() =>
                  setSortBy((prev) =>
                    prev === 'PRIORITY'
                      ? 'MATRICULA'
                      : prev === 'MATRICULA'
                      ? 'LAST_EVAL'
                      : 'PRIORITY'
                  )
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-[#4A6B53] bg-[#F4F0E6] hover:bg-[#E8E2D5] rounded-xl cursor-pointer whitespace-nowrap transition-colors"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                Ordenar: {sortBy === 'PRIORITY' ? 'Prioridad' : sortBy === 'MATRICULA' ? 'Matrícula' : 'Fecha Eval.'}
              </button>
            </div>
          )}
        </div>

        {!canViewNominalClinicalCases ? (
          <div className="py-10 text-center">
            <p className="text-sm font-bold text-[#2F3E32]">
              Información clínica reservada
            </p>
            <p className="text-xs text-[#4A6B53] mt-1 max-w-xl mx-auto">
              Por confidencialidad, el listado de expedientes y las notas de atención solo los ve el personal de psicología.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto border border-[#E8E2D5] rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F4F0E6] border-b border-[#E8E2D5] text-[#4A6B53]">
                    <th className="py-2.5 px-3 font-semibold">Expediente / Matrícula</th>
                    <th className="py-2.5 px-3 font-semibold">Estudiante / Carrera · Semestre</th>
                    <th className="py-2.5 px-3 font-semibold">Modalidad</th>
                    <th className="py-2.5 px-3 font-semibold">Indicador BAI (Ansiedad)</th>
                    <th className="py-2.5 px-3 font-semibold">Indicador BDI (Depresión)</th>
                    <th className="py-2.5 px-3 font-semibold">Prioridad Operativa</th>
                    <th className="py-2.5 px-3 font-semibold">Responsable / Próxima Acción</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E2D5]">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[#4A6B53]">
                        No hay expedientes que coincidan con los filtros.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map(({ clinicalCase, student }) => (
                      <tr key={clinicalCase.id} className="hover:bg-[#FDFBF7] transition-colors">
                        <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                          <div className="font-bold text-[#2F3E32]">{clinicalCase.caseFolio ?? clinicalCase.id}</div>
                          <div className="text-[#4A6B53]">Mat. {student.matricula}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#2F3E32]">{student.fullName}</div>
                          <div className="text-[#4A6B53]">
                            {student.programName} · {student.semester}° Sem ({student.group})
                          </div>
                          {clinicalCase.consultationRequested && (
                            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold">
                              <HeartHandshake className="w-3 h-3" /> Solicitó consulta
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[#3B4A3F] font-medium">
                          {clinicalCase.modalityOrigin === AttentionModality.NUEVO_INGRESO
                            ? 'A · Nuevo Ingreso'
                            : 'B · Consulta Indiv.'}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums">
                          {clinicalCase.anxietyIndicator.score !== null ? (
                            <div>
                              <span className="font-bold text-[#2F3E32]">
                                {clinicalCase.anxietyIndicator.score} pts
                              </span>
                              <div className="text-[11px] font-sans text-[#4A6B53]">
                                {clinicalCase.anxietyIndicator.instrumentVersion}
                              </div>
                            </div>
                          ) : (
                            <span className="font-sans text-[#4A6B53]">
                              {clinicalCase.anxietyIndicator.category || 'Sin aplicación BAI'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums">
                          {clinicalCase.depressionIndicator.score !== null ? (
                            <div>
                              <span className="font-bold text-[#2F3E32]">
                                {clinicalCase.depressionIndicator.score} pts
                              </span>
                              <div className="text-[11px] font-sans text-[#4A6B53]">
                                {clinicalCase.depressionIndicator.instrumentVersion}
                              </div>
                            </div>
                          ) : (
                            <span className="font-sans text-[#4A6B53]">
                              Sin aplicación BDI
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {clinicalCase.operationalPriority === PriorityLevel.ROJO && (
                            <div className="text-rose-700 font-bold">
                              ROJO · Prioritario
                              {clinicalCase.urgentRiskIdentifiedByProfessional && (
                                <div className="text-[11px] font-normal text-rose-800">
                                  Criterio clínico urgente activo
                                </div>
                              )}
                            </div>
                          )}
                          {clinicalCase.operationalPriority === PriorityLevel.AMARILLO && (
                            <div className="text-amber-700 font-bold">AMARILLO · Valoración</div>
                          )}
                          {clinicalCase.operationalPriority === PriorityLevel.VERDE && (
                            <div className="text-emerald-700 font-bold">VERDE · Ordinario</div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-[#2F3E32]">
                            {clinicalCase.assignedPsychologistName || (
                              <span className="text-rose-700 font-bold">SIN RESPONSABLE ASIGNADO</span>
                            )}
                          </div>
                          <div className="text-[#4A6B53] truncate max-w-xs">
                            {clinicalCase.nextFollowUpDate
                              ? `Próx: ${clinicalCase.nextFollowUpDate} · `
                              : ''}
                            {clinicalCase.nextFollowUpAction}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {isUnassignedCase(clinicalCase) && onClaimCase && (
                            <button
                              onClick={() => handleClaim(clinicalCase.id)}
                              disabled={claimingCaseId === clinicalCase.id}
                              className="mr-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#7C1D36] hover:bg-[#611529] disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap shadow-sm transition-colors"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              {claimingCaseId === clinicalCase.id ? 'Tomando…' : 'Tomar caso'}
                            </button>
                          )}
                          <button
                            onClick={() => onOpenClinicalCase(clinicalCase.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-lg cursor-pointer whitespace-nowrap shadow-sm transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Expediente y Guía Clínica
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div className="flex items-center justify-between pt-4 text-xs text-[#4A6B53] font-medium">
              <div>
                Mostrando <span className="font-mono font-bold text-[#2F3E32]">{paginatedRows.length}</span> de{' '}
                <span className="font-mono font-bold text-[#2F3E32]">{authorizedCasesWithStudent.length}</span>{' '}
                expediente(s) autorizados para su rol
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 border border-[#E8E2D5] rounded-lg disabled:opacity-40 hover:bg-[#F4F0E6] cursor-pointer transition-colors"
                >
                  Anterior
                </button>
                <span className="font-mono">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 border border-[#E8E2D5] rounded-lg disabled:opacity-40 hover:bg-[#F4F0E6] cursor-pointer transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DashboardView;