import { useEffect, useMemo, useState } from "react"
import { fetchEntriesGlobal, fetchTasks } from "./api"
import { EntryDetailModal } from "./EntryShared"
import { humaniseValue } from "./fieldTypes"
import { SavedFilterBar } from "./SavedFilterBar"
import { StructuredSearch } from "./StructuredSearch"
import { TaskPanel } from "./TaskPanel"
import { SkeletonRows } from "./ViewTransition"
import "./WorkspacePages.css"

function PageHeader({ eyebrow, title, description, children }) { return <header className="workspace-heading"><div><span className="workspace-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</header> }
// The preview line under an entry. Lists are written out as words rather than
// JSON — a checklist reading "Pack bags ✓" is the point of the field — and a
// link says what it is rather than showing the target's id, which is right to
// store and unreadable here: the entry's own schema snapshot says which
// fields are links, and the target itself is not on this page to be named.
const displayValue = entry => {
  const types = new Map((entry.schema_snapshot || []).map(field => [field.id, field.type]))
  const values = Object.entries(entry.data || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0))
    .map(([id, value]) => types.get(id) === "link" ? "↳ linked entry" : humaniseValue(value))
  return values.join(" · ") || "No note content"
}
// "project" orders the current page in the browser; the rest are orderings the
// search endpoint understands, so they hold across pages.
const SERVER_SORTS = ["newest", "oldest", "due_date", "relevance"]

export function EntriesPage({ projects, onCreate }) {
  const [query, setQuery] = useState(""); const [projectId, setProjectId] = useState(""); const [tag, setTag] = useState(""); const [todo, setTodo] = useState(""); const [page, setPage] = useState(1); const [entries, setEntries] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [retry, setRetry] = useState(0); const [sort, setSort] = useState("newest"); const [sortTouched, setSortTouched] = useState(false); const [conditions, setConditions] = useState([]); const [match, setMatch] = useState("all"); const [selected, setSelected] = useState(new Set()); const [copied, setCopied] = useState(false)
  const [openEntryId, setOpenEntryId] = useState(null)
  const selectedProject = useMemo(() => projects.find(project => project.id === projectId) || null, [projects, projectId])
  const openEntry = useMemo(() => entries.find(entry => entry.id === openEntryId) || null, [entries, openEntryId])
  // The project a clicked entry belongs to may not be the one currently
  // filtered on — this table spans every project — so it's looked up by the
  // entry's own project_id, not the filter's projectId.
  const openEntryProject = useMemo(
    () => openEntry ? projects.find(project => project.id === openEntry.project_id) || null : null,
    [projects, openEntry]
  )
  const userId = useMemo(() => {
    try { return JSON.parse(window.localStorage.getItem("chronicles_user"))?.id || null } catch { return null }
  }, [])

  // US-3.11: once a search or a structured filter is active, results should
  // rank by relevance rather than raw entry order — but only until the
  // person picks a sort themselves, so their explicit choice always wins.
  useEffect(() => {
    if (sortTouched) return
    const hasSearch = query.trim() !== "" || conditions.length > 0
    if (hasSearch && sort !== "relevance") setSort("relevance")
    if (!hasSearch && sort === "relevance") setSort("newest")
  }, [query, conditions, sort, sortTouched])

  const serverSort = SERVER_SORTS.includes(sort) ? sort : "newest"
  useEffect(() => { let active = true; setLoading(true); setError(""); const timer = setTimeout(() => fetchEntriesGlobal({q:query,projectId:projectId || undefined,tag:tag.trim() || undefined,todo:todo === "" ? undefined : todo === "true",sort:serverSort,conditions,match,page,pageSize:30}).then(data => { if(active) setEntries(data) }).catch(caught => { if(active) setError(caught.message) }).finally(() => { if(active) setLoading(false) }), 180); return () => {active=false;clearTimeout(timer)} }, [query,projectId,tag,todo,serverSort,conditions,match,page,retry])
  const ordered = useMemo(() => sort === "project" ? [...entries].sort((a,b) => String(a.project_name).localeCompare(String(b.project_name))) : entries, [entries,sort])
  // The shape the saved-filter endpoint stores, and the shape applying one
  // hands back, so a re-applied filter restores every control below.
  const criteria = useMemo(() => ({q:query.trim() || null,project_id:projectId || null,tag:tag.trim() || null,todo:todo === "" ? null : todo === "true",sort:serverSort,conditions,match}), [query,projectId,tag,todo,serverSort,conditions,match])
  const applySaved = saved => { setQuery(saved.q || ""); setProjectId(saved.project_id || ""); setTag(saved.tag || ""); setTodo(saved.todo == null ? "" : String(saved.todo)); setSort(saved.sort || "newest"); setSortTouched(true); setConditions(saved.conditions || []); setMatch(saved.match || "all"); setPage(1); setSelected(new Set()) }
  const chooseProject = value => { setProjectId(value); setConditions([]); setPage(1) } // field ids are project-specific, so switching projects clears them rather than carrying over conditions that no longer resolve to anything
  const toggleAll = () => setSelected(selected.size === ordered.length ? new Set() : new Set(ordered.map(entry => entry.id)))
  const toggle = id => setSelected(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next })
  const copySelected = async () => { await navigator.clipboard.writeText(ordered.filter(entry => selected.has(entry.id)).map(entry => `${entry.project_name} · ${new Date(entry.created_at).toLocaleString()}\n${displayValue(entry)}`).join("\n\n")); setCopied(true); setTimeout(() => setCopied(false), 1800) }
  return <section className="workspace-page" aria-label="Entries workspace"><PageHeader eyebrow="YOUR WORK, RECORDED" title="Entries" description="A record of work you have already done. For something you still need to do, use Tasks."><button type="button" className="btn-primary" onClick={onCreate}>+ Create project</button></PageHeader><div className="workspace-filters"><label className="workspace-search">Search entries<input type="search" placeholder="Search notes or project names…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} /></label><label>Project<select value={projectId} onChange={e=>chooseProject(e.target.value)}><option value="">All projects</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Tag<input type="search" placeholder="Any tag" value={tag} onChange={e=>{setTag(e.target.value);setPage(1)}} /></label><label>Status<select value={todo} onChange={e=>{setTodo(e.target.value);setPage(1)}}><option value="">Everything</option><option value="true">Still to do</option><option value="false">Already done</option></select></label><label>Sort<select value={sort} onChange={e=>{setSort(e.target.value);setSortTouched(true);setPage(1)}}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="due_date">Due date</option><option value="relevance">Best match</option><option value="project">Project name</option></select></label></div><StructuredSearch schema={selectedProject?.entry_schema || null} conditions={conditions} match={match} onChange={(next,nextMatch)=>{setConditions(next);setMatch(nextMatch);setPage(1)}} /><SavedFilterBar criteria={criteria} onApply={applySaved} />{selected.size > 0 && <div className="workspace-bulkbar"><strong>{selected.size} selected</strong><span>Selection is ready for review or export.</span><button type="button" onClick={copySelected}>{copied ? "Copied" : "Copy selected"}</button><button type="button" onClick={() => setSelected(new Set())}>Clear selection</button></div>}<div className="workspace-body workspace-table-wrap" aria-busy={loading}>{error ? <div className="workspace-error" role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></div> : loading ? <SkeletonRows rows={6} height={44} label="Loading entries" /> : !ordered.length ? <div className="workspace-empty"><span className="workspace-empty-icon">≡</span><h2>{query || projectId || tag || todo ? "No matching entries" : "Your story starts here"}</h2><p>{query || projectId || tag || todo ? "Try another search, project, tag or status." : "Open a project on Home to write your first logbook entry."}</p></div> : <table className="workspace-table"><thead><tr><th><input aria-label="Select all entries" type="checkbox" checked={selected.size === ordered.length} onChange={toggleAll} /></th><th>Entry</th><th>Project</th><th>Recorded</th><th>Due</th><th>Time</th></tr></thead><tbody>{ordered.map(entry => <tr key={entry.id} className={selected.has(entry.id) ? "is-selected" : ""}><td><input aria-label={`Select entry from ${entry.project_name}`} type="checkbox" checked={selected.has(entry.id)} onChange={() => toggle(entry.id)} /></td><td><button type="button" className="workspace-entry-preview-btn" onClick={() => setOpenEntryId(entry.id)}><span className="workspace-entry-preview">{entry.title || displayValue(entry)}</span></button>{entry.todo && <span className="workspace-project-label">To do</span>}</td><td><span className="workspace-project-label">{entry.project_name}</span></td><td><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"})}</time></td><td>{entry.due_date ? <time dateTime={entry.due_date}>{new Date(`${entry.due_date}T00:00:00`).toLocaleDateString(undefined,{day:"2-digit",month:"short"})}</time> : "—"}</td><td>{entry.time_spent != null ? `${entry.time_spent} min` : "—"}</td></tr>)}</tbody></table>}</div><footer className="workspace-pagination"><span>Page {page}</span><button type="button" className="btn-secondary" disabled={page===1 || loading} onClick={()=>setPage(n=>n-1)}>Previous</button><button type="button" className="btn-secondary" disabled={entries.length<30 || loading || !!error} onClick={()=>setPage(n=>n+1)}>Next</button></footer>{openEntry && openEntryProject && <EntryDetailModal project={openEntryProject} entry={openEntry} projects={projects} entries={entries.filter(entry => entry.project_id === openEntryProject.id)} canManage={!openEntryProject.shared || (Boolean(userId) && openEntry.created_by === userId)} onClose={() => setOpenEntryId(null)} onSaved={saved => { setEntries(prev => prev.map(e => e.id === saved.id ? saved : e)); setOpenEntryId(null) }} onDeleted={id => { setEntries(prev => prev.filter(e => e.id !== id)); setOpenEntryId(null) }} />}</section>}

