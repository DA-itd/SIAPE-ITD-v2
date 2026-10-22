import React, { useMemo, useState } from 'react';
import { LOGO_ITD } from '../lib/branding';

const ACTIVITY_LABELS: Record<string, string> = {
  CONSULTA_EXPEDIENTE: 'Consulta de expediente',
  NUEVA_EVALUACION: 'Cuestionario aplicado',
  CALIFICACION_DETERMINISTA: 'Resultado calculado',
  CAMBIO_PRIORIDAD_MANUAL: 'Cambio de prioridad',
  REGISTRO_SESION: 'Sesión registrada',
  ALERTA_TUTORIA_AUTORIZADA: 'Alerta a tutoría',
  EXPORTACION_REPORTE: 'Reporte descargado',
  MODIFICACION_ROL_CUENTA: 'Cambio en cuentas',
  INTENTO_ACCESO_DENEGADO_RLS: 'Acceso no permitido',
  ACTIVACION_PROTOCOLO_URGENTE: 'Protocolo urgente activado',
};
const ACTIVITY_ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  RESPONSABLE_PSICOLOGIA: 'Responsable de Psicología',
  PSICOLOGO: 'Psicólogo(a)',
  PRACTICANTE: 'Practicante',
  ESTUDIANTE: 'Alumno',
  TUTOR_ACADEMICO: 'Tutor(a)',
};
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Lock,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Upload,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  AcademicProgram,
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
  InstrumentVersionConfig,
  PriorityLevel,
  RoleCode,
  StudentRecord,
  UserProfile,
} from '../types/siape';
import {
  checkRlsAccessPermission,
  evaluateInstrumentDeterministically,
} from '../lib/scoringEngine';

export type ActiveModuleKey =
  | 'ESTUDIANTES'
  | 'EVALUACIONES'
  | 'SEGUIMIENTO'
  | 'TUTORIAS'
  | 'USUARIOS'
  | 'REPORTES';

interface ModulesViewProps {
  activeModule: ActiveModuleKey;
  currentUser: UserProfile;
  users: UserProfile[];
  students: StudentRecord[];
  cases: ClinicalCaseRecord[];
  assessments: AssessmentRecord[];
  tasks: FollowUpTask[];
  tutorAlerts: AcademicSupportAlert[];
  auditLogs: AuditLogEntry[];
  periods: EvaluationPeriod[];
  programs: AcademicProgram[];
  instrumentConfigs: Record<InstrumentCode, InstrumentVersionConfig>;
  onOpenClinicalCase: (caseId: string) => void;
  onRegisterStudentAndSingleCase: (payload: {
    matricula: string;
    fullName: string;
    institutionalEmail: string;
    programId: string;
    semester: number;
    group: string;
    entryGeneration: string;
    entryModality: AttentionModality;
  }) => { status: 'CREATED' | 'EXISTING_RECOVERED'; caseId: string; message: string };
  onCompleteFollowUpTask: (taskId: string, outcomeNote: string, nextDate: string) => void;
  onAssignCaseResponsible: (
    caseId: string,
    psychologistId?: string | null,
    internId?: string | null
  ) => void;
  onRegisterTutorAction: (alertId: string, actionSummary: string) => void;
  onCreateUserProfile: (payload: {
    fullName: string;
    email: string;
    role: RoleCode;
    supervisorId: string | null;
    professionalLicense: string;
  }) => void;
  onUpdateUserAccountStatus: (targetUserId: string, newStatus: AccountStatus) => void;
  onLogReportExport: (reportName: string, format: 'PDF' | 'CSV' | 'EXCEL', filterSummary: string) => void;
  onStudentSubmitSelfAssessment: (
    studentId: string,
    instrumentCode: InstrumentCode,
    targetScore: number
  ) => void;
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
}

