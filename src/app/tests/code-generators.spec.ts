import { ErProject } from '../models/er.models';
import {
  generateAngularTableModel,
  generateCSharpTableEntity,
  generatePostgreSqlDdl,
  parsePostgreSqlToTables,
  singularize,
  toCamelCase,
  toKebabCase,
  toPascalCase,
} from '../utils/code-generators';

function buildSampleProject(): ErProject {
  return {
    version: '1.0.0',
    name: 'Notificaciones Test',
    defaultSchema: 'notificaciones',
    csharpNamespace: 'Notificaciones.Domain.Entities',
    useEfDataAnnotations: true,
    useCSharpRecords: false,
    prependedSql: 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
    tables: [
      {
        id: 't_templates',
        schema: 'notificaciones',
        name: 'templates',
        color: '#2563eb',
        comment: 'Plantillas de correo',
        x: 300,
        y: 60,
        columns: [
          {
            id: 'c_tpl_id',
            name: 'id',
            type: 'uuid',
            pk: true,
            nn: true,
            unique: true,
            defaultValue: 'uuid_generate_v4()',
            fk: null,
          },
          {
            id: 'c_tpl_nombre',
            name: 'nombre',
            type: 'varchar(120)',
            pk: false,
            nn: true,
            unique: true,
            fk: null,
          },
          {
            id: 'c_tpl_clasif',
            name: 'idf_clasificador',
            type: 'uuid',
            pk: false,
            nn: true,
            unique: false,
            fk: {
              name: 'fk_templates_clasificador',
              targetTableId: 't_clasificador',
              targetColId: 'c_cla_id',
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            },
          },
          {
            id: 'c_tpl_tipo',
            name: 'tipo_template',
            type: 'varchar(2)',
            pk: false,
            nn: false,
            unique: false,
            comment: 'EB = Email Body, ES = Email Subject',
            fk: null,
          },
        ],
        uniqueConstraints: [
          { id: 'uq_1', name: 'ku_templates_nombre', columns: ['nombre'] },
          { id: 'uq_2', name: 'uq_templates_clasif_tipo', columns: ['idf_clasificador', 'tipo_template'] },
        ],
        checks: [
          { id: 'ck_1', name: 'ck_templates_tipo', expression: "tipo_template IN ('EB', 'ES')" },
        ],
        indexes: [
          {
            id: 'idx_1',
            name: 'idx_templates_tipo_partial',
            columns: ['tipo_template'],
            unique: false,
            method: 'btree',
            where: 'tipo_template IS NOT NULL',
          },
        ],
        initialData: {
          columns: ['id', 'nombre', 'idf_clasificador', 'tipo_template'],
          rows: [['ec4bb5d2-c6dd-4aa3-a9dd-34be60d9e44a', 'test_template', 'fb5a6d94-9798-4cbf-b1fe-dd83e46680ad', 'EB']],
        },
      },
      {
        id: 't_clasificador',
        schema: 'notificaciones',
        name: 'clasificador',
        color: '#0d9488',
        x: 60,
        y: 60,
        columns: [
          {
            id: 'c_cla_id',
            name: 'id',
            type: 'uuid',
            pk: true,
            nn: true,
            unique: true,
            defaultValue: 'uuid_generate_v4()',
            fk: null,
          },
          {
            id: 'c_cla_nombre',
            name: 'nombre',
            type: 'varchar(120)',
            pk: false,
            nn: true,
            unique: false,
            fk: null,
          },
        ],
        initialData: {
          columns: ['id', 'nombre'],
          rows: [['fb5a6d94-9798-4cbf-b1fe-dd83e46680ad', 'FACTURACION']],
        },
      },
    ],
  };
}

