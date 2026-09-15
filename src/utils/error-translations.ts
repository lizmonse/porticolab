/**
 * Translation of engine error codes into Spanish messages for the UI.
 *
 * The engine writes `FrameError.message` in English, for developers and logs.
 * This module is the single boundary where those stable codes become the
 * user-facing Spanish text. The UI must never render `error.message` directly.
 *
 * The map is typed as `Record<FrameErrorCode, ...>`, so adding a code to the
 * engine without translating it here is a compile error rather than a
 * mysterious blank banner at runtime.
 */

import type { FrameErrorCode } from '../lib/frame/errors';
import { FrameError } from '../lib/frame/errors';

/** A user-facing message: a short headline plus what to do about it. */
export interface TranslatedError {
  /** Short headline for the alert banner. */
  readonly title: string;
  /** What went wrong and how to fix it, in plain language. */
  readonly detail: string;
}

const TRANSLATIONS: Record<FrameErrorCode, TranslatedError> = {
  ZERO_LENGTH_ELEMENT: {
    title: 'Barra de longitud cero',
    detail:
      'Una barra une dos nodos que están en la misma posición. Revisa las coordenadas de los nodos.',
  },
  INVALID_MATERIAL: {
    title: 'Propiedades de material inválidas',
    detail:
      'El módulo de elasticidad E y el área A deben ser números mayores que cero en todas las barras.',
  },
  INVALID_SECTION: {
    title: 'Inercia inválida',
    detail:
      'El momento de inercia I debe ser un número mayor que cero en todas las barras. A diferencia ' +
      'de una armadura, un pórtico resiste flexión, y sin inercia la barra no tendría rigidez a ' +
      'flexión alguna.',
  },
  UNKNOWN_NODE: {
    title: 'Referencia a un nodo inexistente',
    detail:
      'Una barra, un apoyo o una carga apunta a un nodo que ya no existe. Revisa la tabla de nodos.',
  },
  UNKNOWN_ELEMENT: {
    title: 'Referencia a una barra inexistente',
    detail:
      'Una carga distribuida apunta a una barra que ya no existe. Revisa la tabla de elementos: al ' +
      'borrar una barra también hay que borrar las cargas repartidas que actuaban sobre ella.',
  },
  DUPLICATE_NODE_ID: {
    title: 'Identificador repetido',
    detail: 'Hay dos nodos o dos barras con el mismo número. Cada uno debe tener un número único.',
  },
  INVALID_NODE_ID: {
    title: 'Número de nodo inválido',
    detail: 'Los números de nodo deben ser enteros mayores o iguales a 1.',
  },
  SELF_CONNECTED_ELEMENT: {
    title: 'Barra conectada a sí misma',
    detail: 'Una barra empieza y termina en el mismo nodo. Elige dos nodos distintos.',
  },
  INVALID_DISPLACEMENT_VECTOR: {
    title: 'Vector de desplazamientos inválido',
    detail: 'Error interno del motor de cálculo. Si persiste, repórtalo como incidencia.',
  },
  EMPTY_MODEL: {
    title: 'Modelo incompleto',
    detail: 'Define al menos dos nodos y una barra para poder calcular.',
  },
  NO_SUPPORTS: {
    title: 'Faltan apoyos',
    detail:
      'La estructura no tiene ningún grado de libertad restringido: se movería como un cuerpo rígido. ' +
      'Añade al menos un empotramiento o dos apoyos articulados.',
  },
  SINGULAR_STIFFNESS: {
    title: 'La estructura es inestable',
    detail:
      'El pórtico funciona como un mecanismo: puede moverse sin deformar ninguna barra, así que no ' +
      'tiene una solución única. Revisa que los apoyos restrinjan el giro o el desplazamiento que ' +
      'falta por sujetar.',
  },
  NON_FINITE_INPUT: {
    title: 'Valor numérico inválido',
    detail: 'Alguna coordenada o carga no es un número válido. Revisa las tablas de entrada.',
  },
  UNSUPPORTED_FEATURE: {
    title: 'Función no disponible todavía',
    detail:
      'El modelo usa apoyos inclinados, que aún no están implementados. Se rechaza el cálculo en ' +
      'lugar de devolver reacciones incorrectas.',
  },
};

/** Fallback for anything that is not a FrameError. */
const UNEXPECTED: TranslatedError = {
  title: 'Error inesperado',
  detail: 'Ocurrió un problema al resolver la estructura. Revisa los datos de entrada.',
};

/** Translates an engine error code into its Spanish message. */
export function translateErrorCode(code: FrameErrorCode): TranslatedError {
  return TRANSLATIONS[code] ?? UNEXPECTED;
}

/** Translates any thrown value, falling back to a generic message. */
export function translateError(error: unknown): TranslatedError {
  return error instanceof FrameError ? translateErrorCode(error.code) : UNEXPECTED;
}
