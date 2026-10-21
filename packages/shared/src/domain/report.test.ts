import { describe, expect, it } from 'vitest';
import { draftReportText, monthBounds, monthlyFigures, type ReportInput } from './report.js';

/**
 * A small October 2026, worked out by hand (v0.3 phase 5: "indicators match
 * a hand-checked spreadsheet"). Each figure below says where it comes from.
 */
const day = (d: string) => `${d}T10:00:00.000Z`;
const OCTOBER: ReportInput = {
  farmers: [
    { id: 'ama', name: 'Ama', status: 'active', created_at: day('2026-09-05') },
    { id: 'kwame', name: 'Kwame', status: 'active', created_at: day('2026-10-03') },
    { id: 'old', name: 'Old', status: 'inactive', created_at: day('2026-08-01') }, // left: not counted
    { id: 'late', name: 'Late', status: 'active', created_at: day('2026-11-02') }, // joined after October
    { id: 'gone', name: 'Gone', status: 'active', created_at: day('2026-09-01'), deleted_at: day('2026-09-02') },
  ],
  collections: [
    { farmer_id: 'ama', collected_at: day('2026-10-05'), crates: 3, amount_paid: 12000 },
    { farmer_id: 'kwame', collected_at: day('2026-10-20'), crates: 2, amount_paid: 8000 },
    { farmer_id: 'ama', collected_at: day('2026-09-28'), crates: 5, amount_paid: 20000 }, // September
    { farmer_id: 'ama', collected_at: day('2026-10-06'), crates: 9, amount_paid: 36000, deleted_at: day('2026-10-06') }, // removed
  ],
  sales: [
    { id: 's1', sold_at: day('2026-10-21'), crates: 4, price_per_crate: 5200 },
    { id: 's2', sold_at: day('2026-11-01'), crates: 1, price_per_crate: 5200 }, // November
    { id: 's3', sold_at: day('2026-10-08'), crates: 2, price_per_crate: 5200, deleted_at: day('2026-10-08') }, // removed: entered by mistake
  ],
  salePayments: [
    { sale_id: 's1', amount: 10400, received_at: day('2026-10-22') },
    { sale_id: 's1', amount: 5000, received_at: day('2026-09-30') }, // September
    { sale_id: 's3', amount: 10400, received_at: day('2026-10-08') }, // its sale was removed
  ],
  visits: [
    { farmer_id: 'ama', visited_at: day('2026-10-05'), deaths: 4 },
    { farmer_id: 'kwame', visited_at: day('2026-10-20'), deaths: 1 },
    { farmer_id: 'ama', visited_at: day('2026-09-15'), deaths: 10 }, // September
  ],
  birdCounts: [
    { farmer_id: 'ama', kind: 'verified', count: 200, counted_at: day('2026-10-05') },
    { farmer_id: 'ama', kind: 'reported', count: 220, counted_at: day('2026-10-15') }, // verified wins
    { farmer_id: 'ama', kind: 'verified', count: 180, counted_at: day('2026-11-02') }, // after October
    { farmer_id: 'kwame', kind: 'reported', count: 50, counted_at: day('2026-10-03') }, // no verified count yet
  ],
  vaccinations: [
    { farmer_id: 'ama', birds_vaccinated: 200, vaccinated_at: day('2026-10-12') },
    { farmer_id: 'kwame', birds_vaccinated: 50, vaccinated_at: day('2026-10-13') },
    { farmer_id: 'ama', birds_vaccinated: 190, vaccinated_at: day('2026-09-10') }, // September
  ],
  vaccinePayments: [{ amount: 500, paid_at: day('2026-10-13') }],
  cases: [
    { created_at: day('2026-10-06'), closed_at: day('2026-10-09'), triage: 'urgent', triage_suggested: null },
    { created_at: day('2026-10-25'), closed_at: null, triage: 'low', triage_suggested: 'urgent' }, // vet said low
    { created_at: day('2026-09-28'), closed_at: day('2026-10-02'), triage: 'medium', triage_suggested: null }, // closed in October
  ],
  ledger: [
    { fund: 'egg', amount: 150000, source_type: 'grant', created_at: day('2026-09-01') },
    { fund: 'egg', amount: -20000, source_type: 'collection', created_at: day('2026-09-28') },
    { fund: 'egg', amount: -12000, source_type: 'collection', created_at: day('2026-10-05') },
    { fund: 'egg', amount: -8000, source_type: 'collection', created_at: day('2026-10-20') },
    { fund: 'egg', amount: 10400, source_type: 'sale_payment', created_at: day('2026-10-22') },
    { fund: 'egg', amount: 50000, source_type: 'grant', created_at: day('2026-10-15') },
    { fund: 'egg', amount: 4000, source_type: 'adjustment', created_at: day('2026-10-07') }, // a collection corrected down
    { fund: 'vaccine', amount: 500, source_type: 'vaccine_payment', created_at: day('2026-10-13') }, // other fund
    { fund: 'egg', amount: 10400, source_type: 'sale_payment', created_at: day('2026-11-03') }, // November
  ],
};

