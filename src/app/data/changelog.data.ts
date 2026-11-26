export interface ChangelogEntry {
  version: string;
  date: string;
  tag: 'latest' | 'release';
  title: string;
  highlights: {
    type: 'added' | 'changed' | 'fixed';
    text: string;
  }[];
}

export const APP_VERSION = 'v0.4.0';

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: 'v0.4.0',
    date: '2026-11-26',
    tag: 'latest',
    title: 'UX Pro: Auto-width de tablas y paneles redimensionables / colapsables',
    highlights: [
      {
        type: 'added',
        text: 'Auto-width inteligente por tabla (240px–390px) para evitar cortes en nombres largos, sincronizado con conectores SVG y Auto-Layout.',
      },
      {
        type: 'added',
        text: 'Paneles izquierdo y derecho redimensionables por arrastre (doble clic para restaurar el ancho por defecto).',
      },
      {
        type: 'added',
        text: 'Botones para ocultar/expandir ambos paneles laterales (Modo Enfoque de lienzo completo) con preferencias guardadas en localStorage.',
      },
      {
        type: 'fixed',
        text: 'Eliminado el espacio entre schema. y nombre de tabla en la cabecera y añadidos tooltips en títulos y columnas.',
      },
    ],
  },
  {
    version: 'v0.3.0',
    date: '2026-11-26',
    tag: 'release',
    title: 'Constraints avanzados, índices explícitos y Changelog integrado',
    highlights: [
      {
        type: 'added',
        text: 'Editor de restricciones CHECK, llaves UNIQUE compuestas e índices explícitos (btree, hash, gin, gist, brin + WHERE parcial).',
      },
      {
        type: 'added',
        text: 'Preservación de nombres originales de constraints FK y UQ al importar archivos .dbm de pgModeler.',
      },
      {
        type: 'added',
        text: 'Parser inverso SQL actualizado para detectar UNIQUE compuestos, CHECK y CREATE [UNIQUE] INDEX.',
      },
      {
        type: 'changed',
        text: 'Generación SQL más limpia evitando duplicar UNIQUE inline cuando existe un constraint nombrado.',
      },
    ],
  },
  {
    version: 'v0.2.0',
    date: '2026-11-26',
    tag: 'release',
    title: 'Importador nativo de pgModeler (.dbm), extensiones y datos semilla',
    highlights: [
      {
        type: 'added',
        text: 'Importación directa de archivos .dbm (XML de pgModeler) con tablas, tipos, defaults, comentarios, colores de tag, posiciones y FKs.',
      },
      {
        type: 'added',
        text: 'Soporte para prepended-sql (extensiones PostgreSQL como uuid-ossp) editable en la pestaña SQL.',
      },
      {
        type: 'added',
        text: 'Soporte para initial-data (datos semilla) con editor en el inspector e INSERT INTO ordenados topológicamente.',
      },
      {
        type: 'added',
        text: 'Comentarios editables por columna y encuadre automático del diagrama al importar.',
      },
    ],
  },
  {
    version: 'v0.1.0',
    date: '2026-11-20',
    tag: 'release',
    title: 'Lanzamiento inicial — pgLite Studio',
    highlights: [
      {
        type: 'added',
        text: 'Lienzo ER infinito estilo pgModeler con zoom, paneo, minimapa y conector Drag & Drop PK → FK.',
      },
      {
        type: 'added',
        text: 'Generación instantánea de PostgreSQL DDL, C# Entities (.NET 8 / EF Core) y modelos TypeScript + DTOs para Angular.',
      },
      {
        type: 'added',
        text: 'Auto-Layout topológico, Undo/Redo, plantillas de dominio, importador SQL y descarga Full-Stack .ZIP.',
      },
    ],
  },
];
