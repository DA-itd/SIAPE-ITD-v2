import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * SIAPE-ITD | Configuración Segura de Cliente Supabase
 * - NUNCA se expone SUPABASE_SERVICE_ROLE_KEY en el navegador.
 * - Los SQL (esquema, RLS, alta de usuarios) viven en /supabase/*.sql y se ejecutan en el SQL Editor.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    (supabaseUrl.startsWith('https://') || supabaseUrl.startsWith('http://')) &&
    supabaseAnonKey.length > 20
);

export const supabaseConnectionMode: 'SUPABASE_LOCAL_CLI' | 'SUPABASE_CLOUD' | 'NO_CONFIGURADO' =
  !isSupabaseConfigured
    ? 'NO_CONFIGURADO'
    : supabaseUrl!.includes('127.0.0.1') || supabaseUrl!.includes('localhost')
    ? 'SUPABASE_LOCAL_CLI'
    : 'SUPABASE_CLOUD';

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Prueba en vivo la conexión con el proyecto de Supabase cuando VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY están configurados
 */
export async function verifySupabaseConnection(): Promise<{
  connected: boolean;
  message: string;
  tablesReady: boolean;
}> {
  if (!supabase) {
    return {
      connected: false,
      message:
        'Variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY aún no configuradas en el entorno.',
      tablesReady: false,
    };
  }

  try {
    const { data, error } = await supabase.from('roles').select('code').limit(1);
    if (error) {
      return {
        connected: true,
        message: `Conectado a Supabase, pero falta ejecutar el script SQL de tablas (${error.message}).`,
        tablesReady: false,
      };
    }
    return {
      connected: true,
      message: `Conexión exitosa a Supabase PostgreSQL (${data?.length ?? 0} rol(es) verificados).`,
      tablesReady: true,
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `Error al conectar con Supabase: ${err?.message || 'Error desconocido'}`,
      tablesReady: false,
    };
  }
}

/**
 * Inicia sesión real con Google OAuth a través de Supabase Auth cuando el proyecto está configurado
 */
export async function signInWithSupabaseGoogle() {
  if (!supabase) {
    throw new Error('Primero configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }
  return await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });
}

/**
 * Validación de dominio institucional para estudiantes y cuentas autorizadas para personal clínico
 */
export function validateInstitutionalAuthPolicy(
  email: string,
  intendedRole: string,
  isRegisteredInAllowlist: boolean,
  accountStatus: string
): { allowed: boolean; reason: string } {
  const normalized = email.trim().toLowerCase();

  if (accountStatus !== 'ACTIVA') {
    return {
      allowed: false,
      reason: `Cuenta en estado ${accountStatus}. El acceso requiere estado ACTIVA autorizado por el Administrador.`,
    };
  }

  if (intendedRole === 'ESTUDIANTE') {
    // Alumnos autorizados con correo institucional @itdurango.edu.mx o cuenta personal @gmail.com
    const isItdDomain = normalized.endsWith('@itdurango.edu.mx');
    const isGmailDomain = normalized.endsWith('@gmail.com');

    if (!isItdDomain && !isGmailDomain) {
      return {
        allowed: false,
        reason:
          'Los estudiantes pueden autenticarse con su correo institucional @itdurango.edu.mx o su cuenta @gmail.com.',
      };
    }
    return {
      allowed: true,
      reason: `Estudiante autenticado con cuenta válida (${isItdDomain ? '@itdurango.edu.mx' : '@gmail.com'}). Acceso exclusivo a sus datos personales y cuestionarios.`,
    };
  }

  // Personal clínico, tutores y administradores: el dominio por sí solo NO concede permisos
  if (!isRegisteredInAllowlist) {
    return {
      allowed: false,
      reason:
        'El dominio de correo no concede permisos clínicos automáticamente. La cuenta debe estar registrada y con rol activo en el sistema.',
    };
  }

  return {
    allowed: true,
    reason: 'Usuario institucional verificado con cuenta activa y permisos asignados.',
  };
}