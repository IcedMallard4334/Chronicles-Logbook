import { useEffect, useState } from "react"
import { fetchEntriesGlobal } from "./api"
import { TaskPanel } from "./TaskPanel"
import "./WorkspacePages.css"

function PageHeader({eyebrow,title,description,children}) {
  return <header className="workspace-heading"><div><span className="workspace-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</header>
}

export function EntriesPage({projects,onCreate}) {
  const [query,setQuery]=useState("")
  const [projectId,setProjectId]=useState("")
  const [page,setPage]=useState(1)
  const [entries,setEntries]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState("")
  const [retry,setRetry]=useState(0)
  useEffect(()=>{
    let active=true
    setLoading(true);setError("")
    const timer=setTimeout(()=>{
      fetchEntriesGlobal({q:query,projectId:projectId||undefined,page,pageSize:20})
        .then(data=>{if(active)setEntries(data)})
        .catch(caught=>{if(active)setError(caught.message)})
        .finally(()=>{if(active)setLoading(false)})
    },200)
    return ()=>{active=false;clearTimeout(timer)}
  },[query,projectId,page,retry])
  return <section className="workspace-page" aria-label="Entries workspace">
    <PageHeader eyebrow="YOUR WORK, RECORDED" title="Entries" description="Find the notes, progress and ideas behind every project."><button type="button" className="btn-primary" onClick={onCreate}>+ Create a project</button></PageHeader>
    <div className="workspace-filters"><label className="workspace-search">Search entries<input type="search" placeholder="Search notes or project names…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} /></label><label>Project<select value={projectId} onChange={e=>{setProjectId(e.target.value);setPage(1)}}><option value="">All projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
    <div className="workspace-body" aria-busy={loading}>
      {error?<div className="workspace-error" role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></div>:loading?<p className="workspace-empty" role="status">Loading entries…</p>:entries.length===0?<div className="workspace-empty"><span className="workspace-empty-icon" aria-hidden="true">≡</span><h2>{query||projectId?"No matching entries":"Your story starts here"}</h2><p>{query||projectId?"Try another search or project.":"Open a project on Home to write your first logbook entry."}</p></div>:<div className="workspace-entries">{entries.map(entry=><article className="workspace-entry" key={entry.id}><div className="workspace-entry-heading"><span className="workspace-project-label">{entry.project_name}</span><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString(undefined,{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</time></div><div className="workspace-entry-data">{Object.values(entry.data||{}).map((value,index)=><p key={index}>{typeof value==="object"?JSON.stringify(value):String(value)}</p>)}{Object.keys(entry.data||{}).length===0&&<p className="workspace-muted">No note content</p>}</div>{entry.time_spent!=null&&<span className="workspace-muted">{entry.time_spent} minutes recorded</span>}</article>)}</div>}
    </div>
    <footer className="workspace-pagination"><span>Page {page}</span><button type="button" className="btn-secondary" disabled={page===1||loading} onClick={()=>setPage(n=>n-1)}>Previous</button><button type="button" className="btn-secondary" disabled={entries.length<20||loading||!!error} onClick={()=>setPage(n=>n+1)}>Next</button></footer>
  </section>
}

export function TasksPage({projects,onCreate}) {
  const [chosen,setChosen]=useState("")
  const project=projects.find(p=>p.id===chosen)||projects[0]
  return <section className="workspace-page" aria-label="Tasks workspace">
    <PageHeader eyebrow="A LITTLE PROGRESS, EVERY DAY" title="Tasks" description="Turn your project plans into clear next steps."><button type="button" className="btn-primary" onClick={onCreate}>+ Create a project</button></PageHeader>
    {projects.length?<><div className="workspace-filters"><label>Working on<select value={project.id} onChange={e=>setChosen(e.target.value)}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p className="workspace-muted">Manage deadlines, checklists and completed work for this project.</p></div><div className="workspace-body workspace-task-body"><TaskPanel key={project.id} projectId={project.id}/></div></>:<div className="workspace-empty"><span className="workspace-empty-icon" aria-hidden="true">✓</span><h2>Make room for your next idea</h2><p>Create a project, then add tasks and track your progress here.</p><button type="button" className="btn-primary" onClick={onCreate}>Create your first project</button></div>}
  </section>
}
