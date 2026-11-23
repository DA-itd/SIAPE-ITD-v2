import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Loader2, LogOut, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LOGO_ITD } from '../lib/branding';
import {
  CONSENT_CHECKBOX_LABEL,
  CONSENT_SECTIONS,
  CONSENT_SIGNATURE,
  CONSENT_SUBTITLE,
  CONSENT_TITLE,
  CONSENT_VERSION,
} from '../lib/consentText';

type ConsentState = 'LOADING' | 'PENDING' | 'ACCEPTED' | 'ERROR';

interface ConsentContextValue {
  openReview: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

/**
 * Devuelve null fuera del ConsentGate (por ejemplo, cuando el administrador
 * usa "Ver como Alumno"). En ese caso el portal simplemente no muestra el enlace.
 */
export const useConsentReview = (): ConsentContextValue | null => useContext(ConsentContext);

const ConsentDocument: React.FC = () => (
  <div className="space-y-5 text-sm text-[#3B4A3F] leading-relaxed">
    {CONSENT_SECTIONS.map((section) => (
      <section key={section.title}>
        <h3 className="font-bold text-[#2F3E32] mb-1.5">{section.title}</h3>
        <div className="space-y-2">
          {section.blocks.map((block, i) =>
            block.type === 'p' ? (
              <p key={i}>{block.text}</p>
            ) : (
              <ul key={i} className="list-disc pl-5 space-y-1">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )
          )}
        </div>
      </section>
    ))}
    <div className="pt-2 text-xs font-semibold text-[#4A6B53]">
      {CONSENT_SIGNATURE.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  </div>
);

interface ReviewModalProps {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onWithdraw: () => void;
}

const ConsentReviewModal: React.FC<ReviewModalProps> = ({ busy, error, onClose, onWithdraw }) => {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-review-title"
    >
      <div className="w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] bg-white rounded-3xl border border-[#E8E2D5] shadow-xl overflow-hidden flex flex-col">
        <div className="bg-[#A3C9A8] text-[#2F3E32] px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="consent-review-title" className="font-bold font-display text-lg">
              {CONSENT_TITLE}
            </h2>
            <p className="text-xs text-[#4A6B53] font-medium mt-0.5">Ya aceptaste este documento. Puedes releerlo aquí.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg hover:bg-white/40 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-8">
          <ConsentDocument />
        </div>

        <div className="border-t border-[#E8E2D5] bg-[#FDFBF7] p-5 space-y-3">
          {error && (
            <div className="p-3 rounded-xl border border-[#F4C2C2] bg-[#FFF5F5] text-xs text-[#9B2C2C]">{error}</div>
          )}
          {confirming ? (
            <div className="space-y-3">
              <p className="text-xs text-[#3B4A3F] leading-relaxed">
                Si retiras tu consentimiento, no podrás contestar cuestionarios ni solicitar consulta hasta aceptarlo de nuevo. Lo
                que ya enviaste sigue registrado.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={onWithdraw}
                  disabled={busy}
                  className="flex-1 py-2.5 px-4 text-xs font-bold text-white bg-[#9B2C2C] hover:bg-[#7F2323] rounded-xl cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Retirando…' : 'Sí, retirar mi consentimiento'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="flex-1 py-2.5 px-4 text-xs font-bold text-[#4A6B53] border border-[#A3C9A8] rounded-xl hover:bg-[#A3C9A8]/10 cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="py-2.5 px-4 text-xs font-bold text-[#9B2C2C] border border-[#F4C2C2] rounded-xl hover:bg-[#FFF5F5] cursor-pointer transition-colors"
              >
                Retirar mi consentimiento
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-6 text-xs font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-xl cursor-pointer transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ConsentGateProps {
  onSignOut: () => void;
  children: React.ReactNode;
}

export const ConsentGate: React.FC<ConsentGateProps> = ({ onSignOut, children }) => {
  const [state, setState] = useState<ConsentState>('LOADING');
  const [withdrawnAt, setWithdrawnAt] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setError('Faltan las variables de conexión del sistema.');
      setState('ERROR');
      return;
    }
    setState('LOADING');
    setError(null);
    const { data, error: err } = await supabase.rpc('my_consent_status');
    if (err || !data) {
      setError(err?.message || 'No se pudo consultar tu consentimiento.');
      setState('ERROR');
      return;
    }
    setWithdrawnAt(data.withdrawnAt ?? null);
    setState(data.accepted && data.version === CONSENT_VERSION ? 'ACCEPTED' : 'PENDING');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAccept = async () => {
    if (!supabase || !checked) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('accept_my_consent', { p_version: CONSENT_VERSION });
    setBusy(false);
    if (err) {
      setError(err.message || 'No se pudo guardar tu aceptación. Inténtalo de nuevo.');
      return;
    }
    setWithdrawnAt(null);
    setState('ACCEPTED');
  };

  const handleWithdraw = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('withdraw_my_consent');
    setBusy(false);
    if (err) {
      setError(err.message || 'No se pudo retirar el consentimiento. Inténtalo de nuevo.');
      return;
    }
    setChecked(false);
    setWithdrawnAt(new Date().toISOString());
    setReviewOpen(false);
    setState('PENDING');
  };

  const ctx = useMemo<ConsentContextValue>(() => ({ openReview: () => setReviewOpen(true) }), []);

  if (state === 'LOADING') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] text-[#4A6B53] text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Un momento…
      </div>
    );
  }

  if (state === 'ERROR') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] p-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-[#E8E2D5] shadow-lg p-8 space-y-4">
          <p className="text-sm text-[#3B4A3F] leading-relaxed">
            No pudimos abrir tu espacio. Revisa tu conexión e inténtalo de nuevo.
          </p>
          {error && <p className="text-xs text-[#9B2C2C] break-words">{error}</p>}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="flex-1 py-2.5 px-4 text-xs font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-xl cursor-pointer transition-colors"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="flex-1 py-2.5 px-4 text-xs font-bold text-[#4A6B53] border border-[#A3C9A8] rounded-xl hover:bg-[#A3C9A8]/10 cursor-pointer transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'PENDING') {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] bg-white rounded-3xl border border-[#E8E2D5] shadow-lg overflow-hidden flex flex-col">
          <div className="bg-[#A3C9A8] text-[#2F3E32] p-6 sm:p-7 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display leading-tight">{CONSENT_TITLE}</h1>
              <p className="text-xs text-[#4A6B53] mt-1.5 font-medium">{CONSENT_SUBTITLE}</p>
            </div>
            <img
              src={LOGO_ITD}
              alt="Instituto Tecnológico de Durango"
              className="h-14 sm:h-16 w-auto rounded-2xl bg-white p-1.5 shrink-0 shadow-sm"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-8 space-y-5">
            <div className="flex items-start gap-2 p-4 rounded-2xl bg-[#F4F0E6] border border-[#E8E2D5] text-xs text-[#3B4A3F] leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-[#4A6B53] shrink-0 mt-0.5" />
              <span>
                Antes de continuar, lee este documento con calma. Tu aceptación se guarda con fecha y hora, y puedes
                consultarla o retirarla cuando quieras desde tu portal.
              </span>
            </div>
            {withdrawnAt && (
              <p className="text-xs text-[#4A6B53]">
                Retiraste tu consentimiento el {new Date(withdrawnAt).toLocaleDateString('es-MX')}. Para volver a usar el sistema,
                acéptalo de nuevo.
              </p>
            )}
            <ConsentDocument />
          </div>

          <div className="border-t border-[#E8E2D5] bg-[#FDFBF7] p-5 sm:p-6 space-y-4">
            <label className="flex items-start gap-3 text-sm text-[#2F3E32] cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 w-5 h-5 accent-[#4A6B53] shrink-0 cursor-pointer"
              />
              <span className="leading-snug">{CONSENT_CHECKBOX_LABEL}</span>
            </label>

            {error && (
              <div className="p-3 rounded-xl border border-[#F4C2C2] bg-[#FFF5F5] text-xs text-[#9B2C2C]">{error}</div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
              <button
                type="button"
                onClick={onSignOut}
                disabled={busy}
                className="py-3 px-4 text-xs font-bold text-[#4A6B53] border border-[#A3C9A8] rounded-2xl hover:bg-[#A3C9A8]/10 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
              >
                <LogOut className="w-4 h-4" /> No acepto, salir
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={!checked || busy}
                className="py-3 px-6 text-sm font-bold text-white bg-[#4A6B53] hover:bg-[#3B5743] rounded-2xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-md"
              >
                {busy ? 'Guardando…' : 'Acepto y continuar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ConsentContext.Provider value={ctx}>
      {children}
      {reviewOpen && (
        <ConsentReviewModal
          busy={busy}
          error={error}
          onClose={() => {
            setError(null);
            setReviewOpen(false);
          }}
          onWithdraw={handleWithdraw}
        />
      )}
    </ConsentContext.Provider>
  );
};
