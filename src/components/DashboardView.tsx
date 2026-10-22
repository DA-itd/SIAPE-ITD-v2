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
  onQuickAssignPsychologist,
  onNavigateModule,
}) => {
  const [priorityFilter, setPriorityFilter] = useState<'TODOS' | PriorityLevel>('TODOS');
  const [modalityFilter, setModalityFilter] = useState<'TODAS' | AttentionModality>('TODAS');
  const [programFilter, setProgramFilter] = useState<string>('TODAS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'PRIORITY' | 'MATRICULA' | 'LAST_EVAL'>('PRIORITY');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 5;

  // Filtrado estricto por jerarquía institucional:
  // 1. Superadmin (Alejandro Calderón): Ve todos los casos institucionales
  // 2. Psicólogo: Ve sus casos propios + los casos de los practicantes a su cargo
  // 3. Practicante: Únicamente los casos asignados a él directamente
  const authorizedCases = useMemo(() => {
    if (
      currentUser.role === RoleCode.ADMINISTRADOR ||
      currentUser.role === RoleCode.RESPONSABLE_PSICOLOGIA
    ) {
      return cases;
    }
    if (currentUser.role === RoleCode.PSICOLOGO) {
      const myInternIds = (allUsers || psychologists)
        .filter((u) => u.role === RoleCode.PRACTICANTE && u.supervisorId === currentUser.id)
        .map((u) => u.id);

      return cases.filter(
        (c) =>
          c.assignedPsychologistId === currentUser.id ||
          (c.assignedInternId && myInternIds.includes(c.assignedInternId))
      );
    }
    if (currentUser.role === RoleCode.PRACTICANTE) {
      return cases.filter((c) => c.assignedInternId === currentUser.id);
    }
    return [];
  }, [cases, currentUser, allUsers, psychologists]);

  // Cálculo de métricas sobre los casos autorizados para este usuario
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

  const unassignedCasesCount = authorizedCases.filter((c) => !c.assignedPsychologistId && !c.assignedInternId).length;
  const unassignedPriorityCases = authorizedCases.filter(
    (c) =>
      !c.assignedPsychologistId &&
      !c.assignedInternId &&
      (c.operationalPriority === PriorityLevel.ROJO ||
        c.operationalPriority === PriorityLevel.AMARILLO)
  );

  const overdueTasks = tasks.filter((t) => t.status === 'VENCIDA');
  const upcomingTasks = tasks.filter((t) => t.status === 'PENDIENTE');

  // Distribución agregada por carrera (SIN NOMBRES NI DATOS CLÍNICOS en gráficas generales)
  const programStats = useMemo(() => {
    return programs.map((prog) => {
      const progStudents = students.filter((s) => s.programId === prog.id);
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

  // Filtrado de expedientes autorizados para la tabla
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
        if (programFilter !== 'TODAS' && student.programId !== programFilter) {
          return false;
        }
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          const matchMatricula = student.matricula.toLowerCase().includes(q);
          const matchName = student.fullName.toLowerCase().includes(q);
          const matchEmail = student.institutionalEmail.toLowerCase().includes(q);
          const matchFolio = clinicalCase.id.toLowerCase().includes(q);
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
      {/* BANNER DE ALERTAS OPERATIVAS Y PROTOCOLO DE ATENCIÓN PRIORITARIA */}
      {(unassignedPriorityCases.length > 0 || overdueTasks.length > 0) &&
        canViewNominalClinicalCases && (
          <div className="bg-white border border-rose-300 rounded-xl p-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700 shrink-0 mt-0.5">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-rose-800">
                    Alertas Activas del Protocolo Institucional de Actuación
                  </div>
                  <h2 className="text-base font-bold text-slate-900 mt-0.5">
                    Atención prioritaria requerida: {unassignedPriorityCases.length} caso(s) prioritario(s) sin
                    responsable · {overdueTasks.length} seguimiento(s) vencido(s)
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Conforme al Protocolo de Atención Prioritaria de la Oficina de Psicología del ITD, los casos en
                    nivel <strong>ROJO</strong> sin responsable asignado y las actividades de seguimiento vencidas
                    requieren asignación o intervención inmediata.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onNavigateModule('EVALUACIONES')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Aplicar Evaluaciones (BAI / BDI)
                </button>
                <button
                  onClick={() => onNavigateModule('SEGUIMIENTO')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Atender Seguimientos y Asignaciones
                </button>
              </div>
            </div>

            {unassignedPriorityCases.length > 0 &&
              currentUser.role === RoleCode.RESPONSABLE_PSICOLOGIA && (
                <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-xs text-slate-700">
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
                        className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        Asignar a {psychologists[0].fullName}
                      </button>
                    )}
                    <button
                      onClick={() => onOpenClinicalCase(unassignedPriorityCases[0].id)}
                      className="px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Abrir Expediente Único
                    </button>
                  </div>
                </div>
              )}
          </div>
        )}

      {/* 7 TARJETAS DE INDICADORES OPERATIVOS DEL PANEL PRINCIPAL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Alumnos Registrados</span>
            <Users className="w-4 h-4 text-[#7C1D36]" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {students.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Nuevo ingreso · Consulta individual
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Evaluaciones Completadas</span>
            <ClipboardCheck className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {completedAssessmentsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Con resultado calculado
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Evaluaciones Pendientes</span>
            <Clock className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {pendingOrIncompleteAssessmentsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Incompletas no generan puntaje
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Por Nivel de Prioridad</span>
            <AlertTriangle className="w-4 h-4 text-[#7C1D36]" />
          </div>
          <div className="flex items-baseline gap-2.5 mt-2 font-mono tabular-nums">
            <span className="text-lg font-bold text-rose-700" title="Prioridad Rojo">
              R:{redCasesCount}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-lg font-bold text-amber-700" title="Prioridad Amarillo">
              A:{yellowCasesCount}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-lg font-bold text-emerald-700" title="Prioridad Verde">
              V:{greenCasesCount}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Semáforo operativo vigente
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Casos Sin Responsable</span>
            <UserX className="w-4 h-4 text-rose-700" />
          </div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums mt-2 ${
              unassignedCasesCount > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {unassignedCasesCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Pendientes de asignación
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Seguimientos Próximos</span>
            <CalendarClock className="w-4 h-4 text-[#1E3A8A]" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {upcomingTasks.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Citas y acciones programadas
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Seguimientos Vencidos</span>
            <ShieldAlert className="w-4 h-4 text-rose-700" />
          </div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums mt-2 ${
              overdueTasks.length > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {overdueTasks.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Requieren contacto inmediato
          </div>
        </div>
      </div>

      {/* SEMÁFORO OPERATIVO DE PRIORIDAD DE ATENCIÓN (SECCIÓN 10) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Semáforo de prioridad de atención
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Se muestran por separado el <strong>resultado de los cuestionarios</strong>, la <strong>prioridad de atención</strong> y el <strong>riesgo urgente</strong> identificado por psicología.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Criterios 2026
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {/* Nivel ROJO */}
          <div className="border border-rose-200 bg-rose-50/40 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
                <span className="text-sm font-bold text-rose-900">
                  NIVEL ROJO · Atención Prioritaria / Valoración Urgente
                </span>
              </div>
              <span className="text-xl font-bold font-mono tabular-nums text-rose-800">
                {redCasesCount}
              </span>
            </div>
            <p className="text-xs text-rose-900/90 mt-2 leading-relaxed">
              Casos que requieren contacto prioritario o valoración urgente según el protocolo profesional
              aprobado, ya sea por puntuación en el instrumento (BAI o BDI) o por elevación manual de un psicólogo.
            </p>
            <div className="mt-3 pt-2.5 border-t border-rose-200/70 text-[11px] text-rose-900">
              No se retrasa una atención urgente por falta de puntuación o evaluación incompleta.
            </div>
          </div>

          {/* Nivel AMARILLO */}
          <div className="border border-amber-200 bg-amber-50/40 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="text-sm font-bold text-amber-900">
                  NIVEL AMARILLO · Valoración o Seguimiento Prioritario
                </span>
              </div>
              <span className="text-xl font-bold font-mono tabular-nums text-amber-800">
                {yellowCasesCount}
              </span>
            </div>
            <p className="text-xs text-amber-900/90 mt-2 leading-relaxed">
              Estudiantes que requieren programación de entrevista de valoración o continuidad de sesiones de
              seguimiento por indicadores moderados en BAI o BDI o por seguimiento en curso.
            </p>
            <div className="mt-3 pt-2.5 border-t border-amber-200/70 text-[11px] text-amber-900">
              Un caso no se cierra automáticamente porque disminuya el puntaje en una aplicación posterior.
            </div>
          </div>

          {/* Nivel VERDE */}
          <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-sm font-bold text-emerald-900">
                  NIVEL VERDE · Seguimiento Ordinario
                </span>
              </div>
              <span className="text-xl font-bold font-mono tabular-nums text-emerald-800">
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
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Participación y Cobertura por Programa Académico
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Estadística agregada sin exposición de nombres ni resultados clínicos individuales.
              </p>
            </div>
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-3">
            {programStats.map((prog) => (
              <div key={prog.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 truncate pr-2">{prog.name}</span>
                  <span className="font-mono tabular-nums text-slate-600 shrink-0">
                    {prog.evaluated}/{prog.registered} evaluados ({prog.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1E3A8A] rounded-full transition-all"
                    style={{ width: `${Math.max(6, prog.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gráfica 2: Distribución Agregada por Estado de Seguimiento e Instrumento */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900">
              Distribución Agregada del Seguimiento y Modalidades
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Resumen operativo para Desarrollo Académico y Coordinación de Psicología.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500">Modalidad A · Nuevo Ingreso</div>
              <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {cases.filter((c) => c.modalityOrigin === AttentionModality.NUEVO_INGRESO).length} casos
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Cohorte de ingreso 2026-B</div>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500">Modalidad B · Consulta Individual</div>
              <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {
                  cases.filter((c) => c.modalityOrigin === AttentionModality.ATENCION_INDIVIDUAL)
                    .length
                }{' '}
                casos
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Alumnos de 1° a 12° semestre</div>
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
                barColor: 'bg-[#1E3A8A]',
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
                    <span className="text-slate-700">{item.label}</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {item.count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
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
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Expedientes
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              {canViewNominalClinicalCases
                ? 'Aquí ves los expedientes que te corresponden.'
                : 'Tu perfil no incluye el listado de expedientes clínicos.'}
            </p>
          </div>

          {canViewNominalClinicalCases && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Buscar matrícula, nombre o correo..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#1E3A8A] w-60"
                />
              </div>

              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value as 'TODOS' | PriorityLevel);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
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
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
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
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
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
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                Ordenar: {sortBy === 'PRIORITY' ? 'Prioridad' : sortBy === 'MATRICULA' ? 'Matrícula' : 'Fecha Eval.'}
              </button>
            </div>
          )}
        </div>

        {!canViewNominalClinicalCases ? (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-slate-800">
              Información clínica reservada
            </p>
            <p className="text-xs text-slate-600 mt-1 max-w-xl mx-auto">
              Por confidencialidad, el listado de expedientes y las notas de atención solo los ve el personal de psicología.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
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
                <tbody className="divide-y divide-slate-200">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No hay expedientes que coincidan con los filtros.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map(({ clinicalCase, student }) => (
                      <tr key={clinicalCase.id} className="hover:bg-slate-50/90">
                        <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                          <div className="font-bold text-slate-900">{clinicalCase.id.toUpperCase()}</div>
                          <div className="text-slate-500">Mat. {student.matricula}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">{student.fullName}</div>
                          <div className="text-slate-500">
                            {student.programName} · {student.semester}° Sem ({student.group})
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          {clinicalCase.modalityOrigin === AttentionModality.NUEVO_INGRESO
                            ? 'A · Nuevo Ingreso'
                            : 'B · Consulta Indiv.'}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums">
                          {clinicalCase.anxietyIndicator.score !== null ? (
                            <div>
                              <span className="font-bold text-slate-900">
                                {clinicalCase.anxietyIndicator.score} pts
                              </span>
                              <div className="text-[11px] font-sans text-slate-500">
                                {clinicalCase.anxietyIndicator.instrumentVersion}
                              </div>
                            </div>
                          ) : (
                            <span className="font-sans text-slate-500">
                              {clinicalCase.anxietyIndicator.category || 'Sin aplicación BAI'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums">
                          {clinicalCase.depressionIndicator.score !== null ? (
                            <div>
                              <span className="font-bold text-slate-900">
                                {clinicalCase.depressionIndicator.score} pts
                              </span>
                              <div className="text-[11px] font-sans text-slate-500">
                                {clinicalCase.depressionIndicator.instrumentVersion}
                              </div>
                            </div>
                          ) : (
                            <span className="font-sans text-slate-400">Sin aplicación BDI</span>
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
                          <div className="font-medium text-slate-900">
                            {clinicalCase.assignedPsychologistName || (
                              <span className="text-rose-700 font-bold">SIN RESPONSABLE ASIGNADO</span>
                            )}
                          </div>
                          <div className="text-slate-500 truncate max-w-xs">
                            {clinicalCase.nextFollowUpDate
                              ? `Próx: ${clinicalCase.nextFollowUpDate} · `
                              : ''}
                            {clinicalCase.nextFollowUpAction}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => onOpenClinicalCase(clinicalCase.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg cursor-pointer whitespace-nowrap"
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
            <div className="flex items-center justify-between pt-4 text-xs text-slate-600">
              <div>
                Mostrando <span className="font-mono font-semibold">{paginatedRows.length}</span> de{' '}
                <span className="font-mono font-semibold">{authorizedCasesWithStudent.length}</span>{' '}
                expediente(s) autorizados para su rol
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                >
                  Anterior
                </button>
                <span className="font-mono">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
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