describe('code-generators', () => {
  it('formats naming helpers consistently', () => {
    expect(toPascalCase('solicitudes_templates')).toBe('SolicitudesTemplates');
    expect(toCamelCase('idf_clasificador')).toBe('idfClasificador');
    expect(toKebabCase('PedidoItems')).toBe('pedido-items');
    expect(singularize('usuarios')).toBe('usuario');
    expect(singularize('notificaciones')).toBe('notificacion');
  });

  it('generates PostgreSQL DDL with prependedSql, custom constraints, indexes, and topological seeds', () => {
    const project = buildSampleProject();
    const ddl = generatePostgreSqlDdl(project);

    expect(ddl).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    expect(ddl).toContain('CREATE SCHEMA IF NOT EXISTS notificaciones;');
    expect(ddl).toContain('CONSTRAINT ku_templates_nombre UNIQUE (nombre)');
    expect(ddl).toContain('CONSTRAINT uq_templates_clasif_tipo UNIQUE (idf_clasificador, tipo_template)');
    expect(ddl).toContain("CONSTRAINT ck_templates_tipo CHECK (tipo_template IN ('EB', 'ES'))");
    // Avoid duplicating inline UNIQUE when a named single-column unique constraint already exists
    expect(ddl).not.toContain('nombre VARCHAR(120) NOT NULL UNIQUE');
    expect(ddl).toContain('ADD CONSTRAINT fk_templates_clasificador');
    expect(ddl).toContain(
      'CREATE INDEX IF NOT EXISTS idx_templates_tipo_partial ON notificaciones.templates (tipo_template) WHERE tipo_template IS NOT NULL;'
    );

    // Seed data must insert parent (clasificador) before child (templates)
    const clasificadorInsertPos = ddl.indexOf('INSERT INTO notificaciones.clasificador');
    const templatesInsertPos = ddl.indexOf('INSERT INTO notificaciones.templates');
    expect(clasificadorInsertPos).toBeGreaterThan(-1);
    expect(templatesInsertPos).toBeGreaterThan(clasificadorInsertPos);
  });

  it('generates C# EF Core entities and respects class vs record setting', () => {
    const project = buildSampleProject();
    const csClass = generateCSharpTableEntity(project.tables[0], project);

    expect(csClass).toContain('namespace Notificaciones.Domain.Entities;');
    expect(csClass).toContain('[Table("templates", Schema = "notificaciones")]');
    expect(csClass).toContain('public class Template');
    expect(csClass).toContain('[Key]');
    expect(csClass).toContain('[MaxLength(120)]');
    expect(csClass).toContain('public Guid Id { get; set; }');
    expect(csClass).toContain('[ForeignKey(nameof(IdfClasificador))]');

    const recordProject: ErProject = { ...project, useCSharpRecords: true, useEfDataAnnotations: false };
    const csRecord = generateCSharpTableEntity(recordProject.tables[0], recordProject);
    expect(csRecord).toContain('public record Template');
    expect(csRecord).not.toContain('[Table(');
  });

  it('generates Angular TypeScript interfaces and Create/Update DTOs', () => {
    const project = buildSampleProject();
    const tsModel = generateAngularTableModel(project.tables[0], project);

    expect(tsModel).toContain('export interface Template {');
    expect(tsModel).toContain('id: string;');
    expect(tsModel).toContain('idfClasificador: string;');
    expect(tsModel).toContain('tipoTemplate?: string | null;');
    expect(tsModel).toContain("export type CreateTemplateDto = Omit<Template, 'id'>;");
    expect(tsModel).toContain('export type UpdateTemplateDto = Partial<CreateTemplateDto>;');
  });

  it('round-trips SQL DDL with CHECK, composite UNIQUE, FK, and CREATE INDEX', () => {
    const sql = `
      CREATE TABLE core.ordenes (
        id serial PRIMARY KEY,
        codigo varchar(50) NOT NULL,
        tenant_id integer NOT NULL,
        total numeric(10,2) NOT NULL,
        CONSTRAINT uq_ordenes_tenant_codigo UNIQUE (tenant_id, codigo),
        CONSTRAINT ck_ordenes_total CHECK (total >= 0)
      );
      CREATE UNIQUE INDEX idx_ordenes_codigo_gin ON core.ordenes USING btree (codigo) WHERE total > 0;
    `;

    const tables = parsePostgreSqlToTables(sql);
    expect(tables.length).toBe(1);
    const ordenes = tables[0];
    expect(ordenes.schema).toBe('core');
    expect(ordenes.name).toBe('ordenes');
    expect(ordenes.uniqueConstraints?.length).toBe(1);
    expect(ordenes.uniqueConstraints?.[0].columns).toEqual(['tenant_id', 'codigo']);
    expect(ordenes.checks?.length).toBe(1);
    expect(ordenes.checks?.[0].expression).toBe('total >= 0');
    expect(ordenes.indexes?.length).toBe(1);
    expect(ordenes.indexes?.[0].unique).toBeTrue();
    expect(ordenes.indexes?.[0].where).toBe('total > 0');
  });
});
