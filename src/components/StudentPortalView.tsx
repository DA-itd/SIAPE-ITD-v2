import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  LifeBuoy,
  Lock,
  LogOut,
  Save,
  Send,
  ShieldCheck,
  User,
  RefreshCw, // Icono para volver a contestar
} from 'lucide-react';
import {
  AcademicProgram,
  AssessmentRecord,
  AssessmentStatus,
  ClinicalCaseRecord,
  InstrumentCode,
  StudentRecord,
  UserProfile,
} from '../types/siape';
import { INITIAL_INSTRUMENT_CONFIGS } from '../lib/scoringEngine';

// Función para generar una nota musical relajante (Acorde de Do Mayor)
const playRelaxingChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const frequencies = [261.63, 329.63, 392.00];
    frequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + index * 0.1);
      osc.stop(ctx.currentTime + 2.5);
    });
  } catch (error) {
    console.log("Audio bloqueado por el navegador.");
  }
};

// Calcula la edad a partir de una fecha AAAA-MM-DD
const calcAge = (iso: string): number => {
  if (!iso) return 0;
  const b = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(b.getTime())) return 0;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age > 0 ? age : 0;
};

// Fecha de hoy en hora local (AAAA-MM-DD)
const todayIso = (): string => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

// Fecha real (no acepta 31/02, letras ni años absurdos) y edad razonable
const isValidBirthDate = (iso: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return false;
  const age = calcAge(iso);
  return age >= 14 && age <= 90;
};

// Teléfono: solo dígitos, máximo 10, con formato 618-123-4567
const formatPhone = (raw: string): string => {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};
const PHONE_REGEX = /^\d{3}-\d{3}-\d{4}$/;

// Contacto de emergencia: se guarda como "Nombre / 618-123-4567"
const composeEmergencyContact = (name: string, phone: string): string => {
  const n = name.trim();
  const p = phone.trim();
  return !n && !p ? '' : `${n} / ${p}`;
};
const parseEmergencyContact = (raw?: string | null): { name: string; phone: string } => {
  const text = (raw || '').trim();
  if (!text) return { name: '', phone: '' };
  const sep = text.lastIndexOf(' / ');
  if (sep >= 0) return { name: text.slice(0, sep).trim(), phone: formatPhone(text.slice(sep + 3)) };
  // Texto libre anterior: si termina en un número de 10 dígitos, se separa
  const m = text.match(/(\d[\d\s\-().]{8,}\d)\s*$/);
  if (m && m.index !== undefined) {
    const digits = m[1].replace(/\D/g, '');
    if (digits.length >= 10) {
      return { name: text.slice(0, m.index).replace(/[\s/\-:,]+$/, '').trim(), phone: formatPhone(digits.slice(-10)) };
    }
  }
  return { name: text, phone: '' };
};

// Tamizaje Columbia (C-SSRS): texto de las 6 preguntas, tal como se aplicaba en el formulario institucional
const COLUMBIA_ITEMS: { itemNumber: number; text: string }[] = [
  { itemNumber: 1, text: 'En el pasado mes, ¿ha deseado estar muerto(a) o poder dormirse y no despertar?' },
  { itemNumber: 2, text: 'En el pasado mes, ¿ha tenido realmente la idea de suicidarse?' },
  { itemNumber: 3, text: 'En el pasado mes, ¿ha pensado en cómo llevaría esto a cabo?' },
  { itemNumber: 4, text: 'En el pasado mes, ¿ha tenido estas ideas y en cierto grado la intención de llevarlas a cabo?' },
  { itemNumber: 5, text: 'En el pasado mes, ¿ha comenzado a elaborar o ha elaborado los detalles sobre cómo suicidarse? ¿Tiene intenciones de llevar a cabo este plan?' },
  { itemNumber: 6, text: 'En los pasados 3 meses, ¿ha hecho algo, comenzado a hacer algo o se ha preparado para hacer algo para terminar su vida?' },
];

interface StudentPortalViewProps {
  currentUser: UserProfile;
  student: StudentRecord;
  programs: AcademicProgram[];
  assessments: AssessmentRecord[];
  clinicalCase?: ClinicalCaseRecord;
  onUpdateStudentRecord: (updated: StudentRecord) => Promise<void>;
  onSubmitAssessment: (instrumentCode: InstrumentCode, responses: Record<number, number>) => Promise<void>;
  onSubmitColumbia: (responses: Record<number, number>) => Promise<void>;
  onLogoutOrSwitchRole?: () => void;
}

