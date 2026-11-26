# AGENTS.md — Instrucciones del repositorio `pgLite Studio`

Guía breve para agentes de IA y colaboradores que trabajen sobre este repositorio.

## Stack y arquitectura
- **Framework**: Angular 19 (Standalone Components + Signals API, sin NgModules).
- **Estilos**: Tailwind CSS v3 + variables CSS en `src/styles.css`.
- **Estado**: `src/app/services/er-store.service.ts` (Signals + persistencia en `localStorage` + Undo/Redo).
- **Generadores / Parsers**:
  - `src/app/utils/code-generators.ts` (PostgreSQL DDL, C# EF Core Entities, Angular TS Models/DTOs y parser inverso SQL).
  - `src/app/utils/dbm-importer.ts` (Importador nativo de archivos `.dbm` de pgModeler).

## Regla de Changelog y Versionado (Importante)
Siempre que agregues una funcionalidad visible para el usuario, cambies comportamiento relevante o corrijas un bug importante:

1. **Actualiza `CHANGELOG.md`** siguiendo el formato [Keep a Changelog](https://keepachangelog.com/) (`Added` / `Changed` / `Fixed`).
2. **Actualiza `src/app/data/changelog.data.ts`**:
   - Agrega o actualiza la entrada correspondiente en `CHANGELOG_ENTRIES`.
   - Si corresponde un nuevo release (ej. `v0.4.0`), incrementa `APP_VERSION` y mueve `tag: 'latest'` a la nueva versión para que el modal de novedades se abra automáticamente una vez a los usuarios.
3. Si el cambio es menor o aún está en progreso y no amerita subir de versión, **recuerda sugerir al usuario** al final de tu respuesta si desea actualizar el changelog y/o incrementar `APP_VERSION`.

## Verificación antes de cerrar o commitear
- Ejecutar `npm run build` y confirmar que compila sin errores ni warnings nuevos.
- No incluir archivos temporales ni credenciales; mantener commits concisos con prefijos convencionales (`feat:`, `fix:`, `docs:`, `refactor:`).
