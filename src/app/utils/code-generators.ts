import {
  ErCheckConstraint,
  ErColumn,
  ErIndex,
  ErIndexMethod,
  ErProject,
  ErTable,
  ErUniqueConstraint,
  GeneratedFile,
  TABLE_COLORS,
} from '../models/er.models';

export function toPascalCase(str: string): string {
  return (str || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : '';
}

export function toKebabCase(str: string): string {
  return (str || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

export function singularize(name: string): string {
  const lower = (name || '').trim();
  if (lower.endsWith('iones')) return lower.slice(0, -5) + 'ion';
  if (lower.endsWith('res') && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith('es') && !lower.endsWith('tes') && !lower.endsWith('les') && lower.length > 5) {
    return lower.slice(0, -1);
  }
  if (lower.endsWith('ies') && lower.length > 4) return lower.slice(0, -3) + 'y';
  if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

/**
 * 1. PostgreSQL 16+ Production-Grade DDL Generator
 */
export function generatePostgreSqlDdl(project: ErProject): string {
  const schemas = Array.from(new Set(project.tables.map(t => t.schema.trim()).filter(Boolean)));
  const lines: string[] = [
    `-- ============================================================================`,
    `-- pgLite Studio — PostgreSQL 16+ DDL Script`,
    `-- Project : ${project.name}`,
    `-- Tables  : ${project.tables.length}`,
    `-- ============================================================================`,
    ``,
    `BEGIN;`,
    ``,
  ];

  // Prepended SQL (extensions, custom setup)
  if (project.prependedSql && project.prependedSql.trim()) {
    lines.push(`-- Prepended SQL / Extensions`);
    lines.push(project.prependedSql.trim());
    lines.push(``);
  }

  // Ensure custom schemas exist
  schemas
    .filter(s => s !== 'public')
    .forEach(s => {
      lines.push(`CREATE SCHEMA IF NOT EXISTS ${s};`);
    });

  if (schemas.some(s => s !== 'public')) {
    lines.push(``);
  }

  // Create tables
  for (const table of project.tables) {
    lines.push(`-- Table: ${table.schema}.${table.name}`);
    lines.push(`CREATE TABLE IF NOT EXISTS ${table.schema}.${table.name} (`);

    const colDefs: string[] = [];
    const pkCols: string[] = [];
    const namedSingleUniqueCols = new Set(
      (table.uniqueConstraints ?? [])
        .filter(u => u.columns.length === 1)
        .map(u => u.columns[0].toLowerCase())
    );

    for (const col of table.columns) {
      let def = `    ${col.name} ${col.type.toUpperCase()}`;
      if (col.nn || col.pk) def += ` NOT NULL`;
      if (col.unique && !col.pk && !namedSingleUniqueCols.has(col.name.toLowerCase())) {
        def += ` UNIQUE`;
      }
      if (col.defaultValue && col.defaultValue.trim().length > 0) {
        def += ` DEFAULT ${col.defaultValue.trim()}`;
      }
      colDefs.push(def);
      if (col.pk) pkCols.push(col.name);
    }

    if (pkCols.length > 0) {
      colDefs.push(`    CONSTRAINT pk_${table.name} PRIMARY KEY (${pkCols.join(', ')})`);
    }

    for (const uq of table.uniqueConstraints ?? []) {
      const cols = uq.columns.map(c => c.trim()).filter(Boolean);
      if (cols.length > 0) {
        const uqName = (uq.name || `uq_${table.name}_${cols.join('_')}`).trim();
        colDefs.push(`    CONSTRAINT ${uqName} UNIQUE (${cols.join(', ')})`);
      }
    }

    for (const ck of table.checks ?? []) {
      const expr = (ck.expression || '').trim();
      if (expr) {
        const ckName = (ck.name || `ck_${table.name}`).trim();
        colDefs.push(`    CONSTRAINT ${ckName} CHECK (${expr})`);
      }
    }

    lines.push(colDefs.join(',\n'));
    lines.push(`);`);

    if (table.comment && table.comment.trim()) {
      lines.push(
        `COMMENT ON TABLE ${table.schema}.${table.name} IS '${table.comment.replace(/'/g, "''")}';`
      );
    }

    for (const col of table.columns) {
      if (col.comment && col.comment.trim()) {
        lines.push(
          `COMMENT ON COLUMN ${table.schema}.${table.name}.${col.name} IS '${col.comment.replace(/'/g, "''")}';`
        );
      }
    }

    lines.push(``);
  }

  // Foreign Keys & Indexes
  const fkStatements: string[] = [];
  const idxStatements: string[] = [];

  for (const table of project.tables) {
    for (const col of table.columns) {
      if (!col.fk) continue;
      const targetTable = project.tables.find(t => t.id === col.fk!.targetTableId);
      if (!targetTable) continue;
      const targetCol =
        targetTable.columns.find(c => c.id === col.fk!.targetColId) ||
        targetTable.columns.find(c => c.pk) ||
        targetTable.columns[0];
      if (!targetCol) continue;

      const constraintName = col.fk.name?.trim() || `fk_${table.name}_${col.name}`;
      fkStatements.push(
        `ALTER TABLE ${table.schema}.${table.name}\n` +
          `    ADD CONSTRAINT ${constraintName}\n` +
          `    FOREIGN KEY (${col.name})\n` +
          `    REFERENCES ${targetTable.schema}.${targetTable.name} (${targetCol.name})\n` +
          `    ON DELETE ${col.fk.onDelete} ON UPDATE ${col.fk.onUpdate};`
      );

      // Automatic index on FK column for PostgreSQL join performance
      if (!col.pk) {
        idxStatements.push(
          `CREATE INDEX IF NOT EXISTS idx_${table.name}_${col.name} ON ${table.schema}.${table.name} (${col.name});`
        );
      }
    }
  }

  // Explicit Table Indexes
  const customIdxStatements: string[] = [];
  for (const table of project.tables) {
    for (const idx of table.indexes ?? []) {
      const cols = idx.columns.map(c => c.trim()).filter(Boolean);
      if (cols.length === 0) continue;
      const uniqueKw = idx.unique ? 'UNIQUE ' : '';
      const methodClause = idx.method && idx.method !== 'btree' ? ` USING ${idx.method}` : '';
      const whereClause = idx.where && idx.where.trim() ? ` WHERE ${idx.where.trim()}` : '';
      const idxName = (idx.name || `idx_${table.name}_${cols.join('_')}`).trim();
      customIdxStatements.push(
        `CREATE ${uniqueKw}INDEX IF NOT EXISTS ${idxName} ON ${table.schema}.${table.name}${methodClause} (${cols.join(', ')})${whereClause};`
      );
    }
  }

  if (fkStatements.length > 0) {
    lines.push(`-- Foreign Key Constraints`);
    lines.push(fkStatements.join('\n\n'));
    lines.push(``);
  }

  if (idxStatements.length > 0) {
    lines.push(`-- Performance Indexes for Foreign Keys`);
    lines.push(idxStatements.join('\n'));
    lines.push(``);
  }

  if (customIdxStatements.length > 0) {
    lines.push(`-- Custom Table Indexes`);
    lines.push(customIdxStatements.join('\n'));
    lines.push(``);
  }

  // Initial Seed Data (ordered topologically: parent tables before child tables)
  const seedTables = sortTablesTopologically(
    project.tables.filter(t => t.initialData && t.initialData.rows.length > 0)
  );

  if (seedTables.length > 0) {
    lines.push(`-- Initial Seed Data`);
    for (const table of seedTables) {
      const seed = table.initialData!;
      const colsList = seed.columns.join(', ');
      lines.push(`-- Seed: ${table.schema}.${table.name} (${seed.rows.length} rows)`);
      for (const row of seed.rows) {
        const formattedValues = seed.columns.map((colName, idx) => {
          const rawVal = row[idx] ?? '';
          const colDef = table.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
          return formatSqlSeedValue(rawVal, colDef?.type);
        });
        lines.push(
          `INSERT INTO ${table.schema}.${table.name} (${colsList}) VALUES (${formattedValues.join(', ')}) ON CONFLICT DO NOTHING;`
        );
      }
      lines.push(``);
    }
  }

  lines.push(`COMMIT;`);
  return lines.join('\n');
}

function sortTablesTopologically(tables: ErTable[]): ErTable[] {
  const depthMap = new Map<string, number>();
  tables.forEach(t => depthMap.set(t.id, 0));

  for (let pass = 0; pass < tables.length; pass++) {
    for (const t of tables) {
      for (const col of t.columns) {
        if (col.fk && col.fk.targetTableId !== t.id && depthMap.has(col.fk.targetTableId)) {
          const parentDepth = depthMap.get(col.fk.targetTableId) ?? 0;
          const currentDepth = depthMap.get(t.id) ?? 0;
          if (parentDepth + 1 > currentDepth) {
            depthMap.set(t.id, parentDepth + 1);
          }
        }
      }
    }
  }

  return [...tables].sort((a, b) => (depthMap.get(a.id) ?? 0) - (depthMap.get(b.id) ?? 0));
}

function formatSqlSeedValue(rawVal: string, pgType?: string): string {
  const val = rawVal.trim();
  if (!val || val.toUpperCase() === 'NULL' || val === '\\N') {
    return 'NULL';
  }
  if (val.toUpperCase() === 'DEFAULT') {
    return 'DEFAULT';
  }
  const t = (pgType || '').toLowerCase();
  if (
    (['serial', 'bigserial', 'integer', 'bigint', 'smallint'].includes(t) ||
      t.startsWith('numeric') ||
      t.startsWith('decimal')) &&
    /^-?\d+(\.\d+)?$/.test(val)
  ) {
    return val;
  }
  if ((t === 'boolean' || t === 'bool') && /^(true|false)$/i.test(val)) {
    return val.toLowerCase();
  }
  return `'${val.replace(/'/g, "''")}'`;
}

/**
 * 2. C# (.NET 8 / EF Core) Entity Generator
 */
function mapPgToCSharp(pgType: string, isRequired: boolean): { csType: string; initializer: string } {
  const base = pgType.toLowerCase().trim();
  let csType = 'string';
  let isRef = true;

  if (base === 'serial' || base === 'integer') {
    csType = 'int';
    isRef = false;
  } else if (base === 'smallint') {
    csType = 'short';
    isRef = false;
  } else if (base === 'bigserial' || base === 'bigint') {
    csType = 'long';
    isRef = false;
  } else if (base.startsWith('numeric') || base.startsWith('decimal')) {
    csType = 'decimal';
    isRef = false;
  } else if (base === 'boolean' || base === 'bool') {
    csType = 'bool';
    isRef = false;
  } else if (base === 'date') {
    csType = 'DateOnly';
    isRef = false;
  } else if (base.startsWith('timestamp')) {
    csType = 'DateTimeOffset';
    isRef = false;
  } else if (base === 'uuid') {
    csType = 'Guid';
    isRef = false;
  } else if (base === 'jsonb' || base === 'json') {
    csType = 'string';
    isRef = true;
  }

  if (!isRequired) {
    return { csType: `${csType}?`, initializer: '' };
  }

  return {
    csType,
    initializer: isRef ? ' = string.Empty;' : '',
  };
}

export function generateCSharpTableEntity(table: ErTable, project: ErProject): string {
  const className = toPascalCase(singularize(table.name));
  const useAnnotations = project.useEfDataAnnotations;
  const keyword = project.useCSharpRecords ? 'public record' : 'public class';

  const lines: string[] = [
    `// Auto-generated by pgLite Studio (.NET 8 / EF Core)`,
    `using System;`,
    `using System.Collections.Generic;`,
  ];

  if (useAnnotations) {
    lines.push(`using System.ComponentModel.DataAnnotations;`);
    lines.push(`using System.ComponentModel.DataAnnotations.Schema;`);
  }

  lines.push(``);
  lines.push(`namespace ${project.csharpNamespace || 'App.Domain.Entities'};`);
  lines.push(``);

  if (table.comment) {
    lines.push(`/// <summary>`);
    lines.push(`/// ${table.comment}`);
    lines.push(`/// </summary>`);
  }
  if (useAnnotations) {
    lines.push(`[Table("${table.name}", Schema = "${table.schema}")]`);
  }
  lines.push(`${keyword} ${className}`);
  lines.push(`{`);

  for (const col of table.columns) {
    const isRequired = col.nn || col.pk;
    const propName = toPascalCase(col.name);
    const { csType, initializer } = mapPgToCSharp(col.type, isRequired);

    if (col.comment) {
      lines.push(`    /// <summary>${col.comment}</summary>`);
    }
    if (useAnnotations) {
      if (col.pk) lines.push(`    [Key]`);
      if (isRequired && csType === 'string') lines.push(`    [Required]`);
      const varcharMatch = col.type.match(/varchar\((\d+)\)/i);
      if (varcharMatch) {
        lines.push(`    [MaxLength(${varcharMatch[1]})]`);
      }
      if (col.type.toLowerCase() === 'jsonb') {
        lines.push(`    [Column("${col.name}", TypeName = "jsonb")]`);
      } else {
        lines.push(`    [Column("${col.name}")]`);
      }
    }
    lines.push(`    public ${csType} ${propName} { get; set; }${initializer}`);
    lines.push(``);
  }

  // Many-to-One navigation properties
  for (const col of table.columns) {
    if (!col.fk) continue;
    const targetTable = project.tables.find(t => t.id === col.fk!.targetTableId);
    if (!targetTable) continue;
    const targetClass = toPascalCase(singularize(targetTable.name));
    const fkProp = toPascalCase(col.name);
    const navName =
      targetClass === fkProp ? `${targetClass}Navigation` : targetClass;

    if (useAnnotations) {
      lines.push(`    [ForeignKey(nameof(${fkProp}))]`);
    }
    lines.push(`    public virtual ${targetClass}? ${navName} { get; set; }`);
    lines.push(``);
  }

  // One-to-Many reverse navigation collections
  for (const other of project.tables) {
    for (const col of other.columns) {
      if (col.fk && col.fk.targetTableId === table.id) {
        const childClass = toPascalCase(singularize(other.name));
        const collectionProp = toPascalCase(other.name);
        lines.push(
          `    public virtual ICollection<${childClass}> ${collectionProp} { get; set; } = new List<${childClass}>();`
        );
      }
    }
  }

  if (lines[lines.length - 1] === '') lines.pop();
  lines.push(`}`);

  return lines.join('\n');
}

export function generateCSharpBundle(project: ErProject): string {
  return project.tables.map(t => generateCSharpTableEntity(t, project)).join('\n\n// ----------------------------------------------------------------------------\n\n');
}

/**
 * 3. Angular TypeScript Interfaces & DTO Generator
 */
function mapPgToTypeScript(pgType: string): string {
  const base = pgType.toLowerCase().trim();
  if (
    ['serial', 'bigserial', 'integer', 'bigint', 'smallint'].includes(base) ||
    base.startsWith('numeric') ||
    base.startsWith('decimal')
  ) {
    return 'number';
  }
  if (base === 'boolean' || base === 'bool') return 'boolean';
  if (base === 'jsonb' || base === 'json') return 'Record<string, unknown>';
  return 'string';
}

export function generateAngularTableModel(table: ErTable, project: ErProject): string {
  const interfaceName = toPascalCase(singularize(table.name));
  const lines: string[] = [];

  if (table.comment) {
    lines.push(`/** ${table.comment} (${table.schema}.${table.name}) */`);
  } else {
    lines.push(`/** Modelo Angular para ${table.schema}.${table.name} */`);
  }

  lines.push(`export interface ${interfaceName} {`);

  for (const col of table.columns) {
    const isRequired = col.nn || col.pk;
    const propName = toCamelCase(col.name);
    const tsType = mapPgToTypeScript(col.type);
    const opt = isRequired ? '' : '?';
    const nullable = isRequired ? '' : ' | null';
    lines.push(`  ${propName}${opt}: ${tsType}${nullable};`);
  }

  // Relations (Many-to-One)
  for (const col of table.columns) {
    if (!col.fk) continue;
    const targetTable = project.tables.find(t => t.id === col.fk!.targetTableId);
    if (!targetTable) continue;
    const targetInterface = toPascalCase(singularize(targetTable.name));
    const navProp = toCamelCase(singularize(targetTable.name));
    lines.push(`  ${navProp}?: ${targetInterface} | null;`);
  }

  // Reverse Collections (One-to-Many)
  for (const other of project.tables) {
    for (const col of other.columns) {
      if (col.fk && col.fk.targetTableId === table.id) {
        const childInterface = toPascalCase(singularize(other.name));
        const collProp = toCamelCase(other.name);
        lines.push(`  ${collProp}?: ${childInterface}[];`);
      }
    }
  }

  lines.push(`}`);

  // Also generate Create/Update Payload DTO helper
  const pkProplist = table.columns
    .filter(c => c.pk)
    .map(c => `'${toCamelCase(c.name)}'`)
    .join(' | ');

  if (pkProplist) {
    lines.push(``);
    lines.push(`export type Create${interfaceName}Dto = Omit<${interfaceName}, ${pkProplist}>;`);
    lines.push(`export type Update${interfaceName}Dto = Partial<Create${interfaceName}Dto>;`);
  }

  return lines.join('\n');
}

export function generateAngularBundle(project: ErProject): string {
  const header = `// Auto-generated by pgLite Studio (Angular TypeScript Interfaces & DTOs)\n\n`;
  return header + project.tables.map(t => generateAngularTableModel(t, project)).join('\n\n');
}

/**
 * Collect all generated files for individual tabs or .zip bundle download
 */
export function buildGeneratedFilesList(project: ErProject): GeneratedFile[] {
  const files: GeneratedFile[] = [
    {
      filename: 'schema.sql',
      folder: 'sql',
      language: 'sql',
      content: generatePostgreSqlDdl(project),
    },
  ];

  for (const table of project.tables) {
    const pascal = toPascalCase(singularize(table.name));
    const kebab = toKebabCase(singularize(table.name));

    files.push({
      filename: `${pascal}.cs`,
      folder: 'csharp',
      language: 'csharp',
      content: generateCSharpTableEntity(table, project),
    });

    files.push({
      filename: `${kebab}.model.ts`,
      folder: 'angular',
      language: 'typescript',
      content: generateAngularTableModel(table, project),
    });
  }

  return files;
}

/**
 * 4. Reverse Engineering Parser: SQL DDL -> ErTable[]
 * Parses CREATE TABLE and ALTER TABLE ... FOREIGN KEY statements
 */
export function parsePostgreSqlToTables(sql: string): ErTable[] {
  const cleaned = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const tables: ErTable[] = [];
  const createRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:([a-zA-Z0-9_"]+)\.)?([a-zA-Z0-9_"]+)\s*\(([\s\S]*?)\);/gi;

  const pendingFks: {
    sourceTableName: string;
    sourceColName: string;
    targetTableName: string;
    targetColName: string;
  }[] = [];

  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = createRegex.exec(cleaned)) !== null) {
    const schema = (match[1] || 'public').replace(/"/g, '').trim();
    const tableName = match[2].replace(/"/g, '').trim();
    const body = match[3];

    // Split top-level commas ignoring commas inside numeric(10,2)
    const lines: string[] = [];
    let current = '';
    let depth = 0;
    for (const ch of body) {
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        lines.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) lines.push(current.trim());

    const columns: ErColumn[] = [];
    const tableLevelPks = new Set<string>();
    const uniqueConstraints: ErUniqueConstraint[] = [];
    const checks: ErCheckConstraint[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Table-level PRIMARY KEY
      const pkConstraint = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (
        pkConstraint &&
        (/^(CONSTRAINT|PRIMARY\s+KEY)/i.test(line))
      ) {
        pkConstraint[1]
          .split(',')
          .map(s => s.replace(/"/g, '').trim())
          .forEach(colName => tableLevelPks.add(colName));
        continue;
      }

      // Table-level FOREIGN KEY
      const fkConstraint = line.match(
        /FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:[a-zA-Z0-9_"]+\.)?([a-zA-Z0-9_"]+)\s*\(([^)]+)\)/i
      );
      if (fkConstraint && /^(CONSTRAINT|FOREIGN\s+KEY)/i.test(line)) {
        pendingFks.push({
          sourceTableName: tableName,
          sourceColName: fkConstraint[1].replace(/"/g, '').trim(),
          targetTableName: fkConstraint[2].replace(/"/g, '').trim(),
          targetColName: fkConstraint[3].replace(/"/g, '').trim(),
        });
        continue;
      }

      // Table-level UNIQUE constraint
      const uqConstraint = line.match(
        /^(?:CONSTRAINT\s+"?([a-zA-Z0-9_]+)"?\s+)?UNIQUE\s*\(([^)]+)\)/i
      );
      if (uqConstraint) {
        const uqCols = uqConstraint[2]
          .split(',')
          .map(s => s.replace(/"/g, '').trim())
          .filter(Boolean);
        if (uqCols.length > 0) {
          uniqueConstraints.push({
            id: `sql_uq_${index}_${uniqueConstraints.length}_${Date.now()}`,
            name: uqConstraint[1] || `uq_${tableName}_${uqCols.join('_')}`,
            columns: uqCols,
          });
        }
        continue;
      }

      // Table-level CHECK constraint
      const ckConstraint = line.match(
        /^(?:CONSTRAINT\s+"?([a-zA-Z0-9_]+)"?\s+)?CHECK\s*\(([\s\S]+)\)\s*$/i
      );
      if (ckConstraint) {
        checks.push({
          id: `sql_ck_${index}_${checks.length}_${Date.now()}`,
          name: ckConstraint[1] || `ck_${tableName}_${checks.length + 1}`,
          expression: ckConstraint[2].trim(),
        });
        continue;
      }

      if (/^(CONSTRAINT|UNIQUE|CHECK)\b/i.test(line)) {
        continue;
      }

      // Column definition
      const colMatch = line.match(/^"?([a-zA-Z0-9_]+)"?\s+([a-zA-Z0-9_]+(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)([\s\S]*)$/);
      if (!colMatch) continue;

      const colName = colMatch[1].trim();
      const colType = colMatch[2].replace(/\s+/g, '').toLowerCase();
      const rest = colMatch[3] || '';

      const isPk = /\bPRIMARY\s+KEY\b/i.test(rest);
      const isNn = isPk || /\bNOT\s+NULL\b/i.test(rest);
      const isUnique = /\bUNIQUE\b/i.test(rest);

      const inlineFk = rest.match(
        /REFERENCES\s+(?:[a-zA-Z0-9_"]+\.)?([a-zA-Z0-9_"]+)\s*(?:\(([^)]+)\))?/i
      );
      if (inlineFk) {
        pendingFks.push({
          sourceTableName: tableName,
          sourceColName: colName,
          targetTableName: inlineFk[1].replace(/"/g, '').trim(),
          targetColName: (inlineFk[2] || 'id').replace(/"/g, '').trim(),
        });
      }

      columns.push({
        id: `col_${index}_${columns.length}_${Date.now()}`,
        name: colName,
        type: colType,
        pk: isPk,
        nn: isNn,
        unique: isUnique,
        fk: null,
      });
    }

    for (const col of columns) {
      if (tableLevelPks.has(col.name)) {
        col.pk = true;
        col.nn = true;
      }
    }

    const colNum = index % 3;
    const rowNum = Math.floor(index / 3);

    tables.push({
      id: `tbl_${index}_${Date.now()}`,
      schema,
      name: tableName,
      color: TABLE_COLORS[index % TABLE_COLORS.length].hex,
      x: 60 + colNum * 330,
      y: 60 + rowNum * 270,
      columns,
      uniqueConstraints: uniqueConstraints.length > 0 ? uniqueConstraints : undefined,
      checks: checks.length > 0 ? checks : undefined,
    });

    index++;
  }

  // Parse CREATE [UNIQUE] INDEX statements
  const idxRegex =
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z0-9_]+)"?\s+ON\s+(?:[a-zA-Z0-9_"]+\.)?"?([a-zA-Z0-9_]+)"?(?:\s+USING\s+([a-zA-Z]+))?\s*\(([^)]+)\)(?:\s+WHERE\s+([^;]+))?;/gi;
  const validMethods = new Set<ErIndexMethod>(['btree', 'hash', 'gin', 'gist', 'brin']);

  while ((match = idxRegex.exec(cleaned)) !== null) {
    const isUnique = Boolean(match[1]);
    const idxName = match[2].trim();
    const tblName = match[3].trim();
    const rawMethod = (match[4] || 'btree').toLowerCase();
    const idxCols = match[5]
      .split(',')
      .map(s => s.replace(/"/g, '').trim())
      .filter(Boolean);
    const whereClause = match[6]?.trim() || undefined;

    const targetTable = tables.find(t => t.name.toLowerCase() === tblName.toLowerCase());
    if (targetTable && idxCols.length > 0) {
      const idxObj: ErIndex = {
        id: `sql_idx_${(targetTable.indexes?.length || 0) + 1}_${Date.now()}`,
        name: idxName,
        columns: idxCols,
        unique: isUnique,
        method: validMethods.has(rawMethod as ErIndexMethod)
          ? (rawMethod as ErIndexMethod)
          : 'btree',
        where: whereClause,
      };
      targetTable.indexes = [...(targetTable.indexes ?? []), idxObj];
    }
  }

  // Parse standalone ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY
  const alterRegex =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:[a-zA-Z0-9_"]+\.)?([a-zA-Z0-9_"]+)\s+ADD\s+(?:CONSTRAINT\s+[a-zA-Z0-9_"]+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:[a-zA-Z0-9_"]+\.)?([a-zA-Z0-9_"]+)\s*\(([^)]+)\)/gi;

  while ((match = alterRegex.exec(cleaned)) !== null) {
    pendingFks.push({
      sourceTableName: match[1].replace(/"/g, '').trim(),
      sourceColName: match[2].replace(/"/g, '').trim(),
      targetTableName: match[3].replace(/"/g, '').trim(),
      targetColName: match[4].replace(/"/g, '').trim(),
    });
  }

  // Wire up resolved FKs
  for (const fk of pendingFks) {
    const srcTable = tables.find(t => t.name.toLowerCase() === fk.sourceTableName.toLowerCase());
    const tgtTable = tables.find(t => t.name.toLowerCase() === fk.targetTableName.toLowerCase());
    if (!srcTable || !tgtTable) continue;

    const srcCol = srcTable.columns.find(c => c.name.toLowerCase() === fk.sourceColName.toLowerCase());
    const tgtCol =
      tgtTable.columns.find(c => c.name.toLowerCase() === fk.targetColName.toLowerCase()) ||
      tgtTable.columns.find(c => c.pk) ||
      tgtTable.columns[0];

    if (srcCol && tgtCol) {
      srcCol.fk = {
        targetTableId: tgtTable.id,
        targetColId: tgtCol.id,
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      };
    }
  }

  return tables;
}
