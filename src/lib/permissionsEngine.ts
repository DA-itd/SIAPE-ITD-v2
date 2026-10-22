import { ClinicalCaseRecord, RoleCode, StudentRecord, UserProfile } from '../types/siape';

/**
 * SIAPE-ITD | Motor de Jerarquía de Acceso y Visibilidad RLS
 * 
 * Reglas solicitadas:
 * 1. Superadministrador (Ing. Alejandro Calderón):
 *    - Da de alta a los administradores (Psicólogos).
 *    - Acceso global a todos los pacientes y expedientes.
 * 
 * 2. Psicólogos (Administradores Clínicos):
 *    - Dan de alta a sus practicantes de psicología a cargo.
 *    - Solo pueden ver a los pacientes que ellos tratan directamente
 *      + los pacientes tratados por los practicantes bajo su supervisión.
 * 
 * 3. Practicantes de Psicología:
 *    - Solo pueden ver a los pacientes que ellos tratan directamente.
 * 
 * 4. Alumnos (con @itdurango.edu.mx o @gmail.com):
 *    - Solo tienen acceso a llenar sus datos personales y sus cuestionarios.
 */

export function getSupervisedInterns(psychologistId: string, users: UserProfile[]): UserProfile[] {
  return users.filter(
    (u) => u.role === RoleCode.PRACTICANTE && u.supervisorId === psychologistId
  );
}

export function canUserViewClinicalCase(
  currentUser: UserProfile,
  clinicalCase: ClinicalCaseRecord,
  users: UserProfile[]
): boolean {
  // 1. Superadministrador y Responsable General de Psicología
  if (
    currentUser.role === RoleCode.ADMINISTRADOR ||
    currentUser.role === RoleCode.RESPONSABLE_PSICOLOGIA
  ) {
    return true;
  }

  // 2. Psicólogo Clínico
  if (currentUser.role === RoleCode.PSICOLOGO) {
    // Caso tratado directamente por él
    if (clinicalCase.assignedPsychologistId === currentUser.id) {
      return true;
    }
    // O caso tratado por un practicante bajo su supervisión
    if (clinicalCase.assignedInternId) {
      const myInterns = getSupervisedInterns(currentUser.id, users);
      return myInterns.some((i) => i.id === clinicalCase.assignedInternId);
    }
    return false;
  }

  // 3. Practicante de Psicología: ÚNICAMENTE los que él trata directamente
  if (currentUser.role === RoleCode.PRACTICANTE) {
    return clinicalCase.assignedInternId === currentUser.id;
  }

  // 4. Estudiantes y tutores no tienen acceso clínico directo
  return false;
}

export function filterCasesForUser(
  currentUser: UserProfile,
  cases: ClinicalCaseRecord[],
  users: UserProfile[]
): ClinicalCaseRecord[] {
  if (
    currentUser.role === RoleCode.ADMINISTRADOR ||
    currentUser.role === RoleCode.RESPONSABLE_PSICOLOGIA
  ) {
    return cases;
  }

  return cases.filter((c) => canUserViewClinicalCase(currentUser, c, users));
}

export function filterStudentsForUser(
  currentUser: UserProfile,
  students: StudentRecord[],
  authorizedCases: ClinicalCaseRecord[]
): StudentRecord[] {
  if (
    currentUser.role === RoleCode.ADMINISTRADOR ||
    currentUser.role === RoleCode.RESPONSABLE_PSICOLOGIA
  ) {
    return students;
  }

  if (currentUser.role === RoleCode.PSICOLOGO || currentUser.role === RoleCode.PRACTICANTE) {
    const allowedStudentIds = new Set(authorizedCases.map((c) => c.studentId));
    return students.filter((s) => allowedStudentIds.has(s.id));
  }

  // Para el alumno, solo su propio registro
  if (currentUser.role === RoleCode.ESTUDIANTE) {
    return students.filter(
      (s) =>
        s.id === currentUser.linkedStudentId ||
        s.institutionalEmail.toLowerCase() === currentUser.email.toLowerCase()
    );
  }

  return [];
}
