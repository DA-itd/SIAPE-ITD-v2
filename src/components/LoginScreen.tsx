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
      await signInWithGoogle(); // redirige a Google; al volver, la sesión se valida sola
    } catch (err: any) {
      setBusy(false);
      console.error(err);
      setLocalError('No se pudo iniciar con Google. Inténtalo de nuevo.');
    }
  };

  if (status === 'LOADING') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-slate-600 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Un momento…
      </div>
    );
  }

  const isBlocked = status === 'BLOCKED';
  const technicalDetail = status === 'ERROR' ? errorMessage : null;

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-[#F8FAFC] p-4">
      {/* Marca de agua TecNM, pegada al borde izquierdo */}
      <img
        src={LOGO_TECNM}
        alt=""
        aria-hidden="true"
        className="absolute left-0 bottom-0 h-[85vh] w-auto opacity-70 mix-blend-multiply pointer-events-none select-none"
      />

      <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="bg-[#6D1B30] text-white p-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">SIAPE-ITD</h1>
            <p className="text-xs text-rose-100 mt-1 leading-relaxed">
              Sistema Integral de Atención Psicológica Estudiantil
              <br />
              Oficina de Psicología · Instituto Tecnológico de Durango
            </p>
          </div>
          <img
            src={LOGO_ITD}
            alt="Instituto Tecnológico de Durango"
            className="h-20 w-auto rounded-lg bg-white p-1.5 shrink-0"
          />
        </div>

        <div className="p-6 space-y-4">
          {isBlocked ? (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-950 space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <ShieldAlert className="w-4 h-4" /> No tienes acceso con esta cuenta
              </div>
              {blockedEmail && <div className="font-mono break-all">{blockedEmail}</div>}
              <p>{blockedReason}</p>
              <button
                onClick={signOut}
                className="mt-1 px-3 py-1.5 text-xs font-bold text-[#7C1D36] border border-[#7C1D36]/30 rounded-lg hover:bg-white cursor-pointer"
              >
                Entrar con otra cuenta
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-700 leading-relaxed">
                Entra con tu cuenta de Google. Si eres alumno, usa tu correo <strong>@itdurango.edu.mx</strong> o{' '}
                <strong>@gmail.com</strong>. Si eres parte del personal, tu cuenta debe haber sido dada de alta
                previamente.
              </p>
              <button
                type="button"
                onClick={handleSignIn}
                disabled={busy}
                className="w-full py-3 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-bold rounded-xl inline-flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
            <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-900 space-y-1">
              <p>
                {localError ?? 'No fue posible abrir el sistema. Inténtalo de nuevo en unos minutos; si continúa, avisa al administrador.'}
              </p>
              {technicalDetail && (
                <details className="text-[11px] text-rose-800/80">
                  <summary className="cursor-pointer">Detalles para el administrador</summary>
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
