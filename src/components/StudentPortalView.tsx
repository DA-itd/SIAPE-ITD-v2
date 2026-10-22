import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  Lock,
  LogOut,
  Save,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  AssessmentRecord,
  AssessmentStatus,
  ClinicalCaseRecord,
  InstrumentCode,
  StudentRecord,
  UserProfile,
} from '../types/siape';
import { INITIAL_INSTRUMENT_CONFIGS } from '../lib/scoringEngine';

interface StudentPortalViewProps {
  currentUser: UserProfile;
  student: StudentRecord;
  assessments: AssessmentRecord[];
  clinicalCase?: ClinicalCaseRecord;
  onUpdateStudentRecord: (updated: StudentRecord) => void;
  onSubmitAssessment: (
    instrumentCode: InstrumentCode,
    responses: Record<number, number>
  ) => void;
  onLogoutOrSwitchRole?: () => void;
}

export const StudentPortalView: React.FC<StudentPortalViewProps> = ({
  currentUser,
  student,
  assessments,
  clinicalCase,
  onUpdateStudentRecord,
  onSubmitAssessment,
  onLogoutOrSwitchRole,
}) => {
  const [activeTab, setActiveTab] = useState<'FICHA_DATOS' | 'BAI' | 'BDI' | 'ESTADO'>(
    'FICHA_DATOS'
  );

  // Formulario editable de datos personales y psicopedagógicos del alumno
  const [formData, setFormData] = useState<StudentRecord>({ ...student });
  const [savedPersonalDataBanner, setSavedPersonalDataBanner] = useState<boolean>(false);

  // Estados de cuestionarios interactivos
  const [baiResponses, setBaiResponses] = useState<Record<number, number>>(() => {
    const existing = assessments.find(
      (a) => a.studentId === student.id && a.instrumentCode === InstrumentCode.BAI
    );
    return existing?.responses ? { ...existing.responses } : {};
  });

  const [bdiResponses, setBdiResponses] = useState<Record<number, number>>(() => {
    const existing = assessments.find(
      (a) => a.studentId === student.id && a.instrumentCode === InstrumentCode.BDI
    );
    return existing?.responses ? { ...existing.responses } : {};
  });

  const [submittedInstrument, setSubmittedInstrument] = useState<InstrumentCode | null>(null);

  const baiConfig = INITIAL_INSTRUMENT_CONFIGS[InstrumentCode.BAI];
  const bdiConfig = INITIAL_INSTRUMENT_CONFIGS[InstrumentCode.BDI];

  const baiExisting = assessments.find(
    (a) => a.studentId === student.id && a.instrumentCode === InstrumentCode.BAI
  );
  const bdiExisting = assessments.find(
    (a) => a.studentId === student.id && a.instrumentCode === InstrumentCode.BDI
  );

  const baiAnsweredCount = Object.keys(baiResponses).length;
  const bdiAnsweredCount = Object.keys(bdiResponses).length;

  const handleSavePersonalData = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateStudentRecord(formData);
    setSavedPersonalDataBanner(true);
    setTimeout(() => setSavedPersonalDataBanner(false), 5000);
  };

  const handleSendAssessment = (inst: InstrumentCode) => {
    const responses = inst === InstrumentCode.BAI ? baiResponses : bdiResponses;
    onSubmitAssessment(inst, responses);
    setSubmittedInstrument(inst);
    setTimeout(() => setSubmittedInstrument(null), 6000);
  };

  const getOptionLabel = (inst: InstrumentCode, val: number) => {
    if (inst === InstrumentCode.BAI) {
      if (val === 0) return '0 — Nada (No me ha molestado)';
      if (val === 1) return '1 — Levemente (No me molestó mucho)';
      if (val === 2) return '2 — Moderadamente (Fue molesto pero tolerable)';
      return '3 — Bastante (Apenas pude soportarlo)';
    }
    if (val === 0) return '0 — En absoluto / Normal';
    if (val === 1) return '1 — Un poco / Leve molestia';
    if (val === 2) return '2 — Moderadamente / Es frecuente';
    return '3 — Mucho / Casi todo el tiempo';
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* ENCABEZADO INSTITUCIONAL PARA EL ESTUDIANTE */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="bg-[#6D1B30] text-white p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-900/60 text-rose-200 text-xs font-semibold mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                Portal del Estudiante · SIAPE-ITD
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight">
                Bienvenido(a), {student.fullName}
              </h1>
              <p className="text-rose-100 text-xs sm:text-sm mt-1 max-w-2xl">
                Cuestionario Diagnóstico Integral y Acompañamiento Psicológico · Instituto Tecnológico de Durango
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/20 text-xs text-rose-100 space-y-1">
              <div>
                Matrícula: <strong className="text-white font-mono">{student.matricula}</strong>
              </div>
              <div>
                Carrera: <strong className="text-white">{student.programName}</strong>
              </div>
              <div>
                Cuenta Google / Gmail: <strong className="text-white font-mono">{currentUser.email}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* CINTILLO ÉTICO Y DE CONFIDENCIALIDAD */}
        <div className="bg-blue-50/70 border-b border-blue-200 px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-700 shrink-0" />
            <span>
              <strong>Confidencialidad Garantizada:</strong> Tus respuestas solo son accesibles por la Oficina de Psicología del ITD. Ningún compañero ni docente tiene acceso a tus evaluaciones.
            </span>
          </div>
          {onLogoutOrSwitchRole && (
            <button
              onClick={onLogoutOrSwitchRole}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-blue-300 hover:bg-blue-100 rounded-lg text-[11px] font-semibold text-blue-950 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cambiar de Perfil / Salir
            </button>
          )}
        </div>

        {/* NAVEGACIÓN DE PESTAÑAS DEL ESTUDIANTE */}
        <div className="flex border-b border-slate-200 bg-slate-50/60 p-2 gap-2 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('FICHA_DATOS')}
            className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'FICHA_DATOS'
                ? 'bg-[#7C1D36] text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <User className="w-4 h-4" />
            1. Mi Ficha de Datos Personales
          </button>
          <button
            onClick={() => setActiveTab('BAI')}
            className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'BAI'
                ? 'bg-[#7C1D36] text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            2. Cuestionario 1 (Sensaciones Físicas y Nerviosismo)
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                baiExisting || baiAnsweredCount === 21
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {baiExisting || baiAnsweredCount === 21 ? 'Completado' : `${baiAnsweredCount}/21`}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('BDI')}
            className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'BDI'
                ? 'bg-[#7C1D36] text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            3. Cuestionario 2 (Estado de Ánimo y Pensamientos)
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                bdiExisting || bdiAnsweredCount === 21
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {bdiExisting || bdiAnsweredCount === 21 ? 'Completado' : `${bdiAnsweredCount}/21`}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('ESTADO')}
            className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'ESTADO'
                ? 'bg-[#1E3A8A] text-white shadow-xs'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            4. Estado de Mis Evaluaciones
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: FICHA DE DATOS PERSONALES */}
      {activeTab === 'FICHA_DATOS' && (
        <form onSubmit={handleSavePersonalData} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-[#7C1D36]" />
                Ficha de Datos Personales y Psicopedagógicos
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Completa y verifica tu información para que la Oficina de Psicología pueda brindarte el acompañamiento adecuado durante tu estancia en el ITD.
              </p>
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2 self-start sm:self-auto"
            >
              <Save className="w-4 h-4" />
              Guardar Mi Ficha
            </button>
          </div>

          {savedPersonalDataBanner && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-3 text-xs text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <strong>¡Datos guardados con éxito!</strong> Tu ficha ha sido actualizada en el sistema institucional.
              </div>
            </div>
          )}

          {/* SECCIÓN A: IDENTIFICACIÓN GENERAL */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              A. Datos de Identificación Institucional
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">No. de Control / Matrícula *</label>
                <input
                  type="text"
                  required
                  value={formData.matricula}
                  onChange={(e) => setFormData({ ...formData, matricula: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Correo Institucional / Contacto *</label>
                <input
                  type="email"
                  required
                  value={formData.institutionalEmail}
                  onChange={(e) => setFormData({ ...formData, institutionalEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  placeholder="ejemplo@itdurango.edu.mx o @gmail.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Carrera ITD *</label>
                <input
                  type="text"
                  value={formData.programName}
                  onChange={(e) => setFormData({ ...formData, programName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Semestre Actual *</label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={formData.semester}
                  onChange={(e) => setFormData({ ...formData, semester: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Grupo</label>
                <input
                  type="text"
                  value={formData.group || ''}
                  onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  placeholder="Ej. 1A, 2B"
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN B: DATOS SOCIODEMOGRÁFICOS */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              B. Datos Sociodemográficos y Contacto
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Edad</label>
                <input
                  type="number"
                  value={formData.age || ''}
                  onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fecha de Nacimiento</label>
                <input
                  type="text"
                  value={formData.birthDate || ''}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                  placeholder="DD/MM/AAAA"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Género</label>
                <select
                  value={formData.gender || 'No especificado'}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Femenino">Femenino</option>
                  <option value="Masculino">Masculino</option>
                  <option value="No binario">No binario</option>
                  <option value="Prefiero no decir">Prefiero no decir</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Teléfono Móvil / WhatsApp *</label>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Ej. 618 123 4567"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ciudad o Localidad de Origen</label>
                <input
                  type="text"
                  value={formData.originCity || ''}
                  onChange={(e) => setFormData({ ...formData, originCity: e.target.value })}
                  placeholder="Ej. Durango, Dgo. / Santiago Papasquiaro"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Domicilio Actual en Durango</label>
                <input
                  type="text"
                  value={formData.currentAddress || ''}
                  onChange={(e) => setFormData({ ...formData, currentAddress: e.target.value })}
                  placeholder="Calle, número, colonia"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Contacto de Emergencia (Nombre y Parentesco) *
                </label>
                <input
                  type="text"
                  value={formData.emergencyContact || ''}
                  onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                  placeholder="Ej. María Soto (Mamá) / Tel: 618..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ¿Cuentas con equipo de cómputo e internet en casa?
                </label>
                <select
                  value={formData.computerAccess || 'Si'}
                  onChange={(e) => setFormData({ ...formData, computerAccess: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Si">Sí, cuento con ambos</option>
                  <option value="Solo internet">Solo internet (sin computadora propia)</option>
                  <option value="Solo computadora">Solo computadora (sin internet fijo)</option>
                  <option value="No">No cuento con ninguno de los dos</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECCIÓN C: HÁBITOS DE ESTUDIO Y SALUD */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
              C. Hábitos Académicos y Salud
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Horas de Estudio al Día (fuera de clase)</label>
                <select
                  value={formData.studyHours || '1 1/2 Hora a 2 Horas'}
                  onChange={(e) => setFormData({ ...formData, studyHours: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Menos de 1 hora">Menos de 1 hora</option>
                  <option value="1 1/2 Hora a 2 Horas">1 1/2 Hora a 2 Horas</option>
                  <option value="3 a 4 horas">3 a 4 horas</option>
                  <option value="Más de 4 horas">Más de 4 horas</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Horas de Sueño Habitual</label>
                <select
                  value={formData.sleepHours || '6 a 8 horas'}
                  onChange={(e) => setFormData({ ...formData, sleepHours: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Menos de 5 horas">Menos de 5 horas</option>
                  <option value="6 a 8 horas">6 a 8 horas (Recomendado)</option>
                  <option value="Más de 8 horas">Más de 8 horas</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">¿Has recibido terapia psicológica antes?</label>
                <select
                  value={formData.previousPsychologicalTherapy || 'No'}
                  onChange={(e) =>
                    setFormData({ ...formData, previousPsychologicalTherapy: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="No">No, nunca</option>
                  <option value="Sí">Sí, anteriormente</option>
                  <option value="Actualmente">Actualmente me encuentro en proceso</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tus Hábitos Principales de Estudio</label>
              <textarea
                rows={2}
                value={formData.studyHabits || ''}
                onChange={(e) => setFormData({ ...formData, studyHabits: e.target.value })}
                placeholder="Ej. Tomar apuntes en clase, realizar resúmenes, mapas mentales, estudio en grupo..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 text-xs font-bold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Guardar Mis Datos Personales
            </button>
          </div>
        </form>
      )}

      {/* PESTAÑA 2: CUESTIONARIO 1 (BAI - ANSIEDAD / SENSACIONES FÍSICAS) */}
      {activeTab === 'BAI' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-[#7C1D36] text-white">
                  Cuestionario 1 de 2
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-2">
                  Cuestionario de Sensaciones Físicas y Nerviosismo
                </h2>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                  Indica qué tanto te han molestado o preocupado los siguientes síntomas durante la última semana, incluyendo el día de hoy.
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-[#7C1D36]">
                  {baiAnsweredCount} de 21 respondidos
                </div>
                <div className="w-32 h-2 bg-slate-200 rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[#7C1D36] transition-all"
                    style={{ width: `${(baiAnsweredCount / 21) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {submittedInstrument === InstrumentCode.BAI && (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-500 rounded-xl flex items-center justify-between gap-4 text-xs text-emerald-950">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  <strong>¡Muchas gracias!</strong> Tus respuestas del Cuestionario 1 fueron enviadas con éxito. Ahora puedes continuar con el Cuestionario 2.
                </span>
              </div>
              <button
                onClick={() => setActiveTab('BDI')}
                className="px-3 py-1.5 font-bold text-white bg-[#7C1D36] rounded-lg cursor-pointer whitespace-nowrap"
              >
                Ir al Cuestionario 2 ➔
              </button>
            </div>
          )}

          {/* LISTA DE LOS 21 REACTIVOS */}
          <div className="space-y-4">
            {baiConfig.items.map((item) => {
              const currentVal = baiResponses[item.itemNumber];
              return (
                <div
                  key={item.itemNumber}
                  className={`p-4 rounded-xl border transition-all ${
                    currentVal !== undefined
                      ? 'bg-rose-50/20 border-rose-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-semibold text-slate-900 text-sm mb-3">
                    <span className="font-mono text-slate-400 mr-2">{item.itemNumber}.</span>
                    {item.placeholderLabel}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                    {[0, 1, 2, 3].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          setBaiResponses((prev) => ({ ...prev, [item.itemNumber]: val }))
                        }
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                          currentVal === val
                            ? 'bg-[#7C1D36] text-white border-[#7C1D36] font-bold shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {getOptionLabel(InstrumentCode.BAI, val)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-slate-500">
              {baiAnsweredCount === 21
                ? '✅ Has respondido los 21 puntos. Ya puedes enviar tus respuestas.'
                : `Faltan ${21 - baiAnsweredCount} preguntas por responder.`}
            </div>
            <button
              type="button"
              disabled={baiAnsweredCount === 0}
              onClick={() => handleSendAssessment(InstrumentCode.BAI)}
              className="px-6 py-2.5 text-xs font-bold text-white bg-[#7C1D36] hover:bg-[#611529] disabled:opacity-50 rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2 self-end"
            >
              <Send className="w-4 h-4" />
              Enviar Cuestionario 1 a Psicología ITD
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: CUESTIONARIO 2 (BDI - ESTADO DE ÁNIMO Y PENSAMIENTOS) */}
      {activeTab === 'BDI' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-[#1E3A8A] text-white">
                  Cuestionario 2 de 2
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-2">
                  Cuestionario de Estado de Ánimo y Pensamientos
                </h2>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                  Selecciona la opción que mejor describa cómo te has sentido durante las últimas dos semanas.
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-[#1E3A8A]">
                  {bdiAnsweredCount} de 21 respondidos
                </div>
                <div className="w-32 h-2 bg-slate-200 rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[#1E3A8A] transition-all"
                    style={{ width: `${(bdiAnsweredCount / 21) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {submittedInstrument === InstrumentCode.BDI && (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-500 rounded-xl flex items-center justify-between gap-4 text-xs text-emerald-950">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  <strong>¡Excelente trabajo!</strong> Has completado y enviado el Cuestionario 2. Tu proceso diagnóstico ha finalizado con éxito.
                </span>
              </div>
              <button
                onClick={() => setActiveTab('ESTADO')}
                className="px-3 py-1.5 font-bold text-white bg-[#1E3A8A] rounded-lg cursor-pointer whitespace-nowrap"
              >
                Ver Estado Final ➔
              </button>
            </div>
          )}

          {/* LISTA DE LOS 21 REACTIVOS */}
          <div className="space-y-4">
            {bdiConfig.items.map((item) => {
              const currentVal = bdiResponses[item.itemNumber];
              return (
                <div
                  key={item.itemNumber}
                  className={`p-4 rounded-xl border transition-all ${
                    currentVal !== undefined
                      ? 'bg-blue-50/20 border-blue-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-semibold text-slate-900 text-sm mb-3">
                    <span className="font-mono text-slate-400 mr-2">{item.itemNumber}.</span>
                    {item.placeholderLabel}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                    {[0, 1, 2, 3].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          setBdiResponses((prev) => ({ ...prev, [item.itemNumber]: val }))
                        }
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                          currentVal === val
                            ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] font-bold shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {getOptionLabel(InstrumentCode.BDI, val)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-slate-500">
              {bdiAnsweredCount === 21
                ? '✅ Has respondido los 21 puntos del Cuestionario 2.'
                : `Faltan ${21 - bdiAnsweredCount} preguntas por responder.`}
            </div>
            <button
              type="button"
              disabled={bdiAnsweredCount === 0}
              onClick={() => handleSendAssessment(InstrumentCode.BDI)}
              className="px-6 py-2.5 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-blue-900 disabled:opacity-50 rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2 self-end"
            >
              <Send className="w-4 h-4" />
              Enviar Cuestionario 2 a Psicología ITD
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: ESTADO DE MIS EVALUACIONES */}
      {activeTab === 'ESTADO' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              Estado de tus Cuestionarios y Acompañamiento
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Aquí puedes verificar la recepción de tus formularios por parte de la Oficina de Psicología del ITD.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tarjeta Cuestionario 1 */}
            <div className="p-5 border border-slate-200 rounded-xl bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">
                  1. Cuestionario de Sensaciones Físicas (BAI)
                </span>
                <span
                  className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                    baiExisting || baiAnsweredCount === 21
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {baiExisting || baiAnsweredCount === 21 ? 'Completado' : 'Pendiente'}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {baiExisting || baiAnsweredCount === 21
                  ? 'Tus respuestas han sido recibidas y procesadas confidencialmente.'
                  : 'Aún no completas este cuestionario. Te invitamos a responderlo.'}
              </p>
              {(!baiExisting && baiAnsweredCount < 21) && (
                <button
                  onClick={() => setActiveTab('BAI')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[#7C1D36] hover:bg-[#611529] rounded-lg cursor-pointer"
                >
                  Responder Cuestionario 1
                </button>
              )}
            </div>

            {/* Tarjeta Cuestionario 2 */}
            <div className="p-5 border border-slate-200 rounded-xl bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">
                  2. Cuestionario de Estado de Ánimo (BDI)
                </span>
                <span
                  className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                    bdiExisting || bdiAnsweredCount === 21
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {bdiExisting || bdiAnsweredCount === 21 ? 'Completado' : 'Pendiente'}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {bdiExisting || bdiAnsweredCount === 21
                  ? 'Tus respuestas han sido recibidas y procesadas confidencialmente.'
                  : 'Aún no completas este cuestionario. Te invitamos a responderlo.'}
              </p>
              {(!bdiExisting && bdiAnsweredCount < 21) && (
                <button
                  onClick={() => setActiveTab('BDI')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg cursor-pointer"
                >
                  Responder Cuestionario 2
                </button>
              )}
            </div>
          </div>

          <div className="p-5 bg-rose-50/50 border border-rose-200 rounded-xl space-y-2 text-xs text-rose-950">
            <div className="font-bold flex items-center gap-1.5 text-[#7C1D36]">
              <HeartHandshake className="w-4 h-4" />
              Oficina de Psicología — Desarrollo Académico ITD
            </div>
            <p className="leading-relaxed">
              Si en algún momento requieres atención, orientación o acompañamiento individual presencial, acude a la Oficina de Psicología del Instituto Tecnológico de Durango (Edificio de Desarrollo Académico) o comunícate con tu tutor de carrera.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
