import defaultRules from './rulesConfig.js';

const FIELD_ALIASES = {
  invoiceHeader: ['invoiceHeader', 'invoice_header', 'header'],
  shipmentDetails: ['shipmentDetails', 'shipmentDetail', 'shipments', 'shipment'],
  chargeLineItems: ['chargeLineItems', 'lineItems', 'items'],
};

const hasValue = (value) => (
  value !== null
  && value !== undefined
  && !(typeof value === 'string' && value.trim() === '')
);

const hasContent = (value) => {
  if (!hasValue(value)) return false;
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === 'object') return Object.values(value).some(hasContent);
  return true;
};

const parseNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.replace(/[\s,\p{Sc}]/gu, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const makeUtcDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
};

const parseDate = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : makeUtcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return makeUtcDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    if (first > 12) return makeUtcDate(year, second, first);
    if (second > 12) return makeUtcDate(year, first, second);
    return makeUtcDate(year, first, second);
  }

  match = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.indexOf(match[2].toLowerCase()) + 1;
    return month ? makeUtcDate(Number(match[3]), month, Number(match[1])) : null;
  }
  return null;
};

const unwrapInvoice = (input) => {
  let value = input;
  const visited = new Set();
  while (value && typeof value === 'object' && !Array.isArray(value) && !visited.has(value)) {
    visited.add(value);
    const wrapperKey = ['extractedData', 'canonicalJson', 'data', 'json']
      .find((key) => value[key] !== undefined && value[key] !== null);
    if (!wrapperKey) break;
    value = value[wrapperKey];
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return {};
      }
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};

const keyCandidates = (key) => FIELD_ALIASES[key] || [key];

const resolveField = (data, fieldPath) => {
  const segments = fieldPath.split('.');
  const walk = (value, segmentIndex, actualPath) => {
    if (segmentIndex >= segments.length) return [{ value, path: actualPath }];
    if (!value || typeof value !== 'object') return [];

    const segment = segments[segmentIndex];
    const isArraySegment = segment.endsWith('[]');
    const canonicalKey = isArraySegment ? segment.slice(0, -2) : segment;
    const actualKey = keyCandidates(canonicalKey).find((candidate) => (
      Object.prototype.hasOwnProperty.call(value, candidate)
    ));
    if (!actualKey) return [];

    const child = value[actualKey];
    const keyPath = actualPath ? `${actualPath}.${actualKey}` : actualKey;
    if (!isArraySegment) return walk(child, segmentIndex + 1, keyPath);
    if (!Array.isArray(child)) return [];

    return child.flatMap((item, index) => (
      walk(item, segmentIndex + 1, `${keyPath}[${index}]`)
    ));
  };
  return walk(data, 0, '');
};

const valuesForRule = (data, fields) => fields.map((field) => resolveField(data, field));

const createResult = (rule, passed, fieldPaths) => ({
  ruleId: rule.id,
  passed,
  severity: rule.severity,
  message: rule.message,
  fieldPaths: [...new Set(fieldPaths)],
});

const isWithinTolerance = (actual, expected, tolerance) => (
  Math.abs(actual - expected) <= tolerance
);

