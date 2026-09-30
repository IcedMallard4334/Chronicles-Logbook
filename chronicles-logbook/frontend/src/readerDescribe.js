// What a screen reader needs to know about a page element: what it is called,
// what kind of thing it is, what state it is in and what it holds. Kept apart
// from the component that speaks so it can be tested on plain markup.

export const INTERACTIVE = [
  "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary",
  "[role=button]", "[role=link]", "[role=tab]", "[role=checkbox]", "[role=radio]", "[role=switch]",
  "[role=menuitem]", "[role=option]", "[role=combobox]", "[role=slider]",
].join(",")

const HEADINGS = "h1,h2,h3,h4,h5,h6,[role=heading]"
const CONTAINERS = new Set(["LI", "P", "LABEL", "TD", "TH", "DD", "DT"])
const READABLE = `${HEADINGS},${INTERACTIVE},li,p,img[alt],label,dt,dd,th,td,[role=status],[role=alert]`

const INPUT_ROLES = {
  button: "button", submit: "button", reset: "button", image: "button", file: "button", color: "button",
  checkbox: "checkbox", radio: "radio", range: "slider", number: "spinbutton", search: "searchbox",
}

const ROLE_WORDS = {
  link: "link", button: "button", checkbox: "check box", radio: "radio button", switch: "switch", combobox: "combo box",
  listbox: "list box", option: "option", tab: "tab", tablist: "tab list", tabpanel: "tab panel", dialog: "dialog",
  alertdialog: "alert dialog", img: "graphic", listitem: "", list: "list", navigation: "navigation landmark",
  main: "main landmark", banner: "banner landmark", contentinfo: "footer landmark", complementary: "complementary landmark",
  region: "region", progressbar: "progress bar", slider: "slider", spinbutton: "spin button", status: "status", alert: "alert",
  searchbox: "search edit", textbox: "edit text", menuitem: "menu item", columnheader: "column header", cell: "", table: "table",
  form: "form", group: "group",
}

export const normalise = (text) => String(text || "").replace(/\s+/g, " ").trim()

export function isHidden(el) {
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    if (node.hidden || node.getAttribute("aria-hidden") === "true" || node.hasAttribute("inert")) return true
    const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : null
    if (style && (style.display === "none" || style.visibility === "hidden")) return true
  }
  return false
}

export function roleOf(el) {
  const explicit = normalise(el.getAttribute("role")).split(" ")[0]
  if (explicit) return explicit
  const tag = el.tagName.toLowerCase()
  if (tag === "a") return el.hasAttribute("href") ? "link" : ""
  if (tag === "button" || tag === "summary") return "button"
  if (/^h[1-6]$/.test(tag)) return "heading"
  if (tag === "input") return INPUT_ROLES[(el.getAttribute("type") || "text").toLowerCase()] || "textbox"
  if (tag === "textarea") return "textbox"
  if (tag === "select") return el.multiple ? "listbox" : "combobox"
  return {
    img: "img", ul: "list", ol: "list", li: "listitem", nav: "navigation", main: "main", header: "banner",
    footer: "contentinfo", aside: "complementary", dialog: "dialog", progress: "progressbar", table: "table",
    th: "columnheader", td: "cell", form: "form", details: "group",
  }[tag] || ""
}

function textOfIds(el, attribute) {
  const ids = normalise(el.getAttribute(attribute)).split(" ").filter(Boolean)
  return normalise(ids.map((id) => el.ownerDocument.getElementById(id)?.textContent || "").join(" "))
}

function contentText(el) {
  // Text a person would hear: everything that isn't hidden from assistive technology.
  let text = ""
  const walk = (node) => {
    if (node.nodeType === 3) text += ` ${node.nodeValue}`
    else if (node.nodeType === 1) {
      if (node.getAttribute("aria-hidden") === "true" || node.hidden) return
      if (node.tagName === "SVG" || node.tagName === "svg") {
        text += ` ${node.querySelector?.("title")?.textContent || ""}`
        return
      }
      if (node.tagName === "IMG") text += ` ${node.getAttribute("alt") || ""}`
      node.childNodes.forEach(walk)
    }
  }
  el.childNodes.forEach(walk)
  return normalise(text)
}

export function accessibleName(el) {
  const labelledBy = textOfIds(el, "aria-labelledby")
  if (labelledBy) return labelledBy
  const label = normalise(el.getAttribute("aria-label"))
  if (label) return label
  const tag = el.tagName.toLowerCase()
  if (["input", "select", "textarea"].includes(tag)) {
    const fromLabels = normalise(
      Array.from(el.labels || [])
        .map((labelEl) => {
          // A wrapping label includes the control's own value; leave it out.
          const clone = labelEl.cloneNode(true)
          clone.querySelectorAll("input,select,textarea,option").forEach((inner) => inner.remove())
          return contentText(clone)
        })
        .join(" ")
    )
    if (fromLabels) return fromLabels
    if (["submit", "button", "reset"].includes((el.getAttribute("type") || "").toLowerCase()) && el.value) return el.value
    return normalise(el.getAttribute("title") || el.getAttribute("placeholder"))
  }
  if (tag === "img") return normalise(el.getAttribute("alt") || el.getAttribute("title"))
  const content = contentText(el)
  if (content) return content
  return normalise(el.getAttribute("title"))
}

function siblingsWithRole(el, role) {
  const parent = el.parentElement
  if (!parent) return []
  return Array.from(parent.children).filter((child) => roleOf(child) === role && !isHidden(child))
}

