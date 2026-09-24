/**
 * The field types a schema can use, and how to read their values.
 *
 * The original four types are joined by tags, checklist and entry link
 * (US-2.1–US-2.3), a project link (US-2.4) and a calculation (US-2.5). All
 * are described in the language the builder shows rather than by the name
 * the API uses: "project_reference" is a fine wire format and a poor label.
 *
 * Calculations are evaluated here as well as on the server. That duplication
 * is deliberate: the point of a calculated field is watching it settle as you
 * fill the entry in, which cannot wait for a round trip. The server remains
 * the authority — it recomputes every value on write and ignores whatever the
 * client sent — so a disagreement is a display bug, never bad data.
 *
 * The grammar is the same narrow one app/computed.py allows: numbers, field
 * references in braces, + - * / and parentheses. Nothing here goes near eval
 * or new Function, for the same reason the server does not.
 */

/**
 * Every field type in one place: the label the builder shows, the hint under
 * it, and — for the two types that are read-only on an entry — the badge that
 * marks them and the colour it wears.
 *
 * `badge: null` means the type gets no callout: a plain field needs no pill,
 * because being plain is the default a reader assumes. Only the exceptions
 * (linked, calculated) are pointed out, and only the registry decides what
 * those callouts say — every view that renders one reads it from here, so
 * renaming a badge or adding a type is one edit rather than a hunt.
 */
export const FIELD_TYPE_META = {
  text: { label: "Text", hint: "A line of writing.", badge: null },
  number: { label: "Number", hint: "A figure you can add up.", badge: null },
  date: { label: "Date", hint: "A calendar day.", badge: null },
  dropdown: { label: "Choice", hint: "One option from a fixed list.", badge: null },
  tags: { label: "Tags", hint: "Short labels you can filter the entry list by.", badge: null },
  checklist: { label: "Checklist", hint: "Sub-tasks ticked off inside the entry.", badge: null },
  link: { label: "Entry link", hint: "Points at another entry, so related work stays traceable.", badge: null },
  project_reference: {
    label: "Project link",
    hint: "Points at another of your projects.",
    badge: "Linked",
    color: "blue",
  },
  computed: {
    label: "Calculation",
    hint: "Worked out from the number fields on the same entry.",
    badge: "Calculated",
    color: "mauve",
  },
}

/** The registry as the builder's type list, in the order it is offered. */
export const FIELD_TYPES = Object.entries(FIELD_TYPE_META).map(([value, meta]) => ({
  value,
  ...meta,
}))

/** Types a calculation is allowed to read. */
export const NUMERIC_FIELD_TYPES = ["number", "computed"]

/** Types the person filling in an entry does not type a value for. */
export const READ_ONLY_FIELD_TYPES = ["computed"]

export function fieldTypeLabel(type) {
  return FIELD_TYPE_META[type]?.label || type
}

export function isNumericField(field) {
  return NUMERIC_FIELD_TYPES.includes(field?.type)
}

// ── Structured search operators (US-3.11) ───────────────────────────────────

/**
 * Which operators the search backend accepts for each field type, and the
 * plain-language question each one asks. Kept in one place so the condition
 * builder's dropdowns can never drift from what app/search.py on the backend
 * actually validates and evaluates.
 */
export const SEARCH_OPERATORS_BY_TYPE = {
  text: [
    { value: "contains", label: "contains" },
    { value: "equals", label: "is exactly" },
  ],
  number: [
    { value: "equals", label: "equals" },
    { value: "gt", label: "is more than" },
    { value: "gte", label: "is at least" },
    { value: "lt", label: "is less than" },
    { value: "lte", label: "is at most" },
    { value: "between", label: "is between" },
  ],
  computed: [
    { value: "equals", label: "equals" },
    { value: "gt", label: "is more than" },
    { value: "gte", label: "is at least" },
    { value: "lt", label: "is less than" },
    { value: "lte", label: "is at most" },
    { value: "between", label: "is between" },
  ],
  date: [
    { value: "on", label: "is on" },
    { value: "before", label: "is before" },
    { value: "after", label: "is after" },
    { value: "between", label: "is between" },
  ],
  dropdown: [
    { value: "equals", label: "is" },
    { value: "in", label: "is one of" },
  ],
  tags: [
    { value: "has", label: "includes the tag" },
    { value: "has_any", label: "includes any of" },
    { value: "has_all", label: "includes all of" },
  ],
  checklist: [
    { value: "contains", label: "has an item mentioning" },
    { value: "complete", label: "is fully checked off" },
  ],
  link: [
    { value: "is_set", label: "is set" },
    { value: "is_empty", label: "is empty" },
  ],
  project_reference: [
    { value: "is_set", label: "is set" },
    { value: "is_empty", label: "is empty" },
  ],
}

/** The operators offered for a field, or an empty list for an unknown type. */
export function searchOperatorsFor(fieldType) {
  return SEARCH_OPERATORS_BY_TYPE[fieldType] || []
}

// ── Expressions ──────────────────────────────────────────────────────────────

const PLACEHOLDER = /\{\s*([^{}]+?)\s*\}/g

