import DashboardPage from "./DashboardPage"
import "./HomeWorkspace.css"

/**
 * The Dashboard: a welcome that says where you stand and lets you start a
 * project, with your own arrangement of panels underneath.
 */
export default function HomeWorkspace({ projects, onCreateProject }) {
  const activeProjects = projects.filter((project) => !project.archived)
  const archivedCount = projects.length - activeProjects.length

  return (
    <section className="home-hub" aria-labelledby="home-hub-title">
      <header className="home-hub-header home-hub-welcome">
        <div className="home-hub-welcome-mark" aria-hidden="true">C</div>
        <div className="home-hub-welcome-copy">
          <p className="home-hub-eyebrow">CHRONICLES WORKSPACE</p>
          <h1 id="home-hub-title">Welcome back</h1>
          <p>Choose a project in the sidebar, or build your dashboard below to see what matters at a glance.</p>
        </div>
        <div className="home-hub-welcome-actions">
          <div className="home-hub-summary">
            <span><strong>{activeProjects.length}</strong> active projects</span>
            <span><strong>{archivedCount}</strong> archived</span>
          </div>
          <button type="button" className="btn-primary" onClick={onCreateProject}>+ New project</button>
        </div>
      </header>

      <DashboardPage projects={projects} embedded />
    </section>
  )
}