export function stateWords(el) {
  const role = roleOf(el)
  const words = []
  if (el.disabled || el.getAttribute("aria-disabled") === "true") words.push("unavailable")
  const checked = el.getAttribute("aria-checked")
  if (role === "checkbox" || role === "radio" || role === "switch") {
    const on = checked != null ? checked === "true" : Boolean(el.checked)
    words.push(role === "switch" ? (on ? "on" : "off") : on ? "checked" : "not checked")
  }
  const pressed = el.getAttribute("aria-pressed")
  if (pressed) words.push(pressed === "true" ? "pressed" : "not pressed")
  const expanded = el.getAttribute("aria-expanded")
  if (expanded) words.push(expanded === "true" ? "expanded" : "collapsed")
  if (el.tagName === "SUMMARY") words.push(el.parentElement?.open ? "expanded" : "collapsed")
  const selected = el.getAttribute("aria-selected")
  if (selected) words.push(selected === "true" ? "selected" : "not selected")
  if (el.getAttribute("aria-current") && el.getAttribute("aria-current") !== "false") words.push("current")
  if (el.required || el.getAttribute("aria-required") === "true") words.push("required")
  if (el.getAttribute("aria-invalid") === "true") words.push("invalid entry")
  if (el.getAttribute("aria-busy") === "true") words.push("busy")
  return words
}

function valueText(el, role) {
  const tag = el.tagName.toLowerCase()
  if (tag === "select") {
    const chosen = Array.from(el.selectedOptions || []).map((option) => normalise(option.textContent))
    return chosen.join(", ") || "nothing selected"
  }
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase()
    if (type === "password") return el.value ? "protected" : "blank"
    if (["checkbox", "radio", "submit", "button", "reset", "file", "image"].includes(type)) return ""
    return el.value ? el.value : "blank"
  }
  if (tag === "textarea") return el.value ? normalise(el.value).slice(0, 160) : "blank"
  if (role === "slider" || role === "progressbar" || role === "spinbutton") return el.getAttribute("aria-valuenow") || ""
  return ""
}

function roleText(el, role) {
  if (role === "heading") return `heading level ${el.getAttribute("aria-level") || el.tagName.replace(/\D/g, "") || 2}`
  if (role === "textbox") {
    if (el.tagName === "TEXTAREA") return "multi-line edit"
    const type = (el.getAttribute("type") || "text").toLowerCase()
    return type === "password" ? "password edit" : type === "date" ? "date edit" : type === "time" ? "time edit" : type === "email" ? "email edit" : "edit text"
  }
  if (role === "button" && el.tagName === "INPUT") {
    const type = (el.getAttribute("type") || "").toLowerCase()
    if (type === "color") return "colour picker"
    if (type === "file") return "file upload button"
  }
  if (role === "list") return `list with ${Array.from(el.children).filter((child) => child.tagName === "LI" || roleOf(child) === "listitem").length} items`
  return ROLE_WORDS[role] ?? role
}

/** What a screen reader says for one element. */
export function describeElement(el) {
  const role = roleOf(el)
  const parts = []
  const name = accessibleName(el)
  const isField = ["textbox", "searchbox", "combobox", "listbox", "slider", "spinbutton"].includes(role)
  if (name) parts.push(name)
  const kind = roleText(el, role)
  if (kind) parts.push(kind)
  parts.push(...stateWords(el))
  const value = isField ? valueText(el, role) : ""
  if (value) parts.push(value)
  if (["tab", "option", "menuitem", "radio", "listitem"].includes(role)) {
    const group = siblingsWithRole(el, role)
    const index = group.indexOf(el)
    if (group.length > 1 && index >= 0) parts.push(`${index + 1} of ${group.length}`)
  }
  const description = textOfIds(el, "aria-describedby")
  if (description) parts.push(description)
  return parts.join(", ")
}

const ownText = (el) => normalise(Array.from(el.childNodes).filter((node) => node.nodeType === 3).map((node) => node.nodeValue).join(" "))

/** Everything there is to read, in page order, limited to an open dialog when there is one. */
export function readableItems(root = document) {
  const dialogs = Array.from(root.querySelectorAll?.("dialog[open], [role=dialog][aria-modal=true], [role=dialog]") || []).filter((node) => !isHidden(node))
  const scope = dialogs.length ? dialogs[dialogs.length - 1] : root
  return Array.from(scope.querySelectorAll(READABLE)).filter((el) => {
    if (isHidden(el) || el.closest(".sr-badge")) return false
    if (CONTAINERS.has(el.tagName) && !ownText(el) && el.querySelector(READABLE)) return false
    return Boolean(accessibleName(el)) || ["checkbox", "radio", "switch", "slider", "textbox", "searchbox", "spinbutton", "combobox"].includes(roleOf(el))
  })
}

export const isHeading = (el) => el.matches(HEADINGS)
export const isFocusable = (el) => el.matches(`${INTERACTIVE},[tabindex]`) && !el.disabled

export const KEYBOARD_HELP = [
  "Tab and Shift Tab move between controls, and each one is read out as you arrive.",
  "Alt Shift Down arrow and Up arrow: next and previous item on the page.",
  "Alt Shift H and Alt Shift J: next and previous heading.",
  "Alt Shift R: read the page from where you are.",
  "Alt Shift T: read the page title.",
  "Alt Shift plus and minus: speak faster or slower.",
  "Escape or Control: stop speaking.",
  "Alt Shift question mark: hear this help again.",
].join(" ")