const evaluateRule = (data, rule) => {
  if (!rule.enabled) return [];

  const resolved = valuesForRule(data, rule.fields || []);
  const tolerance = Number.isFinite(Number(rule.params?.tolerance))
    ? Number(rule.params.tolerance)
    : 0;

  switch (rule.type) {
    case 'required': {
      const target = resolved[0]?.[0];
      const gatePath = rule.params?.whenOtherFieldsPresent?.[0];
      let targetPath = target?.path || rule.fields?.[0];
      if (gatePath) {
        const gateEntry = resolveField(data, gatePath)[0];
        const gate = gateEntry?.value;
        if (!gate || typeof gate !== 'object' || Array.isArray(gate)) return [];
        const hasOtherExtractedValue = Object.entries(gate).some(([key, value]) => (
          key !== rule.params.excludeField && hasContent(value)
        ));
        if (!hasOtherExtractedValue) return [];
        if (!target) {
          const requiredKey = rule.fields?.[0]?.split('.').at(-1);
          targetPath = `${gateEntry.path}.${requiredKey}`;
        }
      }
      return [createResult(rule, Boolean(target && hasValue(target.value)), [targetPath])];
    }

    case 'date_not_future': {
      const target = resolved[0]?.[0];
      if (!target || !hasValue(target.value)) return [];
      const date = parseDate(target.value);
      if (!date) return [];
      const today = new Date();
      const todayUtc = makeUtcDate(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
      return [createResult(rule, date <= todayUtc, [target.path])];
    }

    case 'date_order': {
      const earlier = resolved[0]?.[0];
      const later = resolved[1]?.[0];
      if (!earlier || !later || !hasValue(earlier.value) || !hasValue(later.value)) return [];
      const earlierDate = parseDate(earlier.value);
      const laterDate = parseDate(later.value);
      if (!earlierDate || !laterDate) return [];
      const passed = rule.params?.order === 'not_after'
        ? earlierDate >= laterDate
        : laterDate >= earlierDate;
      return [createResult(rule, passed, [earlier.path, later.path])];
    }

    case 'sum_equals': {
      const operands = resolved.map((items) => items[0]);
      if (operands.length !== 3 || operands.some((item) => !item || !hasValue(item.value))) return [];
      const numbers = operands.map((item) => parseNumber(item.value));
      if (numbers.some((number) => number === null)) return [];
      return [createResult(
        rule,
        isWithinTolerance(numbers[0] + numbers[1], numbers[2], tolerance),
        operands.map((item) => item.path),
      )];
    }

    case 'product_equals': {
      if (resolved.length !== 3) return [];
      const [quantities, unitPrices, subtotals] = resolved;
      const subtotalByPath = new Map(subtotals.map((item) => [item.path.replace(/\.lineSubtotal$/, ''), item]));
      const unitPriceByPath = new Map(unitPrices.map((item) => [item.path.replace(/\.unitPriceRate$/, ''), item]));
      return quantities.flatMap((quantity) => {
        const linePath = quantity.path.replace(/\.quantity$/, '');
        const unitPrice = unitPriceByPath.get(linePath);
        const subtotal = subtotalByPath.get(linePath);
        if (
          !hasValue(quantity.value)
          || !unitPrice
          || !subtotal
          || !hasValue(unitPrice.value)
          || !hasValue(subtotal.value)
        ) return [];
        const quantityNumber = parseNumber(quantity.value);
        const unitPriceNumber = parseNumber(unitPrice.value);
        const subtotalNumber = parseNumber(subtotal.value);
        if ([quantityNumber, unitPriceNumber, subtotalNumber].some((number) => number === null)) return [];
        return [createResult(
          rule,
          isWithinTolerance(quantityNumber * unitPriceNumber, subtotalNumber, tolerance),
          [quantity.path, unitPrice.path, subtotal.path],
        )];
      });
    }

    case 'line_sum_equals': {
      const subtotal = resolved[0]?.[0];
      if (!subtotal || !hasValue(subtotal.value)) return [];
      const subtotalNumber = parseNumber(subtotal.value);
      if (subtotalNumber === null) return [];
      const lineAmounts = resolved[1] || [];
      const presentAmounts = lineAmounts.filter((item) => hasValue(item.value));
      if (presentAmounts.length === 0) return [];
      const amountNumbers = presentAmounts.map((item) => parseNumber(item.value));
      if (amountNumbers.some((number) => number === null)) return [];
      return [createResult(
        rule,
        isWithinTolerance(amountNumbers.reduce((sum, number) => sum + number, 0), subtotalNumber, tolerance),
        [subtotal.path, ...presentAmounts.map((item) => item.path)],
      )];
    }

    case 'valid_currency': {
      const currency = resolved[0]?.[0];
      if (!currency || !hasValue(currency.value)) return [];
      const allowed = rule.params?.allowedCurrencies || [];
      const passed = /^[A-Z]{3}$/.test(currency.value)
        && allowed.includes(currency.value);
      return [createResult(rule, passed, [currency.path])];
    }

    default:
      return [];
  }
};

export const validateInvoice = (data, rules = defaultRules) => {
  const invoice = unwrapInvoice(data);
  const results = (Array.isArray(rules) ? rules : [])
    .flatMap((rule) => evaluateRule(invoice, rule));
  const failedFields = [...new Set(
    results.filter((result) => !result.passed).flatMap((result) => result.fieldPaths),
  )];
  return { results, failedFields };
};

export default validateInvoice;
