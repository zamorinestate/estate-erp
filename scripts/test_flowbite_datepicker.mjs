import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  Datepicker,
  DateRangePicker,
  initDatepickers,
  renderFlowbiteDatepicker,
  renderFlowbiteDateRangePicker,
  renderFlowbiteTimepicker,
  renderFlowbiteDatepickerShowcase,
  formatFlowbiteDate,
  parseFlowbiteDate,
} from '../Frontend/src/js/flowbiteUtils.js';
import {
  Datepicker as CompDatepicker,
  DateRangePicker as CompDateRangePicker,
  initDatepickers as compInitDatepickers,
  renderFlowbiteDatepicker as compRenderFlowbiteDatepicker,
  renderFlowbiteDateRangePicker as compRenderFlowbiteDateRangePicker,
  renderFlowbiteTimepicker as compRenderFlowbiteTimepicker,
  renderFlowbiteDatepickerShowcase as compRenderFlowbiteDatepickerShowcase,
} from '../Frontend/src/js/components.js';

console.log('=== Testing Flowbite Datepicker & Timepicker Integration ===');

// 1. Export & parity check from components.js
assert.strictEqual(typeof Datepicker, 'function', 'Datepicker class must be exported');
assert.strictEqual(typeof DateRangePicker, 'function', 'DateRangePicker class must be exported');
assert.strictEqual(typeof initDatepickers, 'function', 'initDatepickers must be exported');
assert.strictEqual(typeof renderFlowbiteDatepicker, 'function', 'renderFlowbiteDatepicker must be exported');
assert.strictEqual(typeof renderFlowbiteDateRangePicker, 'function', 'renderFlowbiteDateRangePicker must be exported');
assert.strictEqual(typeof renderFlowbiteTimepicker, 'function', 'renderFlowbiteTimepicker must be exported');
assert.strictEqual(typeof renderFlowbiteDatepickerShowcase, 'function', 'renderFlowbiteDatepickerShowcase must be exported');

