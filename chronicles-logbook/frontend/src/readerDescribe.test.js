import { afterEach, describe, expect, it } from "vitest"

import { accessibleName, describeElement, isFocusable, isHeading, isHidden, readableItems, roleOf, stateWords } from "./readerDescribe"

const mount = (html) => {
  document.body.innerHTML = html
  return document.body
}
const $ = (selector) => document.querySelector(selector)

afterEach(() => {
  document.body.innerHTML = ""
})

describe("roles", () => {
  it("reads the role from markup, explicit or implied", () => {
    mount(`<a href="/x" id="a">x</a><a id="b">no href</a><button id="c">c</button><h3 id="d">d</h3>
      <input id="e" type="checkbox"><input id="f" type="range"><input id="g"><select id="h"></select>
      <textarea id="i"></textarea><div id="j" role="tab">t</div><nav id="k"></nav><input id="l" type="search"><input id="m" type="number">`)
    const roles = Object.fromEntries("abcdefghijklm".split("").map((id) => [id, roleOf($(`#${id}`))]))
    expect(roles).toEqual({
      a: "link", b: "", c: "button", d: "heading", e: "checkbox", f: "slider", g: "textbox", h: "combobox",
      i: "textbox", j: "tab", k: "navigation", l: "searchbox", m: "spinbutton",
    })
  })
})

describe("names", () => {
  it("prefers aria-labelledby, then aria-label, then the label, then content", () => {
    mount(`<span id="lab">Named by reference</span>
      <button id="a" aria-labelledby="lab" aria-label="ignored">x</button>
      <button id="b" aria-label="Close dialog">×</button>
      <label for="c">Hours spent</label><input id="c">
      <label>Wrapped <input id="d" value="42"></label>
      <button id="e">  Save   entry </button>
      <img id="f" alt="A chart">
      <input id="g" placeholder="Search notes">
      <input id="h" type="submit" value="Send">
      <div id="i" title="Only a title"></div>`)
    expect(accessibleName($("#a"))).toBe("Named by reference")
    expect(accessibleName($("#b"))).toBe("Close dialog")
    expect(accessibleName($("#c"))).toBe("Hours spent")
    expect(accessibleName($("#d"))).toBe("Wrapped")
    expect(accessibleName($("#e"))).toBe("Save entry")
    expect(accessibleName($("#f"))).toBe("A chart")
    expect(accessibleName($("#g"))).toBe("Search notes")
    expect(accessibleName($("#h"))).toBe("Send")
    expect(accessibleName($("#i"))).toBe("Only a title")
  })

  it("leaves out what is hidden from assistive technology, and reads an svg's title", () => {
    mount(`<button id="a">Delete <span aria-hidden="true">🗑</span><svg><title>trash</title></svg></button>`)
    expect(accessibleName($("#a"))).toBe("Delete trash")
  })
})