export const ModulesView: React.FC<ModulesViewProps> = ({
  activeModule,
  currentUser,
  users,
  students,
  cases,
  assessments,
  tasks,
  tutorAlerts,
  auditLogs,
  periods,
  programs,
  instrumentConfigs,
  onOpenClinicalCase,
  onRegisterStudentAndSingleCase,
  onCompleteFollowUpTask,
  onAssignCaseResponsible,
  onRegisterTutorAction,
  onCreateUserProfile,
  onUpdateUserAccountStatus,
  onLogReportExport,
  onStudentSubmitSelfAssessment,
  onCreateConsultationAssessment,
}) => {
  // Estados para Módulo de Estudiantes (Modalidad A y B + CSV)
  const [stuSearch, setStuSearch] = useState('');
  const [newMatricula, setNewMatricula] = useState('');
  const [newStuName, setNewStuName] = useState('');
  const [newStuEmail, setNewStuEmail] = useState('');
  const [newStuProgram, setNewStuProgram] = useState(programs[0]?.id || '');
  const [newStuSemester, setNewStuSemester] = useState(1);
  const [newStuGroup, setNewStuGroup] = useState('');
  const [newStuGeneration, setNewStuGeneration] = useState('');
  const [newStuModality, setNewStuModality] = useState<AttentionModality>(
    AttentionModality.ATENCION_INDIVIDUAL
  );
  const [stuFeedback, setStuFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
    caseId?: string;
  } | null>(null);
  const [csvInput, setCsvInput] = useState('');

  // Estados para Módulo de Evaluaciones (Aplicación Interactiva de los 2 Instrumentos: BAI y BDI)
  const [evalSubTab, setEvalSubTab] = useState<
    'APLICAR_CUESTIONARIO' | 'HISTORIAL_APLICACIONES' | 'CONFIGURACION_INSTRUMENTOS'
  >('APLICAR_CUESTIONARIO');
  // Por defecto la pantalla de aplicación oculta el semáforo, los puntos y las alertas para no sesgar ni alarmar al estudiante
  const [studentNeutralScreenMode, setStudentNeutralScreenMode] = useState<boolean>(true);
  // Modo de visualización del cuestionario: 'PASO_A_PASO' (1 pregunta a la vez como en la imagen) o 'LISTA_COMPLETA'
  const [questionnaireLayoutMode, setQuestionnaireLayoutMode] = useState<'PASO_A_PASO' | 'LISTA_COMPLETA'>('LISTA_COMPLETA');
  const [currentStepItemNumber, setCurrentStepItemNumber] = useState<number>(1);
  const [selectedConfigTab, setSelectedConfigTab] = useState<InstrumentCode>(InstrumentCode.BAI);
  const [evalTargetCaseId, setEvalTargetCaseId] = useState<string>(cases[0]?.id || '');
  const [evalContextNote, setEvalContextNote] = useState<string>(
    'Aplicación de cuestionario en consulta.'
  );
  const [evalInterpretation, setEvalInterpretation] = useState<string>('');
  const [evalNextAction, setEvalNextAction] = useState<string>(
    'Revisión de resultados en entrevista de seguimiento psicológico'
  );
  const [evalNextDate, setEvalNextDate] = useState<string>(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [evalItemResponses, setEvalItemResponses] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    for (let i = 1; i <= 21; i++) {
      initial[i] = 1;
    }
    return initial;
  });
  const [evalSavedBanner, setEvalSavedBanner] = useState<{
    instrumentCode: InstrumentCode;
    caseId: string;
    studentName: string;
    totalScore: number | null;
    category: string | null;
    priority: PriorityLevel | null;
    status: AssessmentStatus;
  } | null>(null);
  const [inspectedAssessmentId, setInspectedAssessmentId] = useState<string | null>(
    assessments[0]?.id || null
  );

  // Estados para Módulo de Seguimiento
  const [followUpFilter, setFollowUpFilter] = useState<'TODOS' | CaseFollowUpState | 'VENCIDOS'>(
    'TODOS'
  );
  const [taskNoteMap, setTaskNoteMap] = useState<Record<string, string>>({});

  // Estados para Módulo de Tutorías
  const [tutorActionInputMap, setTutorActionInputMap] = useState<Record<string, string>>({});

  // Estados para Módulo de Administración de Usuarios
  const [usrFullName, setUsrFullName] = useState('');
  const [usrEmail, setUsrEmail] = useState('');
  const [usrRole, setUsrRole] = useState<RoleCode>(RoleCode.PSICOLOGO);
  const [usrSupervisorId, setUsrSupervisorId] = useState('');
  const [usrLicense, setUsrLicense] = useState('');
  const [usrError, setUsrError] = useState<string | null>(null);

  // Estados para Módulo de Reportes (Sección 14)
  const [repType, setRepType] = useState<number>(1);
  const [repProgram, setRepProgram] = useState<string>('TODAS');
  const [repPriority, setRepPriority] = useState<string>('TODAS');
  const [repInstrument, setRepInstrument] = useState<string>('TODOS');
  const [repGeneration, setRepGeneration] = useState<string>('TODAS');

  const psychologists = useMemo(
    () =>
      users.filter(
        (u) =>
          (u.role === RoleCode.PSICOLOGO || u.role === RoleCode.RESPONSABLE_PSICOLOGIA) &&
          u.status === AccountStatus.ACTIVA
      ),
    [users]
  );

  const interns = useMemo(
    () => users.filter((u) => u.role === RoleCode.PRACTICANTE && u.status === AccountStatus.ACTIVA),
    [users]
  );

  // ============================================================================
  // 1. MÓDULO DE ESTUDIANTES (SECCIÓN 8 + AMPLIACIÓN MODALIDADES A Y B)
  // ============================================================================
  if (activeModule === 'ESTUDIANTES') {
    const filteredStudents = students.filter((s) => {
      if (!stuSearch.trim()) return true;
      const q = stuSearch.toLowerCase();
      return (
        s.matricula.toLowerCase().includes(q) ||
        s.fullName.toLowerCase().includes(q) ||
        s.institutionalEmail.toLowerCase().includes(q) ||
        s.programName.toLowerCase().includes(q)
      );
    });

    const handleCreateOrRecoverStudent = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newStuEmail.toLowerCase().endsWith('@itdurango.edu.mx')) {
        setStuFeedback({
          type: 'error',
          text: 'Validación institucional rechazada: El correo del estudiante debe pertenecer obligatoriamente al dominio @itdurango.edu.mx.',
        });
        return;
      }
      const res = onRegisterStudentAndSingleCase({
        matricula: newMatricula.trim(),
        fullName: newStuName.trim(),
        institutionalEmail: newStuEmail.trim().toLowerCase(),
        programId: newStuProgram,
        semester: newStuSemester,
        group: newStuGroup.trim().toUpperCase(),
        entryGeneration: newStuGeneration.trim(),
        entryModality: newStuModality,
      });

      setStuFeedback({
        type: res.status === 'CREATED' ? 'success' : 'info',
        text: res.message,
        caseId: res.caseId,
      });
      if (res.status === 'CREATED') {
        setNewMatricula('');
        setNewStuName('');
        setNewStuEmail('');
      }
    };

    const handleImportCsvBatch = () => {
      const lines = csvInput
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let createdCount = 0;
      let duplicateCount = 0;
      for (const line of lines) {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length >= 7) {
          const [matricula, fullName, email, programId, semStr, group, gen] = parts;
          if (email.endsWith('@itdurango.edu.mx')) {
            const res = onRegisterStudentAndSingleCase({
              matricula,
              fullName,
              institutionalEmail: email,
              programId: programs.some((p) => p.id === programId) ? programId : 'prog-isc',
              semester: Number(semStr) || 1,
              group,
              entryGeneration: gen,
              entryModality: AttentionModality.NUEVO_INGRESO,
            });
            if (res.status === 'CREATED') createdCount++;
            else duplicateCount++;
          }
        }
      }
      setStuFeedback({
        type: 'success',
        text: `Importación controlada completada: ${createdCount} alumno(s) nuevos incorporados con Expediente Único; ${duplicateCount} registro(s) existentes recuperados sin duplicar.`,
      });
    };

    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Módulo de Estudiantes y Búsqueda de Expediente Único (Modalidades A y B)
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Permite buscar alumnos por matrícula, nombre o correo <span className="font-mono">@itdurango.edu.mx</span>.
            Si el estudiante ya existe, el sistema recupera su <strong>Expediente Único</strong> evitando duplicados.
            Si acude a consulta individual (Modalidad B, cualquier semestre) y no existe, permite registrarlo.
          </p>

          {stuFeedback && (
            <div
              className={`mt-4 p-3.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                stuFeedback.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : stuFeedback.type === 'info'
                  ? 'bg-blue-50 border-blue-200 text-blue-950'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-950'
              }`}
            >
              <span>{stuFeedback.text}</span>
              {stuFeedback.caseId && (
                <button
                  onClick={() => onOpenClinicalCase(stuFeedback.caseId!)}
                  className="px-3 py-1.5 font-semibold text-white bg-[#1E3A8A] rounded-md whitespace-nowrap cursor-pointer"
                >
                  Abrir Expediente {stuFeedback.caseId.toUpperCase()}
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-5">
            {/* Alta / Recuperación individual (Modalidad B o A) */}
            <form
              onSubmit={handleCreateOrRecoverStudent}
              className="border border-slate-200 rounded-xl p-4 space-y-3 text-xs"
            >
              <div className="font-bold text-slate-900 text-sm">
                Registro Individual o Recuperación en Consulta (Anti-Duplicados)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Matrícula (Nunca usada como contraseña) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newMatricula}
                    onChange={(e) => setNewMatricula(e.target.value)}
                    placeholder="Ej. 24040812 o 25040999"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Correo Institucional (@itdurango.edu.mx) *
                  </label>
                  <input
                    type="email"
                    required
                    value={newStuEmail}
                    onChange={(e) => setNewStuEmail(e.target.value)}
                    placeholder="matricula@itdurango.edu.mx"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nombre Completo del Estudiante *
                </label>
                <input
                  type="text"
                  required
                  value={newStuName}
                  onChange={(e) => setNewStuName(e.target.value)}
                  placeholder="Ej. Juan Pérez Soto"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Carrera ITD *</label>
                  <select
                    value={newStuProgram}
                    onChange={(e) => setNewStuProgram(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Semestre *</label>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    required
                    value={newStuSemester}
                    onChange={(e) => setNewStuSemester(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Grupo *</label>
                  <input
                    type="text"
                    required
                    value={newStuGroup}
                    onChange={(e) => setNewStuGroup(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Generación *</label>
                  <input
                    type="text"
                    required
                    value={newStuGeneration}
                    onChange={(e) => setNewStuGeneration(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Modalidad *</label>
                  <select
                    value={newStuModality}
                    onChange={(e) => setNewStuModality(e.target.value as AttentionModality)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value={AttentionModality.ATENCION_INDIVIDUAL}>
                      Atención individual
                    </option>
                    <option value={AttentionModality.NUEVO_INGRESO}>Nuevo ingreso</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg cursor-pointer"
              >
                Buscar o registrar alumno
              </button>
            </form>

            {/* Importación controlada desde CSV */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 text-xs flex flex-col justify-between">
              <div className="space-y-2">
                <div className="font-bold text-slate-900 text-sm">
                  Cargar varios alumnos desde un archivo
                </div>
                <p className="text-slate-600">
                  Una línea por alumno, separada por comas: matrícula, nombre, correo, carrera, semestre, grupo y generación. Los alumnos repetidos se omiten.
                </p>
                <textarea
                  rows={5}
                  value={csvInput}
                  onChange={(e) => setCsvInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg font-mono text-[11px]"
                />
              </div>
              <button
                type="button"
                onClick={handleImportCsvBatch}
                className="w-full py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                Cargar alumnos
              </button>
            </div>
          </div>
        </div>

        {/* Padrón general de estudiantes */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              Alumnos registrados ({filteredStudents.length})
            </h3>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={stuSearch}
                onChange={(e) => setStuSearch(e.target.value)}
                placeholder="Buscar matrícula, nombre o correo..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-64"
              />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <th className="py-2.5 px-3 font-semibold">Matrícula</th>
                  <th className="py-2.5 px-3 font-semibold">Nombre Completo</th>
                  <th className="py-2.5 px-3 font-semibold">Correo Institucional</th>
                  <th className="py-2.5 px-3 font-semibold">Carrera y Departamento</th>
                  <th className="py-2.5 px-3 font-semibold">Sem · Grupo · Gen</th>
                  <th className="py-2.5 px-3 font-semibold">Modalidad Incorporación</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Expediente Único</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredStudents.map((stu) => {
                  const linkedCase = cases.find((c) => c.studentId === stu.id);
                  return (
                    <tr key={stu.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {stu.matricula}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{stu.fullName}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {stu.institutionalEmail}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-800">{stu.programName}</div>
                        <div className="text-[11px] text-slate-500">{stu.academicDepartment}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {stu.semester}° · {stu.group} · {stu.entryGeneration}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {stu.entryModality === AttentionModality.NUEVO_INGRESO
                          ? 'Modalidad A (Nuevo Ingreso)'
                          : 'Modalidad B (Consulta Indiv.)'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {linkedCase && (
                          <button
                            onClick={() => onOpenClinicalCase(linkedCase.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-[#1E3A8A] bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer font-mono"
                          >
                            {linkedCase.id.toUpperCase()}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. MÓDULO DE APLICACIÓN Y CONFIGURACIÓN DE LAS 2 EVALUACIONES (BAI Y BDI)
  // ============================================================================
  if (activeModule === 'EVALUACIONES') {
    const activeConfig = instrumentConfigs[selectedConfigTab];

    // Si es ESTUDIANTE, su evaluación se asocia únicamente a su propio expediente
    const studentOwnCase = cases.find(
      (c) => c.studentId === (currentUser.linkedStudentId || students[0]?.id)
    );
    const effectiveCase =
      cases.find((c) => c.id === evalTargetCaseId) || studentOwnCase || cases[0];
    const effectiveStudent =
      students.find((s) => s.id === effectiveCase.studentId) || students[0];

    // Cálculo determinista en tiempo real de las 21 respuestas seleccionadas
    const liveDeterministicResult = evaluateInstrumentDeterministically(
      selectedConfigTab,
      activeConfig,
      evalItemResponses
    );

    const applyQuickPreset = (
      mode: 'VERDE_MINIMO' | 'AMARILLO_MODERADO' | 'ROJO_PRIORITARIO' | 'INCOMPLETO_6_21' | 'VACIAR'
    ) => {
      const next: Record<number, number> = {};
      if (mode === 'VERDE_MINIMO') {
        for (let i = 1; i <= 21; i++) next[i] = i <= 6 ? 1 : 0; // 6 pts -> Verde
      } else if (mode === 'AMARILLO_MODERADO') {
        for (let i = 1; i <= 21; i++) next[i] = 1; // 21 pts -> Amarillo
      } else if (mode === 'ROJO_PRIORITARIO') {
        for (let i = 1; i <= 21; i++) next[i] = i <= 14 ? 2 : 1; // 35 pts -> Rojo
      } else if (mode === 'INCOMPLETO_6_21') {
        for (let i = 1; i <= 6; i++) next[i] = 2; // Solo 6 de 21 contestados -> Incompleto
      }
      setEvalItemResponses(next);
      setEvalSavedBanner(null);
    };

    const handleSaveInteractiveEvaluation = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateConsultationAssessment({
        clinicalCaseId: effectiveCase.id,
        studentId: effectiveStudent.id,
        instrumentCode: selectedConfigTab,
        applicationContextNote:
          currentUser.role === RoleCode.ESTUDIANTE
            ? `Autoevaluación respondida por el estudiante autenticado (${currentUser.email}).`
            : evalContextNote,
        responses: evalItemResponses,
        professionalInterpretation:
          currentUser.role === RoleCode.ESTUDIANTE ? '' : evalInterpretation,
        overridePriority: null,
        overrideReason: '',
        nextFollowUpAction: evalNextAction,
        nextFollowUpDate: evalNextDate,
      });

      setEvalSavedBanner({
        instrumentCode: selectedConfigTab,
        caseId: effectiveCase.id,
        studentName: effectiveStudent.fullName,
        totalScore: liveDeterministicResult.totalScore,
        category: liveDeterministicResult.psychometricCategory,
        priority: liveDeterministicResult.suggestedPriority,
        status: liveDeterministicResult.status,
      });
    };

    const inspectedAssessment =
      assessments.find((a) => a.id === inspectedAssessmentId) || assessments[0];

    // Regla ética y psicométrica: Si el usuario es ESTUDIANTE o está activo el Modo Pantalla para el Alumno,
    // se ocultan estrictamente el semáforo, los puntos numéricos, los rangos de corte y las banderas de alerta.
    const isNeutralStudentScreen =
      currentUser.role === RoleCode.ESTUDIANTE || studentNeutralScreenMode;
    const effectiveEvalSubTab =
      currentUser.role === RoleCode.ESTUDIANTE ? 'APLICAR_CUESTIONARIO' : evalSubTab;

    const getSimpleOptionText = (inst: InstrumentCode, val: number) => {
      if (inst === InstrumentCode.BAI) {
        return val === 0 ? 'Nada' : val === 1 ? 'Levemente' : val === 2 ? 'Moderadamente' : 'Bastante';
      }
      return val === 0 ? 'Nada' : val === 1 ? 'Un poco' : val === 2 ? 'Moderadamente' : 'Mucho';
    };

    return (
      <div className="space-y-5">
        {/* ENCABEZADO DEL MÓDULO CON PESTAÑAS INTERNAS */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <div className="text-xs font-bold text-[#7C1D36] uppercase tracking-wider">
                {isNeutralStudentScreen
                  ? 'Oficina de Psicología · ITD'
                  : 'Módulo Clínico de Evaluación Psicométrica · SIAPE-ITD'}
              </div>
              <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                {isNeutralStudentScreen
                  ? 'Cuestionarios de Bienestar Estudiantil'
                  : 'Aplicación y Gestión de las 2 Evaluaciones Psicológicas (BAI y BDI)'}
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                {isNeutralStudentScreen ? (
                  <>Selecciona en cada punto la opción que mejor describa cómo te has sentido últimamente.</>
                ) : (
                  <>
                    Selecciona cualquiera de los <strong>2 instrumentos independientes</strong> (<strong>BAI</strong> o{' '}
                    <strong>BDI</strong>) para responder los 21 reactivos y vincular el resultado al Expediente Único.
                  </>
                )}
              </p>
            </div>

            {currentUser.role !== RoleCode.ESTUDIANTE && (
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl shrink-0">
                <button
                  onClick={() => setEvalSubTab('APLICAR_CUESTIONARIO')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                    evalSubTab === 'APLICAR_CUESTIONARIO'
                      ? 'bg-[#7C1D36] text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  1. Aplicar cuestionario
                </button>
                <button
                  onClick={() => setEvalSubTab('HISTORIAL_APLICACIONES')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                    evalSubTab === 'HISTORIAL_APLICACIONES'
                      ? 'bg-[#7C1D36] text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  2. Cuestionarios aplicados ({assessments.length})
                </button>
                <button
                  onClick={() => setEvalSubTab('CONFIGURACION_INSTRUMENTOS')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                    evalSubTab === 'CONFIGURACION_INSTRUMENTOS'
                      ? 'bg-[#7C1D36] text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  3. Configuración
                </button>
              </div>
            )}
          </div>

          {/* CONTROL DE PRIVACIDAD VISUAL PARA EL PSICÓLOGO (OCULTAR SEMÁFORO AL ALUMNO) */}
          {currentUser.role !== RoleCode.ESTUDIANTE && evalSubTab === 'APLICAR_CUESTIONARIO' && (
            <div className="mt-3.5 p-3 rounded-xl border border-blue-200 bg-blue-50/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
              <div className="font-semibold text-[#1E3A8A]">
                {studentNeutralScreenMode
                  ? 'Vista para el alumno: sin semáforo ni puntajes.'
                  : 'Vista para el psicólogo: con puntajes y semáforo.'}
              </div>
              <button
                type="button"
                onClick={() => setStudentNeutralScreenMode((prev) => !prev)}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  studentNeutralScreenMode
                    ? 'bg-white text-[#1E3A8A] border border-blue-300 hover:bg-blue-100'
                    : 'bg-[#1E3A8A] text-white hover:bg-blue-900'
                }`}
              >
                {studentNeutralScreenMode
                  ? 'Cambiar a Vista de Psicólogo'
                  : 'Cambiar a Vista Limpia para Alumno'}
              </button>
            </div>
          )}

          {/* SELECTOR DE LOS 2 INSTRUMENTOS PSICOLÓGICOS */}
          <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Tarjeta Instrumento 1: BAI */}
              <button
                type="button"
                onClick={() => {
                  setSelectedConfigTab(InstrumentCode.BAI);
                  setEvalSavedBanner(null);
                }}
                className={`text-left p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                  selectedConfigTab === InstrumentCode.BAI
                    ? 'border-[#7C1D36] bg-rose-50/40 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-[#7C1D36] text-white">
                    {isNeutralStudentScreen ? 'CUESTIONARIO 1' : 'EVALUACIÓN 1 · BAI'}
                  </span>
                  {!isNeutralStudentScreen && (
                    <span className="text-[11px] font-mono text-slate-500">
                      0–15 Verde · 16–25 Amarillo · 26–63 Rojo
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-slate-900 mt-1.5">
                  {isNeutralStudentScreen
                    ? 'Cuestionario 1 (Sensaciones Físicas y Nerviosismo — 21 preguntas)'
                    : 'Inventario de Ansiedad de Beck (BAI — 21 reactivos)'}
                </div>
              </button>

              {/* Tarjeta Instrumento 2: BDI */}
              <button
                type="button"
                onClick={() => {
                  setSelectedConfigTab(InstrumentCode.BDI);
                  setEvalSavedBanner(null);
                }}
                className={`text-left p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                  selectedConfigTab === InstrumentCode.BDI
                    ? 'border-[#1E3A8A] bg-blue-50/40 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-[#1E3A8A] text-white">
                    {isNeutralStudentScreen ? 'CUESTIONARIO 2' : 'EVALUACIÓN 2 · BDI'}
                  </span>
                  {!isNeutralStudentScreen && (
                    <span className="text-[11px] font-mono text-slate-500">
                      0–13 Verde · 14–28 Amarillo · 29–63 Rojo
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-slate-900 mt-1.5">
                  {isNeutralStudentScreen
                    ? 'Cuestionario 2 (Estado de Ánimo y Energía — 21 preguntas)'
                    : 'Inventario de Depresión de Beck (BDI — 21 reactivos)'}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* SUB-PESTAÑA 1: APLICACIÓN INTERACTIVA DEL CUESTIONARIO (21 REACTIVOS) */}
        {/* ===================================================================== */}
        {effectiveEvalSubTab === 'APLICAR_CUESTIONARIO' && (
          <form onSubmit={handleSaveInteractiveEvaluation} className="space-y-5">
            {/* Banner de confirmación cuando se guarda una evaluación */}
            {evalSavedBanner && (
              <div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>
                      {isNeutralStudentScreen
                        ? `¡Gracias, ${evalSavedBanner.studentName}! Tus respuestas fueron enviadas.`
                        : `Evaluación ${evalSavedBanner.instrumentCode} registrada en Expediente ${evalSavedBanner.caseId.toUpperCase()} (${evalSavedBanner.studentName})`}
                    </span>
                  </div>
                  {!isNeutralStudentScreen && (
                    <div className="text-xs text-emerald-950">
                      Estado: <strong className="font-mono">{evalSavedBanner.status}</strong> · Puntaje:{' '}
                      <strong className="font-mono">
                        {evalSavedBanner.totalScore !== null
                          ? `${evalSavedBanner.totalScore} / 63 pts`
                          : 'Incompleta'}
                      </strong>{' '}
                      · Semáforo: <strong className="font-mono">{evalSavedBanner.priority || 'N/A'}</strong>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const otherInstrument =
                        evalSavedBanner.instrumentCode === InstrumentCode.BAI
                          ? InstrumentCode.BDI
                          : InstrumentCode.BAI;
                      setSelectedConfigTab(otherInstrument);
                      setEvalSavedBanner(null);
                    }}
                    className="px-3.5 py-2 text-xs font-bold text-[#1E3A8A] bg-white border border-blue-300 hover:bg-blue-50 rounded-lg cursor-pointer"
                  >
                    Pasar al{' '}
                    {evalSavedBanner.instrumentCode === InstrumentCode.BAI
                      ? 'Cuestionario 2'
                      : 'Cuestionario 1'}
                  </button>
                  {!isNeutralStudentScreen && currentUser.role !== RoleCode.ESTUDIANTE && (
                    <button
                      type="button"
                      onClick={() => onOpenClinicalCase(evalSavedBanner.caseId)}
                      className="px-3.5 py-2 text-xs font-bold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg cursor-pointer"
                    >
                      Ver Expediente ({evalSavedBanner.caseId.toUpperCase()})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Paso 1: Identificación del Estudiante Evaluado */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs items-center">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Estudiante
                  </label>
                  {currentUser.role === RoleCode.ESTUDIANTE ? (
                    <div>
                      <select
                        value={evalTargetCaseId}
                        onChange={(e) => {
                          setEvalTargetCaseId(e.target.value);
                          setEvalSavedBanner(null);
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-900"
                      >
                        {cases.map((c) => {
                          const stu = students.find((s) => s.id === c.studentId);
                          if (!stu) return null;
                          return (
                            <option key={c.id} value={c.id}>
                              {stu.fullName} · Matrícula {stu.matricula} ({stu.programName})
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Estudiante del ITD: Tus respuestas son anónimas para tus compañeros y se guardan de forma confidencial.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={evalTargetCaseId}
                      onChange={(e) => {
                        setEvalTargetCaseId(e.target.value);
                        setEvalSavedBanner(null);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-900"
                    >
                      {cases.map((c) => {
                        const stu = students.find((s) => s.id === c.studentId);
                        if (!stu) return null;
                        return (
                          <option key={c.id} value={c.id}>
                            Mat. {stu.matricula} — {stu.fullName} ({stu.semester}° {stu.programName})
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {!isNeutralStudentScreen ? (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Motivo de Aplicación ({effectiveCase.id.toUpperCase()})
                    </label>
                    <input
                      type="text"
                      required
                      value={evalContextNote}
                      onChange={(e) => setEvalContextNote(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Carrera y Semestre
                    </label>
                    <div className="px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 font-medium">
                      {effectiveStudent.programName} · {effectiveStudent.semester}° Semestre
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Paso 2: Cuestionario Interactivo de los 21 Reactivos (Lectura Mínima y Directa) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="space-y-3 border-b border-slate-200 pb-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-slate-900">
                    {isNeutralStudentScreen
                      ? selectedConfigTab === InstrumentCode.BAI
                        ? 'Cuestionario 1 — ¿Qué tanto te han molestado estas sensaciones?'
                        : 'Cuestionario 2 — ¿Cómo te has sentido en los últimos días?'
                      : `Reactivos de ${activeConfig.instrumentName}`}
                  </h2>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Selector entre 1 pregunta a la vez (estilo app móvil de la imagen) o Lista */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => setQuestionnaireLayoutMode('PASO_A_PASO')}
                        className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                          questionnaireLayoutMode === 'PASO_A_PASO'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        1 por pantalla
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuestionnaireLayoutMode('LISTA_COMPLETA')}
                        className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                          questionnaireLayoutMode === 'LISTA_COMPLETA'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Lista (21)
                      </button>
                    </div>

                    <div className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg whitespace-nowrap">
                      Respondidas: {liveDeterministicResult.answeredCount} / {liveDeterministicResult.expectedCount}
                      {!isNeutralStudentScreen && (
                        <>
                          {' '}
                          · Puntaje:{' '}
                          <span className="font-bold text-[#7C1D36]">
                            {liveDeterministicResult.totalScore !== null
                              ? `${liveDeterministicResult.totalScore} / 63 pts`
                              : 'Incompleto'}
                          </span>
                        </>
                      )}
                    </div>
                    {isNeutralStudentScreen && (
                      <button
                        type="button"
                        onClick={() => {
                          applyQuickPreset('VACIAR');
                          setCurrentStepItemNumber(1);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-600 border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        Limpiar
                      </button>
                    )}
                    {!isNeutralStudentScreen && (
                      <button
                        type="button"
                        onClick={() => onOpenClinicalCase(effectiveCase.id)}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        Ver Panorama Clínico y Recomendaciones
                      </button>
                    )}
                  </div>
                </div>

                {/* Botón de limpiar respuestas */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      applyQuickPreset('VACIAR');
                      setCurrentStepItemNumber(1);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-600 border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    Limpiar respuestas del cuestionario
                  </button>
                </div>
              </div>

              {/* MODO A: TARJETA PASO A PASO (1 PREGUNTA A LA VEZ COMO EN EL MÓVIL DE LA IMAGEN) */}
              {questionnaireLayoutMode === 'PASO_A_PASO' ? (
                (() => {
                  const stepItem =
                    activeConfig.items.find((i) => i.itemNumber === currentStepItemNumber) ||
                    activeConfig.items[0];
                  const selectedVal = evalItemResponses[stepItem.itemNumber];
                  const cleanTitle = stepItem.placeholderLabel
                    .replace(/^Reactivo #\d+:\s*/i, '')
                    .replace(/\s*\[Texto configurable.*\]$|\s*\[Grupo de afirmaciones.*\]$/i, '')
                    .replace(/\s*\[Reactivo con bandera.*\]/i, '');
                  const progressPct = Math.round((stepItem.itemNumber / 21) * 100);

                  return (
                    <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                      {/* Barra superior de progreso estilo Blueprint móvil */}
                      <div className="space-y-2">
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              selectedConfigTab === InstrumentCode.BAI ? 'bg-[#7C1D36]' : 'bg-[#1E3A8A]'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                          <span>{selectedConfigTab}</span>
                          <span>
                            {stepItem.itemNumber} de {activeConfig.totalItems}
                          </span>
                        </div>
                      </div>

                      {/* Pregunta centrada clara */}
                      <div className="text-center space-y-1.5 py-2">
                        <div className="text-xs text-slate-500">
                          Durante los últimos días, ¿qué tanto has presentado...
                        </div>
                        <div className="text-lg font-bold text-slate-900 leading-snug">
                          {cleanTitle}?
                        </div>
                      </div>

                      {/* 4 botones verticales limpios con palomita (✓) */}
                      <div className="space-y-2.5">
                        {stepItem.options.map((opt) => {
                          const active = selectedVal === opt.value;
                          const shortLabel = getSimpleOptionText(selectedConfigTab, opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setEvalItemResponses((prev) => ({
                                  ...prev,
                                  [stepItem.itemNumber]: opt.value,
                                }));
                                setEvalSavedBanner(null);
                                if (stepItem.itemNumber < 21) {
                                  setCurrentStepItemNumber(stepItem.itemNumber + 1);
                                }
                              }}
                              className={`w-full py-3.5 px-4 rounded-xl border text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                                active
                                  ? 'bg-blue-50/90 text-[#1E3A8A] border-[#1E3A8A]'
                                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <span className="mx-auto">
                                {isNeutralStudentScreen
                                  ? shortLabel
                                  : `${opt.value} pts · ${shortLabel}`}
                              </span>
                              {active && <span className="text-[#1E3A8A] font-bold">✓</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* Navegación Anterior / Siguiente */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <button
                          type="button"
                          disabled={stepItem.itemNumber <= 1}
                          onClick={() =>
                            setCurrentStepItemNumber((n) => Math.max(1, n - 1))
                          }
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 cursor-pointer"
                        >
                          ← Anterior
                        </button>
                        <div className="flex gap-1">
                          {activeConfig.items.map((it) => (
                            <button
                              key={it.itemNumber}
                              type="button"
                              onClick={() => setCurrentStepItemNumber(it.itemNumber)}
                              className={`w-2 h-2 rounded-full cursor-pointer ${
                                it.itemNumber === stepItem.itemNumber
                                  ? 'bg-[#1E3A8A]'
                                  : typeof evalItemResponses[it.itemNumber] === 'number'
                                  ? 'bg-slate-400'
                                  : 'bg-slate-200'
                              }`}
                              title={`Pregunta ${it.itemNumber}`}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={stepItem.itemNumber >= 21}
                          onClick={() =>
                            setCurrentStepItemNumber((n) => Math.min(21, n + 1))
                          }
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 cursor-pointer"
                        >
                          Siguiente →
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* MODO B: Lista de los 21 Reactivos con mínima carga visual y 1 sola etiqueta por botón */
                <div className="space-y-2.5">
                  {activeConfig.items.map((item) => {
                    const selectedVal = evalItemResponses[item.itemNumber];
                    const isAnswered = typeof selectedVal === 'number';
                    const cleanTitle = item.placeholderLabel
                      .replace(/^Reactivo #\d+:\s*/i, '')
                      .replace(/\s*\[Texto configurable.*\]$|\s*\[Grupo de afirmaciones.*\]$/i, '')
                      .replace(/\s*\[Reactivo con bandera.*\]/i, '');
                    return (
                      <div
                        key={item.itemCode}
                        className={`p-3.5 rounded-xl border transition-colors ${
                          !isNeutralStudentScreen && item.triggersAlertReview && selectedVal && selectedVal > 0
                            ? 'border-rose-400 bg-rose-50/50'
                            : isAnswered
                            ? 'border-slate-200 bg-slate-50/40'
                            : 'border-amber-300 bg-amber-50/20'
                        }`}
                      >
                        {/* Encabezado limpio del reactivo: solo número y texto corto */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-6 h-6 rounded-md font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                                selectedConfigTab === InstrumentCode.BAI
                                  ? 'bg-rose-100 text-[#7C1D36]'
                                  : 'bg-blue-100 text-[#1E3A8A]'
                              }`}
                            >
                              {item.itemNumber}
                            </span>
                            <span className="text-sm font-bold text-slate-900">{cleanTitle}</span>
                          </div>

                          {!isAnswered && (
                            <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
                              Falta responder
                            </span>
                          )}
                        </div>

                        {/* 4 Botones con UNA SOLA etiqueta clara y corta */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                          {item.options.map((opt) => {
                            const active = selectedVal === opt.value;
                            const shortLabel = getSimpleOptionText(selectedConfigTab, opt.value);
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setEvalItemResponses((prev) => ({
                                    ...prev,
                                    [item.itemNumber]: opt.value,
                                  }));
                                  setEvalSavedBanner(null);
                                }}
                                className={`w-full py-2.5 px-3 rounded-lg border text-center text-xs font-bold transition-all cursor-pointer ${
                                  active
                                    ? selectedConfigTab === InstrumentCode.BAI
                                      ? 'bg-[#7C1D36] text-white border-[#7C1D36] shadow-xs'
                                      : 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {isNeutralStudentScreen
                                  ? shortLabel
                                  : `${opt.value} pts · ${shortLabel}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Paso 3: Cierre de Cuestionario (Neutral para el Alumno vs Técnico para el Psicólogo) */}
            {isNeutralStudentScreen ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Respuestas confidenciales · {liveDeterministicResult.answeredCount} de{' '}
                    {liveDeterministicResult.expectedCount} respondidas
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tus respuestas solo son revisadas por la Oficina de Psicología del ITD.
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                >
                  Enviar Respuestas
                </button>
              </div>
            ) : (
              <div className="bg-white border-2 border-slate-300 rounded-xl p-6 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <div className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">
                      Paso 3 · Resultado (solo psicología)
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                      Resultado en Tiempo Real para {activeConfig.instrumentName}
                    </h3>
                    <p className="text-xs text-slate-600">
                      Regla aplicada: <span className="font-mono">{liveDeterministicResult.scoringRuleVersion}</span> ·
                      Los puntajes de Ansiedad (BAI) y Depresión (BDI) se almacenan por separado y nunca se suman.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-right">
                      <div className="text-[11px] text-slate-500 font-medium">Reactivos Contestados</div>
                      <div className="text-base font-bold font-mono text-slate-900 tabular-nums">
                        {liveDeterministicResult.answeredCount} / {liveDeterministicResult.expectedCount} (
                        {Math.round(
                          (liveDeterministicResult.answeredCount /
                            liveDeterministicResult.expectedCount) *
                            100
                        )}
                        %)
                      </div>
                    </div>

                    <div className="px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-right">
                      <div className="text-[11px] text-slate-500 font-medium">
                        Puntaje {activeConfig.instrumentCode} (0–63)
                      </div>
                      <div className="text-xl font-bold font-mono text-[#7C1D36] tabular-nums">
                        {liveDeterministicResult.totalScore !== null
                          ? `${liveDeterministicResult.totalScore} / 63 pts`
                          : 'INCOMPLETO (Sin puntaje)'}
                      </div>
                    </div>

                    <div className="px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Semáforo Sugerido</div>
                      <div className="text-sm font-bold mt-0.5">
                        {liveDeterministicResult.suggestedPriority === PriorityLevel.ROJO && (
                          <span className="text-rose-700">ROJO · Prioritario</span>
                        )}
                        {liveDeterministicResult.suggestedPriority === PriorityLevel.AMARILLO && (
                          <span className="text-amber-700">AMARILLO · Valoración</span>
                        )}
                        {liveDeterministicResult.suggestedPriority === PriorityLevel.VERDE && (
                          <span className="text-emerald-700">VERDE · Ordinario</span>
                        )}
                        {!liveDeterministicResult.suggestedPriority && (
                          <span className="text-slate-500">Pendiente completar 21/21</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 space-y-1">
                  <div>
                    <strong>Categoría de Interpretación Configurada:</strong>{' '}
                    {liveDeterministicResult.psychometricCategory ||
                      'No disponible hasta completar los 21 reactivos del instrumento.'}
                  </div>
                  <div className="text-slate-600">{liveDeterministicResult.validationMessage}</div>
                  {liveDeterministicResult.protocolItemFlagTriggered && (
                    <div className="text-rose-800 font-bold pt-1">
                      ALERTA DE PROTOCOLO CLÍNICO: Se detectó respuesta crítica en reactivo de revisión
                      protocolaria directa. Se sugiere Prioridad ROJO para valoración inmediata.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="md:col-span-3">
                    <label className="block font-semibold text-slate-800 mb-1">
                      Interpretación Profesional del Psicólogo (Opcional al aplicar, recomendada en consulta)
                    </label>
                    <textarea
                      rows={2}
                      value={evalInterpretation}
                      onChange={(e) => setEvalInterpretation(e.target.value)}
                      placeholder="Anota las observaciones clínicas sobre la aplicación de este instrumento (el sistema no realiza diagnósticos automáticos)..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-800 mb-1">
                      Próxima Acción de Seguimiento en el Expediente Único *
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
                      Fecha Programada de Seguimiento *
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

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
                  <div className="text-xs text-slate-500">
                    Alumno: <strong>{effectiveStudent.fullName}</strong> (Mat.{' '}
                    <span className="font-mono">{effectiveStudent.matricula}</span>) · Expediente:{' '}
                    <span className="font-mono font-bold text-[#7C1D36]">
                      {effectiveCase.id.toUpperCase()}
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg cursor-pointer shadow-xs"
                  >
                    Guardar y Registrar Evaluación {activeConfig.instrumentCode} en Expediente Único
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {/* ===================================================================== */}
        {/* SUB-PESTAÑA 2: HISTORIAL DE EVALUACIONES APLICADAS E INSPECTOR 21 ÍTEMS */}
        {/* ===================================================================== */}
        {effectiveEvalSubTab === 'HISTORIAL_APLICACIONES' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Registro Histórico de Evaluaciones Aplicadas (BAI y BDI)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Selecciona cualquier evaluación para inspeccionar las respuestas de los 21 reactivos o abrir
                    el Expediente Institucional Único del estudiante.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEvalSubTab('APLICAR_CUESTIONARIO')}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-[#7C1D36] rounded-lg cursor-pointer shrink-0"
                >
                  + Aplicar Nueva Evaluación (BAI / BDI)
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                      <th className="py-2.5 px-3 font-semibold">Fecha / Folio</th>
                      <th className="py-2.5 px-3 font-semibold">Estudiante / Expediente</th>
                      <th className="py-2.5 px-3 font-semibold">Instrumento y Versión</th>
                      <th className="py-2.5 px-3 font-semibold">Estado</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Puntaje (0–63)</th>
                      <th className="py-2.5 px-3 font-semibold">Categoría / Semáforo</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {assessments.map((ass) => {
                      const stu = students.find((s) => s.id === ass.studentId);
                      const isSelected = inspectedAssessment?.id === ass.id;
                      return (
                        <tr
                          key={ass.id}
                          className={isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50/80'}
                        >
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            <div className="font-bold text-slate-900">{ass.appliedAt.slice(0, 10)}</div>
                            <div className="text-[11px] text-slate-500">{ass.id}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">
                              {stu?.fullName || ass.studentId}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              Mat. {stu?.matricula} · Exp. {ass.clinicalCaseId.toUpperCase()}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`font-mono font-bold px-2 py-0.5 rounded text-white text-[11px] ${
                                ass.instrumentCode === InstrumentCode.BAI
                                  ? 'bg-[#7C1D36]'
                                  : 'bg-[#1E3A8A]'
                              }`}
                            >
                              {ass.instrumentCode}
                            </span>
                            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                              {ass.versionTag}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold">
                            {ass.status} ({ass.completionPercentage}%)
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-right tabular-nums text-slate-900">
                            {ass.totalScore !== null ? `${ass.totalScore} / 63 pts` : 'Sin puntaje'}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-900">
                              {ass.psychometricCategory || 'Incompleta — No válida'}
                            </div>
                            {ass.suggestedPriority && (
                              <div className="text-[11px] font-bold text-slate-600">
                                Semáforo sugerido: {ass.suggestedPriority}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setInspectedAssessmentId(ass.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-[#1E3A8A] bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer"
                            >
                              Ver 21 Respuestas
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenClinicalCase(ass.clinicalCaseId)}
                              className="px-2.5 py-1 text-xs font-semibold text-[#7C1D36] bg-rose-50 hover:bg-rose-100 rounded-md cursor-pointer font-mono"
                            >
                              {ass.clinicalCaseId.toUpperCase()}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Desglose de los 21 reactivos de la evaluación seleccionada */}
            {inspectedAssessment && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <div className="text-xs font-mono font-bold text-[#1E3A8A]">
                      INSPECCIÓN DETALLADA DE EVALUACIÓN · FOLIO {inspectedAssessment.id.toUpperCase()}
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      Desglose de los 21 Reactivos ({inspectedAssessment.instrumentCode} ·{' '}
                      {inspectedAssessment.versionTag})
                    </h3>
                  </div>
                  <div className="font-mono text-sm font-bold text-[#7C1D36]">
                    Puntaje Total:{' '}
                    {inspectedAssessment.totalScore !== null
                      ? `${inspectedAssessment.totalScore} / 63 pts`
                      : 'INCOMPLETA (Sin puntaje)'}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {instrumentConfigs[inspectedAssessment.instrumentCode].items.map((item) => {
                    const val = inspectedAssessment.responses[item.itemNumber];
                    return (
                      <div
                        key={item.itemCode}
                        className="p-3 border border-slate-200 rounded-lg text-xs bg-slate-50/60 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-mono font-bold text-slate-900">{item.itemCode}</div>
                          <div className="text-[11px] text-slate-600 line-clamp-1">
                            {item.placeholderLabel}
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded font-mono font-bold shrink-0 ${
                            typeof val === 'number'
                              ? val >= 2
                                ? 'bg-rose-100 text-rose-900'
                                : 'bg-blue-100 text-[#1E3A8A]'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {typeof val === 'number' ? `${val} pts` : 'N/R'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* SUB-PESTAÑA 3: CONFIGURACIÓN TÉCNICA, PUNTOS DE CORTE Y PERIODOS       */}
        {/* ===================================================================== */}
        {effectiveEvalSubTab === 'CONFIGURACION_INSTRUMENTOS' && (
          <div className="space-y-6">
            {/* Periodos de Evaluación */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-lg font-bold text-slate-900">
                Periodos de Evaluación y Modalidades Operativas Activas
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {periods.map((per) => (
                  <div
                    key={per.id}
                    className="border border-slate-200 rounded-xl p-4 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#7C1D36]">{per.code}</span>
                      <span className="font-semibold text-emerald-700">
                        {per.isActive ? 'PERIODO ACTIVO' : 'CERRADO'}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-900">{per.name}</div>
                    <div className="text-slate-600">
                      Vigencia: <span className="font-mono">{per.startDate}</span> al{' '}
                      <span className="font-mono">{per.endDate}</span> · Generación:{' '}
                      {per.targetGeneration}
                    </div>
                    <div className="text-slate-500">Autorizado por: {per.authorizedBy}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Configuración Independiente de los 2 Instrumentos (BAI y BDI) */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-950">
                <div className="font-bold">
                  Resguardo de Propiedad Intelectual y Verificación Institucional (
                  {activeConfig.instrumentName})
                </div>
                <p className="mt-1">{activeConfig.licenseStatusNote}</p>
                <div className="mt-2 font-mono text-[11px] text-amber-900">
                  Versión activa: {activeConfig.versionTag} · Regla de cálculo:{' '}
                  {activeConfig.scoringRuleVersion} · Aprobado por: {activeConfig.approvedBy} · Vigencia
                  desde: {activeConfig.effectiveFrom}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-2">
                  Criterios Aprobados de Puntuación y Semáforo Operativo para{' '}
                  {activeConfig.instrumentCode}
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                        <th className="py-2.5 px-3 font-semibold">Rango de Puntaje (0–63)</th>
                        <th className="py-2.5 px-3 font-semibold">
                          Categoría de Interpretación Configurada
                        </th>
                        <th className="py-2.5 px-3 font-semibold">Nivel de Semáforo Sugerido</th>
                        <th className="py-2.5 px-3 font-semibold">Lineamiento Operativo Aprobado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeConfig.cutoffBands.map((band) => (
                        <tr key={band.bandId}>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {band.minScore} a {band.maxScore} puntos
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {band.categoryLabel}
                          </td>
                          <td className="py-2.5 px-3 font-bold">
                            {band.suggestedOperationalPriority === PriorityLevel.ROJO && (
                              <span className="text-rose-700">ROJO · Prioritario</span>
                            )}
                            {band.suggestedOperationalPriority === PriorityLevel.AMARILLO && (
                              <span className="text-amber-700">AMARILLO · Valoración</span>
                            )}
                            {band.suggestedOperationalPriority === PriorityLevel.VERDE && (
                              <span className="text-emerald-700">VERDE · Ordinario</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{band.operationalGuidance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 3. MÓDULO DE SEGUIMIENTO OPERATIVO (SECCIÓN 12)
  // ============================================================================
  if (activeModule === 'SEGUIMIENTO') {
    const filteredCases = cases.filter((c) => {
      if (followUpFilter === 'TODOS') return true;
      if (followUpFilter === 'VENCIDOS') {
        return tasks.some((t) => t.clinicalCaseId === c.id && t.status === 'VENCIDA');
      }
      return c.followUpState === followUpFilter;
    });

    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Módulo de Seguimiento Clínico y Programación de Acciones
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Regla institucional: <strong>No se permite cerrar automáticamente un caso</strong> solo porque se haya
            realizado una sesión o porque el resultado de una evaluación haya disminuido.
          </p>

          {/* Filtros por las 8 bandejas obligatorias de la Sección 12 */}
          <div className="flex flex-wrap items-center gap-1.5 mt-4">
            {[
              { id: 'TODOS', label: `Todos (${cases.length})` },
              {
                id: CaseFollowUpState.PENDIENTE_CONTACTO,
                label: `Pendientes de contacto (${
                  cases.filter((c) => c.followUpState === CaseFollowUpState.PENDIENTE_CONTACTO).length
                })`,
              },
              {
                id: CaseFollowUpState.SIN_ASIGNAR,
                label: `Sin profesional asignado (${
                  cases.filter((c) => c.followUpState === CaseFollowUpState.SIN_ASIGNAR).length
                })`,
              },
              {
                id: CaseFollowUpState.CITA_PROGRAMADA,
                label: `Citas programadas (${
                  cases.filter((c) => c.followUpState === CaseFollowUpState.CITA_PROGRAMADA).length
                })`,
              },
              {
                id: 'VENCIDOS',
                label: `Seguimientos vencidos (${
                  tasks.filter((t) => t.status === 'VENCIDA').length
                })`,
              },
              {
                id: CaseFollowUpState.EN_ATENCION,
                label: `En atención (${
                  cases.filter((c) => c.followUpState === CaseFollowUpState.EN_ATENCION).length
                })`,
              },
              {
                id: CaseFollowUpState.REQUIERE_NUEVA_VALORACION,
                label: `Requieren nueva valoración (${
                  cases.filter(
                    (c) => c.followUpState === CaseFollowUpState.REQUIERE_NUEVA_VALORACION
                  ).length
                })`,
              },
              {
                id: CaseFollowUpState.CANALIZADO,
                label: `Canalizados (${
                  cases.filter((c) => c.followUpState === CaseFollowUpState.CANALIZADO).length
                })`,
              },
              {
                id: CaseFollowUpState.SEGUIMIENTO_CONCLUIDO,
                label: `Concluidos (${
                  cases.filter((c) => c.followUpState === CaseFollowUpState.SEGUIMIENTO_CONCLUIDO)
                    .length
                })`,
              },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() =>
                  setFollowUpFilter(btn.id as 'TODOS' | CaseFollowUpState | 'VENCIDOS')
                }
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                  followUpFilter === btn.id
                    ? 'bg-[#1E3A8A] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {filteredCases.map((c) => {
              const stu = students.find((s) => s.id === c.studentId)!;
              const relatedTasks = tasks.filter((t) => t.clinicalCaseId === c.id);
              return (
                <div
                  key={c.id}
                  className="border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-[#7C1D36]">
                        {c.id.toUpperCase()}
                      </span>
                      <span>·</span>
                      <span className="font-bold text-slate-900">{stu.fullName}</span>
                      <span>·</span>
                      <span className="font-mono text-slate-600">Mat. {stu.matricula}</span>
                      <span>·</span>
                      <span className="font-semibold text-slate-700">Estado: {c.followUpState}</span>
                    </div>
                    <div className="text-slate-600">
                      Próxima acción: <strong>{c.nextFollowUpAction}</strong> · Fecha programada:{' '}
                      <span className="font-mono font-semibold">
                        {c.nextFollowUpDate || 'Sin fecha'}
                      </span>
                    </div>
                    <div className="text-slate-500">
                      Psicólogo responsable:{' '}
                      <strong className="text-slate-800">
                        {c.assignedPsychologistName || 'SIN ASIGNAR'}
                      </strong>{' '}
                      · Practicante:{' '}
                      <strong className="text-slate-800">
                        {c.assignedInternName || 'Ninguno'}
                      </strong>
                    </div>

                    {relatedTasks.map((t) => (
                      <div
                        key={t.id}
                        className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <span
                            className={`font-mono font-bold mr-2 ${
                              t.status === 'VENCIDA'
                                ? 'text-rose-700'
                                : t.status === 'COMPLETADA'
                                ? 'text-emerald-700'
                                : 'text-[#1E3A8A]'
                            }`}
                          >
                            [{t.status} · Vence: {t.dueDate}]
                          </span>
                          <span className="font-medium text-slate-900">{t.title}</span>
                        </div>
                        {t.status !== 'COMPLETADA' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Registrar acción realizada..."
                              value={taskNoteMap[t.id] || ''}
                              onChange={(e) =>
                                setTaskNoteMap((prev) => ({ ...prev, [t.id]: e.target.value }))
                              }
                              className="px-2.5 py-1 border border-slate-300 rounded-md text-xs w-52 bg-white"
                            />
                            <button
                              onClick={() =>
                                onCompleteFollowUpTask(
                                  t.id,
                                  taskNoteMap[t.id] || 'Contacto y seguimiento realizados',
                                  '2026-10-25'
                                )
                              }
                              className="px-2.5 py-1 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md cursor-pointer whitespace-nowrap"
                            >
                              Registrar Acción
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(currentUser.role === RoleCode.ADMINISTRADOR ||
                      currentUser.role === RoleCode.RESPONSABLE_PSICOLOGIA ||
                      currentUser.role === RoleCode.PSICOLOGO) && (
                      <>
                        <select
                          value={c.assignedPsychologistId || ''}
                          onChange={(e) =>
                            onAssignCaseResponsible(c.id, e.target.value || null, c.assignedInternId)
                          }
                          className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
                        >
                          <option value="">Sin Psicólogo Asignado</option>
                          {psychologists.map((psi) => (
                            <option key={psi.id} value={psi.id}>
                              Psicólogo: {psi.fullName}
                            </option>
                          ))}
                        </select>

                        <select
                          value={c.assignedInternId || ''}
                          onChange={(e) =>
                            onAssignCaseResponsible(c.id, c.assignedPsychologistId, e.target.value || null)
                          }
                          className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
                        >
                          <option value="">Sin Practicante Asignado</option>
                          {(currentUser.role === RoleCode.PSICOLOGO
                            ? users.filter((u) => u.role === RoleCode.PRACTICANTE && u.supervisorId === currentUser.id)
                            : users.filter((u) => u.role === RoleCode.PRACTICANTE)
                          ).map((intern) => (
                            <option key={intern.id} value={intern.id}>
                              Practicante: {intern.fullName}
                            </option>
                          ))}
                        </select>
                      </>
                    )}

                    <button
                      onClick={() => onOpenClinicalCase(c.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Abrir Expediente
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 4. MÓDULO DE TUTORÍAS ACADÉMICAS CON PERMISOS LIMITADOS (SECCIÓN 13)
  // ============================================================================
  if (activeModule === 'TUTORIAS') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="border-b border-slate-200 pb-4">
            <div className="text-xs font-semibold text-[#1E3A8A]">
              Coordinación de Psicología · Tutoría Académica
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              Alertas de acompañamiento académico
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              El tutor ve solo los datos académicos y las recomendaciones generales que Psicología autoriza. Nunca ve respuestas de cuestionarios, puntajes, notas clínicas ni antecedentes de atención.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {tutorAlerts.map((alert) => (
              <div
                key={alert.id}
                className="border border-slate-200 rounded-xl p-5 space-y-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <span className="font-mono font-bold text-[#7C1D36] mr-2">
                      Matrícula: {alert.studentMatricula}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {alert.studentFullName}
                    </span>
                    <span className="text-slate-500 ml-2">
                      · {alert.studentProgram} ({alert.studentSemester}° Sem, Grupo{' '}
                      {alert.studentGroup})
                    </span>
                  </div>
                  <span className="font-mono font-semibold text-[#1E3A8A]">
                    Estado: {alert.status}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="font-bold text-slate-900">
                    Recomendaciones Generales de Apoyo Académico (Autorizadas por{' '}
                    {alert.authorizedByPsychologistName}):
                  </div>
                  <p className="text-slate-700 mt-1 leading-relaxed">
                    {alert.generalAcademicRecommendations}
                  </p>
                  <div className="text-[11px] font-mono text-slate-500 mt-1.5">
                    Fecha de autorización: {alert.createdAt.replace('T', ' ').slice(0, 16)} · Tutor
                    asignado: {alert.assignedTutorName}
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-slate-800 mb-1">
                    Acciones de acompañamiento autorizadas:
                  </div>
                  <ul className="list-disc list-inside text-slate-700 space-y-1">
                    {alert.authorizedTutorActions.map((act, i) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="font-semibold text-slate-800">
                    Bitácora de Acciones de Acompañamiento Registradas por el Tutor:
                  </div>
                  {alert.tutorRegisteredActions.length === 0 ? (
                    <div className="text-slate-500">
                      Aún no se han registrado acciones tutoriales en esta alerta.
                    </div>
                  ) : (
                    alert.tutorRegisteredActions.map((ta) => (
                      <div
                        key={ta.id}
                        className="p-2.5 bg-emerald-50/50 border border-emerald-200 rounded-lg"
                      >
                        <div className="flex justify-between font-mono text-[11px] text-emerald-900">
                          <span>{ta.tutorName}</span>
                          <span>{ta.registeredAt.replace('T', ' ').slice(0, 16)}</span>
                        </div>
                        <p className="text-slate-800 mt-1">{ta.actionSummary}</p>
                      </div>
                    ))
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="text"
                      value={tutorActionInputMap[alert.id] || ''}
                      onChange={(e) =>
                        setTutorActionInputMap((prev) => ({
                          ...prev,
                          [alert.id]: e.target.value,
                        }))
                      }
                      placeholder="Registrar acción de acompañamiento académico realizada por el tutor..."
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg"
                    />
                    <button
                      onClick={() => {
                        const text = tutorActionInputMap[alert.id];
                        if (!text?.trim()) return;
                        onRegisterTutorAction(alert.id, text.trim());
                        setTutorActionInputMap((prev) => ({ ...prev, [alert.id]: '' }));
                      }}
                      className="px-3.5 py-1.5 font-semibold text-white bg-[#1E3A8A] rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Registrar Acción Tutorial
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 5. MÓDULO DE ADMINISTRACIÓN DE USUARIOS Y AUDITORÍA (SECCIÓN 7)
  // ============================================================================
  if (activeModule === 'USUARIOS') {
    const handleAddUser = (e: React.FormEvent) => {
      e.preventDefault();
      setUsrError(null);
      if (usrRole === RoleCode.PRACTICANTE && !usrSupervisorId) {
        setUsrError('Todo practicante requiere obligatoriamente un psicólogo supervisor asignado.');
        return;
      }
      onCreateUserProfile({
        fullName: usrFullName.trim(),
        email: usrEmail.trim().toLowerCase(),
        role: usrRole,
        supervisorId: usrRole === RoleCode.PRACTICANTE ? usrSupervisorId : null,
        professionalLicense: usrLicense.trim(),
      });
      setUsrFullName('');
      setUsrEmail('');
      setUsrLicense('');
    };

    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Usuarios
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Aquí se dan de alta las cuentas. Cada persona entra con su cuenta de Google; tener un correo del instituto no basta para acceder al sistema.
          </p>

          {usrError && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
              {usrError}
            </div>
          )}

          {/* Formulario de Alta con Jerarquía de Permisos */}
          {currentUser.role === RoleCode.ADMINISTRADOR && (
            <div className="mt-4 p-4 bg-purple-50/60 border border-purple-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-950">
                <ShieldCheck className="w-4 h-4 text-purple-700" />
                <span>Dar de alta a psicólogas y psicólogos</span>
              </div>
              <p className="text-[11px] text-purple-900">
                Como Superadministrador ({currentUser.fullName}), das de alta a los psicólogos autorizados con correo institucional o Gmail.
              </p>
              <form
                onSubmit={handleAddUser}
                className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs items-end"
              >
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre Completo del Psicólogo *</label>
                  <input
                    type="text"
                    required
                    value={usrFullName}
                    onChange={(e) => setUsrFullName(e.target.value)}
                    placeholder="Ej. Lic. Jorge Pineda Soto"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Correo Google / Gmail *</label>
                  <input
                    type="email"
                    required
                    value={usrEmail}
                    onChange={(e) => setUsrEmail(e.target.value)}
                    placeholder="jorge.pineda@itdurango.edu.mx o @gmail.com"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cédula Profesional *</label>
                  <input
                    type="text"
                    value={usrLicense}
                    onChange={(e) => setUsrLicense(e.target.value)}
                    placeholder="CED-PROF-XXXXXXX"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    onClick={() => setUsrRole(RoleCode.PSICOLOGO)}
                    className="w-full py-1.5 px-3 font-semibold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Dar de Alta Psicólogo
                  </button>
                </div>
              </form>
            </div>
          )}

          {currentUser.role === RoleCode.PSICOLOGO && (
            <div className="mt-4 p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1E3A8A]">
                <UserPlus className="w-4 h-4 text-[#1E3A8A]" />
                <span>Dar de alta a tus practicantes</span>
              </div>
              <p className="text-[11px] text-blue-900">
                Como Psicólogo Clínico ({currentUser.fullName}), das de alta a tus practicantes de servicio social. Quedarán asignados bajo tu supervisión directa y podrás supervisar sus pacientes.
              </p>
              <form
                onSubmit={(e) => {
                  setUsrRole(RoleCode.PRACTICANTE);
                  setUsrSupervisorId(currentUser.id);
                  handleAddUser(e);
                }}
                className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs items-end"
              >
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre del Practicante *</label>
                  <input
                    type="text"
                    required
                    value={usrFullName}
                    onChange={(e) => setUsrFullName(e.target.value)}
                    placeholder="Ej. C. Sofía Campuzano Reyes"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Correo Google / Gmail *</label>
                  <input
                    type="email"
                    required
                    value={usrEmail}
                    onChange={(e) => setUsrEmail(e.target.value)}
                    placeholder="sofia.campuzano@gmail.com o ITD"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supervisor Clínico Asignado</label>
                  <input
                    type="text"
                    disabled
                    value={`${currentUser.fullName} (Tú)`}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-slate-100 text-slate-700 font-medium"
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    className="w-full py-1.5 px-3 font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Dar de Alta Practicante
                  </button>
                </div>
              </form>
            </div>
          )}

          {currentUser.role === RoleCode.PRACTICANTE && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950">
              <div>
                <strong>Practicante:</strong> trabajas con la supervisión de{' '}
                <strong>{currentUser.supervisorName || 'tu psicólogo supervisor'}</strong>.
                Solo tienes acceso a los pacientes asignados a tu atención directa.
              </div>
            </div>
          )}

          {/* Tabla de Usuarios */}
          <div className="mt-5 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <th className="py-2.5 px-3 font-semibold">Nombre Completo / Correo OAuth</th>
                  <th className="py-2.5 px-3 font-semibold">Rol Institucional</th>
                  <th className="py-2.5 px-3 font-semibold">Estado Cuenta</th>
                  <th className="py-2.5 px-3 font-semibold">Supervisor / Expedientes Asignados</th>
                  <th className="py-2.5 px-3 font-semibold">Alta / Último Acceso</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Control de Acceso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{u.fullName}</div>
                      <div className="font-mono text-slate-500">{u.email}</div>
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-[#1E3A8A]">{u.role}</td>
                    <td className="py-3 px-3 font-semibold">
                      {u.status === AccountStatus.ACTIVA && (
                        <span className="text-emerald-700">ACTIVA</span>
                      )}
                      {u.status === AccountStatus.SUSPENDIDA && (
                        <span className="text-amber-700">SUSPENDIDA</span>
                      )}
                      {u.status === AccountStatus.REVOCADA && (
                        <span className="text-rose-700">REVOCADA</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {u.supervisorName && (
                        <div>
                          Supervisor: <strong>{u.supervisorName}</strong>
                        </div>
                      )}
                      <div>
                        Expedientes asignados:{' '}
                        <span className="font-mono font-semibold">
                          {u.assignedCaseIds.length}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                      <div>Alta: {u.createdAt.slice(0, 10)}</div>
                      <div>Últ. acceso: {u.lastLoginAt ? u.lastLoginAt.slice(0, 16).replace('T', ' ') : 'N/A'}</div>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                      {u.id === currentUser.id ? (
                        <span className="text-[11px] text-slate-400">
                          Sesión actual (Protección anti-autoedición)
                        </span>
                      ) : (
                        <>
                          {u.status !== AccountStatus.ACTIVA && (
                            <button
                              onClick={() => onUpdateUserAccountStatus(u.id, AccountStatus.ACTIVA)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded cursor-pointer"
                            >
                              Activar
                            </button>
                          )}
                          {u.status !== AccountStatus.SUSPENDIDA && (
                            <button
                              onClick={() =>
                                onUpdateUserAccountStatus(u.id, AccountStatus.SUSPENDIDA)
                              }
                              className="px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded cursor-pointer"
                            >
                              Suspender
                            </button>
                          )}
                          {u.status !== AccountStatus.REVOCADA && (
                            <button
                              onClick={() =>
                                onUpdateUserAccountStatus(u.id, AccountStatus.REVOCADA)
                              }
                              className="px-2.5 py-1 text-[11px] font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 rounded cursor-pointer"
                            >
                              Revocar
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bitácora Institucional de Auditoría (audit_logs) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-900 mb-1">
            Historial de actividad
          </h3>
          <p className="text-xs text-slate-600 mb-4">
            Registra las consultas a expedientes, los resultados calculados, los cambios de prioridad, las alertas a tutoría, los reportes descargados y los cambios en cuentas.
          </p>
          <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-80">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <th className="py-2 px-3 font-semibold">Fecha y hora</th>
                  <th className="py-2 px-3 font-semibold">Persona</th>
                  <th className="py-2 px-3 font-semibold">Actividad</th>
                  <th className="py-2 px-3 font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-medium text-slate-900">{log.actorName}</div>
                      <div className="text-[10px] text-slate-500">{ACTIVITY_ROLE_LABELS[log.actorRole] ?? log.actorRole}</div>
                    </td>
                    <td className="py-2 px-3 font-semibold text-[#7C1D36]">
                      {ACTIVITY_LABELS[log.actionType] ?? log.actionType}
                    </td>
                    <td className="py-2 px-3 text-slate-700">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 6. MÓDULO DE REPORTES E IMPRESIÓN AUDITADA (SECCIÓN 14)
  // ============================================================================
  const canExportIdentifiableData =
    currentUser.role === RoleCode.RESPONSABLE_PSICOLOGIA ||
    currentUser.role === RoleCode.PSICOLOGO;

  const reportCatalog = [
    { id: 1, title: '1. Listado de alumnos pendientes de valoración', identifiable: true },
    { id: 2, title: '2. Listado de casos prioritarios (Rojo / Amarillo) para personal autorizado', identifiable: true },
    { id: 3, title: '3. Distribución agregada de resultados por categoría psicométrica', identifiable: false },
    { id: 4, title: '4. Seguimientos pendientes y vencidos', identifiable: true },
    { id: 5, title: '5. Número total de alumnos evaluados por modalidad e instrumento', identifiable: false },
    { id: 6, title: '6. Porcentaje de participación por carrera y departamento académico', identifiable: false },
    { id: 7, title: '7. Estadísticas comparativas por carrera y generación de ingreso', identifiable: false },
    { id: 8, title: '8. Informe Institucional Agregado para Desarrollo Académico ITD', identifiable: false },
  ];

  const handleExportFile = (format: 'CSV' | 'EXCEL' | 'PDF') => {
    const selectedReport = reportCatalog.find((r) => r.id === repType)!;
    const filterSummary = `Carrera=${repProgram}, Prioridad=${repPriority}, Instrumento=${repInstrument}, Generación=${repGeneration}`;
    onLogReportExport(selectedReport.title, format, filterSummary);

    if (format === 'PDF') {
      window.print();
      return;
    }

    const header = [
      '# SIAPE-ITD | INSTITUTO TECNOLOGICO DE DURANGO - OFICINA DE PSICOLOGIA',
      `# Reporte: ${selectedReport.title}`,
      `# Fecha de generacion: ${new Date().toISOString()}`,
      `# Usuario responsable: ${currentUser.fullName} (${currentUser.role})`,
      `# Filtros aplicados: ${filterSummary}`,
      '',
    ].join('\n');

    let rowsCsv = '';
    if (canExportIdentifiableData && selectedReport.identifiable) {
      rowsCsv =
        'Expediente,Matricula,Estudiante,Carrera,Semestre,Prioridad_Operativa,Puntaje_BAI,Puntaje_BDI,Estado_Seguimiento\n' +
        cases
          .map((c) => {
            const s = students.find((st) => st.id === c.studentId)!;
            return `${c.id},${s.matricula},"${s.fullName}","${s.programName}",${s.semester},${
              c.operationalPriority
            },${c.anxietyIndicator.score ?? 'N/A'},${c.depressionIndicator.score ?? 'N/A'},${
              c.followUpState
            }`;
          })
          .join('\n');
    } else {
      rowsCsv =
        'Codigo_Carrera,Programa_Academico,Departamento,Alumnos_Registrados,Casos_Prioridad_Rojo,Casos_Prioridad_Amarillo,Casos_Prioridad_Verde\n' +
        programs
          .map((p) => {
            const pStus = students.filter((s) => s.programId === p.id);
            const pCases = cases.filter((c) => pStus.some((s) => s.id === c.studentId));
            return `${p.code},"${p.name}","${p.academicDepartment}",${pStus.length},${
              pCases.filter((c) => c.operationalPriority === PriorityLevel.ROJO).length
            },${pCases.filter((c) => c.operationalPriority === PriorityLevel.AMARILLO).length},${
              pCases.filter((c) => c.operationalPriority === PriorityLevel.VERDE).length
            }`;
          })
          .join('\n');
    }

    const blob = new Blob([header + rowsCsv], {
      type:
        format === 'EXCEL'
          ? 'application/vnd.ms-excel;charset=utf-8;'
          : 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `siape_itd_reporte_${repType}_${new Date().toISOString().slice(0, 10)}.${
      format === 'EXCEL' ? 'xls' : 'csv'
    }`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        {/* Encabezado que solo aparece al imprimir o guardar como PDF */}
        <div className="hidden print:flex items-center justify-between gap-4 border-b-2 border-[#7C1D36] pb-3">
          <div>
            <div className="text-lg font-bold text-[#7C1D36]">Oficina de Psicología</div>
            <div className="text-xs text-slate-700">Instituto Tecnológico de Durango · Desarrollo Académico</div>
            <div className="text-sm font-semibold text-slate-900 mt-2">
              {reportCatalog.find((r) => r.id === repType)?.title}
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })} · Generado por {currentUser.fullName}
            </div>
          </div>
          <img src={LOGO_ITD} alt="Instituto Tecnológico de Durango" className="h-24 w-auto" />
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Reportes</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Elige el reporte, aplica los filtros y descárgalo en PDF, Excel o CSV. Cada reporte lleva la fecha, los filtros y quién lo generó. Los reportes con nombres de alumnos solo los descarga el personal de psicología.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
            <button
              onClick={() => handleExportFile('CSV')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar CSV
            </button>
            <button
              onClick={() => handleExportFile('EXCEL')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Descargar Excel
            </button>
            <button
              onClick={() => handleExportFile('PDF')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Descargar PDF
            </button>
          </div>
        </div>

        {/* Filtros del Reporte */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs no-print">
          <div className="lg:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">
              Tipo de Informe Oficial (1 a 8)
            </label>
            <select
              value={repType}
              onChange={(e) => setRepType(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium"
            >
              {reportCatalog.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Carrera ITD</label>
            <select
              value={repProgram}
              onChange={(e) => setRepProgram(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="TODAS">Todas las carreras</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Prioridad Operativa</label>
            <select
              value={repPriority}
              onChange={(e) => setRepPriority(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="TODAS">Todas (Rojo / Amarillo / Verde)</option>
              <option value="ROJO">Prioridad ROJO</option>
              <option value="AMARILLO">Prioridad AMARILLO</option>
              <option value="VERDE">Prioridad VERDE</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Instrumento</label>
            <select
              value={repInstrument}
              onChange={(e) => setRepInstrument(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="TODOS">BAI y BDI</option>
              <option value="BAI">Solo BAI (Ansiedad)</option>
              <option value="BDI">Solo BDI (Depresión)</option>
            </select>
          </div>
        </div>

        {/* Vista Previa Imprimible del Informe Institucional */}
        <div className="border border-slate-300 rounded-xl p-6 bg-white space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
            <div>
              <div className="text-xs font-bold text-[#7C1D36]">
                INSTITUTO TECNOLÓGICO DE DURANGO · SUBDIRECCIÓN ACADÉMICA
              </div>
              <div className="text-sm font-bold text-slate-900">
                Departamento de Desarrollo Académico — Oficina de Psicología (SIAPE-ITD)
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {reportCatalog.find((r) => r.id === repType)?.title}
              </div>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-600 mt-2 sm:mt-0">
              <div>Fecha de generación: 2026-10-10</div>
              <div>Responsable: {currentUser.fullName}</div>
              <div>Rol: {currentUser.role}</div>
            </div>
          </div>

          <div className="text-xs text-slate-600 font-mono bg-slate-50 p-2.5 rounded border border-slate-200">
            Filtros aplicados: Carrera={repProgram} · Prioridad={repPriority} · Instrumento={repInstrument} ·
            Generación={repGeneration} · Modalidad=Evaluación Diagnóstica Integral 2025
          </div>

          {/* Resumen estadístico agregado siempre visible */}
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <th className="py-2 px-3 font-semibold">Programa Académico ITD</th>
                  <th className="py-2 px-3 font-semibold text-right">Registrados</th>
                  <th className="py-2 px-3 font-semibold text-right">Evaluados</th>
                  <th className="py-2 px-3 font-semibold text-right">% Participación</th>
                  <th className="py-2 px-3 font-semibold text-right">Prioridad ROJO</th>
                  <th className="py-2 px-3 font-semibold text-right">Prioridad AMARILLO</th>
                  <th className="py-2 px-3 font-semibold text-right">Prioridad VERDE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                {programs
                  .filter((p) => repProgram === 'TODAS' || p.id === repProgram)
                  .map((p) => {
                    const pStudents = students.filter((s) => s.programId === p.id);
                    const pCases = cases.filter((c) => pStudents.some((s) => s.id === c.studentId));
                    const evalCount = pStudents.filter((s) =>
                      assessments.some(
                        (a) =>
                          a.studentId === s.id &&
                          (a.status === AssessmentStatus.CALIFICADO ||
                            a.status === AssessmentStatus.REVISADO_PROFESIONAL)
                      )
                    ).length;
                    const pct =
                      pStudents.length > 0
                        ? Math.round((evalCount / pStudents.length) * 100)
                        : 0;
                    return (
                      <tr key={p.id}>
                        <td className="py-2 px-3 font-sans font-medium text-slate-900">
                          {p.name}
                        </td>
                        <td className="py-2 px-3 text-right">{pStudents.length}</td>
                        <td className="py-2 px-3 text-right">{evalCount}</td>
                        <td className="py-2 px-3 text-right font-bold">{pct}%</td>
                        <td className="py-2 px-3 text-right text-rose-700 font-bold">
                          {pCases.filter((c) => c.operationalPriority === PriorityLevel.ROJO).length}
                        </td>
                        <td className="py-2 px-3 text-right text-amber-700 font-bold">
                          {
                            pCases.filter((c) => c.operationalPriority === PriorityLevel.AMARILLO)
                              .length
                          }
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-700 font-bold">
                          {
                            pCases.filter((c) => c.operationalPriority === PriorityLevel.VERDE)
                              .length
                          }
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
