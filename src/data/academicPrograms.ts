import { AcademicProgram } from '../types/siape';

/**
 * SIAPE-ITD | Catálogo institucional de programas académicos del ITD.
 * Es un catálogo real (no son datos de pacientes ni usuarios), por eso se conserva.
 * El mismo catálogo se siembra en la tabla public.academic_programs (ver supabase/01_auth_y_usuarios.sql).
 */

export const ITD_ACADEMIC_PROGRAMS: AcademicProgram[] = [
  // Columna 1 (Oferta Educativa ITD)
  {
    id: 'prog-iia',
    code: 'IIA-2023-240',
    name: 'Ingeniería en Inteligencia Artificial',
    academicDepartment: 'Sistemas y Computación',
    active: true,
  },
  {
    id: 'prog-isc',
    code: 'ISC-2020-224',
    name: 'Ingeniería en Sistemas Computacionales',
    academicDepartment: 'Sistemas y Computación',
    active: true,
  },
  {
    id: 'prog-iinf',
    code: 'IINF-2020-220',
    name: 'Ingeniería Informática',
    academicDepartment: 'Sistemas y Computación',
    active: true,
  },
  {
    id: 'prog-itic',
    code: 'ITIC-2020-225',
    name: 'Tecnologías de la Información',
    academicDepartment: 'Sistemas y Computación',
    active: true,
  },
  {
    id: 'prog-adm',
    code: 'LADM-2020-234',
    name: 'Licenciatura en Administración',
    academicDepartment: 'Ciencias Económico-Administrativas',
    active: true,
  },
  {
    id: 'prog-ige',
    code: 'IGEM-2020-201',
    name: 'Ingeniería en Gestión Empresarial',
    academicDepartment: 'Ciencias Económico-Administrativas',
    active: true,
  },
  // Columna 2 (Oferta Educativa ITD)
  {
    id: 'prog-isem',
    code: 'ISEM-2023-241',
    name: 'Ingeniería en Semiconductores',
    academicDepartment: 'Eléctrica y Electrónica',
    active: true,
  },
  {
    id: 'prog-iele',
    code: 'IELE-2020-209',
    name: 'Ingeniería Eléctrica',
    academicDepartment: 'Eléctrica y Electrónica',
    active: true,
  },
  {
    id: 'prog-ielc',
    code: 'IELC-2020-211',
    name: 'Ingeniería Electrónica',
    academicDepartment: 'Eléctrica y Electrónica',
    active: true,
  },
  {
    id: 'prog-ibio',
    code: 'IBIO-2020-202',
    name: 'Ingeniería Biomédica',
    academicDepartment: 'Eléctrica y Electrónica',
    active: true,
  },
  {
    id: 'prog-arq',
    code: 'ARQU-2020-201',
    name: 'Arquitectura',
    academicDepartment: 'Ciencias de la Tierra',
    active: true,
  },
  {
    id: 'prog-civ',
    code: 'ICIV-2020-224',
    name: 'Ingeniería Civil',
    academicDepartment: 'Ciencias de la Tierra',
    active: true,
  },
  // Columna 3 (Oferta Educativa ITD)
  {
    id: 'prog-mec',
    code: 'IMCT-2020-229',
    name: 'Ingeniería Mecatrónica',
    academicDepartment: 'Metal-Mecánica',
    active: true,
  },
  {
    id: 'prog-imca',
    code: 'IMEC-2020-228',
    name: 'Ingeniería Mecánica',
    academicDepartment: 'Metal-Mecánica',
    active: true,
  },
  {
    id: 'prog-ibq',
    code: 'IBQA-2020-207',
    name: 'Ingeniería Bioquímica',
    academicDepartment: 'Ingenierías Química y Bioquímica',
    active: true,
  },
  {
    id: 'prog-qui',
    code: 'IQUI-2020-232',
    name: 'Ingeniería Química',
    academicDepartment: 'Ingenierías Química y Bioquímica',
    active: true,
  },
  {
    id: 'prog-ind',
    code: 'IIND-2020-227',
    name: 'Ingeniería Industrial',
    academicDepartment: 'Ingeniería Industrial',
    active: true,
  },
  {
    id: 'prog-ilog',
    code: 'ILOG-2020-226',
    name: 'Ingeniería Logística',
    academicDepartment: 'Ingeniería Industrial',
    active: true,
  },
];