export function TasksPage({ projects, onCreate }) {
  const [chosen,setChosen] = useState(""); const project = projects.find(item => item.id === chosen) || projects[0]; const [health,setHealth] = useState(null)
  useEffect(() => { let active=true; if(!project) return; fetchTasks(project.id,false).then(tasks => { if(active) setHealth(tasks) }).catch(() => { if(active) setHealth([]) }); return () => {active=false} },[project?.id])
  return <section className="workspace-page" aria-label="Tasks workspace"><PageHeader eyebrow="A LITTLE PROGRESS, EVERY DAY" title="Tasks" description="What still needs doing on a project. For recording work already finished, use Entries."><button type="button" className="btn-primary" onClick={onCreate}>+ Create project</button></PageHeader>{projects.length ? <><div className="workspace-filters"><label>Working on<select value={project.id} onChange={e=>setChosen(e.target.value)}>{projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className="workspace-muted">{health === null ? "Checking project health…" : health.length ? `${health.length} open task${health.length === 1 ? "" : "s"} in this project.` : "No open tasks — this project is clear."}</p></div><div className="workspace-body workspace-task-body"><TaskPanel key={project.id} projectId={project.id}/></div></> : <div className="workspace-empty"><span className="workspace-empty-icon">✓</span><h2>Make room for your next idea</h2><p>Create a project, then add tasks and track your progress here.</p><button type="button" className="btn-primary" onClick={onCreate}>Create your first project</button></div>}</section>
}