describe("describing an element", () => {
  it("says name, then kind, for buttons, links and headings", () => {
    mount(`<button id="a">Save entry</button><a id="b" href="/help">Help</a><h2 id="c">Projects</h2>`)
    expect(describeElement($("#a"))).toBe("Save entry, button")
    expect(describeElement($("#b"))).toBe("Help, link")
    expect(describeElement($("#c"))).toBe("Projects, heading level 2")
  })

  it("adds state: checked, pressed, expanded, selected, required, invalid, unavailable", () => {
    mount(`<input id="a" type="checkbox" aria-label="Done" checked>
      <button id="b" aria-pressed="true">Bold</button>
      <button id="c" aria-expanded="false">Menu</button>
      <div id="d" role="tab" aria-selected="true">Entries</div>
      <input id="e" aria-label="Name" required aria-invalid="true">
      <button id="f" disabled>Save</button>
      <div id="g" role="switch" aria-checked="false" aria-label="Dark"></div>`)
    expect(describeElement($("#a"))).toBe("Done, check box, checked")
    expect(describeElement($("#b"))).toBe("Bold, button, pressed")
    expect(describeElement($("#c"))).toBe("Menu, button, collapsed")
    expect(describeElement($("#d"))).toContain("selected")
    expect(describeElement($("#e"))).toBe("Name, edit text, required, invalid entry, blank")
    expect(describeElement($("#f"))).toBe("Save, button, unavailable")
    expect(describeElement($("#g"))).toBe("Dark, switch, off")
    expect(stateWords($("#a"))).toEqual(["checked"].map((word) => (word === "checked" ? "checked" : word)))
  })

  it("reads what a field holds, but never a password", () => {
    mount(`<label for="a">Title</label><input id="a" value="Weekly plan">
      <label for="b">Secret</label><input id="b" type="password" value="hunter2">
      <label for="c">Kind</label><select id="c"><option>Bug</option><option selected>Feature</option></select>
      <label for="d">Notes</label><textarea id="d">Some   notes</textarea>`)
    expect(describeElement($("#a"))).toBe("Title, edit text, Weekly plan")
    expect(describeElement($("#b"))).toBe("Secret, password edit, protected")
    expect(describeElement($("#c"))).toBe("Kind, combo box, Feature")
    expect(describeElement($("#d"))).toBe("Notes, multi-line edit, Some notes")
  })

  it("says where a tab sits among its siblings and adds its description", () => {
    mount(`<div><div id="a" role="tab">One</div><div id="b" role="tab">Two</div><div role="tab">Three</div></div>
      <input id="c" aria-label="Email" aria-describedby="hint"><p id="hint">Use your work address</p>`)
    expect(describeElement($("#b"))).toBe("Two, tab, 2 of 3")
    expect(describeElement($("#c"))).toBe("Email, edit text, blank, Use your work address")
  })

  it("counts the items in a list", () => {
    mount(`<ul id="a" aria-label="Projects"><li>One</li><li>Two</li></ul>`)
    expect(describeElement($("#a"))).toBe("Projects, list with 2 items")
  })

  it("describes a file input and a colour picker by what they do", () => {
    mount(`<input id="a" type="file" aria-label="Import"><input id="b" type="color" aria-label="Accent">`)
    expect(describeElement($("#a"))).toBe("Import, file upload button")
    expect(describeElement($("#b"))).toBe("Accent, colour picker")
  })
})

describe("what can be read", () => {
  it("lists readable things in page order and skips hidden ones", () => {
    mount(`<h1>Dashboard</h1><p>Welcome back</p><button>Go</button>
      <div hidden><p>Not shown</p></div><div aria-hidden="true"><button>Hidden button</button></div>
      <p style="display:none">Gone</p>`)
    expect(readableItems().map((el) => el.textContent.trim())).toEqual(["Dashboard", "Welcome back", "Go"])
  })

  it("does not read a container and then everything in it twice", () => {
    mount(`<ul><li><button>Edit</button></li><li>Plain text</li></ul>`)
    expect(readableItems().map((el) => el.textContent.trim())).toEqual(["Edit", "Plain text"])
  })

  it("keeps a list item's own text when it also holds a control", () => {
    mount(`<ul><li>Fixed the bug <button>Delete</button></li></ul>`)
    expect(readableItems().map((el) => el.tagName)).toEqual(["LI", "BUTTON"])
  })

  it("confines reading to an open dialog", () => {
    mount(`<h1>Page</h1><div role="dialog" aria-modal="true"><h2>Share</h2><button>Done</button></div>`)
    expect(readableItems().map((el) => el.textContent.trim())).toEqual(["Share", "Done"])
  })

  it("includes form fields that have a name even when empty", () => {
    mount(`<label for="a">Hours</label><input id="a">`)
    expect(readableItems().map((el) => el.tagName)).toEqual(["LABEL", "INPUT"])
  })

  it("knows what is a heading, what is focusable and what is hidden", () => {
    mount(`<h2 id="a">A</h2><button id="b">B</button><button id="c" disabled>C</button><p id="d">D</p><div id="e" hidden>E</div>`)
    expect(isHeading($("#a"))).toBe(true)
    expect(isHeading($("#b"))).toBe(false)
    expect(isFocusable($("#b"))).toBe(true)
    expect(isFocusable($("#c"))).toBe(false)
    expect(isFocusable($("#d"))).toBe(false)
    expect(isHidden($("#e"))).toBe(true)
    expect(isHidden($("#a"))).toBe(false)
  })
})
