# SIAPE-ITD · Etapa 1: autenticación real y arranque sin datos ficticios

Versión para el esquema REAL de tu Supabase (profiles con `auth_user_id` y `role_code`).

## 1. Supabase
1. SQL Editor → ejecutar `supabase/01_auth_esquema_real.sql` completo y después `supabase/02_tamizaje_solo_psicologos.sql` (una sola vez; se puede repetir).
   No ejecutes ningún otro script de versiones anteriores. Al final muestra tus perfiles: debe salir tu correo con rol ADMINISTRADOR.
2. Authentication → Providers → Google: activar con Client ID/Secret de Google Cloud
   (URI de redirección: `https://TU-PROYECTO.supabase.co/auth/v1/callback`).
3. Authentication → URL Configuration: Site URL = tu dominio de Vercel; en Redirect URLs agrega también `http://localhost:3000`.
4. Variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (ver `.env.example`) en `.env.local` y en Vercel.

## 2. Copiar al proyecto
| Archivo | Acción |
|---|---|
| `src/App.tsx` | reemplaza |
| `src/context/AuthContext.tsx`, `src/components/LoginScreen.tsx` | nuevos |
| `src/data/academicPrograms.ts` | nuevo (catálogo real de carreras) |
| `src/components/DashboardView.tsx`, `ModulesView.tsx` | reemplaza |
| `src/lib/scoringEngine.ts`, `src/lib/supabase.ts` | reemplaza |
| `package.json`, `vite.config.ts` | reemplaza (`npm run dev` = solo Vite) |

## 3. Eliminar del proyecto
- `src/data/mockInstitutionalData.ts`, `src/components/GoogleAuthModal.tsx`, `InteractiveAssessmentRunner.tsx` (copia de ModulesView), `ArchitectureReviewView.tsx`
- `server.ts` (identificaba al usuario con un encabezado falsificable y entregaba toda la base sin autenticar)
- `data/`, `scripts/` y `supabase/seed_2025_cohort.sql`: contienen datos reales de alumnos. No los subas a GitHub; repositorio privado y limpiar el historial de Git.

## 4. Primer arranque
1. Entras con tu correo de Google → rol Superadministrador.
2. Usuarios y Accesos → das de alta al psicólogo con su correo de Google (se enlaza solo en su primer acceso).
3. El psicólogo entra y da de alta a sus practicantes.
4. Los alumnos entran con @itdurango.edu.mx o @gmail.com. Si su correo ya está en el padrón (los 31 de 2025) se enlazan a su registro; si no, se crea uno nuevo.

## Reglas de acceso (RLS)
- Superadministrador y Responsable: ven todo (regla de Alex; se cambia en la función `is_global_viewer`).
- Psicólogo: sus pacientes y los de sus practicantes. Practicante: solo los suyos. Alumno: solo su registro.
- Tamizaje y cuestionarios (encuesta de cohorte; en la Etapa 2 también evaluaciones y expedientes clínicos): solo psicólogos y responsable de psicología. No los ven administrador, practicantes, tutores ni alumnos.

## Pendiente (Etapa 2)
Expedientes, evaluaciones (BAI/BDI), sesiones, tareas y bitácora viven solo en memoria del navegador.
La ficha del alumno guarda ya: nombre, carrera, semestre, grupo, generación, sexo, edad, fecha de nacimiento (ISO), teléfono, domicilio, estado civil y ciudad de origen; el resto de campos del cuestionario sociodemográfico se mapea en la Etapa 2.