assert.strictEqual(typeof CompDatepicker, 'function', 'Datepicker must be re-exported from components.js');
assert.strictEqual(typeof CompDateRangePicker, 'function', 'DateRangePicker must be re-exported from components.js');
assert.strictEqual(typeof compInitDatepickers, 'function', 'initDatepickers must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDatepicker, 'function', 'renderFlowbiteDatepicker must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDateRangePicker, 'function', 'renderFlowbiteDateRangePicker must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteTimepicker, 'function', 'renderFlowbiteTimepicker must be re-exported from components.js');
assert.strictEqual(typeof compRenderFlowbiteDatepickerShowcase, 'function', 'renderFlowbiteDatepickerShowcase must be re-exported from components.js');
console.log('✓ Export and import parity verified');

// 2. Date format and parse helper tests
const sampleDate = new Date(2025, 4, 15); // May 15, 2025
assert.strictEqual(formatFlowbiteDate(sampleDate, 'mm/dd/yyyy'), '05/15/2025');
assert.strictEqual(formatFlowbiteDate(sampleDate, 'mm-dd-yyyy'), '05-15-2025');
assert.strictEqual(formatFlowbiteDate(sampleDate, 'yyyy-mm-dd'), '2025-05-15');
assert.strictEqual(formatFlowbiteDate(sampleDate, 'dd/mm/yyyy'), '15/05/2025');

const parsed1 = parseFlowbiteDate('05/15/2025', 'mm/dd/yyyy');
assert.strictEqual(parsed1.getFullYear(), 2025);
assert.strictEqual(parsed1.getMonth(), 4);
assert.strictEqual(parsed1.getDate(), 15);

const parsed2 = parseFlowbiteDate('2025-05-15', 'yyyy-mm-dd');
assert.strictEqual(parsed2.getFullYear(), 2025);
assert.strictEqual(parsed2.getMonth(), 4);
assert.strictEqual(parsed2.getDate(), 15);

const parsed3 = parseFlowbiteDate('15/05/2025', 'dd/mm/yyyy');
assert.strictEqual(parsed3.getFullYear(), 2025);
assert.strictEqual(parsed3.getMonth(), 4);
assert.strictEqual(parsed3.getDate(), 15);
console.log('✓ formatFlowbiteDate and parseFlowbiteDate formatting verified');

// 3. Datepicker class methods and options
const mockInput = {
  id: 'test-dp-input',
  value: '05/15/2025',
  hasAttribute: (attr) => attr === 'datepicker-autohide' || attr === 'datepicker-buttons',
  getAttribute: (attr) => {
    if (attr === 'datepicker-format') return 'mm/dd/yyyy';
    if (attr === 'datepicker-title') return 'Select Trip Date';
    if (attr === 'datepicker-orientation') return 'bottom right';
    return null;
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
};

const dp = new Datepicker(mockInput);
assert.strictEqual(dp._options.autohide, true, 'Should detect datepicker-autohide attribute');
assert.strictEqual(dp._options.buttons, true, 'Should detect datepicker-buttons attribute');
assert.strictEqual(dp._options.title, 'Select Trip Date', 'Should detect datepicker-title attribute');
assert.strictEqual(dp._options.orientation, 'bottom right', 'Should detect datepicker-orientation attribute');
assert.strictEqual(dp.getDate().getFullYear(), 2025, 'getDate() should return parsed initial date');

dp.setDate('06/20/2025');
assert.strictEqual(dp.getDate().getMonth(), 5, 'setDate() should update selected date');
assert.strictEqual(mockInput.value, '06/20/2025', 'setDate() should update input element value');

assert.strictEqual(dp.getDatepickerInstance(), dp, 'getDatepickerInstance() returns datepicker instance');

let showCalled = false;
let hideCalled = false;
dp.updateOnShow(() => { showCalled = true; });
dp.updateOnHide(() => { hideCalled = true; });
dp.show();
dp.hide();
assert.strictEqual(hideCalled, true, 'updateOnHide callback should be invoked on hide()');

dp.destroy();
console.log('✓ Datepicker class methods, options, and callbacks verified');

// 4. DateRangePicker class
const mockStartInput = {
  id: 'start-input',
  value: '01/01/2025',
  hasAttribute: () => false,
  getAttribute: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
};
const mockEndInput = {
  id: 'end-input',
  value: '01/10/2025',
  hasAttribute: () => false,
  getAttribute: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
};
const mockRangeEl = {
  querySelector: (sel) => {
    if (sel.includes('start')) return mockStartInput;
    if (sel.includes('end')) return mockEndInput;
    return null;
  },
};

const drp = new DateRangePicker(mockRangeEl);
const dates = drp.getDates();
assert.strictEqual(dates[0].getDate(), 1, 'Start date should be parsed');
assert.strictEqual(dates[1].getDate(), 10, 'End date should be parsed');

drp.setDates('02/01/2025', '02/15/2025');
assert.strictEqual(mockStartInput.value, '02/01/2025', 'setDates should update start input');
assert.strictEqual(mockEndInput.value, '02/15/2025', 'setDates should update end input');

drp.destroy();
console.log('✓ DateRangePicker class methods and lifecycle verified');

// 5. Markup generator functions
const singleDp = renderFlowbiteDatepicker({
  id: 'custom-dp',
  placeholder: 'Select custom date',
  autohide: true,
  buttons: true,
  autoSelectToday: true,
  format: 'mm-dd-yyyy',
  minDate: '01/01/2024',
  maxDate: '12/31/2025',
  orientation: 'top left',
  title: 'Appointment Date',
});
assert(singleDp.includes('id="custom-dp"'), 'renderFlowbiteDatepicker must set ID');
assert(singleDp.includes('placeholder="Select custom date"'), 'renderFlowbiteDatepicker must set placeholder');
assert(singleDp.includes('datepicker-autohide'), 'renderFlowbiteDatepicker must set autohide attr');
assert(singleDp.includes('datepicker-buttons'), 'renderFlowbiteDatepicker must set buttons attr');
assert(singleDp.includes('datepicker-autoselect-today'), 'renderFlowbiteDatepicker must set autoselect attr');
assert(singleDp.includes('datepicker-format="mm-dd-yyyy"'), 'renderFlowbiteDatepicker must set format attr');
assert(singleDp.includes('datepicker-min-date="01/01/2024"'), 'renderFlowbiteDatepicker must set min-date attr');
assert(singleDp.includes('datepicker-max-date="12/31/2025"'), 'renderFlowbiteDatepicker must set max-date attr');
assert(singleDp.includes('datepicker-orientation="top left"'), 'renderFlowbiteDatepicker must set orientation attr');
assert(singleDp.includes('datepicker-title="Appointment Date"'), 'renderFlowbiteDatepicker must set title attr');
assert(singleDp.includes('ps-9'), 'renderFlowbiteDatepicker must include ps-9');
console.log('✓ renderFlowbiteDatepicker generator verified with all options');

const rangeDp = renderFlowbiteDateRangePicker({
  id: 'flight-range',
  startId: 'depart-date',
  endId: 'return-date',
  startPlaceholder: 'Departure',
  endPlaceholder: 'Return',
});
assert(rangeDp.includes('id="flight-range"'), 'renderFlowbiteDateRangePicker must set container ID');
assert(rangeDp.includes('date-rangepicker'), 'renderFlowbiteDateRangePicker must set date-rangepicker attribute');
assert(rangeDp.includes('id="depart-date"'), 'renderFlowbiteDateRangePicker must set start input ID');
assert(rangeDp.includes('id="return-date"'), 'renderFlowbiteDateRangePicker must set end input ID');
assert(rangeDp.includes('name="start"'), 'renderFlowbiteDateRangePicker must set start name');
assert(rangeDp.includes('name="end"'), 'renderFlowbiteDateRangePicker must set end name');
assert(rangeDp.includes('placeholder="Departure"'), 'renderFlowbiteDateRangePicker must set start placeholder');
assert(rangeDp.includes('placeholder="Return"'), 'renderFlowbiteDateRangePicker must set end placeholder');
assert(rangeDp.includes('>to<'), 'renderFlowbiteDateRangePicker must include "to" separator');
console.log('✓ renderFlowbiteDateRangePicker generator verified');

const timepickerHtml = renderFlowbiteTimepicker({
  id: 'meeting-time',
  label: 'Appointment time:',
  min: '08:00',
  max: '20:00',
  value: '10:30',
});
assert(timepickerHtml.includes('max-w-[8rem]'), 'renderFlowbiteTimepicker must have max-w-[8rem]');
assert(timepickerHtml.includes('id="meeting-time"'), 'renderFlowbiteTimepicker must set ID');
assert(timepickerHtml.includes('for="meeting-time"'), 'renderFlowbiteTimepicker must link label');
assert(timepickerHtml.includes('Appointment time:'), 'renderFlowbiteTimepicker must render label text');
assert(timepickerHtml.includes('type="time"'), 'renderFlowbiteTimepicker must have type="time"');
assert(timepickerHtml.includes('min="08:00"'), 'renderFlowbiteTimepicker must set min');
assert(timepickerHtml.includes('max="20:00"'), 'renderFlowbiteTimepicker must set max');
assert(timepickerHtml.includes('value="10:30"'), 'renderFlowbiteTimepicker must set value');
assert(timepickerHtml.includes('pe-3.5'), 'renderFlowbiteTimepicker must include clock icon padding pe-3.5');
console.log('✓ renderFlowbiteTimepicker generator verified');

// 6. Test renderFlowbiteDatepickerShowcase containing all 9 official sections
const showcase = renderFlowbiteDatepickerShowcase();
assert(typeof showcase === 'string' && showcase.length > 1000, 'Showcase must return non-empty string');

// Section 1: Datepicker example
assert(showcase.includes('Datepicker Example') && showcase.includes('id="default-datepicker"'), 'Section 1 must be present');
assert(showcase.includes('placeholder="Select date"'), 'Section 1 must include default placeholder');

// Section 2: Date range picker
assert(showcase.includes('Date Range Picker') && showcase.includes('id="date-range-picker"'), 'Section 2 must be present');
assert(showcase.includes('id="datepicker-range-start"') && showcase.includes('id="datepicker-range-end"'), 'Section 2 range IDs must match');

// Section 3: Autohide
assert(showcase.includes('Autohide') && showcase.includes('id="datepicker-autohide"'), 'Section 3 must be present');
assert(showcase.includes('datepicker-autohide'), 'Section 3 must include datepicker-autohide attr');

// Section 4: Action buttons
assert(showcase.includes('Action Buttons') && showcase.includes('id="datepicker-actions"'), 'Section 4 must be present');
assert(showcase.includes('datepicker-buttons') && showcase.includes('datepicker-autoselect-today'), 'Section 4 action buttons attrs must be present');

// Section 5: Date format
assert(showcase.includes('Date Format (mm-dd-yyyy)') && showcase.includes('id="datepicker-format"'), 'Section 5 must be present');
assert(showcase.includes('datepicker-format="mm-dd-yyyy"'), 'Section 5 format attr must match');

// Section 6: Max and min dates
assert(showcase.includes('Max and Min Dates') && showcase.includes('id="datepicker-minmax"'), 'Section 6 must be present');
assert(showcase.includes('datepicker-min-date="06/04/2024"') && showcase.includes('datepicker-max-date="05/05/2025"'), 'Section 6 min/max dates must match');

// Section 7: Orientation
assert(showcase.includes('Orientation (bottom right)') && showcase.includes('id="datepicker-orientation"'), 'Section 7 must be present');
assert(showcase.includes('datepicker-orientation="bottom right"'), 'Section 7 orientation attr must match');

// Section 8: Title
assert(showcase.includes('Title') && showcase.includes('id="datepicker-title"'), 'Section 8 must be present');
assert(showcase.includes('datepicker-title="Flowbite datepicker"'), 'Section 8 title attr must match');

// Section 9: Timepicker
assert(showcase.includes('Timepicker') && showcase.includes('id="time"'), 'Section 9 must be present');
assert(showcase.includes('max-w-[8rem]') && showcase.includes('min="09:00"') && showcase.includes('max="18:00"'), 'Section 9 timepicker constraints must match');
console.log('✓ renderFlowbiteDatepickerShowcase verified with all 9 official sections');

// 7. Check CSS classes in flowbite-integration.css
const cssPath = fs.existsSync('Frontend/src/styles/flowbite-integration.css')
  ? path.resolve('Frontend/src/styles/flowbite-integration.css')
  : path.resolve(import.meta.dirname, '../Frontend/src/styles/flowbite-integration.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const requiredCssSelectors = [
  '.ps-9',
  '.pe-3',
  '.pe-3\\.5',
  '.ps-3\\.5',
  '.max-w-\\[8rem\\]',
  '.inset-y-0',
  '.start-0',
  '.mx-4',
  '.flowbite-datepicker-popover',
  '.flowbite-datepicker-grid',
  '.flowbite-datepicker-cell',
  '.flowbite-datepicker-cell.selected',
  '.flowbite-datepicker-cell.today:not(.selected)',
  '.flowbite-datepicker-cell.disabled',
  '.flowbite-datepicker-cell.muted',
];

requiredCssSelectors.forEach((selector) => {
  assert(cssContent.includes(selector), `CSS must include utility selector: ${selector}`);
});
console.log('✓ All 15 required Datepicker & Timepicker CSS classes verified in flowbite-integration.css');

console.log('\nALL FLOWBITE DATEPICKER TESTS PASSED SUCCESSFULLY! 🎉');