describe('monthly report', () => {
  const f = monthlyFigures('2026-10', OCTOBER);

  it('counts enrolled farmers at the end of the month', () => {
    expect(f.farmers).toEqual({ enrolled: 2, newThisMonth: 1 }); // Ama and Kwame; Kwame joined in October
  });

  it('works out eggs and margin from the month only', () => {
    expect(f.eggs).toEqual({
      cratesBought: 5, // 3 + 2
      paidToFarmers: 20000, // GHS 120 + GHS 80
      cratesSold: 4,
      salesValue: 20800, // 4 × GHS 52
      margin: 4800, // 20800 − 4 crates × (20000 / 5 crates)
      paymentsReceived: 10400,
    });
  });

  it('follows the egg fund from opening to closing', () => {
    // Opening: 150000 − 20000. In: 10400 + 50000. Out: 12000 + 8000. Corrections: +4000.
    expect(f.eggFund).toEqual({ opening: 130000, moneyIn: 60400, moneyOut: 20000, corrections: 4000, closing: 174400, grants: 50000 });
  });

  it('counts doses, bird losses and health cases', () => {
    expect(f.vaccination).toEqual({ doses: 250, farms: 2, paymentsReceived: 500 });
    expect(f.birds).toEqual({ deaths: 5, counted: 250, lossPercent: 2 }); // 5 of 200 + 50
    expect(f.cases).toEqual({ opened: 2, urgent: 1, closed: 2 });
  });

  it('gives a line per farmer', () => {
    expect(f.perFarmer).toEqual([
      { farmerId: 'ama', name: 'Ama', crates: 3, paid: 12000, deaths: 4, doses: 200, birds: 200 },
      { farmerId: 'kwame', name: 'Kwame', crates: 2, paid: 8000, deaths: 1, doses: 50, birds: 50 },
    ]);
  });

  it('writes a plain first draft for Gloria to edit', () => {
    expect(draftReportText(f).split('\n\n')).toEqual([
      'In October 2026, 2 farmers were enrolled, 1 of them new this month.',
      'We bought 5 crates of eggs from farmers for GHS 200 and sold 4 crates in Wa for GHS 208, a gross margin of GHS 48.',
      'Vets gave 250 vaccine doses on 2 farms.',
      '5 birds died, 2% of the 250 birds counted.',
      'Farmers reported 2 health problems (1 urgent), and vets closed 2 cases.',
      'The egg fund held GHS 1,300 at the start of the month and GHS 1,744 at the end.',
    ]);
  });

  it('reads naturally for one new farmer and no deaths', () => {
    const one = monthlyFigures('2026-10', { ...OCTOBER, farmers: [OCTOBER.farmers[1]!], visits: [] });
    const text = draftReportText(one);
    expect(text).toContain('In October 2026, 1 farmer was enrolled, who joined this month.');
    expect(text).toContain('No birds died among the 50 birds counted.');
  });

  it('says so plainly when a month is empty', () => {
    const empty = monthlyFigures('2026-12', { ...OCTOBER, farmers: [] });
    expect(draftReportText(empty)).toContain('No eggs were bought or sold this month.');
    expect(empty.birds.lossPercent).toBeNull();
  });

  it('uses whole calendar months and refuses other formats', () => {
    expect(monthBounds('2026-12')).toEqual({ start: '2026-12-01T00:00:00.000Z', end: '2027-01-01T00:00:00.000Z' });
    expect(() => monthBounds('2026-13')).toThrow();
  });
});
