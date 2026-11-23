/**
 * Texto del Encuadre del servicio y Consentimiento informado.
 * Fuente: "Encuadre_del_servicio_y_consentimiento_informado_ITD.pdf" (Departamento de Psicología, ITD).
 *
 * IMPORTANTE: si cambias el texto, cambia también CONSENT_VERSION y el valor
 * 'consent_version' en la tabla app_settings (ver supabase/consentimiento.sql).
 * Así todos los alumnos vuelven a ver y aceptar la versión nueva.
 */

export const CONSENT_VERSION = 'ENCUADRE-2026.1';

export const CONSENT_TITLE = 'Encuadre del servicio y consentimiento informado';
export const CONSENT_SUBTITLE = 'Departamento de Psicología · Instituto Tecnológico de Durango';

export type ConsentBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] };

export interface ConsentSection {
  title: string;
  blocks: ConsentBlock[];
}

export const CONSENT_SECTIONS: ConsentSection[] = [
  {
    title: '1. Naturaleza del servicio',
    blocks: [
      {
        type: 'p',
        text: 'El Departamento de Psicología del Instituto Tecnológico de Durango ofrece un espacio de atención, orientación y acompañamiento psicológico dirigido a los estudiantes, con la finalidad de favorecer su bienestar emocional y contribuir a su desarrollo personal y académico.',
      },
      {
        type: 'p',
        text: 'La atención busca brindar un espacio de escucha profesional, identificación de necesidades, orientación y trabajo sobre aquellas situaciones personales, emocionales, familiares o académicas que puedan estar influyendo en el bienestar del estudiante.',
      },
      {
        type: 'p',
        text: 'Es importante señalar que este servicio tiene un carácter institucional y de acompañamiento psicológico. No sustituye un proceso de psicoterapia especializada, atención psiquiátrica ni otros servicios de salud mental que pudieran requerirse. Cuando la situación lo amerite, se podrán realizar recomendaciones y canalizaciones a instituciones o profesionales externos.',
      },
    ],
  },
  {
    title: '2. Duración y número de sesiones',
    blocks: [
      {
        type: 'p',
        text: 'Para favorecer una atención organizada y brindar seguimiento a las necesidades de los estudiantes, se establece inicialmente el siguiente esquema:',
      },
      {
        type: 'ul',
        items: [
          'Número inicial de sesiones: 5 sesiones.',
          'Duración de cada sesión: 45 minutos aproximadamente.',
          'Frecuencia: de acuerdo con la disponibilidad de agenda y las necesidades identificadas durante la atención.',
          'Continuidad: al finalizar las sesiones iniciales, se realizará una valoración para determinar si es conveniente concluir el acompañamiento, considerar sesiones adicionales o recomendar atención especializada externa.',
        ],
      },
      {
        type: 'p',
        text: 'La posibilidad de ampliar el número de sesiones dependerá de la situación particular del estudiante, los objetivos de trabajo y la disponibilidad del servicio.',
      },
    ],
  },
  {
    title: '3. Compromisos del estudiante',
    blocks: [
      { type: 'p', text: 'Al solicitar atención psicológica, el estudiante se compromete a:' },
      {
        type: 'ul',
        items: [
          'Asistir puntualmente a las sesiones programadas.',
          'Avisar con anticipación cuando no pueda acudir a una cita.',
          'Participar de manera voluntaria y activa en el espacio de atención.',
          'Mantener una actitud de respeto y apertura durante el acompañamiento.',
          'Proporcionar información honesta que permita comprender adecuadamente su situación.',
          'Comprender que los cambios y avances personales requieren participación y compromiso, y que no pueden garantizarse resultados específicos.',
        ],
      },
      {
        type: 'p',
        text: 'En caso de no poder asistir, se solicita notificarlo oportunamente para permitir que otro estudiante pueda aprovechar el espacio disponible.',
      },
    ],
  },
  {
    title: '4. Confidencialidad',
    blocks: [
      {
        type: 'p',
        text: 'La información compartida durante las sesiones será tratada con respeto, responsabilidad y confidencialidad. Los datos personales y la información obtenida durante la atención serán utilizados exclusivamente para fines relacionados con el acompañamiento psicológico y se resguardarán conforme a las disposiciones aplicables en materia de protección de datos personales.',
      },
      {
        type: 'p',
        text: 'La confidencialidad tiene límites en situaciones excepcionales en las que exista un riesgo significativo para la integridad del propio estudiante o de terceras personas, así como cuando exista una obligación legal de proporcionar información a las autoridades competentes. En estos casos, se tomarán las medidas necesarias procurando proteger al estudiante y compartir únicamente la información indispensable.',
      },
      {
        type: 'p',
        text: 'La información de las sesiones no será compartida con docentes, compañeros, familiares o autoridades académicas por el simple hecho de recibir atención psicológica. Cualquier comunicación que resulte pertinente se realizará conforme a los límites legales y éticos correspondientes.',
      },
    ],
  },
  {
    title: '5. Participación voluntaria',
    blocks: [
      {
        type: 'p',
        text: 'La atención psicológica es voluntaria. El estudiante tiene derecho a expresar sus dudas, manifestar desacuerdo con alguna intervención y decidir suspender el acompañamiento cuando así lo considere, sin que esto represente alguna consecuencia negativa en su situación académica o administrativa dentro del Instituto.',
      },
      {
        type: 'p',
        text: 'Asimismo, puede solicitar información sobre el funcionamiento del servicio y las alternativas de atención disponibles.',
      },
    ],
  },
  {
    title: '6. Alcances y situaciones que requieren atención especializada',
    blocks: [
      {
        type: 'p',
        text: 'El Departamento de Psicología buscará identificar las necesidades de cada estudiante y ofrecer la orientación que se encuentre dentro de sus posibilidades y competencias profesionales.',
      },
      {
        type: 'p',
        text: 'Cuando se identifique una situación que requiera atención clínica especializada, tratamiento psicoterapéutico continuo, valoración psiquiátrica o intervención de emergencia, se orientará al estudiante sobre las alternativas de atención correspondientes.',
      },
      {
        type: 'p',
        text: 'En situaciones de crisis o riesgo inmediato, el esquema habitual de sesiones no sustituye la atención de urgencia que pudiera necesitarse.',
      },
    ],
  },
  {
    title: '7. Consentimiento informado',
    blocks: [
      {
        type: 'p',
        text: 'Declaro que he leído y comprendido la información anterior respecto al funcionamiento, características y alcances del servicio de atención psicológica del Instituto Tecnológico de Durango.',
      },
      {
        type: 'p',
        text: 'Se me ha explicado que la atención es voluntaria, que existe un compromiso de confidencialidad dentro de los límites señalados y que el servicio tiene un carácter institucional de orientación y acompañamiento psicológico.',
      },
      {
        type: 'p',
        text: 'Asimismo, comprendo el número inicial de sesiones, su duración aproximada y la posibilidad de que, de acuerdo con mis necesidades, se me recomiende acudir a otros servicios especializados.',
      },
      {
        type: 'p',
        text: 'He tenido la oportunidad de aclarar mis dudas y manifiesto mi conformidad para recibir atención psicológica bajo las condiciones anteriormente descritas.',
      },
      {
        type: 'p',
        text: 'Al aceptar este consentimiento, manifiesto mi decisión libre y voluntaria de participar en el proceso de atención psicológica.',
      },
    ],
  },
];

export const CONSENT_SIGNATURE = ['Departamento de Psicología', 'Instituto Tecnológico de Durango'];

export const CONSENT_CHECKBOX_LABEL =
  'He leído y comprendo este documento, y acepto recibir atención psicológica bajo estas condiciones.';
