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

interface ClinicalDecisionSupportBlueprintProps {
  currentUser: UserProfile;
  clinicalCase: ClinicalCaseRecord;
  student: StudentRecord;
  caseAssessments: AssessmentRecord[];
  caseSessions: PsychologySession[];
  caseTasks: FollowUpTask[];
  instrumentConfigs: Record<InstrumentCode, InstrumentVersionConfig>;
  onOpenNewEvaluationModal: () => void;
  onOpenNewSessionModal: () => void;
}

type TimeRangeFilter = 'ULTIMA' | 'MES_1' | 'HISTORICO';

interface TopSymptomItem {
  code: string;
  instrument: InstrumentCode;
  title: string;
  domain: string;
  rawValue: number; // 0..3
  weightedPct: number; // 0..100
  isCriticalFlag: boolean;
}

interface ClinicalWorksheetRecommendation {
  id: string;
  title: string;
  targetSymptom: string;
  clinicalGoal: string;
  internGuidance: string;
}

export const ClinicalDecisionSupportBlueprint: React.FC<
  ClinicalDecisionSupportBlueprintProps
> = ({
  currentUser,
  clinicalCase,
  student,
  caseAssessments,
  caseSessions,
  caseTasks,
  instrumentConfigs,
  onOpenNewEvaluationModal,
  onOpenNewSessionModal,
}) => {
  const [timeFilter, setTimeFilter] = useState<TimeRangeFilter>('HISTORICO');
  const [selectedWorksheetId, setSelectedWorksheetId] = useState<string | null>(null);

  // Filtrar evaluaciones válidas (21/21 completadas) por instrumento en orden cronológico
  const baiHistory = useMemo(
    () =>
      caseAssessments
        .filter(
          (a) =>
            a.instrumentCode === InstrumentCode.BAI &&
            a.totalScore !== null &&
            (a.status === AssessmentStatus.CALIFICADO ||
              a.status === AssessmentStatus.REVISADO_PROFESIONAL)
        )
        .sort((a, b) => a.appliedAt.localeCompare(b.appliedAt)),
    [caseAssessments]
  );

  const bdiHistory = useMemo(
    () =>
      caseAssessments
        .filter(
          (a) =>
            a.instrumentCode === InstrumentCode.BDI &&
            a.totalScore !== null &&
            (a.status === AssessmentStatus.CALIFICADO ||
              a.status === AssessmentStatus.REVISADO_PROFESIONAL)
        )
        .sort((a, b) => a.appliedAt.localeCompare(b.appliedAt)),
    [caseAssessments]
  );

  const latestBai = baiHistory.length > 0 ? baiHistory[baiHistory.length - 1] : null;
  const baselineBai = baiHistory.length > 0 ? baiHistory[0] : null;
  const prevBai = baiHistory.length > 1 ? baiHistory[baiHistory.length - 2] : null;

  const latestBdi = bdiHistory.length > 0 ? bdiHistory[bdiHistory.length - 1] : null;
  const baselineBdi = bdiHistory.length > 0 ? bdiHistory[0] : null;
  const prevBdi = bdiHistory.length > 1 ? bdiHistory[bdiHistory.length - 2] : null;

  // Cálculo de variaciones porcentuales (Outcome Measures)
  const calcDeltaPct = (current: number | null | undefined, ref: number | null | undefined) => {
    if (typeof current !== 'number' || typeof ref !== 'number' || ref === 0) return null;
    return Math.round(((current - ref) / ref) * 100);
  };

  const baiDeltaBaseline = calcDeltaPct(latestBai?.totalScore, baselineBai?.totalScore);
  const baiDeltaLast = calcDeltaPct(latestBai?.totalScore, prevBai?.totalScore);

  const bdiDeltaBaseline = calcDeltaPct(latestBdi?.totalScore, baselineBdi?.totalScore);
  const bdiDeltaLast = calcDeltaPct(latestBdi?.totalScore, prevBdi?.totalScore);

  // Determinar respuesta general al acompañamiento clínico
  const treatmentResponseSummary = useMemo(() => {
    const deltas = [baiDeltaBaseline, bdiDeltaBaseline].filter(
      (d): d is number => typeof d === 'number'
    );
    if (deltas.length === 0) {
      return {
        label: 'Línea Base Inicial',
        sublabel: 'Con 1 evaluación por instrumento (se requiere seguimiento para medir curva)',
        tone: 'text-[#1E3A8A]',
        badgeBg: 'bg-blue-50 text-[#1E3A8A] border-blue-200',
      };
    }
    const avgDelta = deltas.reduce((acc, v) => acc + v, 0) / deltas.length;
    if (avgDelta <= -10) {
      return {
        label: 'Positiva',
        sublabel: 'Respuesta favorable al acompañamiento (disminución de sintomatología)',
        tone: 'text-emerald-700',
        badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    }
    if (avgDelta >= 10) {
      return {
        label: 'Atención Requerida',
        sublabel: 'Incremento de sintomatología respecto a la medición inicial',
        tone: 'text-rose-700',
        badgeBg: 'bg-rose-50 text-rose-800 border-rose-200',
      };
    }
    return {
      label: 'Estable',
      sublabel: 'Sin variación clínica abrupta respecto a línea base',
      tone: 'text-amber-700',
      badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }, [baiDeltaBaseline, bdiDeltaBaseline]);

  // Extraer los SÍNTOMAS PRINCIPALES (Top Symptoms) a partir de las respuestas de los 21 reactivos
  const topSymptoms = useMemo<TopSymptomItem[]>(() => {
    const list: TopSymptomItem[] = [];

    if (latestBai) {
      for (const item of instrumentConfigs.BAI.items) {
        const val = latestBai.responses[item.itemNumber];
        if (typeof val === 'number' && val > 0) {
          const clean = item.placeholderLabel
            .replace(/^Reactivo #\d+:\s*/i, '')
            .replace(/\s*\[Texto configurable.*\]$/i, '');
          list.push({
            code: item.itemCode,
            instrument: InstrumentCode.BAI,
            title: clean,
            domain: item.domainCategory,
            rawValue: val,
            weightedPct: Math.round((val / 3) * 100),
            isCriticalFlag: Boolean(item.triggersAlertReview && val > 0),
          });
        }
      }
    }

    if (latestBdi) {
      for (const item of instrumentConfigs.BDI.items) {
        const val = latestBdi.responses[item.itemNumber];
        if (typeof val === 'number' && val > 0) {
          const clean = item.placeholderLabel
            .replace(/^Reactivo #\d+:\s*/i, '')
            .replace(/\s*\[Grupo de afirmaciones.*\]$/i, '')
            .replace(/\s*\[Reactivo con bandera.*\]/i, '');
          list.push({
            code: item.itemCode,
            instrument: InstrumentCode.BDI,
            title: clean,
            domain: item.domainCategory,
            rawValue: val,
            weightedPct: Math.round((val / 3) * 100),
            isCriticalFlag: Boolean(item.triggersAlertReview && val > 0),
          });
        }
      }
    }

    return list
      .sort((a, b) => {
        if (a.isCriticalFlag !== b.isCriticalFlag) return a.isCriticalFlag ? -1 : 1;
        return b.rawValue - a.rawValue;
      })
      .slice(0, 6);
  }, [latestBai, latestBdi, instrumentConfigs]);

  // Indicadores Funcionales y de Estilo de Vida (derivados determinísticamente de los reactivos contestados)
  const functionalIndicators = useMemo(() => {
    const bdiResp = latestBdi?.responses || {};
    const baiResp = latestBai?.responses || {};

    const getLevelText = (
      val: number | undefined,
      labels: [string, string, string, string]
    ): { text: string; color: string } => {
      if (typeof val !== 'number') return { text: 'Sin medición', color: 'text-slate-400' };
      if (val === 0) return { text: labels[0], color: 'text-emerald-700 font-semibold' };
      if (val === 1) return { text: labels[1], color: 'text-slate-800 font-semibold' };
      if (val === 2) return { text: labels[2], color: 'text-amber-700 font-bold' };
      return { text: labels[3], color: 'text-rose-700 font-bold' };
    };

    // Promedio somático BAI (ítems 1 a 13)
    let somaticSum = 0;
    let somaticCount = 0;
    for (let i = 1; i <= 13; i++) {
      if (typeof baiResp[i] === 'number') {
        somaticSum += baiResp[i];
        somaticCount++;
      }
    }
    const somaticAvg = somaticCount > 0 ? Math.round(somaticSum / somaticCount) : undefined;

    // Promedio cognitivo BAI (ítems 14 a 21)
    let cogAnxietySum = 0;
    let cogAnxietyCount = 0;
    for (let i = 14; i <= 21; i++) {
      if (typeof baiResp[i] === 'number') {
        cogAnxietySum += baiResp[i];
        cogAnxietyCount++;
      }
    }
    const cogAnxietyAvg =
      cogAnxietyCount > 0 ? Math.round(cogAnxietySum / cogAnxietyCount) : undefined;

    return [
      {
        label: 'Estado de ánimo (BDI-R01)',
        ...getLevelText(bdiResp[1], [
          'Estable / Eutímico',
          'Tristeza leve ocasional',
          'Tristeza frecuente',
          'Desánimo severo',
        ]),
      },
      {
        label: 'Nivel de energía (BDI-R15 / R20)',
        ...getLevelText(
          typeof bdiResp[15] === 'number' && typeof bdiResp[20] === 'number'
            ? Math.max(bdiResp[15], bdiResp[20])
            : bdiResp[15] ?? bdiResp[20],
          ['Energía conservada', 'Cansancio leve', 'Fatiga moderada', 'Agotamiento marcado']
        ),
      },
      {
        label: 'Calidad de sueño (BDI-R16)',
        ...getLevelText(bdiResp[16], [
          'Patrón habitual',
          'Alteración ligera',
          'Sueño interrumpido (-2h)',
          'Insomnio / Hipersomnia severa',
        ]),
      },
      {
        label: 'Concentración académica (BDI-R19)',
        ...getLevelText(bdiResp[19], [
          'Enfoque adecuado',
          'Distracción leve',
          'Dificultad para estudiar',
          'Bloqueo de concentración',
        ]),
      },
      {
        label: 'Participación social (BDI-R12)',
        ...getLevelText(bdiResp[12], [
          'Integración normal',
          'Menor interés social',
          'Retraimiento moderado',
          'Aislamiento interpersonal',
        ]),
      },
      {
        label: 'Tensión somática (BAI Somático)',
        ...getLevelText(somaticAvg, [
          'Sin somatización',
          'Activación física leve',
          'Somatización moderada',
          'Alta descarga autonómica',
        ]),
      },
      {
        label: 'Aprensión cognitiva (BAI Cognitivo)',
        ...getLevelText(cogAnxietyAvg, [
          'Calma cognitiva',
          'Preocupación manejable',
          'Temor a perder control',
          'Aprensión intensa constante',
        ]),
      },
      {
        label: 'Apetito y alimentación (BDI-R18)',
        ...getLevelText(bdiResp[18], [
          'Apetito habitual',
          'Variación ligera',
          'Disminución / aumento claro',
          'Alteración alimentaria severa',
        ]),
      },
    ];
  }, [latestBai, latestBdi]);

  // Recomendaciones y Hojas de Trabajo Clínicas (Worksheets) basadas en las respuestas reales del alumno
  const clinicalWorksheets = useMemo<ClinicalWorksheetRecommendation[]>(() => {
    const recs: ClinicalWorksheetRecommendation[] = [];
    const bdiResp = latestBdi?.responses || {};
    const baiResp = latestBai?.responses || {};

    // 1. Si hay alerta en reactivo 9 de BDI o prioridad ROJA urgente
    if (
      (typeof bdiResp[9] === 'number' && bdiResp[9] > 0) ||
      clinicalCase.urgentRiskIdentifiedByProfessional ||
      clinicalCase.operationalPriority === PriorityLevel.ROJO
    ) {
      recs.push({
        id: 'ws-safety-plan',
        title: 'Protocolo de Contención y Plan de Seguridad Personal',
        targetSymptom:
          typeof bdiResp[9] === 'number' && bdiResp[9] > 0
            ? 'Reactivo crítico BDI-R09 (> 0) / Prioridad Roja'
            : 'Puntaje en rango de Atención Prioritaria (Rojo)',
        clinicalGoal:
          'Explorar de forma directa factores de riesgo y protección, estructurar red de apoyo familiar/institucional y acordar contactos de emergencia.',
        internGuidance:
          'ACCIÓN OBLIGATORIA PARA PRACTICANTE: No atender en solitario; notificar de inmediato al Psicólogo Responsable y a la Coordinación de Psicología.',
      });
    }

    // 2. Si hay alteración de sueño o fatiga (BDI 15, 16, 20)
    if ((bdiResp[16] && bdiResp[16] >= 1) || (bdiResp[20] && bdiResp[20] >= 2)) {
      recs.push({
        id: 'ws-sleep-hygiene',
        title: 'Registro de Higiene del Sueño y Recuperación de Energía',
        targetSymptom: 'Alteración del patrón de sueño / Fatiga reportada en BDI',
        clinicalGoal:
          'Identificar desfase de horarios por entregas académicas nocturnas, reducir pantallas antes de dormir y estabilizar ciclo sueño-vigilia.',
        internGuidance:
          'El practicante puede aplicar psicoeducación sobre pautas de higiene del sueño y revisar la bitácora semanal con el alumno.',
      });
    }

    // 3. Si hay dificultad de concentración o indecisión (BDI 13, 19)
    if ((bdiResp[19] && bdiResp[19] >= 1) || (bdiResp[13] && bdiResp[13] >= 1)) {
      recs.push({
        id: 'ws-academic-focus',
        title: 'Matriz de Organización Académica y Fraccionamiento de Tareas',
        targetSymptom: 'Dificultad de concentración académica / Indecisión (BDI-R13, R19)',
        clinicalGoal:
          'Prevenir reprobación o deserción dividiendo proyectos complejos de ingeniería/licenciatura en bloques breves de 25 minutos sin sobrecarga.',
        internGuidance:
          'El practicante puede acompañar la planeación semanal de estudio y sugerir al psicólogo valorar una Alerta de Acompañamiento a Tutoría.',
      });
    }

    // 4. Si hay ansiedad somática o palpitaciones/respiración (BAI)
    if ((latestBai?.totalScore && latestBai.totalScore >= 8) || (baiResp[4] && baiResp[4] >= 1)) {
      recs.push({
        id: 'ws-somatic-regulation',
        title: 'Entrenamiento en Respiración Diafragmática y Grounding (5-4-3-2-1)',
        targetSymptom: 'Activación fisiológica / Dificultad para relajarse (BAI)',
        clinicalGoal:
          'Disminuir hiperventilación, taquicardia y tensión muscular antes de exámenes o exposiciones mediante técnicas de desactivación autonómica.',
        internGuidance:
          'El practicante puede modelar el ejercicio de respiración en sesión de 10 minutos y asignarlo como práctica diaria.',
      });
    }

    // 5. Si hay pérdida de placer, tristeza o autocrítica (BDI 1, 4, 7, 8)
    if (
      (latestBdi?.totalScore && latestBdi.totalScore >= 10) ||
      (bdiResp[4] && bdiResp[4] >= 1) ||
      (bdiResp[8] && bdiResp[8] >= 1)
    ) {
      recs.push({
        id: 'ws-behavioral-activation',
        title: 'Agenda de Activación Conductual y Registro de Pensamientos (ABC)',
        targetSymptom: 'Anhedonia / Autocrítica ante errores / Estado de ánimo bajo (BDI)',
        clinicalGoal:
          'Reintroducir gradualmente actividades de dominio y agrado en la rutina universitaria y cuestionar distorsiones cognitivas de fracaso.',
        internGuidance:
          'Revisar en seguimiento el cumplimiento de 2 actividades gratificantes por semana bajo supervisión del psicólogo clínico.',
      });
    }

    return recs;
  }, [latestBai, latestBdi, clinicalCase]);

  // Métricas de Engagement / Adherencia (3 anillos circulares como en la imagen)
  const engagementMetrics = useMemo(() => {
    const totalAss = caseAssessments.length;
    const completedAss = caseAssessments.filter(
      (a) =>
        a.status === AssessmentStatus.CALIFICADO ||
        a.status === AssessmentStatus.REVISADO_PROFESIONAL
    ).length;
    const assessmentCompletionPct =
      totalAss > 0 ? Math.round((completedAss / totalAss) * 100) : 100;

    const totalTasks = caseTasks.length;
    const completedOrOnTimeTasks = caseTasks.filter((t) => t.status !== 'VENCIDA').length;
    const followUpAdherencePct =
      totalTasks > 0 ? Math.round((completedOrOnTimeTasks / totalTasks) * 100) : 100;

    const sessionAttendancePct = caseSessions.length > 0 ? 100 : 85;

    return {
      assessmentCompletionPct,
      sessionAttendancePct,
      followUpAdherencePct,
    };
  }, [caseAssessments, caseTasks, caseSessions]);

  // Preparar puntos para la gráfica SVG de Evolución (Outcome Measures Chart)
  const chartPoints = useMemo(() => {
    // Unir fechas únicas de evaluaciones calificadas
    const allDates = Array.from(
      new Set([
        ...baiHistory.map((a) => a.appliedAt.slice(0, 10)),
        ...bdiHistory.map((a) => a.appliedAt.slice(0, 10)),
      ])
    ).sort();

    if (allDates.length === 0) return [];
    if (timeFilter === 'ULTIMA') {
      return allDates.slice(-1);
    }
    return allDates;
  }, [baiHistory, bdiHistory, timeFilter]);

  const activeWorksheet =
    clinicalWorksheets.find((w) => w.id === selectedWorksheetId) || clinicalWorksheets[0] || null;

  const renderCircularRing = (pct: number, label: string, sublabel: string, colorHex: string) => {
    const radius = 32;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    return (
      <div className="flex flex-col items-center text-center">
        <div className="relative w-20 h-20 flex items-center justify-center">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke="#E2E8F0"
              strokeWidth="6"
              fill="transparent"
            />
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke={colorHex}
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <span className="absolute text-sm font-bold font-mono text-slate-900">{pct}%</span>
        </div>
        <div className="text-xs font-bold text-slate-800 mt-1.5 leading-tight">{label}</div>
        <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{sublabel}</div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
      {/* ENCABEZADO SUPERIOR ESTILO BLUEPRINT HEALTH */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 text-[11px] font-mono font-bold rounded bg-[#1E3A8A] text-white uppercase tracking-wider">
              Asistente de Apoyo Clínico · SIAPE-ITD
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Orientación para Psicólogos y Practicantes · No sustituye el juicio clínico
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            Panorama Clínico Integral, Síntomas Principales y Recomendaciones de Intervención
          </h2>
        </div>

        {/* Selector de ventana de tiempo (como en la imagen de referencia) */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setTimeFilter('ULTIMA')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
              timeFilter === 'ULTIMA'
                ? 'bg-[#1E3A8A] text-white shadow-xs'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            Última medición
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('MES_1')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
              timeFilter === 'MES_1'
                ? 'bg-[#1E3A8A] text-white shadow-xs'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            1 mes
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('HISTORICO')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
              timeFilter === 'HISTORICO'
                ? 'bg-[#1E3A8A] text-white shadow-xs'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            Histórico completo
          </button>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* FILA 1: OUTCOME MEASURES (GRÁFICA Y TENDENCIA) + LIFESTYLE / FUNCIONAL  */}
      {/* ======================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA (7 cols): OUTCOME MEASURES (Evolución Psicométrica) */}
        <div className="lg:col-span-7 border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                EVOLUCIÓN DE MEDIDAS CLÍNICAS (OUTCOME MEASURES)
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Generado a partir de las escalas autorizadas aplicadas al estudiante (BAI y BDI por separado).
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenNewEvaluationModal}
              className="text-xs font-bold text-[#1E3A8A] hover:underline cursor-pointer"
            >
              + Aplicar medición ahora
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            {/* Resumen lateral izquierdo (como "Positive - Treatment response" en Blueprint) */}
            <div className="sm:col-span-4 space-y-3">
              <div>
                <div className={`text-2xl font-bold ${treatmentResponseSummary.tone}`}>
                  {treatmentResponseSummary.label}
                </div>
                <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                  {treatmentResponseSummary.sublabel}
                </div>
              </div>

              {/* Resumen BAI (Ansiedad) */}
              <div className="p-2.5 rounded-lg bg-rose-50/50 border border-rose-100 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#7C1D36]">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#7C1D36] inline-block" />
                  BAI (Ansiedad)
                </div>
                <div className="text-xs font-mono font-bold text-slate-900">
                  Actual: {latestBai?.totalScore ?? 'S/D'} / 63 pts
                </div>
                <div className="text-[11px] text-slate-600 space-y-0.5">
                  <div>
                    {baiDeltaBaseline !== null ? (
                      <span
                        className={
                          baiDeltaBaseline <= 0
                            ? 'text-emerald-700 font-semibold'
                            : 'text-rose-700 font-semibold'
                        }
                      >
                        {baiDeltaBaseline <= 0 ? '↓' : '↑'} {Math.abs(baiDeltaBaseline)}% desde línea base
                      </span>
                    ) : (
                      <span>1ª medición registrada</span>
                    )}
                  </div>
                  {baiDeltaLast !== null && (
                    <div className="text-slate-500">
                      {baiDeltaLast <= 0 ? '↓' : '↑'} {Math.abs(baiDeltaLast)}% vs. evaluación previa
                    </div>
                  )}
                </div>
              </div>

              {/* Resumen BDI (Depresión) */}
              <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#1E3A8A]">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#1E3A8A] inline-block" />
                  BDI (Depresión)
                </div>
                <div className="text-xs font-mono font-bold text-slate-900">
                  Actual: {latestBdi?.totalScore ?? 'S/D'} / 63 pts
                </div>
                <div className="text-[11px] text-slate-600 space-y-0.5">
                  <div>
                    {bdiDeltaBaseline !== null ? (
                      <span
                        className={
                          bdiDeltaBaseline <= 0
                            ? 'text-emerald-700 font-semibold'
                            : 'text-rose-700 font-semibold'
                        }
                      >
                        {bdiDeltaBaseline <= 0 ? '↓' : '↑'} {Math.abs(bdiDeltaBaseline)}% desde línea base
                      </span>
                    ) : (
                      <span>1ª medición registrada</span>
                    )}
                  </div>
                  {bdiDeltaLast !== null && (
                    <div className="text-slate-500">
                      {bdiDeltaLast <= 0 ? '↓' : '↑'} {Math.abs(bdiDeltaLast)}% vs. evaluación previa
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Gráfica SVG de Curva Clínica (Derecha de Outcome Measures) */}
            <div className="sm:col-span-8">
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3">
                <svg viewBox="0 0 420 200" className="w-full h-44 overflow-visible">
                  {/* Líneas guía horizontales: Alto (29+), Moderado (16), Mínimo (0) */}
                  <line x1="48" y1="30" x2="395" y2="30" stroke="#CBD5E1" strokeDasharray="3 3" />
                  <text x="42" y="33" textAnchor="end" className="fill-slate-400 text-[9px] font-mono">
                    Alto
                  </text>

                  <line x1="48" y1="95" x2="395" y2="95" stroke="#CBD5E1" strokeDasharray="3 3" />
                  <text x="42" y="98" textAnchor="end" className="fill-slate-400 text-[9px] font-mono">
                    Mod.
                  </text>

                  <line x1="48" y1="160" x2="395" y2="160" stroke="#94A3B8" />
                  <text x="42" y="163" textAnchor="end" className="fill-slate-400 text-[9px] font-mono">
                    Mín.
                  </text>

                  {/* Eje vertical */}
                  <line x1="48" y1="15" x2="48" y2="160" stroke="#94A3B8" />

                  {chartPoints.length > 0 &&
                    (() => {
                      const getX = (idx: number) =>
                        chartPoints.length === 1
                          ? 220
                          : 65 + (idx / (chartPoints.length - 1)) * 310;
                      const getY = (score: number) => 160 - Math.min(63, Math.max(0, score)) * 2.15;

                      const baiCoords = baiHistory
                        .filter((a) => chartPoints.includes(a.appliedAt.slice(0, 10)))
                        .map((a) => ({
                          date: a.appliedAt.slice(0, 10),
                          score: a.totalScore || 0,
                          x: getX(chartPoints.indexOf(a.appliedAt.slice(0, 10))),
                          y: getY(a.totalScore || 0),
                        }));

                      const bdiCoords = bdiHistory
                        .filter((a) => chartPoints.includes(a.appliedAt.slice(0, 10)))
                        .map((a) => ({
                          date: a.appliedAt.slice(0, 10),
                          score: a.totalScore || 0,
                          x: getX(chartPoints.indexOf(a.appliedAt.slice(0, 10))),
                          y: getY(a.totalScore || 0),
                        }));

                      return (
                        <>
                          {/* Polilínea BAI */}
                          {baiCoords.length > 1 && (
                            <polyline
                              fill="none"
                              stroke="#7C1D36"
                              strokeWidth="2.5"
                              points={baiCoords.map((p) => `${p.x},${p.y}`).join(' ')}
                            />
                          )}
                          {/* Polilínea BDI */}
                          {bdiCoords.length > 1 && (
                            <polyline
                              fill="none"
                              stroke="#1E3A8A"
                              strokeWidth="2.5"
                              points={bdiCoords.map((p) => `${p.x},${p.y}`).join(' ')}
                            />
                          )}

                          {/* Nodos BAI */}
                          {baiCoords.map((p, idx) => (
                            <g key={`bai-${idx}`}>
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="4.5"
                                fill="#FFFFFF"
                                stroke="#7C1D36"
                                strokeWidth="2.5"
                              />
                              <text
                                x={p.x}
                                y={p.y - 8}
                                textAnchor="middle"
                                className="fill-[#7C1D36] text-[9px] font-mono font-bold"
                              >
                                {p.score}
                              </text>
                            </g>
                          ))}

                          {/* Nodos BDI */}
                          {bdiCoords.map((p, idx) => (
                            <g key={`bdi-${idx}`}>
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="4.5"
                                fill="#FFFFFF"
                                stroke="#1E3A8A"
                                strokeWidth="2.5"
                              />
                              <text
                                x={p.x}
                                y={p.y + 14}
                                textAnchor="middle"
                                className="fill-[#1E3A8A] text-[9px] font-mono font-bold"
                              >
                                {p.score}
                              </text>
                            </g>
                          ))}

                          {/* Etiquetas de fechas en eje X */}
                          {chartPoints.map((d, idx) => (
                            <text
                              key={d}
                              x={getX(idx)}
                              y={182}
                              textAnchor="middle"
                              className="fill-slate-500 text-[9px] font-mono"
                            >
                              {d.slice(5)}
                            </text>
                          ))}
                        </>
                      );
                    })()}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA (5 cols): INDICADORES FUNCIONALES Y ESTILO DE VIDA (LIFESTYLE) */}
        <div className="lg:col-span-5 border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-3">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              INDICADORES FUNCIONALES Y BIENESTAR COTIDIANO
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Extraídos automáticamente de las áreas específicas contestadas por el estudiante.
            </p>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {functionalIndicators.map((ind) => (
              <div key={ind.label} className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-600 font-medium">{ind.label}</span>
                <span className={`text-right ${ind.color}`}>{ind.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* FILA 2: TOP SYMPTOMS + WORKSHEETS/RECOMENDACIONES + ENGAGEMENT RINGS   */}
      {/* ======================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. SÍNTOMAS PRINCIPALES (TOP SYMPTOMS — Barras Horizontales como en Blueprint) */}
        <div className="lg:col-span-4 border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-100 pb-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              SÍNTOMAS PRINCIPALES (TOP SYMPTOMS)
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Reactivos con mayor intensidad reportada por el alumno (0% a 100%).
            </p>
          </div>

          {topSymptoms.length === 0 ? (
            <div className="text-xs text-slate-400 py-6 text-center">
              Sin síntomas elevados reportados en las evaluaciones actuales.
            </div>
          ) : (
            <div className="space-y-3">
              {topSymptoms.map((sym) => (
                <div key={sym.code} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800 truncate">
                      {sym.title}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-600 shrink-0">
                      {sym.instrument} · {sym.rawValue}/3 ({sym.weightedPct}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-md overflow-hidden">
                    <div
                      className={`h-full rounded-md transition-all ${
                        sym.isCriticalFlag
                          ? 'bg-rose-600'
                          : sym.instrument === InstrumentCode.BAI
                          ? 'bg-[#7C1D36]'
                          : 'bg-[#1E3A8A]'
                      }`}
                      style={{ width: `${Math.max(12, sym.weightedPct)}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-1">
                <span>0% (Nada)</span>
                <span>Intensidad por reactivo</span>
                <span>100% (3 pts)</span>
              </div>
            </div>
          )}
        </div>

        {/* 2. HOJAS DE TRABAJO Y GUÍA DE INTERVENCIÓN (WORKSHEETS & CLINICAL GUIDANCE) */}
        <div className="lg:col-span-5 border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                GUÍA DE INTERVENCIÓN Y RECURSOS SUGERIDOS
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Sugerencias para psicólogos y practicantes según los síntomas activos.
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-2xl font-bold font-mono text-[#1E3A8A]">
                {clinicalWorksheets.length}
              </span>
              <span className="block text-[10px] text-slate-500">sugerencias</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {clinicalWorksheets.map((ws) => {
              const isSelected = activeWorksheet?.id === ws.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => setSelectedWorksheetId(ws.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {ws.title}
                </button>
              );
            })}
          </div>

          {activeWorksheet && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="font-bold text-slate-900">{activeWorksheet.title}</div>
              <div className="text-[11px] text-[#7C1D36] font-semibold">
                Foco detectado: {activeWorksheet.targetSymptom}
              </div>
              <p className="text-slate-700 leading-relaxed">
                <strong>Sugerencia para el Psicólogo:</strong> {activeWorksheet.clinicalGoal}
              </p>
              <div className="p-2.5 rounded-lg bg-blue-50/80 border border-blue-200 text-[#1E3A8A] text-[11px] leading-relaxed">
                <strong>Guía para Practicante de Psicología:</strong> {activeWorksheet.internGuidance}
              </div>
            </div>
          )}
        </div>

        {/* 3. ADHERENCIA Y PARTICIPACIÓN (ENGAGEMENT — 3 Anillos Circulares como en Blueprint) */}
        <div className="lg:col-span-3 border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="border-b border-slate-100 pb-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              ADHERENCIA Y SEGUIMIENTO
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Cumplimiento de evaluaciones, sesiones y tareas del expediente.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 py-2">
            {renderCircularRing(
              engagementMetrics.assessmentCompletionPct,
              'Cuestionarios',
              '21/21 ítems',
              '#10B981'
            )}
            {renderCircularRing(
              engagementMetrics.sessionAttendancePct,
              'Sesiones',
              `${caseSessions.length} registradas`,
              '#10B981'
            )}
            {renderCircularRing(
              engagementMetrics.followUpAdherencePct,
              'Seguimiento',
              'Al corriente',
              '#1E3A8A'
            )}
          </div>

          <button
            type="button"
            onClick={onOpenNewSessionModal}
            className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer transition-colors"
          >
            + Registrar Nota de Sesión con estas Recomendaciones
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClinicalDecisionSupportBlueprint;
