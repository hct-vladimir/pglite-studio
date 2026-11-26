export type PgDataType =
  | 'serial'
  | 'bigserial'
  | 'integer'
  | 'bigint'
  | 'smallint'
  | 'uuid'
  | 'varchar(50)'
  | 'varchar(120)'
  | 'varchar(255)'
  | 'text'
  | 'numeric(10,2)'
  | 'numeric(14,4)'
  | 'boolean'
  | 'date'
  | 'timestamptz'
  | 'jsonb';

export type ReferentialAction = 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'NO ACTION';

export interface ForeignKeyRef {
  targetTableId: string;
  targetColId: string;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

export interface ErColumn {
  id: string;
  name: string;
  type: PgDataType | string;
  pk: boolean;
  nn: boolean;
  unique: boolean;
  defaultValue?: string;
  comment?: string;
  fk: ForeignKeyRef | null;
}

export interface ErIndex {
  id: string;
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ErInitialData {
  columns: string[];
  rows: string[][];
}

export interface ErTable {
  id: string;
  schema: string;
  name: string;
  color: string;
  comment?: string;
  x: number;
  y: number;
  columns: ErColumn[];
  indexes?: ErIndex[];
  initialData?: ErInitialData;
}

export interface ErProject {
  version: string;
  name: string;
  defaultSchema: string;
  csharpNamespace: string;
  useEfDataAnnotations: boolean;
  useCSharpRecords: boolean;
  prependedSql?: string;
  tables: ErTable[];
}

export interface GeneratedFile {
  filename: string;
  folder: 'sql' | 'csharp' | 'angular';
  language: 'sql' | 'csharp' | 'typescript';
  content: string;
}

export const PG_DATA_TYPES: string[] = [
  'uuid',
  'serial',
  'bigserial',
  'integer',
  'bigint',
  'smallint',
  'varchar(50)',
  'varchar(120)',
  'varchar(255)',
  'text',
  'numeric(10,2)',
  'numeric(14,4)',
  'boolean',
  'date',
  'timestamptz',
  'jsonb',
];

export const TABLE_COLORS: { name: string; hex: string }[] = [
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Teal Emerald', hex: '#0d9488' },
  { name: 'Violet Purple', hex: '#7c3aed' },
  { name: 'Crimson Rose', hex: '#e11d48' },
  { name: 'Amber Gold', hex: '#d97706' },
  { name: 'Cyan Sky', hex: '#0284c7' },
  { name: 'Indigo Slate', hex: '#4f46e5' },
  { name: 'Forest Green', hex: '#16a34a' },
];
