import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import JSZip from 'jszip';
import { ErStoreService } from './services/er-store.service';
import {
  ErColumn,
  ErIndexMethod,
  ErProject,
  ErTable,
  PG_DATA_TYPES,
  ReferentialAction,
  TABLE_COLORS,
} from './models/er.models';
import { singularize, toKebabCase } from './utils/code-generators';
import { APP_VERSION, CHANGELOG_ENTRIES } from './data/changelog.data';

interface SvgRelationshipPath {
  id: string;
  sourceTableId: string;
  targetTableId: string;
  label: string;
  color: string;
  pathD: string;
  crowD: string;
  barX: number;
  barY1: number;
  barY2: number;
  midX: number;
  midY: number;
  isHighlighted: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly store = inject(ErStoreService);

  @ViewChild('canvasViewport', { static: false })
  canvasViewport?: ElementRef<HTMLDivElement>;

  // Constants exposed to template
  readonly appVersion = APP_VERSION;
  readonly changelog = CHANGELOG_ENTRIES;
  readonly pgTypes = PG_DATA_TYPES;
  readonly tableColors = TABLE_COLORS;
  readonly refActions: ReferentialAction[] = ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'];
  readonly indexMethods: ErIndexMethod[] = ['btree', 'hash', 'gin', 'gist', 'brin'];

  // Canvas Viewport Pan & Zoom State
  readonly zoom = signal<number>(1);
  readonly panX = signal<number>(30);
  readonly panY = signal<number>(20);
  readonly isPanning = signal<boolean>(false);

  // Right Panel Tabs: 'inspector' | 'code'
  readonly rightTab = signal<'inspector' | 'code'>('inspector');
  readonly activeCodeLang = signal<'sql' | 'csharp' | 'angular'>('sql');
  readonly selectedFileIndex = signal<number>(0);

  // Resizable & Collapsible Sidebars State (persisted in localStorage)
  private static readonly LAYOUT_KEY = 'pglite_studio_layout_v1';
  private static readonly DEFAULT_LEFT_WIDTH = 240;
  private static readonly DEFAULT_RIGHT_WIDTH = 410;

  readonly leftSidebarOpen = signal<boolean>(this.loadLayoutPref().leftOpen);
  readonly rightSidebarOpen = signal<boolean>(this.loadLayoutPref().rightOpen);
  readonly leftSidebarWidth = signal<number>(this.loadLayoutPref().leftWidth);
  readonly rightSidebarWidth = signal<number>(this.loadLayoutPref().rightWidth);
  readonly resizingPanel = signal<'left' | 'right' | null>(null);

  private resizeStartX = 0;
  private resizeStartWidth = 0;

  private loadLayoutPref(): {
    leftOpen: boolean;
    rightOpen: boolean;
    leftWidth: number;
    rightWidth: number;
  } {
    const defaults = {
      leftOpen: true,
      rightOpen: true,
      leftWidth: AppComponent.DEFAULT_LEFT_WIDTH,
      rightWidth: AppComponent.DEFAULT_RIGHT_WIDTH,
    };
    try {
      const raw = localStorage.getItem(AppComponent.LAYOUT_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        leftOpen: typeof parsed.leftOpen === 'boolean' ? parsed.leftOpen : defaults.leftOpen,
        rightOpen: typeof parsed.rightOpen === 'boolean' ? parsed.rightOpen : defaults.rightOpen,
        leftWidth:
          typeof parsed.leftWidth === 'number'
            ? Math.max(180, Math.min(380, parsed.leftWidth))
            : defaults.leftWidth,
        rightWidth:
          typeof parsed.rightWidth === 'number'
            ? Math.max(320, Math.min(760, parsed.rightWidth))
            : defaults.rightWidth,
      };
    } catch {
      return defaults;
    }
  }

