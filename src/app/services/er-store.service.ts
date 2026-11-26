import { Injectable, computed, effect, signal } from '@angular/core';
import {
  ErCheckConstraint,
  ErColumn,
  ErIndex,
  ErInitialData,
  ErProject,
  ErTable,
  ErUniqueConstraint,
  GeneratedFile,
  ReferentialAction,
  TABLE_COLORS,
} from '../models/er.models';
import {
  buildGeneratedFilesList,
  generateAngularBundle,
  generateCSharpBundle,
  generatePostgreSqlDdl,
  parsePostgreSqlToTables,
  singularize,
} from '../utils/code-generators';
import { DbmImportResult, parsePgModelerDbm } from '../utils/dbm-importer';

const STORAGE_KEY = 'pglite_studio_project_v1';

export const TEMPLATES: Record<'saas' | 'ecommerce' | 'clinic', ErProject> = {
  saas: {
    version: '1.0.0',
    name: 'SaaS Multi-Tenant Platform',
    defaultSchema: 'core',
    csharpNamespace: 'SaaS.Domain.Entities',
    useEfDataAnnotations: true,
    useCSharpRecords: false,
    tables: [
      {
        id: 't_organizations',
        schema: 'core',
        name: 'organizations',
        color: '#2563eb',
        comment: 'Empresas o tenants suscritos a la plataforma SaaS',
        x: 60,
        y: 60,
        columns: [
          { id: 'c_org_id', name: 'id', type: 'uuid', pk: true, nn: true, unique: true, defaultValue: 'gen_random_uuid()', fk: null },
          { id: 'c_org_name', name: 'nombre', type: 'varchar(120)', pk: false, nn: true, unique: false, fk: null },
          { id: 'c_org_slug', name: 'slug', type: 'varchar(50)', pk: false, nn: true, unique: true, fk: null },
          { id: 'c_org_plan', name: 'plan_tier', type: 'varchar(50)', pk: false, nn: true, unique: false, defaultValue: "'pro'", fk: null },
          { id: 'c_org_active', name: 'activo', type: 'boolean', pk: false, nn: true, unique: false, defaultValue: 'true', fk: null },
          { id: 'c_org_created', name: 'creado_en', type: 'timestamptz', pk: false, nn: true, unique: false, defaultValue: 'now()', fk: null },
        ],
      },
      {
        id: 't_users',
        schema: 'core',
        name: 'usuarios',
        color: '#0d9488',
        comment: 'Usuarios pertenecientes a una organización',
        x: 420,
        y: 50,
        columns: [
          { id: 'c_usr_id', name: 'id', type: 'uuid', pk: true, nn: true, unique: true, defaultValue: 'gen_random_uuid()', fk: null },
          {
            id: 'c_usr_org',
            name: 'organization_id',
            type: 'uuid',
            pk: false,
            nn: true,
            unique: false,
            fk: { targetTableId: 't_organizations', targetColId: 'c_org_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
          },
          { id: 'c_usr_email', name: 'email', type: 'varchar(120)', pk: false, nn: true, unique: true, fk: null },
          { id: 'c_usr_nombre', name: 'nombre_completo', type: 'varchar(120)', pk: false, nn: true, unique: false, fk: null },
          { id: 'c_usr_rol', name: 'rol', type: 'varchar(50)', pk: false, nn: true, unique: false, defaultValue: "'admin'", fk: null },
          { id: 'c_usr_last', name: 'ultimo_acceso', type: 'timestamptz', pk: false, nn: false, unique: false, fk: null },
        ],
      },
      {
        id: 't_subscriptions',
        schema: 'billing',
        name: 'suscripciones',
        color: '#7c3aed',
        comment: 'Suscripciones recurrentes y estado de facturación',
        x: 60,
        y: 350,
        columns: [
          { id: 'c_sub_id', name: 'id', type: 'serial', pk: true, nn: true, unique: true, fk: null },
          {
            id: 'c_sub_org',
            name: 'organization_id',
            type: 'uuid',
            pk: false,
            nn: true,
            unique: false,
            fk: { targetTableId: 't_organizations', targetColId: 'c_org_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
          },
          { id: 'c_sub_mrr', name: 'monto_mensual', type: 'numeric(10,2)', pk: false, nn: true, unique: false, fk: null },
          { id: 'c_sub_status', name: 'estado', type: 'varchar(50)', pk: false, nn: true, unique: false, defaultValue: "'active'", fk: null },
          { id: 'c_sub_renews', name: 'proxima_renovacion', type: 'date', pk: false, nn: true, unique: false, fk: null },
        ],
      },
      {
        id: 't_invoices',
        schema: 'billing',
        name: 'facturas',
        color: '#e11d48',
        comment: 'Facturas emitidas por cada período de suscripción',
        x: 420,
        y: 340,
        columns: [
          { id: 'c_inv_id', name: 'id', type: 'bigserial', pk: true, nn: true, unique: true, fk: null },
          {
            id: 'c_inv_sub',
            name: 'suscripcion_id',
            type: 'integer',
            pk: false,
            nn: true,
            unique: false,
            fk: { targetTableId: 't_subscriptions', targetColId: 'c_sub_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
          },
          {
            id: 'c_inv_usr',
            name: 'emitido_por_id',
            type: 'uuid',
            pk: false,
            nn: false,
            unique: false,
            fk: { targetTableId: 't_users', targetColId: 'c_usr_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' },
          },
          { id: 'c_inv_total', name: 'total_usd', type: 'numeric(10,2)', pk: false, nn: true, unique: false, fk: null },
          { id: 'c_inv_paid', name: 'pagada', type: 'boolean', pk: false, nn: true, unique: false, defaultValue: 'false', fk: null },
          { id: 'c_inv_meta', name: 'metadata', type: 'jsonb', pk: false, nn: false, unique: false, fk: null },
        ],
      },
    ],
  },
  ecommerce: {
    version: '1.0.0',
    name: 'E-Commerce Order Engine',
    defaultSchema: 'shop',
    csharpNamespace: 'Commerce.Domain.Entities',
    useEfDataAnnotations: true,
    useCSharpRecords: false,
    tables: [
      {
        id: 't_clientes',
        schema: 'shop',
        name: 'clientes',
        color: '#2563eb',
        comment: 'Clientes registrados en la tienda',
        x: 60,
        y: 70,
        columns: [
          { id: 'ec_c1', name: 'id', type: 'serial', pk: true, nn: true, unique: true, fk: null },
          { id: 'ec_c2', name: 'email', type: 'varchar(120)', pk: false, nn: true, unique: true, fk: null },
          { id: 'ec_c3', name: 'nombre', type: 'varchar(120)', pk: false, nn: true, unique: false, fk: null },
          { id: 'ec_c4', name: 'telefono', type: 'varchar(50)', pk: false, nn: false, unique: false, fk: null },
        ],
      },
      {
        id: 't_productos',
        schema: 'shop',
        name: 'productos',
        color: '#d97706',
        comment: 'Catálogo maestro de productos e inventario',
        x: 60,
        y: 330,
        columns: [
          { id: 'ec_p1', name: 'id', type: 'serial', pk: true, nn: true, unique: true, fk: null },
          { id: 'ec_p2', name: 'sku', type: 'varchar(50)', pk: false, nn: true, unique: true, fk: null },
          { id: 'ec_p3', name: 'titulo', type: 'varchar(120)', pk: false, nn: true, unique: false, fk: null },
          { id: 'ec_p4', name: 'precio_unitario', type: 'numeric(10,2)', pk: false, nn: true, unique: false, fk: null },
          { id: 'ec_p5', name: 'stock', type: 'integer', pk: false, nn: true, unique: false, defaultValue: '0', fk: null },
        ],
      },
      {
        id: 't_pedidos',
        schema: 'shop',
        name: 'pedidos',
        color: '#0d9488',
        comment: 'Órdenes de compra confirmadas',
        x: 410,
        y: 70,
        columns: [
          { id: 'ec_o1', name: 'id', type: 'bigserial', pk: true, nn: true, unique: true, fk: null },
          {
            id: 'ec_o2',
            name: 'cliente_id',
            type: 'integer',
            pk: false,
            nn: true,
            unique: false,
            fk: { targetTableId: 't_clientes', targetColId: 'ec_c1', onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
          },
          { id: 'ec_o3', name: 'total', type: 'numeric(10,2)', pk: false, nn: true, unique: false, fk: null },
          { id: 'ec_o4', name: 'estado', type: 'varchar(50)', pk: false, nn: true, unique: false, defaultValue: "'pendiente'", fk: null },
          { id: 'ec_o5', name: 'fecha_pedido', type: 'timestamptz', pk: false, nn: true, unique: false, defaultValue: 'now()', fk: null },
        ],
      },
      {
        id: 't_pedido_items',
        schema: 'shop',
        name: 'pedido_items',
        color: '#7c3aed',
        comment: 'Líneas de detalle por cada pedido',
        x: 410,
        y: 330,
        columns: [
          { id: 'ec_i1', name: 'id', type: 'bigserial', pk: true, nn: true, unique: true, fk: null },
          {
            id: 'ec_i2',
            name: 'pedido_id',
            type: 'bigint',
            pk: false,
            nn: true,
            unique: false,
            fk: { targetTableId: 't_pedidos', targetColId: 'ec_o1', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
          },
          {
            id: 'ec_i3',
            name: 'producto_id',
            type: 'integer',
            pk: false,
            nn: true,
            unique: false,
            fk: { targetTableId: 't_productos', targetColId: 'ec_p1', onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
          },
          { id: 'ec_i4', name: 'cantidad', type: 'integer', pk: false, nn: true, unique: false, defaultValue: '1', fk: null },
          { id: 'ec_i5', name: 'subtotal', type: 'numeric(10,2)', pk: false, nn: true, unique: false, fk: null },
        ],
      },
    ],
  },
  clinic: {
    version: '1.0.0',
    name: 'Clinical HIS & Medical Appointments',
    defaultSchema: 'med',
    csharpNamespace: 'Clinic.Domain.Entities',
    useEfDataAnnotations: true,
    useCSharpRecords: false,
    tables: [
      {
        id: 't_pacientes',
        schema: 'med',
        name: 'pacientes',
        color: '#0284c7',
        comment: 'Expediente maestro de pacientes',
        x: 60,
        y: 80,
        columns: [
          { id: 'md_p1', name: 'id', type: 'uuid', pk: true, nn: true, unique: true, defaultValue: 'gen_random_uuid()', fk: null },
          { id: 'md_p2', name: 'documento_identidad', type: 'varchar(50)', pk: false, nn: true, unique: true, fk: null },
          { id: 'md_p3', name: 'nombre_completo', type: 'varchar(120)', pk: false, nn: true, unique: false, fk: null },
          { id: 'md_p4', name: 'fecha_nacimiento', type: 'date', pk: false, nn: true, unique: false, fk: null },
        ],
      },
      {
        id: 't_medicos',
        schema: 'med',
        name: 'medicos',
        color: '#16a34a',
        comment: 'Especialistas habilitados para consulta',
        x: 60,
        y: 330,
        columns: [
          { id: 'md_m1', name: 'id', type: 'serial', pk: true, nn: true, unique: true, fk: null },
          { id: 'md_m2', name: 'matricula', type: 'varchar(50)', pk: false, nn: true, unique: true, fk: null },
          { id: 'md_m3', name: 'nombre', type: 'varchar(120)', pk: false, nn: true, unique: false, fk: null },
          { id: 'md_m4', name: 'especialidad', type: 'varchar(120)', pk: false, nn: true, unique: false, fk: null },
        ],
      },
      {
        id: 't_citas',
        schema: 'med',
        name: 'citas_medicas',
        color: '#7c3aed',
        comment: 'Agenda de consultas y evolución clínica',
        x: 420,
        y: 180,
        columns: [
          { id: 'md_c1', name: 'id', type: 'bigserial', pk: true, nn: true, unique: true, fk: null },
          {
            id: 'md_c2',
            name: 'paciente_id',
            type: 'uuid',
            pk: false,
            nn: true,
            unique: false,
            fk: { targetTableId: 't_pacientes', targetColId: 'md_p1', onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
          },
          {
            id: 'md_c3',
            name: 'medico_id',
            type: 'integer',
            pk: false,
            nn: true,
            unique: false,
            fk: { targetTableId: 't_medicos', targetColId: 'md_m1', onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
          },
          { id: 'md_c4', name: 'fecha_hora', type: 'timestamptz', pk: false, nn: true, unique: false, fk: null },
          { id: 'md_c5', name: 'honorarios', type: 'numeric(10,2)', pk: false, nn: true, unique: false, fk: null },
          { id: 'md_c6', name: 'diagnostico', type: 'text', pk: false, nn: false, unique: false, fk: null },
        ],
      },
    ],
  },
};

@Injectable({ providedIn: 'root' })
export class ErStoreService {
  // Primary reactive state
  readonly project = signal<ErProject>(this.loadInitialProject());
  readonly selectedTableId = signal<string | null>(this.project().tables[0]?.id ?? null);
  readonly searchQuery = signal<string>('');
  readonly isDarkMode = signal<boolean>(true);

  // Undo / Redo snapshots
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  readonly canUndo = signal<boolean>(false);
  readonly canRedo = signal<boolean>(false);

  // Derived Signals
  readonly tables = computed(() => this.project().tables);

  readonly filteredTables = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.tables();
    return this.tables().filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        t.schema.toLowerCase().includes(q) ||
        t.columns.some(c => c.name.toLowerCase().includes(q))
    );
  });

  readonly selectedTable = computed(() =>
    this.tables().find(t => t.id === this.selectedTableId()) ?? null
  );

  readonly totalColumnsCount = computed(() =>
    this.tables().reduce((acc, t) => acc + t.columns.length, 0)
  );

  readonly totalRelationsCount = computed(() =>
    this.tables().reduce(
      (acc, t) => acc + t.columns.filter(c => c.fk !== null).length,
      0
    )
  );

  // Live Code Outputs (computed automatically on every change)
  readonly sqlDdlOutput = computed(() => generatePostgreSqlDdl(this.project()));
  readonly csharpBundleOutput = computed(() => generateCSharpBundle(this.project()));
  readonly angularBundleOutput = computed(() => generateAngularBundle(this.project()));
  readonly generatedFiles = computed<GeneratedFile[]>(() => buildGeneratedFilesList(this.project()));

  constructor() {
    effect(() => {
      const current = this.project();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      } catch {
        // Ignore storage quota issues
      }
    });
  }

  private loadInitialProject(): ErProject {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ErProject;
        if (parsed && Array.isArray(parsed.tables) && parsed.tables.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback to SaaS template
    }
    return structuredClone(TEMPLATES.saas);
  }

  private pushHistory(): void {
    this.undoStack.push(JSON.stringify(this.project()));
    if (this.undoStack.length > 35) this.undoStack.shift();
    this.redoStack = [];
    this.syncHistoryFlags();
  }

  private syncHistoryFlags(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.project()));
    this.project.set(JSON.parse(prev));
    this.syncHistoryFlags();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.project()));
    this.project.set(JSON.parse(next));
    this.syncHistoryFlags();
  }

  loadTemplate(key: 'saas' | 'ecommerce' | 'clinic'): void {
    this.pushHistory();
    const copy = structuredClone(TEMPLATES[key]);
    this.project.set(copy);
    this.selectedTableId.set(copy.tables[0]?.id ?? null);
  }

  loadProjectJson(projectData: ErProject): void {
    this.pushHistory();
    this.project.set(projectData);
    this.selectedTableId.set(projectData.tables[0]?.id ?? null);
  }

  updateProjectConfig(patch: Partial<Omit<ErProject, 'tables'>>): void {
    this.project.update(p => ({ ...p, ...patch }));
  }

  addTable(customX?: number, customY?: number): ErTable {
    this.pushHistory();
    const currentTables = this.tables();
    const idx = currentTables.length + 1;
    const newTable: ErTable = {
      id: `t_${Date.now()}`,
      schema: this.project().defaultSchema || 'public',
      name: `nueva_tabla_${idx}`,
      color: TABLE_COLORS[(idx - 1) % TABLE_COLORS.length].hex,
      comment: '',
      x: customX ?? 100 + ((idx * 55) % 350),
      y: customY ?? 90 + ((idx * 45) % 240),
      columns: [
        {
          id: `c_${Date.now()}_1`,
          name: 'id',
          type: 'serial',
          pk: true,
          nn: true,
          unique: true,
          fk: null,
        },
        {
          id: `c_${Date.now()}_2`,
          name: 'nombre',
          type: 'varchar(120)',
          pk: false,
          nn: true,
          unique: false,
          fk: null,
        },
        {
          id: `c_${Date.now()}_3`,
          name: 'creado_en',
          type: 'timestamptz',
          pk: false,
          nn: true,
          unique: false,
          defaultValue: 'now()',
          fk: null,
        },
      ],
    };

    this.project.update(p => ({
      ...p,
      tables: [...p.tables, newTable],
    }));
    this.selectedTableId.set(newTable.id);
    return newTable;
  }

  duplicateTable(tableId: string): void {
    const orig = this.tables().find(t => t.id === tableId);
    if (!orig) return;
    this.pushHistory();

    const copy: ErTable = {
      ...structuredClone(orig),
      id: `t_${Date.now()}`,
      name: `${orig.name}_copia`,
      x: orig.x + 40,
      y: orig.y + 40,
      columns: orig.columns.map((c, i) => ({
        ...structuredClone(c),
        id: `c_${Date.now()}_${i}`,
      })),
    };

    this.project.update(p => ({
      ...p,
      tables: [...p.tables, copy],
    }));
    this.selectedTableId.set(copy.id);
  }

  deleteTable(tableId: string): void {
    this.pushHistory();
    this.project.update(p => {
      const remaining = p.tables
        .filter(t => t.id !== tableId)
        .map(t => ({
          ...t,
          columns: t.columns.map(c =>
            c.fk && c.fk.targetTableId === tableId ? { ...c, fk: null } : c
          ),
        }));
      return { ...p, tables: remaining };
    });

    if (this.selectedTableId() === tableId) {
      this.selectedTableId.set(this.tables()[0]?.id ?? null);
    }
  }

  updateTableMeta(
    tableId: string,
    patch: Partial<Pick<ErTable, 'name' | 'schema' | 'color' | 'comment' | 'initialData'>>
  ): void {
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => (t.id === tableId ? { ...t, ...patch } : t)),
    }));
  }

  addInitialDataRow(tableId: string): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId) return t;
        const cols = t.initialData?.columns?.length
          ? t.initialData.columns
          : t.columns.map(c => c.name);
        const existingRows = t.initialData?.rows ?? [];
        const emptyRow = cols.map(() => '');
        const initialData: ErInitialData = {
          columns: [...cols],
          rows: [...existingRows, emptyRow],
        };
        return { ...t, initialData };
      }),
    }));
  }

  updateInitialDataCell(tableId: string, rowIndex: number, colIndex: number, value: string): void {
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId || !t.initialData) return t;
        const rows = t.initialData.rows.map((row, rIdx) => {
          if (rIdx !== rowIndex) return row;
          const next = [...row];
          next[colIndex] = value;
          return next;
        });
        return { ...t, initialData: { ...t.initialData, rows } };
      }),
    }));
  }

  deleteInitialDataRow(tableId: string, rowIndex: number): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId || !t.initialData) return t;
        const rows = t.initialData.rows.filter((_, idx) => idx !== rowIndex);
        return {
          ...t,
          initialData: rows.length > 0 ? { ...t.initialData, rows } : undefined,
        };
      }),
    }));
  }

  // ---- Advanced Constraints: CHECK, Composite UNIQUE, and Explicit INDEXES ----

  addCheckConstraint(tableId: string): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId) return t;
        const list = t.checks ?? [];
        const firstCol = t.columns.find(c => !c.pk)?.name || t.columns[0]?.name || 'valor';
        const next: ErCheckConstraint = {
          id: `ck_${Date.now()}`,
          name: `ck_${t.name}_${list.length + 1}`,
          expression: `${firstCol} IS NOT NULL`,
        };
        return { ...t, checks: [...list, next] };
      }),
    }));
  }

  updateCheckConstraint(
    tableId: string,
    checkId: string,
    patch: Partial<Pick<ErCheckConstraint, 'name' | 'expression'>>
  ): void {
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId || !t.checks) return t;
        return {
          ...t,
          checks: t.checks.map(c => (c.id === checkId ? { ...c, ...patch } : c)),
        };
      }),
    }));
  }

  deleteCheckConstraint(tableId: string, checkId: string): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId || !t.checks) return t;
        const next = t.checks.filter(c => c.id !== checkId);
        return { ...t, checks: next.length > 0 ? next : undefined };
      }),
    }));
  }

  addUniqueConstraint(tableId: string): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId) return t;
        const list = t.uniqueConstraints ?? [];
        const defaultCols = t.columns.filter(c => !c.pk).slice(0, 2).map(c => c.name);
        const cols = defaultCols.length > 0 ? defaultCols : [t.columns[0]?.name || 'id'];
        const next: ErUniqueConstraint = {
          id: `uq_${Date.now()}`,
          name: `uq_${t.name}_${cols.join('_')}`,
          columns: cols,
        };
        return { ...t, uniqueConstraints: [...list, next] };
      }),
    }));
  }

  updateUniqueConstraint(
    tableId: string,
    uqId: string,
    patch: Partial<Pick<ErUniqueConstraint, 'name' | 'columns'>>
  ): void {
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId || !t.uniqueConstraints) return t;
        return {
          ...t,
          uniqueConstraints: t.uniqueConstraints.map(u =>
            u.id === uqId ? { ...u, ...patch } : u
          ),
        };
      }),
    }));
  }

  deleteUniqueConstraint(tableId: string, uqId: string): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId || !t.uniqueConstraints) return t;
        const next = t.uniqueConstraints.filter(u => u.id !== uqId);
        return { ...t, uniqueConstraints: next.length > 0 ? next : undefined };
      }),
    }));
  }

  addTableIndex(tableId: string): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId) return t;
        const list = t.indexes ?? [];
        const defaultCol = t.columns.find(c => !c.pk)?.name || t.columns[0]?.name || 'id';
        const next: ErIndex = {
          id: `idx_${Date.now()}`,
          name: `idx_${t.name}_${defaultCol}`,
          columns: [defaultCol],
          unique: false,
          method: 'btree',
        };
        return { ...t, indexes: [...list, next] };
      }),
    }));
  }

  updateTableIndex(
    tableId: string,
    idxId: string,
    patch: Partial<Omit<ErIndex, 'id'>>
  ): void {
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId || !t.indexes) return t;
        return {
          ...t,
          indexes: t.indexes.map(i => (i.id === idxId ? { ...i, ...patch } : i)),
        };
      }),
    }));
  }

  deleteTableIndex(tableId: string, idxId: string): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId || !t.indexes) return t;
        const next = t.indexes.filter(i => i.id !== idxId);
        return { ...t, indexes: next.length > 0 ? next : undefined };
      }),
    }));
  }

  moveTable(tableId: string, x: number, y: number): void {
    const snappedX = Math.round(x / 12) * 12;
    const snappedY = Math.round(y / 12) * 12;
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => (t.id === tableId ? { ...t, x: snappedX, y: snappedY } : t)),
    }));
  }

  addColumn(tableId: string): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId) return t;
        const newCol: ErColumn = {
          id: `c_${Date.now()}`,
          name: `columna_${t.columns.length + 1}`,
          type: 'varchar(120)',
          pk: false,
          nn: false,
          unique: false,
          fk: null,
        };
        return { ...t, columns: [...t.columns, newCol] };
      }),
    }));
  }

  updateColumn(tableId: string, colId: string, patch: Partial<ErColumn>): void {
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          columns: t.columns.map(c => {
            if (c.id !== colId) return c;
            const updated = { ...c, ...patch };
            if (updated.pk) {
              updated.nn = true;
            }
            return updated;
          }),
        };
      }),
    }));
  }

  moveColumnOrder(tableId: string, colId: string, direction: -1 | 1): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId) return t;
        const idx = t.columns.findIndex(c => c.id === colId);
        if (idx === -1) return t;
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= t.columns.length) return t;
        const cols = [...t.columns];
        const [item] = cols.splice(idx, 1);
        cols.splice(targetIdx, 0, item);
        return { ...t, columns: cols };
      }),
    }));
  }

  deleteColumn(tableId: string, colId: string): void {
    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== tableId || t.columns.length <= 1) return t;
        return {
          ...t,
          columns: t.columns.filter(c => c.id !== colId),
        };
      }),
    }));
  }

  /**
   * Connect a Parent Table's PK column to a Child Table (either creating a new FK column or linking an existing one)
   */
  createForeignKeyRelation(params: {
    childTableId: string;
    parentTableId: string;
    parentColId?: string;
    fkColumnName?: string;
    onDelete?: ReferentialAction;
    onUpdate?: ReferentialAction;
  }): void {
    const parentTable = this.tables().find(t => t.id === params.parentTableId);
    const childTable = this.tables().find(t => t.id === params.childTableId);
    if (!parentTable || !childTable) return;

    const parentPkCol =
      parentTable.columns.find(c => c.id === params.parentColId) ||
      parentTable.columns.find(c => c.pk) ||
      parentTable.columns[0];
    if (!parentPkCol) return;

    this.pushHistory();

    // Match FK type to referenced PK type (serial -> integer, bigserial -> bigint)
    let fkType = parentPkCol.type;
    if (fkType === 'serial') fkType = 'integer';
    if (fkType === 'bigserial') fkType = 'bigint';

    const colName =
      params.fkColumnName?.trim() || `${singularize(parentTable.name)}_${parentPkCol.name}`;

    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        if (t.id !== childTable.id) return t;

        const existingCol = t.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
        if (existingCol) {
          return {
            ...t,
            columns: t.columns.map(c =>
              c.id === existingCol.id
                ? {
                    ...c,
                    type: fkType,
                    fk: {
                      targetTableId: parentTable.id,
                      targetColId: parentPkCol.id,
                      onDelete: params.onDelete ?? 'RESTRICT',
                      onUpdate: params.onUpdate ?? 'CASCADE',
                    },
                  }
                : c
            ),
          };
        }

        const newFkCol: ErColumn = {
          id: `c_fk_${Date.now()}`,
          name: colName,
          type: fkType,
          pk: false,
          nn: true,
          unique: false,
          fk: {
            targetTableId: parentTable.id,
            targetColId: parentPkCol.id,
            onDelete: params.onDelete ?? 'RESTRICT',
            onUpdate: params.onUpdate ?? 'CASCADE',
          },
        };

        return {
          ...t,
          columns: [...t.columns, newFkCol],
        };
      }),
    }));
  }

  /**
   * Smart Topological Auto-Layout (arranges parent tables on left/top and dependent child tables in clean tiers)
   */
  autoLayoutDiagram(): void {
    this.pushHistory();
    const allTables = [...this.tables()];
    if (allTables.length === 0) return;

    // Calculate dependency depth (parents = 0, children = parent + 1)
    const depthMap = new Map<string, number>();
    allTables.forEach(t => depthMap.set(t.id, 0));

    for (let pass = 0; pass < allTables.length; pass++) {
      for (const t of allTables) {
        for (const col of t.columns) {
          if (col.fk && col.fk.targetTableId !== t.id) {
            const parentDepth = depthMap.get(col.fk.targetTableId) ?? 0;
            const currentDepth = depthMap.get(t.id) ?? 0;
            if (parentDepth + 1 > currentDepth) {
              depthMap.set(t.id, Math.min(4, parentDepth + 1));
            }
          }
        }
      }
    }

    // Group by depth column
    const columnsByDepth = new Map<number, ErTable[]>();
    for (const t of allTables) {
      const d = depthMap.get(t.id) ?? 0;
      const list = columnsByDepth.get(d) ?? [];
      list.push(t);
      columnsByDepth.set(d, list);
    }

    const sortedDepths = Array.from(columnsByDepth.keys()).sort((a, b) => a - b);
    const updatedPositions = new Map<string, { x: number; y: number }>();

    sortedDepths.forEach((depth, colIndex) => {
      const group = columnsByDepth.get(depth) ?? [];
      let currentY = 60;
      for (const tbl of group) {
        updatedPositions.set(tbl.id, {
          x: 60 + colIndex * 360,
          y: currentY,
        });
        const cardEstimatedHeight = 56 + tbl.columns.length * 30 + 36;
        currentY += cardEstimatedHeight;
      }
    });

    this.project.update(p => ({
      ...p,
      tables: p.tables.map(t => {
        const pos = updatedPositions.get(t.id);
        return pos ? { ...t, x: pos.x, y: pos.y } : t;
      }),
    }));
  }

  /**
   * Reverse Engineer SQL DDL script into visual tables
   */
  importFromPostgreSqlDdl(sql: string, replaceExisting: boolean): number {
    const parsedTables = parsePostgreSqlToTables(sql);
    if (parsedTables.length === 0) return 0;

    this.pushHistory();
    this.project.update(p => ({
      ...p,
      tables: replaceExisting ? parsedTables : [...p.tables, ...parsedTables],
    }));
    this.selectedTableId.set(parsedTables[0].id);
    this.autoLayoutDiagram();
    return parsedTables.length;
  }

  /**
   * Import a pgModeler .dbm XML file preserving tables, FKs, comments, defaults, and positions
   */
  importFromPgModelerDbm(xmlContent: string): DbmImportResult {
    const result = parsePgModelerDbm(xmlContent);
    this.pushHistory();
    this.project.set(result.project);
    this.selectedTableId.set(result.project.tables[0]?.id ?? null);
    return result;
  }
}
