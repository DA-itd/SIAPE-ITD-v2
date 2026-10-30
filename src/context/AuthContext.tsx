import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AccountStatus, RoleCode, UserProfile } from '../types/siape';
import { isSupabaseConfigured, signInWithSupabaseGoogle, supabase } from '../lib/supabase';

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
      const email = (session.user.email ?? '').toLowerCase();

      // 1. Buscar si el perfil ya existe
      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      let currentProfile = existingProfile;

      // 2. Si no existe el perfil, lo creamos (Auto-registro)
      if (!currentProfile) {
        const isStudentDomain = email.endsWith('@itdurango.edu.mx') || email.endsWith('@gmail.com');

        if (isStudentDomain) {
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              auth_user_id: session.user.id,
              email: email,
              full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Alumno ITD',
              role_code: RoleCode.ESTUDIANTE,
              account_status: 'ACTIVA',
            })
            .select(PROFILE_SELECT)
            .single();

          if (createError) {
            console.error("Error creando perfil de alumno:", createError);
            throw new Error(`No se pudo crear el perfil del alumno: ${createError.message}`);
          }
          currentProfile = newProfile;
        } else {
          // Si es personal (no alumno) y no está dado de alta, lo bloqueamos.
          setBlockedEmail(email);
          setBlockedReason('El personal debe ser dado de alta previamente por el administrador.');
          setProfile(null);
          setStatus('BLOCKED');
          return;
        }
      }

      // 3. Validar que la cuenta esté activa
      const mapped = mapProfileRow(currentProfile);

      if (mapped.status === 'SUSPENDIDA' || mapped.status === 'REVOCADA') {
        setBlockedEmail(email);
        setBlockedReason(`Tu cuenta está ${mapped.status.toLowerCase()}. Contacta al administrador.`);
        setProfile(null);
        setStatus('BLOCKED');
        return;
      }
      
      if (!mapped.role || mapped.status !== 'ACTIVA') {
        setBlockedEmail(email);
        setBlockedReason('Este correo no está autorizado.');
        setProfile(null);
        setStatus('BLOCKED');
        return;
      }

      setProfile(mapped);
      setBlockedEmail(null);
      setBlockedReason(null);
      setStatus('READY');

    } catch (err: any) {
      console.error("Error en AuthContext:", err);
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