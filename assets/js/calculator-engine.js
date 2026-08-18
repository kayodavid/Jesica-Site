export const CALCULATOR_DEFINITION_SEPARATOR = '\n\n---DEFINIÇÃO-DA-CALCULADORA---\n\n';
export const CUSTOM_CALCULATOR_PREFIX = 'custom_';

const FUNCTION_NAMES = ['sqrt', 'pow', 'abs', 'round', 'floor', 'ceil', 'min', 'max', 'log', 'exp', 'sin', 'cos', 'tan'];
const CONSTANT_NAMES = ['PI', 'E'];
const SAFE_EXPRESSION = /^[0-9A-Za-z_+\-*/%^().,\s]+$/;

function cleanText(value, maxLength = 180) { return String(value || '').trim().slice(0, maxLength); }

export function createCustomCalculatorType() {
  const suffix = (globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  return `${CUSTOM_CALCULATOR_PREFIX}${suffix}`;
}

export function isCustomCalculatorType(value) { return String(value || '').startsWith(CUSTOM_CALCULATOR_PREFIX); }

export function validateCustomDefinition(rawDefinition) {
  const definition = rawDefinition && typeof rawDefinition === 'object' ? rawDefinition : {};
  const fields = Array.isArray(definition.fields) ? definition.fields.map((field, index) => ({
    id: cleanText(field?.id, 32).toLowerCase(),
    label: cleanText(field?.label, 80),
    unit: cleanText(field?.unit, 24),
    placeholder: cleanText(field?.placeholder, 80),
    min: field?.min === '' || field?.min === undefined || field?.min === null ? null : Number(field.min)
  })) : [];
  if (!fields.length) throw new Error('Adicione ao menos um campo de entrada.');
  const identifiers = new Set();
  fields.forEach((field, index) => {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(field.id)) throw new Error(`O identificador do campo ${index + 1} deve usar letras minúsculas, números e _.`);
    if (identifiers.has(field.id)) throw new Error('Os identificadores dos campos não podem se repetir.');
    if (!field.label) throw new Error(`Informe o nome do campo ${index + 1}.`);
    if (field.min !== null && !Number.isFinite(field.min)) throw new Error(`Informe um mínimo válido para ${field.label}.`);
    identifiers.add(field.id);
  });
  const formula = cleanText(definition.formula, 500).replace(/\s+/g, ' ');
  if (!formula) throw new Error('Informe a fórmula matemática.');
  if (!SAFE_EXPRESSION.test(formula)) throw new Error('A fórmula contém caracteres não permitidos. Use números, campos, parênteses e operadores matemáticos.');
  const normalizedFormula = formula.replace(/\^/g, '**').replace(/,/g, '.');
  const identifiersInFormula = normalizedFormula.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const allowedNames = new Set([...identifiers, ...FUNCTION_NAMES, ...CONSTANT_NAMES]);
  identifiersInFormula.forEach(name => { if (!allowedNames.has(name)) throw new Error(`O termo “${name}” não corresponde a um campo ou função permitida.`); });
  const decimals = Number.isInteger(Number(definition.decimals)) ? Math.max(0, Math.min(4, Number(definition.decimals))) : 2;
  return {
    version: 1,
    fields,
    formula,
    unit: cleanText(definition.unit, 32),
    decimals,
    resultNote: cleanText(definition.resultNote, 360)
  };
}

export function evaluateCustomFormula(definition, values) {
  const valid = validateCustomDefinition(definition);
  const argumentNames = valid.fields.map(field => field.id);
  const argumentsValues = argumentNames.map(name => Number(values[name]));
  if (argumentsValues.some(value => !Number.isFinite(value))) throw new Error('Preencha todos os campos com números válidos.');
  const executable = valid.formula.replace(/\^/g, '**').replace(/,/g, '.').replace(/\b(sqrt|pow|abs|round|floor|ceil|min|max|log|exp|sin|cos|tan)\b/g, 'Math.$1').replace(/\b(PI|E)\b/g, 'Math.$1');
  const calculate = new Function(...argumentNames, `"use strict"; return (${executable});`);
  const result = Number(calculate(...argumentsValues));
  if (!Number.isFinite(result)) throw new Error('A fórmula não produziu um resultado numérico válido.');
  return { value: result, definition: valid };
}

export function encodeCalculatorContent(description, references, definition = null) {
  const base = `${String(description || '').trim()}\n\n---REFERÊNCIAS---\n\n${String(references || '').trim()}`.replace(/^\n+|\n+$/g, '');
  return definition ? `${base}${CALCULATOR_DEFINITION_SEPARATOR}${JSON.stringify(definition)}` : base;
}

export function decodeCalculatorContent(content) {
  const [textContent, ...definitionParts] = String(content || '').split(CALCULATOR_DEFINITION_SEPARATOR);
  const [description, ...referenceParts] = textContent.split('\n\n---REFERÊNCIAS---\n\n');
  let definition = null;
  if (definitionParts.length) {
    try { definition = validateCustomDefinition(JSON.parse(definitionParts.join(CALCULATOR_DEFINITION_SEPARATOR))); } catch {}
  }
  return { description: String(description || '').trim(), references: referenceParts.join('\n\n---REFERÊNCIAS---\n\n').trim(), definition };
}
