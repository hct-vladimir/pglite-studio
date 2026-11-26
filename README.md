# pgLite Studio — PostgreSQL ER Modeler & Full-Stack Code Generator

**pgLite Studio** es una herramienta visual ligera e interactiva de modelado Entidad-Relación (inspirada en *pgModeler*), diseñada para arquitectos y desarrolladores que trabajan con **PostgreSQL**, **.NET (C# / EF Core)** y **Angular (TypeScript)**.

Construida 100% en **Angular 19** usando **Signals** para reactividad instantánea sin backend requerido.

---

## ✨ Características Principales

- **Lienzo ER Infinito Estilo pgModeler**:
  - Zoom suave, paneo libre, *snap-to-grid* y radar minimapa en vivo.
  - Cabeceras con código de color por tabla (`schema.table`), indicadores de `🔑 PK`, `🔗 FK`, `NN` (`NOT NULL`) y `UQ` (`UNIQUE`).
  - Conectores curvos Bézier SVG con notación *Crow's Foot* (`1:N`) animados al seleccionar una entidad.
- **Conexión Rápida Drag & Drop (`PK → FK`)**:
  - Arrastra el conector dorado (`●`) desde cualquier llave primaria `PK` y suéltalo sobre cualquier otra tabla para crear automáticamente la columna y la restricción Foreign Key.
- **Auto-Layout Topológico (`✨ Auto-Layout`)**:
  - Ordena automáticamente las tablas por niveles jerárquicos de dependencia (tablas padre a la izquierda, tablas hijas a la derecha).
- **Generador de Código Multi-Lenguaje en Tiempo Real**:
  1. **PostgreSQL 16+ DDL (`schema.sql`)**: `CREATE SCHEMA`, `CREATE TABLE`, `COMMENT ON`, `ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY` e índices automáticos `CREATE INDEX` sobre llaves foráneas.
  2. **C# Entities (`.NET 8 / EF Core`)**: Clases o `records` con `DataAnnotations` (`[Table]`, `[Key]`, `[Required]`, `[MaxLength]`, `[Column]`, `[ForeignKey]`) y propiedades de navegación `1:N` (`ICollection<T>`).
  3. **Angular TypeScript Models + DTOs**: Interfaces en `camelCase` con relaciones opcionales y tipos utilitarios `Create<Entity>Dto` y `Update<Entity>Dto`.
- **Constraints Avanzados e Índices**:
  - Restricciones `CHECK`, llaves `UNIQUE` compuestas/nombradas e índices explícitos (`btree`, `hash`, `gin`, `gist`, `brin`) con predicado parcial `WHERE`.
- **Importación Nativa de pgModeler (`.dbm`) e Ingeniería Inversa SQL (`📥 Importar SQL`)**:
  - Importa directamente archivos `.dbm` de *pgModeler* preservando esquemas, tablas, tipos, defaults, comentarios, colores de tag, `<prepended-sql>` (extensiones), `<initial-data>` (datos semilla) y restricciones `PK`/`UQ`/`CK`/`FK`/`INDEX`.
  - También puedes pegar cualquier script `CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX` de PostgreSQL para construir el diagrama automáticamente.
- **Exportación Full-Stack (`.ZIP` y `.pglite.json`)**:
  - Descarga en un clic un paquete `.zip` con `/sql`, `/csharp-entities`, `/angular-models` y el archivo de proyecto `.pglite.json` versionable en Git.

Consulta el historial completo de versiones en [CHANGELOG.md](./CHANGELOG.md) o desde el botón de versión (`v0.3.0`) en la barra superior de la aplicación.

> **Nota para colaboradores y agentes de IA:** Consulta [AGENTS.md](./AGENTS.md) para las convenciones del repo y el recordatorio de mantener sincronizados `CHANGELOG.md` y `src/app/data/changelog.data.ts` en cada cambio relevante.

---

## 🚀 Inicio Rápido

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo (http://localhost:4200)
npm start

# Compilar para producción
npm run build
```

---

## 🛠️ Stack Tecnológico

- **Framework**: Angular 19 (Standalone Components + Signals API)
- **Estilos**: Tailwind CSS v3 + CSS Custom Variables (Tema Oscuro / Claro)
- **Empaquetado ZIP**: JSZip (Client-side bundle generation)