  private saveLayoutPref(): void {
    try {
      localStorage.setItem(
        AppComponent.LAYOUT_KEY,
        JSON.stringify({
          leftOpen: this.leftSidebarOpen(),
          rightOpen: this.rightSidebarOpen(),
          leftWidth: this.leftSidebarWidth(),
          rightWidth: this.rightSidebarWidth(),
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

  toggleLeftSidebar(): void {
    this.leftSidebarOpen.update(v => !v);
    this.saveLayoutPref();
  }

  toggleRightSidebar(): void {
    this.rightSidebarOpen.update(v => !v);
    this.saveLayoutPref();
  }

  onStartResizePanel(event: MouseEvent, side: 'left' | 'right'): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizingPanel.set(side);
    this.resizeStartX = event.clientX;
    this.resizeStartWidth =
      side === 'left' ? this.leftSidebarWidth() : this.rightSidebarWidth();
  }

  resetPanelWidth(side: 'left' | 'right'): void {
    if (side === 'left') {
      this.leftSidebarWidth.set(AppComponent.DEFAULT_LEFT_WIDTH);
    } else {
      this.rightSidebarWidth.set(AppComponent.DEFAULT_RIGHT_WIDTH);
    }
    this.saveLayoutPref();
  }

  /**
   * Smart Auto-Width per table card (240px - 390px) based on header & longest column content.
   * Deterministic so SVG Crow's Foot connectors and PK ports align to the exact pixel.
   */
  getTableWidth(table: ErTable): number {
    const headerChars = `${table.schema}.${table.name}`.length;
    const headerWidth = headerChars * 7.6 + 68;

    let maxRowWidth = 0;
    for (const col of table.columns) {
      const nameW = col.name.length * 7.4;
      const typeW = (col.type || '').length * 6.8;
      const badgesW = (col.nn || col.pk ? 26 : 0) + (col.unique && !col.pk ? 26 : 0);
      const rowW = 48 + nameW + 18 + typeW + badgesW + 16;
      if (rowW > maxRowWidth) maxRowWidth = rowW;
    }

    const ideal = Math.max(headerWidth, maxRowWidth);
    return Math.max(240, Math.min(390, Math.round(ideal)));
  }

  // Interactive Port Cable Dragging (Drag from a Parent PK port to any Child Table)
  readonly draggingCable = signal<{
    parentTableId: string;
    parentColId: string;
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  } | null>(null);

  // Modals state
  readonly showFkModal = signal<boolean>(false);
  readonly showImportSqlModal = signal<boolean>(false);
  readonly showChangelogModal = signal<boolean>(this.shouldAutoOpenChangelog());
  readonly toastMessage = signal<string | null>(null);

  private static readonly SEEN_VERSION_KEY = 'pglite_studio_seen_version';

  private shouldAutoOpenChangelog(): boolean {
    try {
      return localStorage.getItem(AppComponent.SEEN_VERSION_KEY) !== APP_VERSION;
    } catch {
      return false;
    }
  }

  closeChangelogModal(): void {
    this.showChangelogModal.set(false);
    try {
      localStorage.setItem(AppComponent.SEEN_VERSION_KEY, APP_VERSION);
    } catch {
      // Ignore storage errors
    }
  }

  // FK Modal Form
  fkChildTableId = '';
  fkParentTableId = '';
  fkColumnName = '';
  fkOnDelete: ReferentialAction = 'RESTRICT';
  fkOnUpdate: ReferentialAction = 'CASCADE';

  // Import SQL Form
  importSqlText = `-- Pega cualquier script PostgreSQL DDL aquí para ingeniería inversa automática:
CREATE TABLE core.departamentos (
    id serial PRIMARY KEY,
    codigo varchar(50) NOT NULL UNIQUE,
    nombre varchar(120) NOT NULL,
    presupuesto_anual numeric(14,4) NOT NULL
);

CREATE TABLE core.empleados (
    id uuid PRIMARY KEY,
    departamento_id integer NOT NULL REFERENCES core.departamentos(id),
    nombre_completo varchar(120) NOT NULL,
    emailCorporativo varchar(120) NOT NULL UNIQUE,
    salario_mensual numeric(10,2) NOT NULL,
    activo boolean NOT NULL,
    fecha_ingreso date NOT NULL
);`;
  importReplaceExisting = false;

  // Filtered files by selected language tab
  readonly filteredGeneratedFiles = computed(() => {
    const lang = this.activeCodeLang();
    return this.store.generatedFiles().filter(f => f.folder === lang);
  });

  readonly activeCodeContent = computed(() => {
    const lang = this.activeCodeLang();
    const files = this.filteredGeneratedFiles();
    const idx = this.selectedFileIndex();
    if (idx === -1 || files.length === 0) {
      if (lang === 'sql') return this.store.sqlDdlOutput();
      if (lang === 'csharp') return this.store.csharpBundleOutput();
      return this.store.angularBundleOutput();
    }
    return files[Math.min(idx, files.length - 1)]?.content ?? '';
  });

  // Computed SVG Bezier Crow's Foot Paths between tables
  readonly relationshipPaths = computed<SvgRelationshipPath[]>(() => {
    const allTables = this.store.tables();
    const selectedId = this.store.selectedTableId();
    const paths: SvgRelationshipPath[] = [];

    const HEADER_HEIGHT = 38;
    const ROW_HEIGHT = 29;

    for (const sourceTable of allTables) {
      const srcWidth = this.getTableWidth(sourceTable);
      sourceTable.columns.forEach((col, colIndex) => {
        if (!col.fk) return;
        const targetTable = allTables.find(t => t.id === col.fk!.targetTableId);
        if (!targetTable) return;
        const tgtWidth = this.getTableWidth(targetTable);

        let targetColIndex = targetTable.columns.findIndex(c => c.id === col.fk!.targetColId);
        if (targetColIndex === -1) {
          targetColIndex = targetTable.columns.findIndex(c => c.pk);
        }
        if (targetColIndex === -1) targetColIndex = 0;

        const srcCenterX = sourceTable.x + srcWidth / 2;
        const tgtCenterX = targetTable.x + tgtWidth / 2;

        let x1: number;
        let x2: number;
        let dir1: number;
        let dir2: number;

        if (srcCenterX < tgtCenterX - 60) {
          x1 = sourceTable.x + srcWidth;
          x2 = targetTable.x;
          dir1 = 1;
          dir2 = -1;
        } else if (srcCenterX > tgtCenterX + 60) {
          x1 = sourceTable.x;
          x2 = targetTable.x + tgtWidth;
          dir1 = -1;
          dir2 = 1;
        } else {
          x1 = sourceTable.x + srcWidth;
          x2 = targetTable.x + tgtWidth;
          dir1 = 1;
          dir2 = 1;
        }

        const y1 = sourceTable.y + HEADER_HEIGHT + colIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
        const y2 = targetTable.y + HEADER_HEIGHT + targetColIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

        const dx = Math.max(55, Math.min(150, Math.abs(x2 - x1) * 0.48));
        const c1x = x1 + dir1 * dx;
        const c2x = x2 + dir2 * dx;

        const pathD = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;

        // Crow's foot on the child (FK / Many) side
        const forkTipX = x1 + dir1 * 11;
        const crowD = `M ${forkTipX} ${y1} L ${x1} ${y1 - 6} M ${forkTipX} ${y1} L ${x1} ${y1 + 6}`;

        // Single vertical bar on the parent (PK / One) side
        const barX = x2 + dir2 * 7;

        const isHighlighted =
          selectedId === sourceTable.id || selectedId === targetTable.id;

        paths.push({
          id: `${sourceTable.id}_${col.id}_${targetTable.id}`,
          sourceTableId: sourceTable.id,
          targetTableId: targetTable.id,
          label: `${sourceTable.name}.${col.name} → ${targetTable.name}`,
          color: sourceTable.color,
          pathD,
          crowD,
          barX,
          barY1: y2 - 6,
          barY2: y2 + 6,
          midX: (x1 + x2) / 2,
          midY: (y1 + y2) / 2 - 6,
          isHighlighted,
        });
      });
    }

    return paths;
  });

  // Minimap table rectangles scaled to 180x110 box
  readonly minimapNodes = computed(() => {
    const tables = this.store.tables();
    return tables.map(t => ({
      id: t.id,
      x: Math.max(4, Math.min(150, (t.x + 100) * 0.12)),
      y: Math.max(4, Math.min(90, (t.y + 80) * 0.12)),
      color: t.color,
      isSelected: t.id === this.store.selectedTableId(),
    }));
  });

  private panStartX = 0;
  private panStartY = 0;
  private panOrigX = 0;
  private panOrigY = 0;

  showToast(msg: string): void {
    this.toastMessage.set(msg);
    setTimeout(() => {
      if (this.toastMessage() === msg) {
        this.toastMessage.set(null);
      }
    }, 2800);
  }

  toggleTheme(): void {
    this.store.isDarkMode.update(v => !v);
  }

  selectTable(tableId: string, focusOnCanvas = false): void {
    this.store.selectedTableId.set(tableId);
    if (focusOnCanvas) {
      const tbl = this.store.tables().find(t => t.id === tableId);
      if (tbl) {
        const vpWidth = this.canvasViewport?.nativeElement.clientWidth || 800;
        const vpHeight = this.canvasViewport?.nativeElement.clientHeight || 600;
        const halfW = this.getTableWidth(tbl) / 2;
        this.panX.set(vpWidth / 2 - (tbl.x + halfW) * this.zoom());
        this.panY.set(vpHeight / 2 - (tbl.y + 110) * this.zoom());
      }
    }
  }

  openCodeGenerator(lang: 'sql' | 'csharp' | 'angular'): void {
    this.activeCodeLang.set(lang);
    this.selectedFileIndex.set(-1); // Show full bundle by default
    this.rightTab.set('code');
    if (!this.rightSidebarOpen()) {
      this.rightSidebarOpen.set(true);
      this.saveLayoutPref();
    }
  }

  // Canvas Zoom & Pan handlers
  onCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.09 : 0.91;
    const newZoom = Math.max(0.4, Math.min(1.85, Number((this.zoom() * factor).toFixed(2))));
    this.zoom.set(newZoom);
  }

  adjustZoom(delta: number): void {
    const newZoom = Math.max(0.4, Math.min(1.85, Number((this.zoom() + delta).toFixed(2))));
    this.zoom.set(newZoom);
  }

  resetViewport(): void {
    this.zoom.set(1);
    this.panX.set(30);
    this.panY.set(20);
  }

  onCanvasMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    this.isPanning.set(true);
    this.panStartX = event.clientX;
    this.panStartY = event.clientY;
    this.panOrigX = this.panX();
    this.panOrigY = this.panY();
  }

  // Dragging a Table Node on the Canvas
  onTableMouseDown(event: MouseEvent, table: ErTable): void {
    event.stopPropagation();
    this.store.selectedTableId.set(table.id);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const origX = table.x;
    const origY = table.y;
    const currentZoom = this.zoom();

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startClientX) / currentZoom;
      const dy = (ev.clientY - startClientY) / currentZoom;
      this.store.moveTable(table.id, Math.max(-400, origX + dx), Math.max(-400, origY + dy));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Interactive Port Dragging: Drag from a PK connector dot to any Target Table to create an instant FK
  onStartCableDrag(event: MouseEvent, parentTable: ErTable, parentCol: ErColumn, colIndex: number): void {
    event.stopPropagation();
    event.preventDefault();

    const HEADER_HEIGHT = 38;
    const ROW_HEIGHT = 29;
    const startX = parentTable.x + this.getTableWidth(parentTable);
    const startY = parentTable.y + HEADER_HEIGHT + colIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

    this.draggingCable.set({
      parentTableId: parentTable.id,
      parentColId: parentCol.id,
      startX,
      startY,
      currX: startX + 20,
      currY: startY,
    });
  }

  onDropCableOnTable(event: MouseEvent, targetChildTable: ErTable): void {
    const cable = this.draggingCable();
    if (!cable) return;
    event.stopPropagation();

    if (cable.parentTableId !== targetChildTable.id) {
      this.store.createForeignKeyRelation({
        childTableId: targetChildTable.id,
        parentTableId: cable.parentTableId,
        parentColId: cable.parentColId,
      });
      this.store.selectedTableId.set(targetChildTable.id);
      const parentName = this.store.tables().find(t => t.id === cable.parentTableId)?.name;
      this.showToast(`Relación FK creada: ${targetChildTable.name} → ${parentName}`);
    }
    this.draggingCable.set(null);
  }

  @HostListener('window:mousemove', ['$event'])
  onGlobalMouseMove(event: MouseEvent): void {
    const resizing = this.resizingPanel();
    if (resizing) {
      const delta = event.clientX - this.resizeStartX;
      if (resizing === 'left') {
        const nextW = Math.max(180, Math.min(380, this.resizeStartWidth + delta));
        this.leftSidebarWidth.set(nextW);
      } else {
        const nextW = Math.max(320, Math.min(760, this.resizeStartWidth - delta));
        this.rightSidebarWidth.set(nextW);
      }
      return;
    }

    if (this.isPanning()) {
      this.panX.set(this.panOrigX + (event.clientX - this.panStartX));
      this.panY.set(this.panOrigY + (event.clientY - this.panStartY));
    }

    const cable = this.draggingCable();
    if (cable && this.canvasViewport) {
      const rect = this.canvasViewport.nativeElement.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - this.panX()) / this.zoom();
      const worldY = (event.clientY - rect.top - this.panY()) / this.zoom();
      this.draggingCable.set({
        ...cable,
        currX: worldX,
        currY: worldY,
      });
    }
  }

  @HostListener('window:mouseup')
  onGlobalMouseUp(): void {
    if (this.resizingPanel()) {
      this.resizingPanel.set(null);
      this.saveLayoutPref();
    }
    if (this.isPanning()) {
      this.isPanning.set(false);
    }
    if (this.draggingCable()) {
      this.draggingCable.set(null);
    }
  }

  // Open FK Creation Modal
  openFkModal(): void {
    const tables = this.store.tables();
    if (tables.length < 2) {
      this.showToast('Necesitas al menos 2 tablas para crear una relación FK');
      return;
    }
    const current = this.store.selectedTable() || tables[0];
    const parent = tables.find(t => t.id !== current.id) || tables[0];
    this.fkChildTableId = current.id;
    this.fkParentTableId = parent.id;
    this.fkColumnName = `${singularize(parent.name)}_id`;
    this.fkOnDelete = 'RESTRICT';
    this.fkOnUpdate = 'CASCADE';
    this.showFkModal.set(true);
  }

  onFkParentTableChange(): void {
    const parent = this.store.tables().find(t => t.id === this.fkParentTableId);
    if (parent) {
      this.fkColumnName = `${singularize(parent.name)}_id`;
    }
  }

  confirmCreateFk(): void {
    if (!this.fkChildTableId || !this.fkParentTableId) return;
    this.store.createForeignKeyRelation({
      childTableId: this.fkChildTableId,
      parentTableId: this.fkParentTableId,
      fkColumnName: this.fkColumnName,
      onDelete: this.fkOnDelete,
      onUpdate: this.fkOnUpdate,
    });
    this.showFkModal.set(false);
    this.showToast('Relación Foreign Key agregada correctamente');
  }

  removeColumnFk(tableId: string, colId: string): void {
    this.store.updateColumn(tableId, colId, { fk: null });
    this.showToast('Restricción Foreign Key eliminada');
  }

  getTargetTableName(targetTableId: string): string {
    return this.store.tables().find(t => t.id === targetTableId)?.name ?? 'tabla';
  }

  getColumnTypeOptions(currentType: string): string[] {
    if (!currentType || this.pgTypes.includes(currentType)) {
      return this.pgTypes;
    }
    return [currentType, ...this.pgTypes];
  }

  countTableFks(table: ErTable): number {
    return table.columns.filter(c => c.fk !== null).length;
  }

  countTableAdvancedConstraints(table: ErTable): number {
    return (
      (table.checks?.length ?? 0) +
      (table.uniqueConstraints?.length ?? 0) +
      (table.indexes?.length ?? 0)
    );
  }

  toggleConstraintColumn(currentCols: string[], colName: string): string[] {
    if (currentCols.includes(colName)) {
      return currentCols.length > 1 ? currentCols.filter(c => c !== colName) : currentCols;
    }
    return [...currentCols, colName];
  }

  // Reverse Engineering SQL Import
  confirmImportSql(): void {
    const count = this.store.importFromPostgreSqlDdl(
      this.importSqlText,
      this.importReplaceExisting
    );
    if (count === 0) {
      this.showToast('No se detectaron sentencias CREATE TABLE válidas');
      return;
    }
    this.showImportSqlModal.set(false);
    this.resetViewport();
    this.showToast(`¡Ingeniería inversa completada! (${count} tablas importadas)`);
  }

  // Copy active code
  async copyActiveCode(): Promise<void> {
    await navigator.clipboard.writeText(this.activeCodeContent());
    this.showToast('¡Código copiado al portapapeles!');
  }

  // Download single active file
  downloadCurrentCodeFile(): void {
    const lang = this.activeCodeLang();
    const content = this.activeCodeContent();
    let filename = 'schema.sql';

    const files = this.filteredGeneratedFiles();
    const idx = this.selectedFileIndex();
    if (idx >= 0 && files[idx]) {
      filename = files[idx].filename;
    } else if (lang === 'csharp') {
      filename = 'DomainEntities.cs';
    } else if (lang === 'angular') {
      filename = 'domain.models.ts';
    }

    this.triggerBlobDownload(new Blob([content], { type: 'text/plain;charset=utf-8' }), filename);
    this.showToast(`Archivo descargado: ${filename}`);
  }

  // Export Project JSON (.pglite.json)
  exportProjectJson(): void {
    const proj = this.store.project();
    const slug = toKebabCase(proj.name) || 'er-project';
    const blob = new Blob([JSON.stringify(proj, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    this.triggerBlobDownload(blob, `${slug}.pglite.json`);
    this.showToast('Proyecto exportado en formato .pglite.json');
  }

  // Import Project JSON (.pglite.json) or pgModeler (.dbm)
  onImportProjectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const isDbm = file.name.toLowerCase().endsWith('.dbm');
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (isDbm || text.trimStart().startsWith('<?xml') || text.includes('<dbmodel')) {
        this.handleDbmImport(text);
        return;
      }

      try {
        const parsed = JSON.parse(text) as ErProject;
        if (parsed && Array.isArray(parsed.tables)) {
          this.store.loadProjectJson(parsed);
          this.resetViewport();
          this.showToast(`Proyecto cargado: ${parsed.name}`);
        }
      } catch {
        this.showToast('El archivo no tiene un formato .json o .dbm válido');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  // Dedicated pgModeler .dbm file import
  onImportDbmFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.handleDbmImport(String(reader.result || ''));
    };
    reader.readAsText(file);
    input.value = '';
  }

  private handleDbmImport(xmlText: string): void {
    try {
      const res = this.store.importFromPgModelerDbm(xmlText);
      this.fitDiagramToViewport();
      this.showToast(
        `pgModeler importado: ${res.project.name} (${res.tableCount} tablas · ${res.relationCount} FK)`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al leer el archivo .dbm';
      this.showToast(msg);
    }
  }

  fitDiagramToViewport(): void {
    const tables = this.store.tables();
    if (tables.length === 0) {
      this.resetViewport();
      return;
    }

    const vpWidth = this.canvasViewport?.nativeElement.clientWidth || 900;
    const vpHeight = this.canvasViewport?.nativeElement.clientHeight || 650;

    const minX = Math.min(...tables.map(t => t.x));
    const minY = Math.min(...tables.map(t => t.y));
    const maxX = Math.max(...tables.map(t => t.x + this.getTableWidth(t) + 12));
    const maxY = Math.max(...tables.map(t => t.y + 70 + t.columns.length * 30));

    const contentW = Math.max(300, maxX - minX);
    const contentH = Math.max(200, maxY - minY);
    const padding = 48;

    const scaleX = (vpWidth - padding * 2) / contentW;
    const scaleY = (vpHeight - padding * 2) / contentH;
    const fitZoom = Math.max(0.45, Math.min(1, Number(Math.min(scaleX, scaleY).toFixed(2))));

    this.zoom.set(fitZoom);
    this.panX.set(Math.round(padding - minX * fitZoom));
    this.panY.set(Math.round(padding - minY * fitZoom));
  }

  // Export Full Stack Bundle (.zip with /sql, /csharp-entities, /angular-models, and project.pglite.json)
  async downloadFullStackZip(): Promise<void> {
    const zip = new JSZip();
    const proj = this.store.project();
    const slug = toKebabCase(proj.name) || 'pglite-project';

    zip.file(`${slug}.pglite.json`, JSON.stringify(proj, null, 2));
    zip.file('sql/01_schema.sql', this.store.sqlDdlOutput());
    zip.file('csharp-entities/_AllEntities.cs', this.store.csharpBundleOutput());
    zip.file('angular-models/index.ts', this.store.angularBundleOutput());

    for (const f of this.store.generatedFiles()) {
      if (f.folder === 'csharp') {
        zip.file(`csharp-entities/${f.filename}`, f.content);
      } else if (f.folder === 'angular') {
        zip.file(`angular-models/${f.filename}`, f.content);
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    this.triggerBlobDownload(content, `${slug}-fullstack-bundle.zip`);
    this.showToast('¡Paquete Full-Stack (.zip) generado con SQL + C# + Angular TS!');
  }

  private triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
