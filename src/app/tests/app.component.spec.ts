import { TestBed } from '@angular/core/testing';
import { AppComponent } from '../app.component';
import { APP_VERSION } from '../data/changelog.data';
import { ErTable } from '../models/er.models';

describe('AppComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  it('creates the studio component and auto-opens changelog on first visit', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    expect(app).toBeTruthy();
    expect(app.showChangelogModal()).toBeTrue();

    app.closeChangelogModal();
    expect(app.showChangelogModal()).toBeFalse();
    expect(localStorage.getItem('pglite_studio_seen_version')).toBe(APP_VERSION);
  });

  it('calculates smart auto-width clamped between 240px and 390px', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    const shortTable: ErTable = {
      id: 't1',
      schema: 'public',
      name: 'a',
      color: '#2563eb',
      x: 0,
      y: 0,
      columns: [{ id: 'c1', name: 'id', type: 'integer', pk: true, nn: true, unique: true, fk: null }],
    };

    const longTable: ErTable = {
      id: 't2',
      schema: 'notificaciones',
      name: 'solicitudes_templates_historico_detallado_mensual',
      color: '#2563eb',
      x: 0,
      y: 0,
      columns: [
        { id: 'c2', name: 'identificador_externo_super_largo', type: 'varchar(255)', pk: false, nn: true, unique: true, fk: null },
      ],
    };

    expect(app.getTableWidth(shortTable)).toBe(240);
    expect(app.getTableWidth(longTable)).toBe(390);
  });

  it('toggles left and right sidebars and reopens right sidebar when selecting a code tab', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    expect(app.leftSidebarOpen()).toBeTrue();
    expect(app.rightSidebarOpen()).toBeTrue();

    app.toggleLeftSidebar();
    app.toggleRightSidebar();
    expect(app.leftSidebarOpen()).toBeFalse();
    expect(app.rightSidebarOpen()).toBeFalse();

    app.openCodeGenerator('csharp');
    expect(app.rightSidebarOpen()).toBeTrue();
    expect(app.rightTab()).toBe('code');
    expect(app.activeCodeLang()).toBe('csharp');
  });
});