/** The field ids an expression reads, in the order they first appear. */
export function referencedFieldIds(expression) {
  const seen = []
  for (const match of String(expression || "").matchAll(PLACEHOLDER)) {
    if (!seen.includes(match[1])) seen.push(match[1])
  }
  return seen
}

/**
 * Map every way of naming a field to its id.
 *
 * Ids are matched exactly; names are matched ignoring case and surrounding
 * space, the same rule that keeps schema names unique. Ids win over a name
 * that happens to look like one — the same order the server resolves in.
 */
export function fieldResolution(schema) {
  const resolution = new Map()
  for (const field of schema || []) resolution.set(field.id, field.id)
  for (const field of schema || []) {
    const key = (field.name || "").trim().toLowerCase()
    if (key && !resolution.has(key)) resolution.set(key, field.id)
  }
  return resolution
}

/** The field id a reference token names, or null if it names nothing. */
function resolveToken(token, resolution) {
  if (resolution.has(token)) return resolution.get(token)
  return resolution.get(String(token).trim().toLowerCase()) ?? null
}

/**
 * The expression with every reference written as a field id.
 *
 * The server stores expressions this way, so this is the form a save sends
 * and the form two schemas are compared in; a reference by name is a person's
 * shorthand, resolved here the same way the server resolves it.
 */
export function expressionCanonical(expression, schema) {
  const resolution = fieldResolution(schema)
  return String(expression || "").replace(PLACEHOLDER, (match, token) => {
    const id = resolveToken(token, resolution)
    return id ? `{${id}}` : match
  })
}

/**
 * The expression with every reference written as a field name.
 *
 * The editing form: a person is shown — and writes — the name they gave the
 * field, never the id the database knows it by.
 */
export function expressionToDisplay(expression, schema) {
  const resolution = fieldResolution(schema)
  const byId = new Map((schema || []).map((field) => [field.id, field]))
  return String(expression || "").replace(PLACEHOLDER, (match, token) => {
    const field = byId.get(resolveToken(token, resolution))
    return field ? `{${field.name}}` : match
  })
}

/**
 * A field's new name, wherever a calculation refers to it by the old one.
 *
 * Renaming a field in the builder renames it in every calculation at the same
 * moment — otherwise the calculation would be left referring to a field that
 * is no longer called that, and the rename would read as a break.
 */
export function renameFieldInExpression(expression, fromName, toName) {
  const from = String(fromName || "").trim().toLowerCase()
  if (!from) return expression
  return String(expression || "").replace(PLACEHOLDER, (match, token) =>
    token.trim().toLowerCase() === from ? `{${toName}}` : match
  )
}

function tokenise(source) {
  const tokens = []
  let index = 0

  while (index < source.length) {
    const character = source[index]

    if (/\s/.test(character)) {
      index += 1
      continue
    }

    if ("+-*/()".includes(character)) {
      tokens.push({ type: character })
      index += 1
      continue
    }

    if (character === "{") {
      const end = source.indexOf("}", index)
      if (end === -1) throw new Error("A field reference is missing its closing brace.")
      tokens.push({ type: "ref", id: source.slice(index + 1, end).trim() })
      index = end + 1
      continue
    }

    const number = /^\d+(\.\d+)?/.exec(source.slice(index))
    if (number) {
      tokens.push({ type: "number", value: Number(number[0]) })
      index += number[0].length
      continue
    }

    // Letters are almost always a field name typed bare, which is the natural
    // first attempt. Mirrors the message the server gives an ast.Name node.
    if (/[a-zA-Z]/.test(character)) {
      throw new Error(
        "Refer to a field by its name in braces, like {Hours}, rather than by its bare name, and use numbers for everything else."
      )
    }

    throw new Error(
      "An expression can only contain numbers, field references and + - * /."
    )
  }

  return tokens
}

/**
 * Parse an expression into a tree, or throw with a message fit to show.
 *
 * Ordinary precedence: a sum of products of signed values, with parentheses.
 */
export function parseExpression(expression) {
  const tokens = tokenise(String(expression || ""))
  let position = 0

  const peek = () => tokens[position]
  const take = (type) => {
    if (peek()?.type !== type) throw new Error("This expression is incomplete or mistyped.")
    return tokens[position++]
  }

  const parseSum = () => {
    let left = parseProduct()
    while (peek()?.type === "+" || peek()?.type === "-") {
      const operator = tokens[position++].type
      left = { kind: "binary", operator, left, right: parseProduct() }
    }
    return left
  }

  const parseProduct = () => {
    let left = parseValue()
    while (peek()?.type === "*" || peek()?.type === "/") {
      const operator = tokens[position++].type
      left = { kind: "binary", operator, left, right: parseValue() }
    }
    return left
  }

  const parseValue = () => {
    const token = peek()
    if (!token) throw new Error("This expression is incomplete or mistyped.")

    if (token.type === "-" || token.type === "+") {
      position += 1
      return { kind: "unary", operator: token.type, operand: parseValue() }
    }
    if (token.type === "number") {
      position += 1
      return { kind: "number", value: token.value }
    }
    if (token.type === "ref") {
      position += 1
      return { kind: "ref", id: token.id }
    }
    if (token.type === "(") {
      position += 1
      const inner = parseSum()
      take(")")
      return inner
    }

    throw new Error("This expression is incomplete or mistyped.")
  }

  if (tokens.length === 0) throw new Error("A calculation needs an expression.")

  const tree = parseSum()
  if (position !== tokens.length) throw new Error("This expression is incomplete or mistyped.")
  return tree
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "boolean") return null
  const number = typeof value === "number" ? value : Number(String(value).trim())
  return Number.isFinite(number) ? number : null
}

