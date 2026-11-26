# Changelog

Todos los cambios notables de **pgLite Studio** se documentan en este archivo siguiendo el formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [Semantic Versioning](https://semver.org/).

---

## [0.4.0] — 2026-11-26

### Added
- **Auto-width inteligente por tabla (`240px – 390px`)**: cada caja de tabla calcula dinámicamente su ancho óptimo según `schema.tabla` y la columna más larga, manteniendo alineados al píxel los conectores SVG *Crow's Foot*, puertos `PK` y el Auto-Layout.
- **Paneles laterales redimensionables**: separadores arrastrables (`cursor-col-resize`) entre el Explorador izquierdo (`180px – 380px`), el lienzo y el panel derecho de Inspector/Código (`320px – 760px`), con doble clic para restaurar el ancho por defecto.
- **Modo Enfoque (Colapsar/Expandir paneles)**: botones `◧` / `◨` para ocultar el Explorador y/o el Panel Derecho y aprovechar el 100% del lienzo ER, con persistencia en `localStorage`.

### Fixed
- Eliminado el espacio accidental entre `schema.` y el nombre de tabla en la cabecera de las cajas y agregados tooltips nativos (`title`) para nombres extensos.

---

## [0.3.0] — 2026-11-26

### Added
- **Constraints avanzados de PostgreSQL**:
  - Restricciones `CHECK` con nombre y expresión SQL editable por tabla (`+ CHECK`).
  - Restricciones `UNIQUE` nombradas y compuestas con selector de columnas por chips (`+ UQ`).
  - Índices explícitos (`+ IDX`) con soporte para métodos `btree`, `hash`, `gin`, `gist` y `brin`, flag `UNIQUE` y predicado parcial `WHERE`.
- **Preservación de nombres originales de Foreign Keys** al importar desde `.dbm` (ej. `fk_templates_clasificador`).
- **Parser SQL inverso ampliado** para detectar `CONSTRAINT ... UNIQUE (...)`, `CHECK (...)` y `CREATE [UNIQUE] INDEX ... USING ... WHERE ...`.
- **Modal de Novedades (`v0.3.0`)** accesible desde el encabezado de la aplicación y documentación `CHANGELOG.md`.

### Changed
- El generador PostgreSQL DDL evita duplicar `UNIQUE` inline cuando ya existe una restricción `UNIQUE` nombrada sobre la misma columna.

---

## [0.2.0] — 2026-11-26

### Added
- **Importador nativo de pgModeler (`.dbm`)**:
  - Lectura directa de XML `<dbmodel>` conservando esquemas, tablas, columnas, tipos PostgreSQL (`varchar(n)`, `timestamp(p)`, `uuid`, etc.), valores por defecto, comentarios, colores de `<tag>`, coordenadas normalizadas y relaciones FK con `ON DELETE`/`ON UPDATE`.
  - Soporte para `<prepended-sql>` (extensiones como `uuid-ossp`) editable desde la pestaña `PostgreSQL`.
  - Soporte para `<initial-data>` (datos semilla) con editor tabular en el inspector y generación automática de `INSERT INTO ... ON CONFLICT DO NOTHING;` ordenados topológicamente.
- **Comentarios de columna editables** desde el Inspector de Tabla.
- **Encuadre automático del lienzo (`fitDiagramToViewport`)** al importar un archivo `.dbm`.

---

## [0.1.0] — 2026-11-20

### Added
- **Lanzamiento inicial de pgLite Studio** en Angular 19 (Standalone Components + Signals API + Tailwind CSS).
- Lienzo ER infinito estilo *pgModeler* con zoom, paneo, *snap-to-grid*, radar minimapa y conectores Bézier SVG con notación *Crow's Foot*.
- Conector rápido Drag & Drop desde puertos `PK` hacia tablas destino para crear relaciones `FK` al instante.
- **Auto-Layout Topológico** y pila de **Undo / Redo** con persistencia automática en `localStorage`.
- Generador en tiempo real para **PostgreSQL 16+ DDL**, **C# Entities (.NET 8 / EF Core)** e **Interfaces TypeScript + DTOs para Angular**.
- Ingeniería inversa básica desde SQL DDL (`CREATE TABLE` / `ALTER TABLE`).
- Plantillas de dominio (**SaaS Multi-Tenant**, **E-Commerce**, **Clínica HIS**) y exportación **Full-Stack `.ZIP`** + proyecto `.pglite.json`.
