import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AccountStatus, RoleCode, UserProfile } from '../types/siape';
import { isSupabaseConfigured, signInWithSupabaseGoogle, supabase } from '../lib/supabase';

/**
 * SIAPE-ITD | Autenticación real con Google (Supabase Auth).
 * La identidad y el rol salen SIEMPRE de la base de datos (tabla profiles),
 * nunca de lo que el usuario escriba en pantalla.
 */

// El rol vive en profiles.role_code y la cuenta de Google se enlaza por profiles.auth_user_id.
export const PROFILE_SELECT =
  'id, auth_user_id, full_name, email, role_code, account_status, professional_license, supervisor_id, created_at, last_login_at';

const DEPARTMENT_BY_ROLE: Record<string, string> = {
  ADMINISTRADOR: 'Desarrollo Académico — Administración del sistema',
  RESPONSABLE_PSICOLOGIA: 'Oficina de Psicología',
  PSICOLOGO: 'Oficina de Psicología',
  PRACTICANTE: 'Servicio Social / Prácticas',
  ESTUDIANTE: 'Estudiante ITD',
  TUTOR_ACADEMICO: 'Tutorías Académicas',
};

export function mapProfileRow(row: any): UserProfile {
  const role = (row.role_code ?? null) as RoleCode | null;
  // Perfil dado de alta pero que aún no ha iniciado sesión con Google: se muestra como pendiente.
  const status =
    !row.auth_user_id && row.account_status === 'ACTIVA' ? 'PENDIENTE_AUTORIZACION' : row.account_status;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: role as RoleCode,
    status: status as AccountStatus,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
    supervisorId: row.supervisor_id ?? null,
    supervisorName: null,
    department: role ? DEPARTMENT_BY_ROLE[role] ?? '' : '',
    professionalLicense: row.professional_license ?? undefined,
    assignedCaseIds: [],
    linkedStudentId: null,
  } as UserProfile;
}

export type AuthStatus = 'LOADING' | 'SIGNED_OUT' | 'BLOCKED' | 'READY' | 'ERROR';

interface AuthContextValue {
  status: AuthStatus;
  profile: UserProfile | null;
  /** Correo de la sesión cuando la cuenta existe pero aún no tiene acceso. */
  blockedEmail: string | null;
  blockedReason: string | null;
  errorMessage: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('LOADING');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolveSession = useCallback(async (session: Session | null) => {
    if (!supabase) {
      setStatus('ERROR');
      setErrorMessage('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el entorno.');
      return;
    }
    if (!session?.user) {
      setProfile(null);
      setBlockedEmail(null);
      setStatus('SIGNED_OUT');
      return;
    }
    try {
      // Enlaza la cuenta de Google con su perfil/alumno por correo y registra el acceso.
      const { error: syncError } = await supabase.rpc('sync_my_authorization');
      if (syncError) throw syncError;

      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        const email = (session.user.email ?? '').toLowerCase();
        setBlockedEmail(email);
        setBlockedReason(
          'Este correo no está autorizado. Los alumnos usan @itdurango.edu.mx o @gmail.com; ' +
            'el personal debe ser dado de alta por el administrador o por su psicólogo supervisor.'
        );
        setProfile(null);
        setStatus('BLOCKED');
        return;
      }

      const mapped = mapProfileRow(data);
      const email = (session.user.email ?? mapped.email).toLowerCase();

      if (mapped.status === 'SUSPENDIDA' || mapped.status === 'REVOCADA') {
        setBlockedEmail(email);
        setBlockedReason(`Tu cuenta está ${mapped.status.toLowerCase()}. Contacta al administrador del sistema.`);
        setProfile(null);
        setStatus('BLOCKED');
        return;
      }
      if (!mapped.role || mapped.status !== 'ACTIVA') {
        setBlockedEmail(email);
        setBlockedReason(
          'Este correo aún no está autorizado. Los alumnos usan @itdurango.edu.mx o @gmail.com; ' +
            'el personal debe ser dado de alta por el administrador o por su psicólogo supervisor.'
        );
        setProfile(null);
        setStatus('BLOCKED');
        return;
      }

      setProfile(mapped);
      setBlockedEmail(null);
      setBlockedReason(null);
      setStatus('READY');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error desconocido al validar la sesión.');
      setStatus('ERROR');
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setStatus('ERROR');
      setErrorMessage('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el entorno.');
      return;
    }
    supabase.auth.getSession().then(({ data }) => resolveSession(data.session));

    // Importante: no hacer llamadas a Supabase dentro del callback (puede bloquear la sesión).
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      setTimeout(() => resolveSession(session), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [resolveSession]);

  const signInWithGoogle = useCallback(async () => {
    setErrorMessage(null);
    const { error } = await signInWithSupabaseGoogle();
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setProfile(null);
    setStatus('SIGNED_OUT');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, profile, blockedEmail, blockedReason, errorMessage, signInWithGoogle, signOut }),
    [status, profile, blockedEmail, blockedReason, errorMessage, signInWithGoogle, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