function evaluateNode(node, values) {
  if (node.kind === "number") return node.value
  if (node.kind === "ref") return asNumber(values[node.id])

  if (node.kind === "unary") {
    const operand = evaluateNode(node.operand, values)
    if (operand === null) return null
    return node.operator === "-" ? -operand : operand
  }

  const left = evaluateNode(node.left, values)
  const right = evaluateNode(node.right, values)
  if (left === null || right === null) return null

  switch (node.operator) {
    case "+":
      return left + right
    case "-":
      return left - right
    case "*":
      return left * right
    default:
      // Matching the server: dividing by nothing leaves the field unknown
      // rather than showing Infinity or NaN.
      return right === 0 ? null : left / right
  }
}

/**
 * The value of an expression given what the entry holds so far.
 *
 * `null` means "not known yet" — a source is empty, holds something that is
 * not a number, or the arithmetic could not be done. Rounded to six decimals
 * so that 0.1 + 0.2 reads as 0.3 rather than as a bug.
 */
export function evaluateExpression(expression, values) {
  let tree
  try {
    tree = parseExpression(expression)
  } catch {
    return null
  }

  const result = evaluateNode(tree, values || {})
  if (result === null || !Number.isFinite(result)) return null
  return Math.round(result * 1e6) / 1e6
}

/**
 * Evaluate every calculation in a schema, in an order that lets one
 * calculation read another.
 *
 * Ten passes is far more than any real schema needs and cannot loop forever
 * on a circular reference, which the server refuses to save anyway.
 *
 * Expressions are canonicalised to ids first: the values they read are keyed
 * by id, and a schema saved through the builder can hold name references
 * until the server has stored the canonical form.
 */
export function withComputedValues(values, schema) {
  const computed = (schema || []).filter((field) => field.type === "computed")
  if (computed.length === 0) return values

  const result = { ...values }
  for (let pass = 0; pass < Math.min(computed.length, 10); pass += 1) {
    for (const field of computed) {
      result[field.id] = evaluateExpression(
        expressionCanonical(field.expression, schema),
        result
      )
    }
  }
  return result
}

/**
 * A figure to show beside a formula while it is being written.
 *
 * Prefers the project's most recent entry, so what the owner checks against is
 * a number they recognise from their own logbook; falls back to a fixed sample
 * when there is no entry yet, or when the entry cannot produce one. `null`
 * means not even a sample could be worked out.
 */
export function previewExpressionValue(expression, latestData, schema) {
  const canonical = expressionCanonical(expression, schema)
  const referenced = referencedFieldIds(canonical)
  if (referenced.length === 0) {
    const value = evaluateExpression(canonical, {})
    return value === null ? null : { value, fromEntry: false }
  }

  if (latestData) {
    const value = evaluateExpression(canonical, latestData)
    if (value !== null) return { value, fromEntry: true }
  }

  const samples = {}
  for (const id of referenced) samples[id] = 2
  const value = evaluateExpression(canonical, samples)
  return value === null ? null : { value, fromEntry: false }
}

/**
 * Why an expression cannot be saved, or `null` if it can.
 *
 * The same rules the server applies, checked as the field is typed so the
 * builder can explain the problem next to the input rather than after a
 * failed save. References are accepted by name or by id, exactly as the
 * server accepts them.
 */
export function expressionError(expression, field, schema) {
  if (!String(expression || "").trim()) return "A calculation needs an expression."

  try {
    parseExpression(expression)
  } catch (error) {
    return error.message
  }

  const byId = new Map((schema || []).map((entry) => [entry.id, entry]))
  const byName = new Map(
    (schema || []).map((entry) => [(entry.name || "").trim().toLowerCase(), entry])
  )

  for (const reference of referencedFieldIds(expression)) {
    const source =
      byId.get(reference) || byName.get(String(reference).trim().toLowerCase())

    if (!source) return "This calculation uses a field that is no longer in the schema."
    if (source.id === field.id) return "A calculation cannot use its own result."
    if (!isNumericField(source)) {
      return `'${source.name || "That field"}' is not a number, so it cannot be part of a calculation.`
    }
  }

  return null
}

/** An expression with references written as names, for reading rather than editing. */
export function describeExpression(expression, schema) {
  const resolution = fieldResolution(schema)
  const byId = new Map((schema || []).map((field) => [field.id, field]))
  return String(expression || "").replace(PLACEHOLDER, (_match, token) => {
    const field = byId.get(resolveToken(token, resolution))
    return field?.name || "unknown field"
  })
}
