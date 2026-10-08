import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInvoice } from './engine.js';

const validInvoice = () => ({
  invoiceHeader: {
    invoiceNumber: 'INV-1001',
    invoiceDate: '2024-05-01',
    dueDate: '31/05/2024',
    subtotalAmount: '$30.00',
    taxAmount: '$2.00',
    totalAmountDue: '$32.00',
    currency: 'USD',
  },
  shipmentDetails: [{
    trackingNumber: 'TRACK-1',
    chargeLineItems: [
      { quantity: 2, unitPriceRate: '$10.00', lineSubtotal: '$20.00', totalLineAmount: '$20.00' },
      { quantity: 1, unitPriceRate: '$10.00', lineSubtotal: '$10.00', totalLineAmount: '$10.00' },
    ],
  }],
});

const resultFor = (validation, ruleId) => validation.results.find((result) => result.ruleId === ruleId);

test('a fully valid invoice has no failures', () => {
  const validation = validateInvoice(validInvoice());
  assert.deepEqual(validation.failedFields, []);
  assert.ok(validation.results.length > 0);
  assert.ok(validation.results.every((result) => result.passed));
});

test('wrong invoice total fails and marks all related fields', () => {
  const invoice = validInvoice();
  invoice.invoiceHeader.totalAmountDue = '$35.00';
  const validation = validateInvoice(invoice);

  assert.equal(resultFor(validation, 'invoice-total-matches-subtotal-and-tax').passed, false);
  assert.deepEqual(
    resultFor(validation, 'invoice-total-matches-subtotal-and-tax').fieldPaths,
    [
      'invoiceHeader.subtotalAmount',
      'invoiceHeader.taxAmount',
      'invoiceHeader.totalAmountDue',
    ],
  );
  for (const path of [
    'invoiceHeader.subtotalAmount',
    'invoiceHeader.taxAmount',
    'invoiceHeader.totalAmountDue',
  ]) assert.ok(validation.failedFields.includes(path));
});

test('number parsing removes currency symbols, spaces, and commas', () => {
  const invoice = validInvoice();
  invoice.invoiceHeader.subtotalAmount = ' $1,234.50 ';
  invoice.invoiceHeader.taxAmount = '$65.50';
  invoice.invoiceHeader.totalAmountDue = '$1,300.00';
  const validation = validateInvoice(invoice);

  assert.equal(resultFor(validation, 'invoice-total-matches-subtotal-and-tax').passed, true);
});

test('a wrong quantity-price product identifies only the exact charge line', () => {
  const invoice = validInvoice();
  invoice.shipmentDetails[0].chargeLineItems[1].lineSubtotal = '$12.00';
  const validation = validateInvoice(invoice);
  const productFailures = validation.results.filter(
    (result) => result.ruleId === 'charge-line-subtotal-matches-quantity-and-price' && !result.passed,
  );

  assert.equal(productFailures.length, 1);
  assert.deepEqual(productFailures[0].fieldPaths, [
    'shipmentDetails[0].chargeLineItems[1].quantity',
    'shipmentDetails[0].chargeLineItems[1].unitPriceRate',
    'shipmentDetails[0].chargeLineItems[1].lineSubtotal',
  ]);
});

test('future invoice date fails', () => {
  const invoice = validInvoice();
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 2);
  invoice.invoiceHeader.invoiceDate = future.toISOString().slice(0, 10);

  const validation = validateInvoice(invoice);
  assert.equal(resultFor(validation, 'invoice-date-not-future').passed, false);
});

test('date parser accepts ISO, day-first, month-first, and abbreviated-month formats', () => {
  const invoice = validInvoice();
  invoice.invoiceHeader.invoiceDate = '01-May-2024';
  invoice.invoiceHeader.dueDate = '05/31/2024';

  const validation = validateInvoice(invoice);
  assert.equal(resultFor(validation, 'invoice-date-not-future').passed, true);
  assert.equal(resultFor(validation, 'due-date-after-invoice-date').passed, true);
});

test('due date before invoice date fails', () => {
  const invoice = validInvoice();
  invoice.invoiceHeader.invoiceDate = '2024-06-10';
  invoice.invoiceHeader.dueDate = '2024-06-09';

  const validation = validateInvoice(invoice);
  assert.equal(resultFor(validation, 'due-date-after-invoice-date').passed, false);
});

test('invalid currency fails', () => {
  const invoice = validInvoice();
  invoice.invoiceHeader.currency = 'US1';

  const validation = validateInvoice(invoice);
  assert.equal(resultFor(validation, 'currency-is-valid-iso-4217').passed, false);
  assert.ok(validation.failedFields.includes('invoiceHeader.currency'));
});

test('empty, null, missing, and empty-array data do not fail', () => {
  for (const data of [
    null,
    {},
    { invoiceHeader: null, shipmentDetails: null },
    { invoiceHeader: {}, shipmentDetails: [], chargeLineItems: [] },
    { invoiceHeader: { invoiceNumber: null, invoiceDate: '', dueDate: null }, shipmentDetails: [{ chargeLineItems: [] }] },
  ]) {
    const validation = validateInvoice(data);
    assert.deepEqual(validation.failedFields, []);
    assert.ok(validation.results.every((result) => result.passed));
  }
});

