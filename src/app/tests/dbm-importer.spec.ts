import { parsePgModelerDbm } from '../utils/dbm-importer';

const SAMPLE_DBM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<dbmodel pgmodeler-ver="0.9.4">
  <database name="notificacion_v1">
    <prepended-sql><![CDATA[CREATE EXTENSION IF NOT EXISTS "uuid-ossp";]]></prepended-sql>
  </database>
  <tag name="externo">
    <style id="table-title" colors="#e39fcd,#ef83ff,#c156cb"/>
  </tag>
  <schema name="notificaciones"/>
  <table name="clasificador">
    <schema name="notificaciones"/>
    <comment><![CDATA[Catalogo principal]]></comment>
    <position x="1000" y="200"/>
    <column name="id" not-null="true" default-value="uuid_generate_v4 ()">
      <type name="uuid" length="0"/>
    </column>
    <column name="nombre" not-null="true">
      <type name="character varying" length="0"/>
    </column>
    <constraint name="clasificador_pk" type="pk-constr" table="notificaciones.clasificador">
      <columns names="id" ref-type="src-columns"/>
    </constraint>
    <initial-data><![CDATA[id•nombre⸣
fb5a6d94-9798-4cbf-b1fe-dd83e46680ad•FACTURACION]]></initial-data>
  </table>
  <table name="templates">
    <schema name="notificaciones"/>
    <tag name="externo"/>
    <position x="1600" y="500"/>
    <column name="id" not-null="true" default-value="uuid_generate_v4 ()">
      <type name="uuid" length="0"/>
    </column>
    <column name="nombre">
      <type name="character varying" length="0"/>
    </column>
    <column name="idf_clasificador" not-null="true">
      <type name="uuid" length="0"/>
    </column>
    <column name="idf_tipo_template">
      <type name="character varying" length="2"/>
      <comment><![CDATA[EB = EMAIL BODY]]></comment>
    </column>
    <column name="creado_en" not-null="true">
      <type name="timestamp" length="0" precision="6"/>
    </column>
    <constraint name="templates_pk" type="pk-constr" table="notificaciones.templates">
      <columns names="id" ref-type="src-columns"/>
    </constraint>
    <constraint name="ku_templates_nombre" type="uq-constr" table="notificaciones.templates">
      <columns names="nombre" ref-type="src-columns"/>
    </constraint>
    <constraint name="ck_templates_tipo" type="ck-constr" table="notificaciones.templates">
      <expression><![CDATA[idf_tipo_template IN ('EB','ES')]]></expression>
    </constraint>
    <index name="idx_templates_tipo" unique="false" indexing-type="btree">
      <idxelement><column name="idf_tipo_template"/></idxelement>
      <predicate><![CDATA[idf_tipo_template IS NOT NULL]]></predicate>
    </index>
  </table>
  <constraint name="fk_templates_clasificador" type="fk-constr"
    upd-action="CASCADE" del-action="CASCADE"
    ref-table="notificaciones.clasificador" table="notificaciones.templates">
    <columns names="idf_clasificador" ref-type="src-columns"/>
    <columns names="id" ref-type="dst-columns"/>
  </constraint>
</dbmodel>`;

describe('dbm-importer', () => {
  it('parses pgModeler .dbm XML including prependedSql, tags, constraints, indexes, FKs, and initial-data', () => {
    const res = parsePgModelerDbm(SAMPLE_DBM_XML);

    expect(res.project.name).toBe('notificacion_v1');
    expect(res.project.defaultSchema).toBe('notificaciones');
    expect(res.project.prependedSql).toBe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    expect(res.tableCount).toBe(2);
    expect(res.relationCount).toBe(1);

    const clasificador = res.project.tables.find(t => t.name === 'clasificador')!;
    const templates = res.project.tables.find(t => t.name === 'templates')!;

    expect(clasificador.comment).toBe('Catalogo principal');
    expect(clasificador.initialData?.columns).toEqual(['id', 'nombre']);
    expect(clasificador.initialData?.rows).toEqual([
      ['fb5a6d94-9798-4cbf-b1fe-dd83e46680ad', 'FACTURACION'],
    ]);

    expect(templates.color).toBe('#e39fcd');
    expect(templates.columns.find(c => c.name === 'idf_tipo_template')?.type).toBe('varchar(2)');
    expect(templates.columns.find(c => c.name === 'creado_en')?.type).toBe('timestamp(6)');
    expect(templates.uniqueConstraints?.[0].name).toBe('ku_templates_nombre');
    expect(templates.checks?.[0].expression).toBe("idf_tipo_template IN ('EB','ES')");
    expect(templates.indexes?.[0].name).toBe('idx_templates_tipo');
    expect(templates.indexes?.[0].where).toBe('idf_tipo_template IS NOT NULL');

    const fkCol = templates.columns.find(c => c.name === 'idf_clasificador')!;
    expect(fkCol.fk?.name).toBe('fk_templates_clasificador');
    expect(fkCol.fk?.targetTableId).toBe(clasificador.id);
    expect(fkCol.fk?.onDelete).toBe('CASCADE');
  });

  it('throws a clear error on invalid XML', () => {
    expect(() => parsePgModelerDbm('<invalid>')).toThrowError();
  });
});