export const StudentPortalView: React.FC<StudentPortalViewProps> = ({
  currentUser,
  student,
  programs,
  assessments,
  clinicalCase,
  onUpdateStudentRecord,
  onSubmitAssessment,
  onSubmitColumbia,
  onLogoutOrSwitchRole,
}) => {
  // ¿La carrera actual ya está en el catálogo institucional?
  const hasCatalogProgram = useMemo(
    () =>
      programs.some((p) => p.id === student.programId) ||
      programs.some((p) => p.name.trim().toLowerCase() === (student.programName || '').trim().toLowerCase()),
    [programs, student.programId, student.programName]
  );

  const isDataLocked = useMemo(() => {
    return Boolean(
      student.fullName?.trim() &&
      student.matricula?.trim() &&
      !student.matricula.trim().startsWith('G-') &&
      student.institutionalEmail?.trim() &&
      student.phone?.trim() &&
      student.emergencyContact?.trim() &&
      student.originCity?.trim() &&
      student.currentAddress?.trim() &&
      student.age &&
      student.birthDate &&
      student.gender &&
      hasCatalogProgram
    );
  }, [student, hasCatalogProgram]);

  const [activeTab, setActiveTab] = useState<'FICHA_DATOS' | 'BAI' | 'BDI' | 'COLUMBIA' | 'ESTADO'>(
    isDataLocked ? 'BAI' : 'FICHA_DATOS'
  );

  useEffect(() => {
    if (isDataLocked && activeTab === 'FICHA_DATOS') {
      setActiveTab('BAI');
    }
  }, [isDataLocked, activeTab]);

  // Las cuentas de Gmail nacen con una matrícula provisional (G-xxxxxxxx): se deja vacía para que el alumno capture la real.
  const [formData, setFormData] = useState<StudentRecord>({
    ...student,
    matricula: student.matricula?.startsWith('G-') ? '' : student.matricula,
    gender: student.gender ?? '',
    phone: formatPhone(student.phone ?? ''),
  });
  const initialEmergency = parseEmergencyContact(student.emergencyContact);
  const [emergencyName, setEmergencyName] = useState<string>(initialEmergency.name);
  const [emergencyPhone, setEmergencyPhone] = useState<string>(initialEmergency.phone);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedPersonalDataBanner, setSavedPersonalDataBanner] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Estados para los cuestionarios (inician vacíos para permitir nuevas aplicaciones)
  const [baiResponses, setBaiResponses] = useState<Record<number, number>>({});
  const [bdiResponses, setBdiResponses] = useState<Record<number, number>>({});
  const [columbiaResponses, setColumbiaResponses] = useState<Record<number, number>>({});
  const [columbiaSubmitted, setColumbiaSubmitted] = useState<boolean>(false);

  // El aviso de error de un cuestionario no debe seguir visible al cambiar de pestaña
  useEffect(() => { setSubmitError(null); }, [activeTab]);
  const [submittedInstrument, setSubmittedInstrument] = useState<InstrumentCode | null>(null);

  const baiConfig = INITIAL_INSTRUMENT_CONFIGS[InstrumentCode.BAI];
  const bdiConfig = INITIAL_INSTRUMENT_CONFIGS[InstrumentCode.BDI];

  // Encontrar la ÚLTIMA evaluación completada de cada instrumento para mostrarla en el estado
  const lastBai = assessments
    .filter((a) => a.instrumentCode === InstrumentCode.BAI)
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))[0];
    
  const lastBdi = assessments
    .filter((a) => a.instrumentCode === InstrumentCode.BDI)
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))[0];

  const lastColumbia = assessments
    .filter((a) => (a.instrumentCode as unknown as string) === 'CSSRS')
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))[0];

  const baiAnsweredCount = Object.keys(baiResponses).length;
  const bdiAnsweredCount = Object.keys(bdiResponses).length;
  const columbiaAnsweredCount = Object.keys(columbiaResponses).length;
  const columbiaHasYes = Object.values(columbiaResponses).some((v) => v === 1);

  // Carrera seleccionada: por id del catálogo o, si el alumno ya tenía una carrera
  // escrita a mano, se busca por nombre para conservarla mientras elige del menú.
  const selectedProgramId =
    programs.find((p) => p.id === formData.programId)?.id ||
    programs.find((p) => p.name.trim().toLowerCase() === (formData.programName || '').trim().toLowerCase())?.id ||
    '';
  const legacyProgramName = !selectedProgramId && formData.programName && formData.programName.trim().toLowerCase() !== 'sin asignar'
    ? formData.programName.trim()
    : '';

  const handleSelectProgram = (programId: string) => {
    const program = programs.find((p) => p.id === programId);
    if (!program) return;
    setFormData((prev) => ({
      ...prev,
      programId: program.id,
      programName: program.name,
      academicDepartment: program.academicDepartment,
    }));
  };

  const handleSavePersonalData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDataLocked) return;
    try {
      setFormError(null);
      const pickedProgram =
        programs.find((p) => p.id === formData.programId) ||
        programs.find((p) => p.name.trim().toLowerCase() === (formData.programName || '').trim().toLowerCase());
      if (!pickedProgram) {
        setFormError('Selecciona tu carrera del menú. Es necesaria para tu expediente.');
        return;
      }
      if (!isValidBirthDate(formData.birthDate || '')) {
        setFormError('Revisa tu fecha de nacimiento: debe ser una fecha válida (día, mes y año).');
        return;
      }
      if (!PHONE_REGEX.test(formData.phone || '')) {
        setFormError('El teléfono móvil debe tener el formato 618-123-4567.');
        return;
      }
      if (!emergencyName.trim()) {
        setFormError('Escribe el nombre de tu contacto de emergencia.');
        return;
      }
      if (!PHONE_REGEX.test(emergencyPhone)) {
        setFormError('El teléfono del contacto de emergencia debe tener el formato 618-123-4567.');
        return;
      }
      await onUpdateStudentRecord({
        ...formData,
        programId: pickedProgram.id,
        programName: pickedProgram.name,
        academicDepartment: pickedProgram.academicDepartment,
        age: calcAge(formData.birthDate as string),
        emergencyContact: composeEmergencyContact(emergencyName, emergencyPhone),
      });
      setSavedPersonalDataBanner(true);
      setTimeout(() => setSavedPersonalDataBanner(false), 5000);
    } catch (err: any) {
      console.error('Error al guardar la ficha', err);
      setFormError(`No se pudo guardar: ${err?.message ?? 'revisa tu conexión'}`);
    }
  };

  const handleSendAssessment = async (inst: InstrumentCode) => {
    const responses = inst === InstrumentCode.BAI ? baiResponses : bdiResponses;
    if (Object.keys(responses).length < 21) {
      setSubmitError('Responde todos los reactivos antes de enviar.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmitAssessment(inst, responses);
      playRelaxingChime();
      setSubmittedInstrument(inst);
      setTimeout(() => setSubmittedInstrument(null), 8000);
    } catch (err: any) {
      console.error('Error al enviar el cuestionario', err);
      setSubmitError(`No pudimos guardar tus respuestas: ${err?.message ?? 'revisa tu conexión'}. Siguen en pantalla; inténtalo de nuevo.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendColumbia = async () => {
    if (Object.keys(columbiaResponses).length < 6) {
      setSubmitError('Responde las 6 preguntas antes de enviar.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmitColumbia(columbiaResponses);
      setColumbiaSubmitted(true);
    } catch (err: any) {
      console.error('Error al enviar el cuestionario 3', err);
      setSubmitError(`No pudimos guardar tus respuestas: ${err?.message ?? 'revisa tu conexión'}. Siguen en pantalla; inténtalo de nuevo.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetColumbia = () => { setColumbiaResponses({}); setColumbiaSubmitted(false); };
  const resetBai = () => setBaiResponses({});
  const resetBdi = () => setBdiResponses({});

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
      {/* ENCABEZADO */}
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
                Cuestionario Diagnóstico Integral y Acompañamiento Psicológico
              </p>
            </div>
            <div className="bg-white/50 backdrop-blur-sm p-3 rounded-xl border border-white/60 text-xs text-[#4A6B53] space-y-1">
              <div>Matrícula: <strong className="text-[#2F3E32] font-mono">{student.matricula}</strong></div>
              <div>Carrera: <strong className="text-[#2F3E32]">{student.programName}</strong></div>
            </div>
          </div>
        </div>

        <div className="bg-[#F4F0E6] border-b border-[#E8E2D5] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-[#4A6B53]">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#4A6B53] shrink-0" />
            <span><strong>Confidencialidad:</strong> Tus respuestas solo las ve Psicología ITD.</span>
          </div>
          {onLogoutOrSwitchRole && (
            <button onClick={onLogoutOrSwitchRole} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border-2 border-rose-200 hover:border-rose-400 hover:bg-rose-50 rounded-xl text-xs font-bold text-rose-700 cursor-pointer transition-all shadow-sm w-full sm:w-auto">
              <LogOut className="w-4 h-4" /> Cerrar Sesión / Salir
            </button>
          )}
        </div>

        {/* PESTAÑAS */}
        <div className="flex border-b border-[#E8E2D5] bg-[#FDFBF7] p-2 gap-2 overflow-x-auto text-xs">
          {!isDataLocked && (
            <button onClick={() => setActiveTab('FICHA_DATOS')} className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${activeTab === 'FICHA_DATOS' ? 'bg-[#4A6B53] text-white shadow-sm' : 'text-[#4A6B53] hover:bg-[#E8E2D5]'}`}>
              <User className="w-4 h-4" /> 1. Mis Datos
            </button>
          )}
          <button onClick={() => setActiveTab('BAI')} className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${activeTab === 'BAI' ? 'bg-[#4A6B53] text-white shadow-sm' : 'text-[#4A6B53] hover:bg-[#E8E2D5]'}`}>
            <ClipboardCheck className="w-4 h-4" /> {isDataLocked ? '1.' : '2.'} Cuestionario 1
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${lastBai ? 'bg-[#A3C9A8] text-[#2F3E32]' : 'bg-amber-100 text-amber-900'}`}>
              {lastBai ? 'Evaluado' : `${baiAnsweredCount}/21`}
            </span>
          </button>
          <button onClick={() => setActiveTab('BDI')} className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${activeTab === 'BDI' ? 'bg-[#4A6B53] text-white shadow-sm' : 'text-[#4A6B53] hover:bg-[#E8E2D5]'}`}>
            <FileText className="w-4 h-4" /> {isDataLocked ? '2.' : '3.'} Cuestionario 2
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${lastBdi ? 'bg-[#A3C9A8] text-[#2F3E32]' : 'bg-amber-100 text-amber-900'}`}>
              {lastBdi ? 'Evaluado' : `${bdiAnsweredCount}/21`}
            </span>
          </button>
          <button onClick={() => setActiveTab('COLUMBIA')} className={`px-4 py-2.5 rounded-xl font-bold cursor-pointer transition-colors inline-flex items-center gap-2 whitespace-nowrap ${activeTab === 'COLUMBIA' ? 'bg-[#4A6B53] text-white shadow-sm' : 'text-[#4A6B53] hover:bg-[#E8E2D5]'}`}>
            <LifeBuoy className="w-4 h-4" /> {isDataLocked ? '3.' : '4.'} Cuestionario 3
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${lastColumbia ? 'bg-[#A3C9A8] text-[#2F3E32]' : 'bg-amber-100 text-amber-900'}`}>
              {lastColumbia ? 'Evaluado' : `${columbiaAnsweredCount}/6`}
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
                <User className="w-5 h-5 text-[#4A6B53]" /> Ficha de Datos Personales
              </h2>
              <p className="text-xs text-[#4A6B53] mt-1">Completa tu información para el acompañamiento psicológico.</p>
            </div>
          </div>

          {savedPersonalDataBanner && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-3 text-xs text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div><strong>¡Datos guardados!</strong> Ahora puedes responder los cuestionarios.</div>
            </div>
          )}

          {formError && (
            <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl flex items-center gap-3 text-xs text-rose-900">
              <Lock className="w-5 h-5 text-rose-600 shrink-0" /><div>{formError}</div>
            </div>
          )}

          <fieldset className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4A6B53] font-mono">A. Datos de Identificación Institucional</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Nombre Completo *</label>
                <input type="text" required value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]" />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">No. de Control / Matrícula *</label>
                <input type="text" required value={formData.matricula} onChange={(e) => setFormData({ ...formData, matricula: e.target.value })} placeholder="Ej. 12345678 o xxx-2026" className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]" />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Correo con el que iniciaste sesión</label>
                <input type="email" value={formData.institutionalEmail} readOnly className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#F4F0E6] text-[#4A6B53] font-mono cursor-not-allowed focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Carrera ITD *</label>
                <select
                  required
                  value={selectedProgramId || (legacyProgramName ? '__legacy__' : '')}
                  onChange={(e) => handleSelectProgram(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]"
                >
                  <option value="" disabled>Selecciona tu carrera…</option>
                  {legacyProgramName && (
                    <option value="__legacy__">
                      Carrera actual: {legacyProgramName} — elígela de la lista
                    </option>
                  )}
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
                {selectedProgramId && (
                  <p className="mt-1 text-[11px] text-[#4A6B53]">
                    {programs.find((p) => p.id === selectedProgramId)?.academicDepartment}
                  </p>
                )}
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Semestre Actual</label>
                <input type="number" min={1} max={14} value={formData.semester} onChange={(e) => setFormData({ ...formData, semester: Number(e.target.value) })} className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]" />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4 pt-4 border-t border-[#E8E2D5]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4A6B53] font-mono">B. Datos Sociodemográficos y Contacto</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Fecha de Nacimiento *</label>
                <input type="date" required value={formData.birthDate || ''} min="1930-01-01" max={todayIso()} onChange={(e) => setFormData({ ...formData, birthDate: e.target.value, age: calcAge(e.target.value) })} className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]" />
                {isValidBirthDate(formData.birthDate || '') && (
                  <p className="mt-1 text-[11px] text-[#4A6B53]">Edad calculada: <span className="font-mono font-bold">{calcAge(formData.birthDate as string)}</span> años</p>
                )}
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Género *</label>
                <select required value={formData.gender || ''} onChange={(e) => setFormData({ ...formData, gender: e.target.value })} className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]">
                  <option value="" disabled>Selecciona…</option><option value="Femenino">Femenino</option><option value="Masculino">Masculino</option><option value="No binario">No binario</option><option value="Prefiero no decir">Prefiero no decir</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Teléfono Móvil *</label>
                <input type="tel" inputMode="numeric" autoComplete="tel-national" required maxLength={12} pattern="\d{3}-\d{3}-\d{4}" title="Formato: 618-123-4567" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })} placeholder="618-123-4567" className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Ciudad o Localidad de Origen *</label>
                <input type="text" required value={formData.originCity || ''} onChange={(e) => setFormData({ ...formData, originCity: e.target.value })} placeholder="Ej. Durango, Dgo." className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]" />
              </div>
              <div>
                <label className="block font-semibold text-[#3B4A3F] mb-1">Domicilio Actual *</label>
                <input type="text" required value={formData.currentAddress || ''} onChange={(e) => setFormData({ ...formData, currentAddress: e.target.value })} placeholder="C. Hidalgo 123, Col. Centro" className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-[#3B4A3F] mb-1">Contacto de Emergencia (Nombre y parentesco) *</label>
                  <input type="text" required value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} placeholder="Ej. María Soto (Mamá)" className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]" />
                </div>
                <div>
                  <label className="block font-semibold text-[#3B4A3F] mb-1">Teléfono del Contacto de Emergencia *</label>
                  <input type="tel" inputMode="numeric" required maxLength={12} pattern="\d{3}-\d{3}-\d{4}" title="Formato: 618-123-4567" value={emergencyPhone} onChange={(e) => setEmergencyPhone(formatPhone(e.target.value))} placeholder="618-123-4567" className="w-full px-3 py-2 border border-[#E8E2D5] rounded-lg bg-[#FDFBF7] text-[#3B4A3F] font-mono focus:outline-none focus:ring-2 focus:ring-[#A3C9A8]" />
                </div>
              </div>
            </div>
          </fieldset>

          <div className="pt-4 border-t border-[#E8E2D5] flex justify-end">
            <button type="submit" className="w-full sm:w-auto px-6 py-3 text-sm font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-xl shadow-sm cursor-pointer inline-flex items-center justify-center gap-2">
              <Save className="w-4 h-4" /> Guardar Mis Datos
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
                  Cuestionario 1 de 3
                </span>
                <h2 className="text-xl font-bold text-[#2F3E32] mt-2">Sensaciones Físicas y Nerviosismo</h2>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-xs font-mono font-bold text-[#4A6B53]">{baiAnsweredCount} de 21 respondidos</div>
                <div className="w-full sm:w-32 h-2 bg-[#E8E2D5] rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-[#4A6B53] transition-all" style={{ width: `${(baiAnsweredCount / 21) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* AVISO SI YA CONTESTÓ ANTES */}
          {lastBai && !submittedInstrument && (
            <div className="p-4 bg-[#F4F0E6] border border-[#E8E2D5] rounded-xl flex items-center justify-between gap-3 text-xs text-[#4A6B53]">
              <div>
                <strong>Ya completaste este cuestionario el {new Date(lastBai.appliedAt).toLocaleDateString()}.</strong>
                <br />Si lo deseas, puedes volver a responderlo para actualizar tu evaluación.
              </div>
            </div>
          )}

          {submittedInstrument === InstrumentCode.BAI && (
            <div className="p-6 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex flex-col items-center justify-center gap-3 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              <h3 className="text-lg font-bold text-emerald-900">¡Muchas gracias por tus respuestas!</h3>
              <p className="text-sm text-emerald-800">Tus respuestas han sido recibidas de forma confidencial. Te esperamos en un mes para revisar tu avance.</p>
              <button onClick={() => setActiveTab('BDI')} className="mt-2 px-6 py-2.5 font-bold text-white bg-[#4A6B53] rounded-xl cursor-pointer">
                Continuar al Cuestionario 2 ➔
              </button>
            </div>
          )}

          <div className={`space-y-4 ${submittedInstrument === InstrumentCode.BAI ? 'opacity-50 pointer-events-none' : ''}`}>
            {baiConfig.items.map((item) => {
              const currentVal = baiResponses[item.itemNumber];
              return (
                <div key={item.itemNumber} className={`p-4 rounded-xl border transition-all ${currentVal !== undefined ? 'bg-[#A3C9A8]/10 border-[#A3C9A8]/50' : 'bg-white border-[#E8E2D5] hover:border-[#A3C9A8]'}`}>
                  <div className="font-semibold text-[#2F3E32] text-sm mb-3">
                    <span className="font-mono text-[#A3C9A8] mr-2">{item.itemNumber}.</span>
                    {item.placeholderLabel}
                  </div>
                  <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 text-xs">
                    {[0, 1, 2, 3].map((val) => (
                      <button key={val} type="button" onClick={() => setBaiResponses((prev) => ({ ...prev, [item.itemNumber]: val }))} className={`w-full p-3 rounded-lg border text-left cursor-pointer transition-all ${currentVal === val ? 'bg-[#4A6B53] text-white border-[#4A6B53] font-bold shadow-sm' : 'bg-[#FDFBF7] text-[#4A6B53] border-[#E8E2D5] hover:bg-[#F4F0E6]'}`}>
                        {getOptionLabel(InstrumentCode.BAI, val)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`sticky bottom-4 pt-4 mt-6 border-t border-[#E8E2D5] bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 z-10 ${submittedInstrument === InstrumentCode.BAI ? 'hidden' : ''}`}>
            <div className="text-xs text-[#4A6B53] font-bold">
              {baiAnsweredCount === 21 ? '✅ Todo listo para enviar.' : `Faltan ${21 - baiAnsweredCount} preguntas.`}
            </div>
            {submitError && (
              <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2 w-full sm:flex-1">{submitError}</div>
            )}
            <button type="button" disabled={baiAnsweredCount < 21 || isSubmitting} onClick={() => handleSendAssessment(InstrumentCode.BAI)} className="w-full sm:w-auto px-6 py-3.5 text-sm font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md cursor-pointer inline-flex items-center justify-center gap-2 transition-all">
              <Send className="w-4 h-4" /> {isSubmitting ? 'Enviando…' : lastBai ? 'Actualizar Evaluación' : 'Enviar Cuestionario 1'}
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
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-[#A3C9A8] text-[#2F3E32]">Cuestionario 2 de 3</span>
                <h2 className="text-xl font-bold text-[#2F3E32] mt-2">Estado de Ánimo y Pensamientos</h2>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-xs font-mono font-bold text-[#4A6B53]">{bdiAnsweredCount} de 21 respondidos</div>
                <div className="w-full sm:w-32 h-2 bg-[#E8E2D5] rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-[#4A6B53] transition-all" style={{ width: `${(bdiAnsweredCount / 21) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* AVISO SI YA CONTESTÓ ANTES */}
          {lastBdi && !submittedInstrument && (
            <div className="p-4 bg-[#F4F0E6] border border-[#E8E2D5] rounded-xl flex items-center justify-between gap-3 text-xs text-[#4A6B53]">
              <div>
                <strong>Ya completaste este cuestionario el {new Date(lastBdi.appliedAt).toLocaleDateString()}.</strong>
                <br />Si lo deseas, puedes volver a responderlo para actualizar tu evaluación.
              </div>
            </div>
          )}

          {submittedInstrument === InstrumentCode.BDI && (
            <div className="p-6 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex flex-col items-center justify-center gap-3 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              <h3 className="text-lg font-bold text-emerald-900">¡Muchas gracias por tus respuestas!</h3>
              <p className="text-sm text-emerald-800">Gracias. Solo falta un último cuestionario breve (6 preguntas): el Cuestionario 3.</p>
              <button onClick={() => setActiveTab('COLUMBIA')} className="mt-2 px-6 py-2.5 font-bold text-white bg-[#4A6B53] rounded-xl cursor-pointer">
                Continuar al Cuestionario 3 ➔
              </button>
            </div>
          )}

          <div className={`space-y-4 ${submittedInstrument === InstrumentCode.BDI ? 'opacity-50 pointer-events-none' : ''}`}>
            {bdiConfig.items.map((item) => {
              const currentVal = bdiResponses[item.itemNumber];
              return (
                <div key={item.itemNumber} className={`p-4 rounded-xl border transition-all ${currentVal !== undefined ? 'bg-[#A3C9A8]/10 border-[#A3C9A8]/50' : 'bg-white border-[#E8E2D5] hover:border-[#A3C9A8]'}`}>
                  <div className="font-semibold text-[#2F3E32] text-sm mb-3">
                    <span className="font-mono text-[#A3C9A8] mr-2">{item.itemNumber}.</span>
                    {item.placeholderLabel}
                  </div>
                  <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 text-xs">
                    {[0, 1, 2, 3].map((val) => (
                      <button key={val} type="button" onClick={() => setBdiResponses((prev) => ({ ...prev, [item.itemNumber]: val }))} className={`w-full p-3 rounded-lg border text-left cursor-pointer transition-all ${currentVal === val ? 'bg-[#4A6B53] text-white border-[#4A6B53] font-bold shadow-sm' : 'bg-[#FDFBF7] text-[#4A6B53] border-[#E8E2D5] hover:bg-[#F4F0E6]'}`}>
                        {getOptionLabel(InstrumentCode.BDI, val)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`sticky bottom-4 pt-4 mt-6 border-t border-[#E8E2D5] bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 z-10 ${submittedInstrument === InstrumentCode.BDI ? 'hidden' : ''}`}>
            <div className="text-xs text-[#4A6B53] font-bold">
              {bdiAnsweredCount === 21 ? '✅ Todo listo para enviar.' : `Faltan ${21 - bdiAnsweredCount} preguntas.`}
            </div>
            {submitError && (
              <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2 w-full sm:flex-1">{submitError}</div>
            )}
            <button type="button" disabled={bdiAnsweredCount < 21 || isSubmitting} onClick={() => handleSendAssessment(InstrumentCode.BDI)} className="w-full sm:w-auto px-6 py-3.5 text-sm font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md cursor-pointer inline-flex items-center justify-center gap-2 transition-all">
              <Send className="w-4 h-4" /> {isSubmitting ? 'Enviando…' : lastBdi ? 'Actualizar Evaluación' : 'Enviar Cuestionario 2'}
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA: CUESTIONARIO 3 (TAMIZAJE COLUMBIA) */}
      {activeTab === 'COLUMBIA' && (
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 sm:p-8 space-y-6">
          <div className="border-b border-[#E8E2D5] pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-[#A3C9A8] text-[#2F3E32]">Cuestionario 3 de 3</span>
                <h2 className="text-xl font-bold text-[#2F3E32] mt-2">Tu Bienestar y Seguridad</h2>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-xs font-mono font-bold text-[#4A6B53]">{columbiaAnsweredCount} de 6 respondidos</div>
                <div className="w-full sm:w-32 h-2 bg-[#E8E2D5] rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-[#4A6B53] transition-all" style={{ width: `${(columbiaAnsweredCount / 6) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-[#F4F0E6] border border-[#E8E2D5] rounded-xl text-xs text-[#3B4A3F] space-y-2">
            <p className="leading-relaxed">Estas seis preguntas son parte del cuidado de tu bienestar. Responde con sinceridad: tus respuestas son confidenciales y solo las revisa la Oficina de Psicología.</p>
            <p className="leading-relaxed flex items-start gap-2">
              <LifeBuoy className="w-4 h-4 mt-0.5 shrink-0 text-[#4A6B53]" />
              <span>
                <strong>Si en este momento sientes que puedes hacerte daño, no esperes:</strong> llama al{' '}
                <a href="tel:911" className="font-bold underline">911</a> o a la{' '}
                <a href="tel:8009112000" className="font-bold underline">Línea de la Vida 800 911 2000</a>{' '}
                (gratuita, las 24 horas, todos los días).
              </span>
            </p>
          </div>

          {lastColumbia && !columbiaSubmitted && (
            <div className="p-4 bg-[#F4F0E6] border border-[#E8E2D5] rounded-xl flex items-center justify-between gap-3 text-xs text-[#4A6B53]">
              <div>
                <strong>Ya completaste este cuestionario el {new Date(lastColumbia.appliedAt).toLocaleDateString()}.</strong>
                <br />Si lo deseas, puedes volver a responderlo para actualizar tu evaluación.
              </div>
            </div>
          )}

          {columbiaSubmitted && (
            <div className="p-6 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex flex-col items-center justify-center gap-3 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              <h3 className="text-lg font-bold text-emerald-900">Gracias por tus respuestas</h3>
              <p className="text-sm text-emerald-800">
                {columbiaHasYes
                  ? 'Lo que compartiste es importante para nosotros. La Oficina de Psicología se pondrá en contacto contigo lo antes posible.'
                  : 'Has completado todo el proceso. La Oficina de Psicología revisará tu información. Te esperamos en un mes para ver tu avance.'}
              </p>
              <p className="text-xs text-emerald-900">
                Si en algún momento necesitas hablar con alguien, llama a la{' '}
                <a href="tel:8009112000" className="font-bold underline">Línea de la Vida 800 911 2000</a>{' '}
                (gratuita, 24 horas) o acude al Edificio de Desarrollo Académico del ITD.
              </p>
              <button onClick={() => setActiveTab('ESTADO')} className="mt-2 px-6 py-2.5 font-bold text-white bg-[#4A6B53] rounded-xl cursor-pointer">
                Ver mi Estado Final ➔
              </button>
            </div>
          )}

          <div className={`space-y-4 ${columbiaSubmitted ? 'opacity-50 pointer-events-none' : ''}`}>
            {COLUMBIA_ITEMS.map((item) => {
              const currentVal = columbiaResponses[item.itemNumber];
              return (
                <div key={item.itemNumber} className={`p-4 rounded-xl border transition-all ${currentVal !== undefined ? 'bg-[#A3C9A8]/10 border-[#A3C9A8]/50' : 'bg-white border-[#E8E2D5] hover:border-[#A3C9A8]'}`}>
                  <div className="font-semibold text-[#2F3E32] text-sm mb-3">
                    <span className="font-mono text-[#A3C9A8] mr-2">{item.itemNumber}.</span>
                    {item.text}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:max-w-xs">
                    {[{ val: 1, label: 'Sí' }, { val: 0, label: 'No' }].map((opt) => (
                      <button key={opt.val} type="button" onClick={() => setColumbiaResponses((prev) => ({ ...prev, [item.itemNumber]: opt.val }))} className={`w-full p-3 rounded-lg border text-center font-bold cursor-pointer transition-all ${currentVal === opt.val ? 'bg-[#4A6B53] text-white border-[#4A6B53] shadow-sm' : 'bg-[#FDFBF7] text-[#3B4A3F] border-[#E8E2D5] hover:border-[#A3C9A8]'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`sticky bottom-4 pt-4 mt-6 border-t border-[#E8E2D5] bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 z-10 ${columbiaSubmitted ? 'hidden' : ''}`}>
            <div className="text-xs text-[#4A6B53] font-bold">
              {columbiaAnsweredCount === 6 ? '✅ Todo listo para enviar.' : `Faltan ${6 - columbiaAnsweredCount} preguntas.`}
            </div>
            {submitError && (
              <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2 w-full sm:flex-1">{submitError}</div>
            )}
            <button type="button" disabled={columbiaAnsweredCount < 6 || isSubmitting} onClick={handleSendColumbia} className="w-full sm:w-auto px-6 py-3.5 text-sm font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl cursor-pointer inline-flex items-center justify-center gap-2 transition-colors">
              <Send className="w-4 h-4" /> {isSubmitting ? 'Enviando…' : lastColumbia ? 'Actualizar Evaluación' : 'Enviar Cuestionario 3'}
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: ESTADO FINAL */}
      {activeTab === 'ESTADO' && (
        <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4 sm:p-8 space-y-6">
          <div className="border-b border-[#E8E2D5] pb-4">
            <h2 className="text-xl font-bold text-[#2F3E32] flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-[#4A6B53]" /> Estado de tus Evaluaciones
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#2F3E32]">1. Sensaciones Físicas (BAI)</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${lastBai ? 'bg-[#A3C9A8] text-[#2F3E32]' : 'bg-amber-100 text-amber-900'}`}>
                  {lastBai ? 'Evaluado' : 'Pendiente'}
                </span>
              </div>
              {lastBai && <p className="text-xs text-[#4A6B53]">Última evaluación: {new Date(lastBai.appliedAt).toLocaleDateString()}</p>}
              <button onClick={() => { resetBai(); setActiveTab('BAI'); }} className="mt-2 text-xs font-bold text-[#4A6B53] underline flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Volver a contestar
              </button>
            </div>

            <div className="p-5 border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#2F3E32]">2. Estado de Ánimo (BDI)</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${lastBdi ? 'bg-[#A3C9A8] text-[#2F3E32]' : 'bg-amber-100 text-amber-900'}`}>
                  {lastBdi ? 'Evaluado' : 'Pendiente'}
                </span>
              </div>
              {lastBdi && <p className="text-xs text-[#4A6B53]">Última evaluación: {new Date(lastBdi.appliedAt).toLocaleDateString()}</p>}
              <button onClick={() => { resetBdi(); setActiveTab('BDI'); }} className="mt-2 text-xs font-bold text-[#4A6B53] underline flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Volver a contestar
              </button>
            </div>

            <div className="p-5 border border-[#E8E2D5] rounded-xl bg-[#FDFBF7] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#2F3E32]">3. Bienestar y Seguridad</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${lastColumbia ? 'bg-[#A3C9A8] text-[#2F3E32]' : 'bg-amber-100 text-amber-900'}`}>
                  {lastColumbia ? 'Evaluado' : 'Pendiente'}
                </span>
              </div>
              {lastColumbia && <p className="text-xs text-[#4A6B53]">Última evaluación: {new Date(lastColumbia.appliedAt).toLocaleDateString()}</p>}
              <button onClick={() => { resetColumbia(); setActiveTab('COLUMBIA'); }} className="mt-2 text-xs font-bold text-[#4A6B53] underline flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> {lastColumbia ? 'Volver a contestar' : 'Contestar ahora'}
              </button>
            </div>
          </div>

          <div className="p-5 bg-[#F4F0E6] border border-[#E8E2D5] rounded-xl space-y-2 text-xs text-[#3B4A3F]">
            <div className="font-bold flex items-center gap-1.5 text-[#4A6B53]">
              <HeartHandshake className="w-4 h-4" /> Oficina de Psicología
            </div>
            <p className="leading-relaxed">Si requieres atención presencial o apoyo, acude al Edificio de Desarrollo Académico del ITD.</p>
          </div>
        </div>
      )}
    </div>
  );
};