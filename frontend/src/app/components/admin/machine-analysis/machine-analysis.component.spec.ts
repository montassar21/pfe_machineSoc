import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MachineAnalysisComponent } from './machine-analysis.component';

describe('MachineAnalysisComponent', () => {
  let component: MachineAnalysisComponent;
  let fixture: ComponentFixture<MachineAnalysisComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [MachineAnalysisComponent]
    });
    fixture = TestBed.createComponent(MachineAnalysisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
