import { TestBed } from '@angular/core/testing';
import { ErStoreService } from '../services/er-store.service';

describe('ErStoreService', () => {
  let service: ErStoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ErStoreService);
  });

  it('loads default SaaS template and computes derived metrics', () => {
    expect(service.tables().length).toBeGreaterThanOrEqual(4);
    expect(service.totalColumnsCount()).toBeGreaterThan(0);
    expect(service.totalRelationsCount()).toBeGreaterThan(0);
    expect(service.sqlDdlOutput()).toContain('CREATE TABLE');
  });

  it('supports adding tables, creating FK relations, and undo/redo', () => {
    const initialCount = service.tables().length;
    const parent = service.tables()[0];
    const child = service.addTable(120, 120);

    expect(service.tables().length).toBe(initialCount + 1);
    expect(service.canUndo()).toBeTrue();

    service.createForeignKeyRelation({
      childTableId: child.id,
      parentTableId: parent.id,
      fkColumnName: 'org_ref_id',
      onDelete: 'CASCADE',
    });

    const updatedChild = service.tables().find(t => t.id === child.id)!;
    const fkCol = updatedChild.columns.find(c => c.name === 'org_ref_id');
    expect(fkCol?.fk?.targetTableId).toBe(parent.id);
    expect(fkCol?.fk?.onDelete).toBe('CASCADE');

    service.undo();
    const revertedChild = service.tables().find(t => t.id === child.id)!;
    expect(revertedChild.columns.find(c => c.name === 'org_ref_id')).toBeUndefined();
    expect(service.canRedo()).toBeTrue();

    service.redo();
    const redoneChild = service.tables().find(t => t.id === child.id)!;
    expect(redoneChild.columns.find(c => c.name === 'org_ref_id')?.fk?.targetTableId).toBe(parent.id);
  });

  it('manages advanced constraints (CHECK, UNIQUE, INDEX) and initial seed rows', () => {
    const tblId = service.tables()[0].id;

    service.addCheckConstraint(tblId);
    service.addUniqueConstraint(tblId);
    service.addTableIndex(tblId);
    service.addInitialDataRow(tblId);

    let tbl = service.tables().find(t => t.id === tblId)!;
    expect(tbl.checks?.length).toBe(1);
    expect(tbl.uniqueConstraints?.length).toBe(1);
    expect(tbl.indexes?.length).toBe(1);
    expect(tbl.initialData?.rows.length).toBe(1);

    service.updateInitialDataCell(tblId, 0, 1, 'Acme Corp');
    tbl = service.tables().find(t => t.id === tblId)!;
    expect(tbl.initialData?.rows[0][1]).toBe('Acme Corp');

    service.deleteCheckConstraint(tblId, tbl.checks![0].id);
    service.deleteUniqueConstraint(tblId, tbl.uniqueConstraints![0].id);
    service.deleteTableIndex(tblId, tbl.indexes![0].id);
    service.deleteInitialDataRow(tblId, 0);

    tbl = service.tables().find(t => t.id === tblId)!;
    expect(tbl.checks).toBeUndefined();
    expect(tbl.uniqueConstraints).toBeUndefined();
    expect(tbl.indexes).toBeUndefined();
    expect(tbl.initialData).toBeUndefined();
  });
});
