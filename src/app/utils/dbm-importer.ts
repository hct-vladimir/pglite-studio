import {
  ErColumn,
  ErInitialData,
  ErProject,
  ErTable,
  ReferentialAction,
  TABLE_COLORS,
} from '../models/er.models';
import { toPascalCase } from './code-generators';

export interface DbmImportResult {
  project: ErProject;
  tableCount: number;
  relationCount: number;
  schemas: string[];
  prependedSql?: string;
}

const VALID_REF_ACTIONS = new Set<ReferentialAction>([
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'NO ACTION',
]);

function normalizeReferentialAction(raw: string | null): ReferentialAction {
  const upper = (raw || '').trim().toUpperCase().replace(/_/g, ' ');
  if (VALID_REF_ACTIONS.has(upper as ReferentialAction)) {
    return upper as ReferentialAction;
  }
  return 'NO ACTION';
}

function normalizePgModelerType(typeEl: Element | null): string {
  if (!typeEl) return 'text';
  const rawName = (typeEl.getAttribute('name') || 'text').trim().toLowerCase();
  const length = Number(typeEl.getAttribute('length') || '0');
  const precision = Number(typeEl.getAttribute('precision') || '0');
  const dimension = Number(typeEl.getAttribute('dimension') || '0');
  const withTimezone = typeEl.getAttribute('with-timezone') === 'true';

  let mapped = rawName;

  if (rawName === 'character varying' || rawName === 'varchar') {
    mapped = length > 0 ? `varchar(${length})` : 'varchar';
  } else if (rawName === 'character' || rawName === 'char') {
    mapped = length > 0 ? `char(${length})` : 'char(1)';
  } else if (rawName === 'numeric' || rawName === 'decimal') {
    if (length > 0 && precision > 0) mapped = `numeric(${length},${precision})`;
    else if (length > 0) mapped = `numeric(${length})`;
    else mapped = 'numeric';
  } else if (rawName === 'timestamp' || rawName === 'timestamp without time zone') {
    if (withTimezone) {
      mapped = 'timestamptz';
    } else if (precision > 0) {
      mapped = `timestamp(${precision})`;
    } else {
      mapped = 'timestamp';
    }
  } else if (rawName === 'timestamp with time zone' || rawName === 'timestamptz') {
    mapped = 'timestamptz';
  } else if (rawName === 'int4' || rawName === 'int') {
    mapped = 'integer';
  } else if (rawName === 'int8') {
    mapped = 'bigint';
  } else if (rawName === 'int2') {
    mapped = 'smallint';
  } else if (rawName === 'bool') {
    mapped = 'boolean';
  }

  if (dimension > 0) {
    mapped += '[]'.repeat(dimension);
  }

  return mapped;
}

function directChild(parent: Element, tagName: string): Element | null {
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].tagName.toLowerCase() === tagName) {
      return parent.children[i];
    }
  }
  return null;
}

function directChildren(parent: Element, tagName: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].tagName.toLowerCase() === tagName) {
      result.push(parent.children[i]);
    }
  }
  return result;
}

