import React, { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LOGO_ITD, LOGO_TECNM } from '../lib/branding';

export const LoginScreen: React.FC = () => {
  const { status, blockedEmail, blockedReason, errorMessage, signInWithGoogle, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSignIn = async () => {
    try {
      setBusy(true);
      setLocalError(null);
      await signInWithGoogle();
    } catch (err: any) {
      setBusy(false);
      console.error(err);
      setLocalError('No se pudo iniciar con Google. Inténtalo de nuevo.');
    }
  };

  if (status === 'LOADING') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] text-[#4A6B53] text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Un momento…
      </div>
    );
  }

  const isBlocked = status === 'BLOCKED';
  const technicalDetail = status === 'ERROR' ? errorMessage : null;

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-[#FDFBF7] p-4">
      {/* Marca de agua TecNM sutil */}
      <img
        src={LOGO_TECNM}
        alt=""
        aria-hidden="true"
        className="absolute left-0 bottom-0 h-[85vh] w-auto opacity-30 mix-blend-multiply pointer-events-none select-none"
      />

      <div className="relative w-full max-w-md bg-white rounded-3xl border border-[#E8E2D5] shadow-lg overflow-hidden">
        {/* Cabecera con verde pastel */}
        <div className="bg-[#A3C9A8] text-[#2F3E32] p-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">SIAPE-ITD</h1>
            <p className="text-xs text-[#4A6B53] mt-1.5 leading-relaxed font-medium">
              Sistema Integral de Atención Psicológica Estudiantil
              <br />
              Oficina de Psicología · Instituto Tecnológico de Durango
            </p>
          </div>
          <img
            src={LOGO_ITD}
            alt="Instituto Tecnológico de Durango"
            className="h-20 w-auto rounded-2xl bg-white p-2 shrink-0 shadow-sm"
          />
        </div>

        <div className="p-8 space-y-6">
          {isBlocked ? (
            <div className="p-5 rounded-2xl border border-[#E8E2D5] bg-[#FDFBF7] text-xs text-[#3B4A3F] space-y-3">
              <div className="flex items-center gap-2 font-bold text-[#4A6B53]">
                <ShieldAlert className="w-5 h-5" /> No tienes acceso con esta cuenta
              </div>
              {blockedEmail && <div className="font-mono bg-white p-2 rounded border border-[#E8E2D5] break-all">{blockedEmail}</div>}
              <p className="leading-relaxed">{blockedReason}</p>
              <button
                onClick={signOut}
                className="mt-2 w-full py-2 text-xs font-bold text-[#4A6B53] border border-[#A3C9A8] rounded-xl hover:bg-[#A3C9A8]/10 transition-colors cursor-pointer"
              >
                Entrar con otra cuenta
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#3B4A3F] leading-relaxed text-center">
                Bienvenido. Entra con tu cuenta de Google para acceder a tu espacio seguro.
              </p>
              <button
                type="button"
                onClick={handleSignIn}
                disabled={busy}
                className="w-full py-3.5 px-4 bg-[#4A6B53] hover:bg-[#3B5743] text-white text-sm font-bold rounded-2xl inline-flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 transition-colors shadow-md"
              >
                <svg className="w-5 h-5 shrink-0 bg-white rounded-full p-0.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                {busy ? 'Abriendo Google…' : 'Continuar con Google'}
              </button>
            </>
          )}

          {(localError || status === 'ERROR') && (
            <div className="p-4 rounded-2xl border border-[#F4C2C2] bg-[#FFF5F5] text-xs text-[#9B2C2C] space-y-1">
              <p>{localError ?? 'No fue posible abrir el sistema. Inténtalo de nuevo.'}</p>
              {technicalDetail && (
                <details className="text-[11px] opacity-80">
                  <summary className="cursor-pointer">Detalles técnicos</summary>
                  <p className="mt-1 break-words">{technicalDetail}</p>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};