test('shipmentDetail and lineItems aliases are validated with their real paths', () => {
  const invoice = {
    invoiceHeader: {
      invoiceNumber: 'INV-ALIAS',
      invoiceDate: '2024-05-01',
      dueDate: '2024-05-02',
      subtotalAmount: '20',
      taxAmount: '0',
      totalAmountDue: '20',
      currency: 'EUR',
    },
    shipmentDetail: [{
      lineItems: [
        { quantity: 1, unitPriceRate: '10', lineSubtotal: '10', totalLineAmount: '10' },
        { quantity: 2, unitPriceRate: '10', lineSubtotal: '15', totalLineAmount: '10' },
      ],
    }],
  };
  const validation = validateInvoice(invoice);
  const productFailure = validation.results.find(
    (result) => result.ruleId === 'charge-line-subtotal-matches-quantity-and-price' && !result.passed,
  );

  assert.deepEqual(productFailure.fieldPaths, [
    'shipmentDetail[0].lineItems[1].quantity',
    'shipmentDetail[0].lineItems[1].unitPriceRate',
    'shipmentDetail[0].lineItems[1].lineSubtotal',
  ]);
  assert.ok(validation.failedFields.includes('shipmentDetail[0].lineItems[1].lineSubtotal'));
});

test('items alias is accepted for nested charge lines', () => {
  const invoice = validInvoice();
  invoice.shipmentDetails[0].items = invoice.shipmentDetails[0].chargeLineItems;
  delete invoice.shipmentDetails[0].chargeLineItems;
  invoice.shipmentDetails[0].items[1].lineSubtotal = '12';

  const validation = validateInvoice(invoice);
  const failure = validation.results.find(
    (result) => result.ruleId === 'charge-line-subtotal-matches-quantity-and-price' && !result.passed,
  );
  assert.deepEqual(failure.fieldPaths, [
    'shipmentDetails[0].items[1].quantity',
    'shipmentDetails[0].items[1].unitPriceRate',
    'shipmentDetails[0].items[1].lineSubtotal',
  ]);
});

test('missing invoice number fails only when another header value proves extraction occurred', () => {
  const invoice = validInvoice();
  invoice.invoiceHeader.invoiceNumber = '';
  const validation = validateInvoice(invoice);
  assert.equal(resultFor(validation, 'invoice-number-required').passed, false);
  delete invoice.invoiceHeader.invoiceNumber;
  const missingNumberValidation = validateInvoice(invoice);
  assert.equal(resultFor(missingNumberValidation, 'invoice-number-required').passed, false);
  assert.ok(missingNumberValidation.failedFields.includes('invoiceHeader.invoiceNumber'));

  invoice.invoiceHeader = { invoiceNumber: '', optionalObject: {}, optionalArray: [] };
  assert.equal(resultFor(validateInvoice(invoice), 'invoice-number-required'), undefined);
});

test('unparseable dates are skipped rather than failed', () => {
  const invoice = validInvoice();
  invoice.invoiceHeader.invoiceDate = 'not a date';
  invoice.invoiceHeader.dueDate = 'also not a date';
  const validation = validateInvoice(invoice);

  assert.equal(resultFor(validation, 'invoice-date-not-future'), undefined);
  assert.equal(resultFor(validation, 'due-date-after-invoice-date'), undefined);
  assert.deepEqual(validation.failedFields, []);
});

test('line sum check is a warning and honors the configured tolerance', () => {
  const invoice = validInvoice();
  invoice.invoiceHeader.subtotalAmount = '30.01';
  const validation = validateInvoice(invoice);
  const sumResult = resultFor(validation, 'charge-lines-match-invoice-subtotal');

  assert.equal(sumResult.severity, 'warning');
  assert.equal(sumResult.passed, true);

  invoice.invoiceHeader.subtotalAmount = '35.00';
  const failedSum = resultFor(
    validateInvoice(invoice),
    'charge-lines-match-invoice-subtotal',
  );
  assert.equal(failedSum.passed, false);
  assert.deepEqual(failedSum.fieldPaths, [
    'invoiceHeader.subtotalAmount',
    'shipmentDetails[0].chargeLineItems[0].totalLineAmount',
    'shipmentDetails[0].chargeLineItems[1].totalLineAmount',
  ]);
});

test('legacy-shaped payload does not throw and produces no failures', () => {
  const legacy = {
    shipmentNumber: 'SHIP-1',
    totalAmount: 100,
    lineItems: [{ description: 'Freight', quantity: 2, unitPrice: 50, totalPrice: 100 }],
  };
  assert.doesNotThrow(() => validateInvoice(legacy));
  assert.deepEqual(validateInvoice(legacy).failedFields, []);
});

test('wrapped invoice payload is unwrapped and results are JSON serializable', () => {
  const wrapped = { data: { extractedData: JSON.stringify(validInvoice()) } };
  const validation = validateInvoice(wrapped);
  assert.deepEqual(validation.failedFields, []);
  assert.doesNotThrow(() => JSON.stringify(validation));
});
