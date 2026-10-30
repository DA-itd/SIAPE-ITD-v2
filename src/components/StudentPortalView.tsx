import React, { useState, useMemo, useEffect } from 'react';
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
// Función para generar una nota musical relajante (Acorde de Do Mayor) usando Web Audio API
const playRelaxingChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // Frecuencias de un acorde mayor suave (Do4, Mi4, Sol4)
    const frequencies = [261.63, 329.63, 392.00];
    
    frequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Tipo de onda 'sine' genera un tono puro y suave (como una flauta o campana)
      osc.type = 'sine';
      osc.frequency.value = freq;

      // Envolvente de volumen: empieza en 0, sube rápido y se desvanece suavemente
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      // Un pequeño retraso para que suene como un arpegio rápido
      osc.start(ctx.currentTime + index * 0.1);
      osc.stop(ctx.currentTime + 2.5);
    });
  } catch (error) {
    console.log("El navegador bloqueó el audio automático, pero la evaluación se guardó correctamente.");
  }
};

export const StudentPortalView: React.FC<StudentPortalViewProps> = ({
  currentUser,
  student,
  assessments,
  clinicalCase,
  onUpdateStudentRecord,
  onSubmitAssessment,
  onLogoutOrSwitchRole,
}) => {
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

  const [activeTab, setActiveTab] = useState<'FICHA_DATOS' | 'BAI' | 'BDI' | 'ESTADO'>(
    isDataLocked ? 'BAI' : 'FICHA_DATOS'
  );

  useEffect(() => {
    if (isDataLocked && activeTab === 'FICHA_DATOS') {
      setActiveTab('BAI');
    }
  }, [isDataLocked, activeTab]);

  const [formData, setFormData] = useState<StudentRecord>({ ...student });
  const [savedPersonalDataBanner, setSavedPersonalDataBanner] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const handleSavePersonalData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDataLocked) return;
    
    try {
      setFormError(null);
      await onUpdateStudentRecord(formData);
      setSavedPersonalDataBanner(true);
      setTimeout(() => setSavedPersonalDataBanner(false), 5000);
    } catch (err: any) {
      setFormError('Hubo un problema al guardar. Revisa tu conexión a internet e intenta de nuevo.');
    }
  };

  const handleSendAssessment = (inst: InstrumentCode) => {
    const responses = inst === InstrumentCode.BAI ? baiResponses : bdiResponses;
    
    if (Object.keys(responses).length < 21) {
      alert('Por favor responde todos los reactivos antes de enviar.');
      return;
    }

    setSubmittedInstrument(inst);
    onSubmitAssessment(inst, responses);
    setTimeout(() => setSubmittedInstrument(null), 8000); // El mensaje de éxito dura 8 segundos
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
    <div className="space-y-6 max-w-5xl mx-auto pb-24">
      {/* ENCABEZADO INSTITUCIONAL PARA EL ESTUDIANTE */}
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
            </div>
          </div>
        </div>

        {/* CINTILLO ÉTICO Y BOTÓN DE SALIR VISUAL */}
        <div className="bg-[#F4F0E6] border-b border-[#E8E2D5] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-[#4A6B53]">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#4A6B53] shrink-0" />
            <span>
              <strong>Confidencialidad:</strong> Tus respuestas solo las ve Psicología ITD.
            </span>
          </div>
          {onLogoutOrSwitchRole && (
            <button
              onClick={onLogoutOrSwitchRole}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border-2 border-rose-200 hover:border-rose-400 hover:bg-rose-50 rounded-xl text-xs font-bold text-rose-700 cursor-pointer transition-all shadow-sm w-full sm:w-auto"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión / Salir
            </button>
          )}
        </div>

        {/* NAVEGACIÓN DE PESTAÑAS */}
        <div className="flex border-b border-[#E8E2D5] bg-[#FDFBF7] p-2 gap-2 overflow-x-auto text-xs">
          {!isDataLocked && (
            <button
              onClick={() => setActiveTab('FICHA_DATOS')}
              className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'FICHA_DATOS'
                  ? 'bg-[#4A6B53] text-white shadow-sm'
                  : 'text-[#4A6B53] hover:bg-[#E8E2D5]'
              }`}
            >
              <User className="w-4 h-4" />
              1. Mis Datos
            </button>
          )}
          <button
            onClick={() => setActiveTab('BAI')}
            className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'BAI'
                ? 'bg-[#4A6B53] text-white shadow-sm'
                : 'text-[#4A6B53] hover:bg-[#E8E2D5]'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            {isDataLocked ? '1.' : '2.'} Cuestionario 1
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                baiExisting || baiAnsweredCount === 21
                  ? 'bg-[#A3C9A8] text-[#2F3E32]'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {baiExisting ? 'OK' : `${baiAnsweredCount}/21`}
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
            {isDataLocked ? '2.' : '3.'} Cuestionario 2
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                bdiExisting || bdiAnsweredCount === 21
                  ? 'bg-[#A3C9A8] text-[#2F3E32]'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {bdiExisting ? 'OK' : `${bdiAnsweredCount}/21`}
            </span>
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: FICHA DE DATOS PERSONALES */}
      {!isDataLocked && activeTab === 'FICHA_DATOS' && (
        <form onSubmit={handleSavePersonalData} className="bg-white border border-[#E8E2D5] rounded-2xl p-4 sm:p-8 space-y-6">
          <div className="border-b border-[#E8E2D5] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#2F3E32] flex items-center gap-2">
                <User className="w-5 h-5 text-[#4A6B53]" />
                Ficha de Datos Personales
              </h2>
              <p className="text-xs text-[#4A6B53] mt-1">
                Completa tu información para el acompañamiento psicológico.
              </p>
            </div>
          </div>

          {savedPersonalDataBanner && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-3 text-xs text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <strong>¡Datos guardados!</strong> Ahora puedes responder los cuestionarios.
              </div>
            </div>
          )}

          {formError && (
            <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl flex items-center gap-3 text-xs text-rose-900">
              <Lock className="w-5 h-5 text-rose-600 shrink-0" />
              <div>{formError}</div>
            </div>
          )}

          {/* SECCIÓN A: IDENTIFICACIÓN GENERAL */}
          <fieldset className="space-y-4">
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
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
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
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Correo Institucional *</label>
                <input
                  type="email"
                  required
                  value={formData.institutionalEmail}
                  onChange={(e) => setFormData({ ...formData, institutionalEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Carrera ITD</label>
                <input
                  type="text"
                  value={formData.programName}
                  onChange={(e) => setFormData({ ...formData, programName: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
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
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
            </div>
          </fieldset>

          {/* SECCIÓN B: DATOS SOCIODEMOGRÁFICOS */}
          <fieldset className="space-y-4 pt-4 border-t border-[#E8E2D5]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4A6B53] font-mono">
              B. Datos Sociodemográficos y Contacto
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Edad *</label>
                <input
                  type="number"
                  required
                  value={formData.age || ''}
                  onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
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
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Género *</label>
                <select
                  required
                  value={formData.gender || 'No especificado'}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                >
                  <option value="Femenino">Femenino</option>
                  <option value="Masculino">Masculino</option>
                  <option value="No binario">No binario</option>
                  <option value="Prefiero no decir">Prefiero no decir</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Teléfono Móvil *</label>
                <input
                  type="text"
                  required
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Ej. 618 123 4567"
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Ciudad o Localidad de Origen *</label>
                <input
                  type="text"
                  required
                  value={formData.originCity || ''}
                  onChange={(e) => setFormData({ ...formData, originCity: e.target.value })}
                  placeholder="Ej. Durango, Dgo."
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
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
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">
                  Contacto de Emergencia (Nombre y Teléfono) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.emergencyContact || ''}
                  onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                  placeholder="Ej. María Soto (Mamá) / 618..."
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                />
              </div>
            </div>
          </fieldset>

          <div className="pt-4 border-t border-[#E8E2D5] flex justify-end">
            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-3 text-sm font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-xl shadow-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Guardar Mis Datos
            </button>
          </div>
        </form>
      )}
            {/* PESTAÑA 2: CUESTIONARIO 1 (BAI) */}
      {activeTab === 'BAI' && (
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 sm:p-8 space-y-6">
          <div className="border-b border-[#E8E2D5] pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-[#A3C9A8] text-[#2F3E32]">
                  Cuestionario 1 de 2
                </span>
                <h2 className="text-xl font-bold text-[#2F3E32] mt-2">
                  Sensaciones Físicas y Nerviosismo
                </h2>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-xs font-mono font-bold text-[#4A6B53]">
                  {baiAnsweredCount} de 21 respondidos
                </div>
                <div className="w-full sm:w-32 h-2 bg-[#E8E2D5] rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[#4A6B53] transition-all"
                    style={{ width: `${(baiAnsweredCount / 21) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* MENSAJE DE ALIENTO TRAS ENVIAR */}
          {submittedInstrument === InstrumentCode.BAI && (
            <div className="p-6 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex flex-col items-center justify-center gap-3 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              <h3 className="text-lg font-bold text-emerald-900">¡Muchas gracias por tus respuestas!</h3>
              <p className="text-sm text-emerald-800">
                Tus respuestas han sido recibidas de forma confidencial. Te esperamos en un mes para revisar tu avance.
              </p>
              <button
                onClick={() => setActiveTab('BDI')}
                className="mt-2 px-6 py-2.5 font-bold text-white bg-[#4A6B53] rounded-xl cursor-pointer"
              >
                Continuar al Cuestionario 2 ➔
              </button>
            </div>
          )}

          {/* LISTA DE LOS 21 REACTIVOS */}
          <div className={`space-y-4 ${submittedInstrument === InstrumentCode.BAI ? 'opacity-50 pointer-events-none' : ''}`}>
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
                  <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 text-xs">
                    {[0, 1, 2, 3].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setBaiResponses((prev) => ({ ...prev, [item.itemNumber]: val }))}
                        className={`w-full p-3 rounded-lg border text-left cursor-pointer transition-all ${
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

          {/* BOTÓN FLOTANTE PARA ENVIAR */}
          <div className={`sticky bottom-4 pt-4 mt-6 border-t border-[#E8E2D5] bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 z-10 ${submittedInstrument === InstrumentCode.BAI ? 'hidden' : ''}`}>
            <div className="text-xs text-[#4A6B53] font-bold">
              {baiAnsweredCount === 21 ? '✅ Todo listo para enviar.' : `Faltan ${21 - baiAnsweredCount} preguntas.`}
            </div>
            <button
              type="button"
              disabled={baiAnsweredCount < 21}
              onClick={() => handleSendAssessment(InstrumentCode.BAI)}
              className="w-full sm:w-auto px-6 py-3.5 text-sm font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md cursor-pointer inline-flex items-center justify-center gap-2 transition-all"
            >
              <Send className="w-4 h-4" />
              Enviar Cuestionario 1
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: CUESTIONARIO 2 (BDI) */}
      {activeTab === 'BDI' && (
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 sm:p-8 space-y-6">
          <div className="border-b border-[#E8E2D5] pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-[#A3C9A8] text-[#2F3E32]">
                  Cuestionario 2 de 2
                </span>
                <h2 className="text-xl font-bold text-[#2F3E32] mt-2">
                  Estado de Ánimo y Pensamientos
                </h2>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-xs font-mono font-bold text-[#4A6B53]">
                  {bdiAnsweredCount} de 21 respondidos
                </div>
                <div className="w-full sm:w-32 h-2 bg-[#E8E2D5] rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[#4A6B53] transition-all"
                    style={{ width: `${(bdiAnsweredCount / 21) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* MENSAJE DE ALIENTO TRAS ENVIAR */}
          {submittedInstrument === InstrumentCode.BDI && (
            <div className="p-6 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex flex-col items-center justify-center gap-3 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              <h3 className="text-lg font-bold text-emerald-900">¡Muchas gracias por tus respuestas!</h3>
              <p className="text-sm text-emerald-800">
                Has completado todo el proceso. La Oficina de Psicología revisará tu información y te contactará si es necesario. Te esperamos en un mes para ver tu avance.
              </p>
              <button
                onClick={() => setActiveTab('ESTADO')}
                className="mt-2 px-6 py-2.5 font-bold text-white bg-[#4A6B53] rounded-xl cursor-pointer"
              >
                Ver mi Estado Final ➔
              </button>
            </div>
          )}

          {/* LISTA DE LOS 21 REACTIVOS */}
          <div className={`space-y-4 ${submittedInstrument === InstrumentCode.BDI ? 'opacity-50 pointer-events-none' : ''}`}>
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
                  <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 text-xs">
                    {[0, 1, 2, 3].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setBdiResponses((prev) => ({ ...prev, [item.itemNumber]: val }))}
                        className={`w-full p-3 rounded-lg border text-left cursor-pointer transition-all ${
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

          {/* BOTÓN FLOTANTE PARA ENVIAR */}
          <div className={`sticky bottom-4 pt-4 mt-6 border-t border-[#E8E2D5] bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 z-10 ${submittedInstrument === InstrumentCode.BDI ? 'hidden' : ''}`}>
            <div className="text-xs text-[#4A6B53] font-bold">
              {bdiAnsweredCount === 21 ? '✅ Todo listo para enviar.' : `Faltan ${21 - bdiAnsweredCount} preguntas.`}
            </div>
            <button
              type="button"
              disabled={bdiAnsweredCount < 21}
              onClick={() => handleSendAssessment(InstrumentCode.BDI)}
              className="w-full sm:w-auto px-6 py-3.5 text-sm font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md cursor-pointer inline-flex items-center justify-center gap-2 transition-all"
            >
              <Send className="w-4 h-4" />
              Enviar Cuestionario 2
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: ESTADO FINAL */}
      {activeTab === 'ESTADO' && (
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 sm:p-8 space-y-6">
          <div className="border-b border-[#E8E2D5] pb-4">
            <h2 className="text-xl font-bold text-[#2F3E32] flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-[#4A6B53]" />
              Estado de tus Evaluaciones
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#2F3E32]">1. Sensaciones Físicas (BAI)</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${baiExisting || baiAnsweredCount === 21 ? 'bg-[#A3C9A8] text-[#2F3E32]' : 'bg-amber-100 text-amber-900'}`}>
                  {baiExisting ? 'Completado' : 'Pendiente'}
                </span>
              </div>
              <p className="text-xs text-[#4A6B53]">
                {baiExisting ? 'Tus respuestas han sido recibidas y procesadas confidencialmente.' : 'Aún no envías este cuestionario.'}
              </p>
            </div>

            <div className="p-5 border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#2F3E32]">2. Estado de Ánimo (BDI)</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${bdiExisting || bdiAnsweredCount === 21 ? 'bg-[#A3C9A8] text-[#2F3E32]' : 'bg-amber-100 text-amber-900'}`}>
                  {bdiExisting ? 'Completado' : 'Pendiente'}
                </span>
              </div>
              <p className="text-xs text-[#4A6B53]">
                {bdiExisting ? 'Tus respuestas han sido recibidas y procesadas confidencialmente.' : 'Aún no envías este cuestionario.'}
              </p>
            </div>
          </div>

          <div className="p-5 bg-[#F4F0E6] border border-[#E8E2D5] rounded-xl space-y-2 text-xs text-[#3B4A3F]">
            <div className="font-bold flex items-center gap-1.5 text-[#4A6B53]">
              <HeartHandshake className="w-4 h-4" />
              Oficina de Psicología
            </div>
            <p className="leading-relaxed">
              Si requieres atención presencial o apoyo, acude al Edificio de Desarrollo Académico del ITD.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
