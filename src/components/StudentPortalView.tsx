import React, { useState, useMemo } from 'react';
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

  // Lógica para saber si el alumno ya completó sus datos (para bloquear edición futura)
  const isDataLocked = useMemo(() => {
    return Boolean(
      student.fullName?.trim() &&
      student.matricula?.trim() &&
      student.institutionalEmail?.trim() &&
      student.phone?.trim() &&
      student.emergencyContact?.trim() &&
      student.originCity?.trim() &&
      student.currentAddress?.trim() &&
      student.age &&
      student.birthDate &&
      student.gender
    );
  }, [student]);

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
    if (isDataLocked) return; // Seguridad extra
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
      {/* ENCABEZADO INSTITUCIONAL PARA EL ESTUDIANTE - AHORA EN VERDE PASTEL */}
      <div className="bg-white border border-[#E8E2D5] rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-[#A3C9A8] text-[#2F3E32] p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4A6B53]/20 text-[#2F3E32] text-xs font-bold mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                Portal del Estudiante · SIAPE-ITD
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-[#2F3E32]">
                Bienvenido(a), {student.fullName}
              </h1>
              <p className="text-[#4A6B53] text-xs sm:text-sm mt-1 max-w-2xl font-medium">
                Cuestionario Diagnóstico Integral y Acompañamiento Psicológico · Instituto Tecnológico de Durango
              </p>
            </div>
            <div className="bg-white/50 backdrop-blur-sm p-3 rounded-xl border border-white/60 text-xs text-[#4A6B53] space-y-1">
              <div>
                Matrícula: <strong className="text-[#2F3E32] font-mono">{student.matricula}</strong>
              </div>
              <div>
                Carrera: <strong className="text-[#2F3E32]">{student.programName}</strong>
              </div>
              <div>
                Cuenta Google / Gmail: <strong className="text-[#2F3E32] font-mono">{currentUser.email}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* CINTILLO ÉTICO Y DE CONFIDENCIALIDAD */}
        <div className="bg-[#F4F0E6] border-b border-[#E8E2D5] px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-[#4A6B53]">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#4A6B53] shrink-0" />
            <span>
              <strong>Confidencialidad Garantizada:</strong> Tus respuestas solo son accesibles por la Oficina de Psicología del ITD. Ningún compañero ni docente tiene acceso a tus evaluaciones.
            </span>
          </div>
          {onLogoutOrSwitchRole && (
            <button
              onClick={onLogoutOrSwitchRole}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E8E2D5] hover:bg-[#FDFBF7] rounded-lg text-[11px] font-bold text-[#4A6B53] cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cambiar de Perfil / Salir
            </button>
          )}
        </div>

        {/* NAVEGACIÓN DE PESTAÑAS DEL ESTUDIANTE */}
        <div className="flex border-b border-[#E8E2D5] bg-[#FDFBF7] p-2 gap-2 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('FICHA_DATOS')}
            className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'FICHA_DATOS'
                ? 'bg-[#4A6B53] text-white shadow-sm'
                : 'text-[#4A6B53] hover:bg-[#E8E2D5]'
            }`}
          >
            <User className="w-4 h-4" />
            1. Mi Ficha de Datos Personales
          </button>
          <button
            onClick={() => setActiveTab('BAI')}
            className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'BAI'
                ? 'bg-[#4A6B53] text-white shadow-sm'
                : 'text-[#4A6B53] hover:bg-[#E8E2D5]'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            2. Cuestionario 1 (Sensaciones Físicas y Nerviosismo)
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                baiExisting || baiAnsweredCount === 21
                  ? 'bg-[#A3C9A8] text-[#2F3E32]'
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
                ? 'bg-[#4A6B53] text-white shadow-sm'
                : 'text-[#4A6B53] hover:bg-[#E8E2D5]'
            }`}
          >
            <FileText className="w-4 h-4" />
            3. Cuestionario 2 (Estado de Ánimo y Pensamientos)
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                bdiExisting || bdiAnsweredCount === 21
                  ? 'bg-[#A3C9A8] text-[#2F3E32]'
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
                ? 'bg-[#4A6B53] text-white shadow-sm'
                : 'text-[#4A6B53] hover:bg-[#E8E2D5]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            4. Estado de Mis Evaluaciones
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: FICHA DE DATOS PERSONALES */}
      {activeTab === 'FICHA_DATOS' && (
        <form onSubmit={handleSavePersonalData} className="bg-white border border-[#E8E2D5] rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#E8E2D5] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#2F3E32] flex items-center gap-2">
                <User className="w-5 h-5 text-[#4A6B53]" />
                Ficha de Datos Personales y Psicopedagógicos
              </h2>
              <p className="text-xs text-[#4A6B53] mt-1">
                {isDataLocked 
                  ? 'Tus datos ya han sido registrados y verificados. Si necesitas corregir algo, contacta a la Oficina de Psicología.' 
                  : 'Completa y verifica tu información para que la Oficina de Psicología pueda brindarte el acompañamiento adecuado durante tu estancia en el ITD.'}
              </p>
            </div>
            {!isDataLocked && (
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-xl shadow-sm cursor-pointer inline-flex items-center gap-2 self-start sm:self-auto"
              >
                <Save className="w-4 h-4" />
                Guardar Mi Ficha
              </button>
            )}
          </div>

          {savedPersonalDataBanner && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-3 text-xs text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <strong>¡Datos guardados con éxito!</strong> Tu ficha ha sido actualizada en el sistema institucional.
              </div>
            </div>
          )}

          {isDataLocked && (
            <div className="p-4 bg-[#F4F0E6] border border-[#E8E2D5] rounded-xl flex items-center gap-3 text-xs text-[#4A6B53]">
              <Lock className="w-5 h-5 text-[#4A6B53] shrink-0" />
              <div>
                <strong>Modo de solo lectura:</strong> Tus datos de identificación y contacto ya fueron guardados y no pueden ser modificados desde aquí.
              </div>
            </div>
          )}

          {/* SECCIÓN A: IDENTIFICACIÓN GENERAL */}
          <fieldset disabled={isDataLocked} className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4A6B53] font-mono">
              A. Datos de Identificación Institucional
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">No. de Control / Matrícula *</label>
                <input
                  type="text"
                  required
                  value={formData.matricula}
                  onChange={(e) => setFormData({ ...formData, matricula: e.target.value })}
                  placeholder="Ej. 12345678 o xxx-2026"
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Correo Institucional / Contacto *</label>
                <input
                  type="email"
                  required
                  value={formData.institutionalEmail}
                  onChange={(e) => setFormData({ ...formData, institutionalEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                  placeholder="ejemplo@itdurango.edu.mx o @gmail.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Carrera ITD</label>
                <input
                  type="text"
                  value={formData.programName}
                  onChange={(e) => setFormData({ ...formData, programName: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Semestre Actual</label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={formData.semester}
                  onChange={(e) => setFormData({ ...formData, semester: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Grupo</label>
                <input
                  type="text"
                  value={formData.group || ''}
                  onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                  placeholder="Ej. 1A, 2B"
                />
              </div>
            </div>
          </fieldset>

          {/* SECCIÓN B: DATOS SOCIODEMOGRÁFICOS */}
          <fieldset disabled={isDataLocked} className="space-y-4 pt-4 border-t border-[#E8E2D5]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4A6B53] font-mono">
              B. Datos Sociodemográficos y Contacto
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Edad *</label>
                <input
                  type="number"
                  required
                  value={formData.age || ''}
                  onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Fecha de Nacimiento *</label>
                <input
                  type="text"
                  required
                  value={formData.birthDate || ''}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                  placeholder="DD/MM/AAAA"
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Género *</label>
                <select
                  required
                  value={formData.gender || 'No especificado'}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                >
                  <option value="Femenino">Femenino</option>
                  <option value="Masculino">Masculino</option>
                  <option value="No binario">No binario</option>
                  <option value="Prefiero no decir">Prefiero no decir</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Teléfono Móvil / WhatsApp *</label>
                <input
                  type="text"
                  required
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Ej. 618 123 4567"
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Ciudad o Localidad de Origen *</label>
                <input
                  type="text"
                  required
                  value={formData.originCity || ''}
                  onChange={(e) => setFormData({ ...formData, originCity: e.target.value })}
                  placeholder="Ej. Durango, Dgo. / Santiago Papasquiaro"
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Domicilio Actual en Durango *</label>
                <input
                  type="text"
                  required
                  value={formData.currentAddress || ''}
                  onChange={(e) => setFormData({ ...formData, currentAddress: e.target.value })}
                  placeholder="Calle, número, colonia"
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">
                  Contacto de Emergencia (Nombre y Parentesco) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.emergencyContact || ''}
                  onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                  placeholder="Ej. María Soto (Mamá) / Tel: 618..."
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">
                  ¿Cuentas con equipo de cómputo e internet en casa?
                </label>
                <select
                  value={formData.computerAccess || 'Si'}
                  onChange={(e) => setFormData({ ...formData, computerAccess: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                >
                  <option value="Si">Sí, cuento con ambos</option>
                  <option value="Solo internet">Solo internet (sin computadora propia)</option>
                  <option value="Solo computadora">Solo computadora (sin internet fijo)</option>
                  <option value="No">No cuento con ninguno de los dos</option>
                </select>
              </div>
            </div>
          </fieldset>
                    {/* SECCIÓN C: HÁBITOS DE ESTUDIO Y SALUD */}
          <fieldset disabled={isDataLocked} className="space-y-4 pt-4 border-t border-[#E8E2D5]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4A6B53] font-mono">
              C. Hábitos Académicos y Salud
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Horas de Estudio al Día (fuera de clase)</label>
                <select
                  value={formData.studyHours || '1 1/2 Hora a 2 Horas'}
                  onChange={(e) => setFormData({ ...formData, studyHours: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                >
                  <option value="Menos de 1 hora">Menos de 1 hora</option>
                  <option value="1 1/2 Hora a 2 Horas">1 1/2 Hora a 2 Horas</option>
                  <option value="3 a 4 horas">3 a 4 horas</option>
                  <option value="Más de 4 horas">Más de 4 horas</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Horas de Sueño Habitual</label>
                <select
                  value={formData.sleepHours || '6 a 8 horas'}
                  onChange={(e) => setFormData({ ...formData, sleepHours: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                >
                  <option value="Menos de 5 horas">Menos de 5 horas</option>
                  <option value="6 a 8 horas">6 a 8 horas (Recomendado)</option>
                  <option value="Más de 8 horas">Más de 8 horas</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">¿Has recibido terapia psicológica antes?</label>
                <select
                  value={formData.previousPsychologicalTherapy || 'No'}
                  onChange={(e) =>
                    setFormData({ ...formData, previousPsychologicalTherapy: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                >
                  <option value="No">No, nunca</option>
                  <option value="Sí">Sí, anteriormente</option>
                  <option value="Actualmente">Actualmente me encuentro en proceso</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#3B4A3F] mb-1">Tus Hábitos Principales de Estudio</label>
              <textarea
                rows={2}
                value={formData.studyHabits || ''}
                onChange={(e) => setFormData({ ...formData, studyHabits: e.target.value })}
                placeholder="Ej. Tomar apuntes en clase, realizar resúmenes, mapas mentales, estudio en grupo..."
                className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] disabled:opacity-70 text-xs focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
              />
            </div>
          </fieldset>

          {!isDataLocked && (
            <div className="pt-4 border-t border-[#E8E2D5] flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 text-xs font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-xl shadow-sm cursor-pointer inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Guardar Mis Datos Personales
              </button>
            </div>
          )}
        </form>
      )}

      {/* PESTAÑA 2: CUESTIONARIO 1 (BAI - ANSIEDAD / SENSACIONES FÍSICAS) */}
      {activeTab === 'BAI' && (
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#E8E2D5] pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-[#A3C9A8] text-[#2F3E32]">
                  Cuestionario 1 de 2
                </span>
                <h2 className="text-xl font-bold text-[#2F3E32] mt-2">
                  Cuestionario de Sensaciones Físicas y Nerviosismo
                </h2>
                <p className="text-xs text-[#4A6B53] mt-1 max-w-2xl">
                  Indica qué tanto te han molestado o preocupado los siguientes síntomas durante la última semana, incluyendo el día de hoy.
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-[#4A6B53]">
                  {baiAnsweredCount} de 21 respondidos
                </div>
                <div className="w-32 h-2 bg-[#E8E2D5] rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[#4A6B53] transition-all"
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
                className="px-3 py-1.5 font-bold text-white bg-[#4A6B53] rounded-lg cursor-pointer whitespace-nowrap"
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
                      ? 'bg-[#A3C9A8]/10 border-[#A3C9A8]/50'
                      : 'bg-white border-[#E8E2D5] hover:border-[#A3C9A8]'
                  }`}
                >
                  <div className="font-semibold text-[#2F3E32] text-sm mb-3">
                    <span className="font-mono text-[#A3C9A8] mr-2">{item.itemNumber}.</span>
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
                            ? 'bg-[#4A6B53] text-white border-[#4A6B53] font-bold shadow-sm'
                            : 'bg-[#FDFBF7] text-[#4A6B53] border-[#E8E2D5] hover:bg-[#F4F0E6]'
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

          <div className="pt-4 border-t border-[#E8E2D5] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-[#4A6B53]">
              {baiAnsweredCount === 21
                ? '✅ Has respondido los 21 puntos. Ya puedes enviar tus respuestas.'
                : `Faltan ${21 - baiAnsweredCount} preguntas por responder.`}
            </div>
            <button
              type="button"
              disabled={baiAnsweredCount === 0}
              onClick={() => handleSendAssessment(InstrumentCode.BAI)}
              className="px-6 py-2.5 text-xs font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] disabled:opacity-50 rounded-xl shadow-sm cursor-pointer inline-flex items-center gap-2 self-end"
            >
              <Send className="w-4 h-4" />
              Enviar Cuestionario 1 a Psicología ITD
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: CUESTIONARIO 2 (BDI - ESTADO DE ÁNIMO Y PENSAMIENTOS) */}
      {activeTab === 'BDI' && (
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#E8E2D5] pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-[#A3C9A8] text-[#2F3E32]">
                  Cuestionario 2 de 2
                </span>
                <h2 className="text-xl font-bold text-[#2F3E32] mt-2">
                  Cuestionario de Estado de Ánimo y Pensamientos
                </h2>
                <p className="text-xs text-[#4A6B53] mt-1 max-w-2xl">
                  Selecciona la opción que mejor describa cómo te has sentido durante las últimas dos semanas.
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-[#4A6B53]">
                  {bdiAnsweredCount} de 21 respondidos
                </div>
                <div className="w-32 h-2 bg-[#E8E2D5] rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[#4A6B53] transition-all"
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
                className="px-3 py-1.5 font-bold text-white bg-[#4A6B53] rounded-lg cursor-pointer whitespace-nowrap"
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
                      ? 'bg-[#A3C9A8]/10 border-[#A3C9A8]/50'
                      : 'bg-white border-[#E8E2D5] hover:border-[#A3C9A8]'
                  }`}
                >
                  <div className="font-semibold text-[#2F3E32] text-sm mb-3">
                    <span className="font-mono text-[#A3C9A8] mr-2">{item.itemNumber}.</span>
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
                            ? 'bg-[#4A6B53] text-white border-[#4A6B53] font-bold shadow-sm'
                            : 'bg-[#FDFBF7] text-[#4A6B53] border-[#E8E2D5] hover:bg-[#F4F0E6]'
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

          <div className="pt-4 border-t border-[#E8E2D5] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-[#4A6B53]">
              {bdiAnsweredCount === 21
                ? '✅ Has respondido los 21 puntos del Cuestionario 2.'
                : `Faltan ${21 - bdiAnsweredCount} preguntas por responder.`}
            </div>
            <button
              type="button"
              disabled={bdiAnsweredCount === 0}
              onClick={() => handleSendAssessment(InstrumentCode.BDI)}
              className="px-6 py-2.5 text-xs font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] disabled:opacity-50 rounded-xl shadow-sm cursor-pointer inline-flex items-center gap-2 self-end"
            >
              <Send className="w-4 h-4" />
              Enviar Cuestionario 2 a Psicología ITD
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: ESTADO DE MIS EVALUACIONES */}
      {activeTab === 'ESTADO' && (
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#E8E2D5] pb-4">
            <h2 className="text-xl font-bold text-[#2F3E32] flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-[#4A6B53]" />
              Estado de tus Cuestionarios y Acompañamiento
            </h2>
            <p className="text-xs text-[#4A6B53] mt-1">
              Aquí puedes verificar la recepción de tus formularios por parte de la Oficina de Psicología del ITD.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tarjeta Cuestionario 1 */}
            <div className="p-5 border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#2F3E32]">
                  1. Cuestionario de Sensaciones Físicas (BAI)
                </span>
                <span
                  className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                    baiExisting || baiAnsweredCount === 21
                      ? 'bg-[#A3C9A8] text-[#2F3E32]'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {baiExisting || baiAnsweredCount === 21 ? 'Completado' : 'Pendiente'}
                </span>
              </div>
              <p className="text-xs text-[#4A6B53]">
                {baiExisting || baiAnsweredCount === 21
                  ? 'Tus respuestas han sido recibidas y procesadas confidencialmente.'
                  : 'Aún no completas este cuestionario. Te invitamos a responderlo.'}
              </p>
              {(!baiExisting && baiAnsweredCount < 21) && (
                <button
                  onClick={() => setActiveTab('BAI')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-lg cursor-pointer"
                >
                  Responder Cuestionario 1
                </button>
              )}
            </div>

            {/* Tarjeta Cuestionario 2 */}
            <div className="p-5 border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#2F3E32]">
                  2. Cuestionario de Estado de Ánimo (BDI)
                </span>
                <span
                  className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                    bdiExisting || bdiAnsweredCount === 21
                      ? 'bg-[#A3C9A8] text-[#2F3E32]'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {bdiExisting || bdiAnsweredCount === 21 ? 'Completado' : 'Pendiente'}
                </span>
              </div>
              <p className="text-xs text-[#4A6B53]">
                {bdiExisting || bdiAnsweredCount === 21
                  ? 'Tus respuestas han sido recibidas y procesadas confidencialmente.'
                  : 'Aún no completas este cuestionario. Te invitamos a responderlo.'}
              </p>
              {(!bdiExisting && bdiAnsweredCount < 21) && (
                <button
                  onClick={() => setActiveTab('BDI')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-lg cursor-pointer"
                >
                  Responder Cuestionario 2
                </button>
              )}
            </div>
          </div>

          <div className="p-5 bg-[#F4F0E6] border border-[#E8E2D5] rounded-xl space-y-2 text-xs text-[#3B4A3F]">
            <div className="font-bold flex items-center gap-1.5 text-[#4A6B53]">
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