function parseTableKey(qualified: string, fallbackSchema = 'public'): string {
  const clean = (qualified || '').replace(/"/g, '').trim();
  if (clean.includes('.')) {
    return clean.toLowerCase();
  }
  return `${fallbackSchema}.${clean}`.toLowerCase();
}

/**
 * Parses pgModeler <initial-data> CDATA blocks.
 * Format: columns separated by '•' (U+2022) and rows terminated by '⸣' (U+2E23) or newline.
 */
function parsePgModelerInitialData(rawText: string | null | undefined): ErInitialData | undefined {
  if (!rawText) return undefined;
  const trimmed = rawText.trim();
  if (!trimmed) return undefined;

  const rawLines = trimmed
    .split(/\u2E23(?:\r?\n)?|\r?\n/)
    .map(l => l.replace(/\u2E23$/g, '').trim())
    .filter(Boolean);

  if (rawLines.length < 2) return undefined;

  const sep = rawLines[0].includes('\u2022') ? '\u2022' : ',';
  const columns = rawLines[0]
    .split(sep)
    .map(c => c.trim())
    .filter(Boolean);

  if (columns.length === 0) return undefined;

  const rows: string[][] = [];
  for (let i = 1; i < rawLines.length; i++) {
    const cells = rawLines[i].split(sep).map(v => v.trim());
    if (cells.length > 0 && cells.some(c => c.length > 0)) {
      rows.push(cells);
    }
  }

  return rows.length > 0 ? { columns, rows } : undefined;
}

/**
 * Parses a pgModeler .dbm XML file into an ErProject ready for pgLite Studio.
 * Preserves schemas, tables, columns, pg types, defaults, comments, PK/UQ/FK constraints,
 * tag header colors, and normalized 2D coordinates.
 */
export function parsePgModelerDbm(xmlContent: string): DbmImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('El archivo .dbm no es un XML válido de pgModeler.');
  }

  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'dbmodel') {
    throw new Error('No se encontró el nodo raíz <dbmodel> de pgModeler.');
  }

  // 1. Database metadata
  const dbEl = directChild(root, 'database');
  const dbName = dbEl?.getAttribute('name')?.trim() || 'pgModeler Import';
  const prependedSql = directChild(dbEl || root, 'prepended-sql')?.textContent?.trim();

  // 2. Tag color styles (<tag name="..."> -> <style id="table-title" colors="..."/>)
  const tagColorMap = new Map<string, string>();
  for (const tagEl of directChildren(root, 'tag')) {
    const tagName = tagEl.getAttribute('name')?.trim();
    if (!tagName) continue;
    const titleStyle = directChildren(tagEl, 'style').find(
      s => s.getAttribute('id') === 'table-title'
    );
    const colorsAttr = titleStyle?.getAttribute('colors') || '';
    const firstHex = colorsAttr
      .split(',')
      .map(s => s.trim())
      .find(s => /^#[0-9a-fA-F]{6}$/.test(s));
    if (firstHex) {
      tagColorMap.set(tagName.toLowerCase(), firstHex);
    }
  }

  // 3. Parse <table> nodes
  const tableElements = directChildren(root, 'table');
  if (tableElements.length === 0) {
    throw new Error('El archivo .dbm no contiene tablas.');
  }

  const tables: ErTable[] = [];
  const tableByKey = new Map<string, ErTable>();
  const rawPositions: { table: ErTable; x: number; y: number }[] = [];
  const schemasSet = new Set<string>();
  const now = Date.now();

  tableElements.forEach((tblEl, tblIdx) => {
    const name = (tblEl.getAttribute('name') || `tabla_${tblIdx + 1}`).trim();
    const schemaEl = directChild(tblEl, 'schema');
    const schema = (schemaEl?.getAttribute('name') || 'public').trim();
    schemasSet.add(schema);

    const commentEl = directChild(tblEl, 'comment');
    const comment = commentEl?.textContent?.trim() || undefined;

    const tagEl = directChild(tblEl, 'tag');
    const tagName = tagEl?.getAttribute('name')?.trim().toLowerCase();
    const color =
      (tagName && tagColorMap.get(tagName)) ||
      TABLE_COLORS[tblIdx % TABLE_COLORS.length].hex;

    const posEl = directChild(tblEl, 'position');
    const rawX = Number(posEl?.getAttribute('x') ?? tblIdx * 320);
    const rawY = Number(posEl?.getAttribute('y') ?? 60);

    // Columns
    const colElements = directChildren(tblEl, 'column');
    const columns: ErColumn[] = colElements.map((colEl, colIdx) => {
      const colName = (colEl.getAttribute('name') || `col_${colIdx + 1}`).trim();
      const notNull = colEl.getAttribute('not-null') === 'true';
      const defaultValue = colEl.getAttribute('default-value')?.trim() || undefined;
      const typeEl = directChild(colEl, 'type');
      const colComment = directChild(colEl, 'comment')?.textContent?.trim() || undefined;

      return {
        id: `dbm_c_${tblIdx}_${colIdx}_${now}`,
        name: colName,
        type: normalizePgModelerType(typeEl),
        pk: false,
        nn: notNull,
        unique: false,
        defaultValue,
        comment: colComment,
        fk: null,
      };
    });

    // Inline table constraints (PK, UQ, and occasional inline FK)
    for (const constrEl of directChildren(tblEl, 'constraint')) {
      const constrType = (constrEl.getAttribute('type') || '').toLowerCase();
      const srcColsEl = directChildren(constrEl, 'columns').find(
        c => (c.getAttribute('ref-type') || 'src-columns') === 'src-columns'
      );
      const colNames = (srcColsEl?.getAttribute('names') || '')
        .split(',')
        .map(s => s.replace(/"/g, '').trim().toLowerCase())
        .filter(Boolean);

      if (constrType === 'pk-constr') {
        for (const col of columns) {
          if (colNames.includes(col.name.toLowerCase())) {
            col.pk = true;
            col.nn = true;
          }
        }
      } else if (constrType === 'uq-constr') {
        for (const col of columns) {
          if (colNames.includes(col.name.toLowerCase())) {
            col.unique = true;
          }
        }
      }
    }

    const initialDataEl = directChild(tblEl, 'initial-data');
    const initialData = parsePgModelerInitialData(initialDataEl?.textContent);

    const table: ErTable = {
      id: `dbm_t_${tblIdx}_${now}`,
      schema,
      name,
      color,
      comment,
      x: 60,
      y: 60,
      columns,
      initialData,
    };

    tables.push(table);
    tableByKey.set(parseTableKey(`${schema}.${name}`), table);
    rawPositions.push({ table, x: Number.isFinite(rawX) ? rawX : 60, y: Number.isFinite(rawY) ? rawY : 60 });
  });

  // Normalize pgModeler positions so the diagram starts cleanly near (60, 60)
  // and scales gently if pgModeler coordinates are very spread out
  if (rawPositions.length > 0) {
    const minX = Math.min(...rawPositions.map(p => p.x));
    const minY = Math.min(...rawPositions.map(p => p.y));
    const maxX = Math.max(...rawPositions.map(p => p.x));
    const spanX = maxX - minX;
    // pgModeler canvases often span ~1800px+ at 0.55 zoom; keep a comfortable scale
    const scale = spanX > 1500 ? 0.72 : 1;

    for (const item of rawPositions) {
      item.table.x = Math.round(((item.x - minX) * scale + 60) / 12) * 12;
      item.table.y = Math.round(((item.y - minY) * scale + 60) / 12) * 12;
    }
  }

  // 4. Parse Foreign Key constraints (both root-level <constraint type="fk-constr"> and table-level)
  const fkConstraints: Element[] = [
    ...directChildren(root, 'constraint').filter(
      c => (c.getAttribute('type') || '').toLowerCase() === 'fk-constr'
    ),
  ];

  for (const tblEl of tableElements) {
    for (const c of directChildren(tblEl, 'constraint')) {
      if ((c.getAttribute('type') || '').toLowerCase() === 'fk-constr') {
        fkConstraints.push(c);
      }
    }
  }

  let relationCount = 0;

  for (const fkEl of fkConstraints) {
    const srcTableAttr = fkEl.getAttribute('table') || '';
    const dstTableAttr = fkEl.getAttribute('ref-table') || '';
    if (!srcTableAttr || !dstTableAttr) continue;

    const srcTable = tableByKey.get(parseTableKey(srcTableAttr));
    const dstTable = tableByKey.get(parseTableKey(dstTableAttr));
    if (!srcTable || !dstTable) continue;

    const colEls = directChildren(fkEl, 'columns');
    const srcColsAttr =
      colEls.find(c => c.getAttribute('ref-type') === 'src-columns')?.getAttribute('names') || '';
    const dstColsAttr =
      colEls.find(c => c.getAttribute('ref-type') === 'dst-columns')?.getAttribute('names') || '';

    const srcColNames = srcColsAttr
      .split(',')
      .map(s => s.replace(/"/g, '').trim())
      .filter(Boolean);
    const dstColNames = dstColsAttr
      .split(',')
      .map(s => s.replace(/"/g, '').trim())
      .filter(Boolean);

    const onDelete = normalizeReferentialAction(fkEl.getAttribute('del-action'));
    const onUpdate = normalizeReferentialAction(fkEl.getAttribute('upd-action'));

    srcColNames.forEach((srcColName, idx) => {
      const dstColName = dstColNames[idx] || dstColNames[0] || 'id';
      const srcCol = srcTable.columns.find(
        c => c.name.toLowerCase() === srcColName.toLowerCase()
      );
      const dstCol =
        dstTable.columns.find(c => c.name.toLowerCase() === dstColName.toLowerCase()) ||
        dstTable.columns.find(c => c.pk) ||
        dstTable.columns[0];

      if (srcCol && dstCol) {
        srcCol.fk = {
          targetTableId: dstTable.id,
          targetColId: dstCol.id,
          onDelete,
          onUpdate,
        };
        relationCount++;
      }
    });
  }

  const schemas = Array.from(schemasSet);
  const defaultSchema = schemas.find(s => s !== 'public') || schemas[0] || 'public';
  const namespaceRoot = toPascalCase(dbName.replace(/_v\d+$/i, '')) || 'App';

  const project: ErProject = {
    version: '1.0.0',
    name: dbName,
    defaultSchema,
    csharpNamespace: `${namespaceRoot}.Domain.Entities`,
    useEfDataAnnotations: true,
    useCSharpRecords: false,
    prependedSql: prependedSql || undefined,
    tables,
  };

  return {
    project,
    tableCount: tables.length,
    relationCount,
    schemas,
    prependedSql,
  };
}
