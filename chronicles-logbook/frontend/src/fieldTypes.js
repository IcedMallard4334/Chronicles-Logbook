/**
 * The field types a schema can use, and how to read their values.
 *
 * The two additions here are a project link (US-2.4) and a calculation
 * (US-2.5). Both are described in the language the builder shows rather than
 * by the name the API uses: "project_reference" is a fine wire format and a
 * poor label.
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

export const FIELD_TYPES = [
  { value: "text", label: "Text", hint: "A line of writing." },
  { value: "number", label: "Number", hint: "A figure you can add up." },
  { value: "date", label: "Date", hint: "A calendar day." },
  { value: "dropdown", label: "Choice", hint: "One option from a fixed list." },
  {
    value: "project_reference",
    label: "Project link",
    hint: "Points at another of your projects.",
  },
  {
    value: "computed",
    label: "Calculation",
    hint: "Worked out from the number fields on the same entry.",
  },
]

/** Types a calculation is allowed to read. */
export const NUMERIC_FIELD_TYPES = ["number", "computed"]

/** Types the person filling in an entry does not type a value for. */
export const READ_ONLY_FIELD_TYPES = ["computed"]

export function fieldTypeLabel(type) {
  return FIELD_TYPES.find((entry) => entry.value === type)?.label || type
}

export function isNumericField(field) {
  return NUMERIC_FIELD_TYPES.includes(field?.type)
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
        "Refer to a field as {field} rather than by name, and use numbers for everything else."
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
 */
export function withComputedValues(values, schema) {
  const computed = (schema || []).filter((field) => field.type === "computed")
  if (computed.length === 0) return values

  const result = { ...values }
  for (let pass = 0; pass < Math.min(computed.length, 10); pass += 1) {
    for (const field of computed) {
      result[field.id] = evaluateExpression(field.expression, result)
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
export function previewExpressionValue(expression, latestData) {
  const referenced = referencedFieldIds(expression)
  if (referenced.length === 0) {
    const value = evaluateExpression(expression, {})
    return value === null ? null : { value, fromEntry: false }
  }

  if (latestData) {
    const value = evaluateExpression(expression, latestData)
    if (value !== null) return { value, fromEntry: true }
  }

  const samples = {}
  for (const id of referenced) samples[id] = 2
  const value = evaluateExpression(expression, samples)
  return value === null ? null : { value, fromEntry: false }
}

/**
 * Why an expression cannot be saved, or `null` if it can.
 *
 * The same rules the server applies, checked as the field is typed so the
 * builder can explain the problem next to the input rather than after a
 * failed save.
 */
export function expressionError(expression, field, schema) {
  if (!String(expression || "").trim()) return "A calculation needs an expression."

  try {
    parseExpression(expression)
  } catch (error) {
    return error.message
  }

  const byId = new Map((schema || []).map((entry) => [entry.id, entry]))

  for (const reference of referencedFieldIds(expression)) {
    if (reference === field.id) return "A calculation cannot use its own result."

    let source = byId.get(reference)
    if (!source) {
      // A braced name rather than a braced id: the instinct is right, the
      // syntax is not. Names are what a person knows; ids are what the
      // expression stores, because a name can be renamed out from under it.
      const byName = (schema || []).find(
        (entry) =>
          (entry.name || "").trim().toLowerCase() === reference.trim().toLowerCase()
      )
      if (byName?.id === field.id) return "A calculation cannot use its own result."
      if (byName && isNumericField(byName)) {
        return `'${byName.name}' is one of your fields — click it below to add it to the calculation.`
      }
      source = byName
    }
    if (!source) return "This calculation uses a field that is no longer in the schema."
    if (!isNumericField(source)) {
      return `'${source.name || "That field"}' is not a number, so it cannot be part of a calculation.`
    }
  }

  return null
}

/** An expression with field ids replaced by names, for reading rather than editing. */
export function describeExpression(expression, schema) {
  const byId = new Map((schema || []).map((field) => [field.id, field]))
  return String(expression || "").replace(
    PLACEHOLDER,
    (_match, id) => byId.get(id)?.name || "unknown field"
  )
}
