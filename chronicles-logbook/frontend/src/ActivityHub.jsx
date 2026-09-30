import { useState } from "react"

import ActivitiesPage from "./ActivitiesPage"
import "./ActivityHub.css"

const TABS = [
  { id: "logged", label: "Logged", hint: "Entries you have recorded, newest first" },
  { id: "scheduled", label: "Scheduled", hint: "Activities you have planned on the calendar" },
]

/**
 * Activity: what you have done and what you have planned, in one place.
 * "Logged" is the entry timeline (passed in, since the app owns it); "Scheduled" is the planned activities that
 * the Calendar also shows, to add to, edit and delete.
 */
export default function ActivityHub({ logged, initialTab = "logged" }) {
  const [tab, setTab] = useState(initialTab)

  return (
    <div className="activity-hub">
      <div className="activity-hub-tabs" role="tablist" aria-label="Activity views">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`activity-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="activity-panel"
            title={item.hint}
            className={tab === item.id ? "is-selected" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id="activity-panel" role="tabpanel" aria-labelledby={`activity-tab-${tab}`}>
        {tab === "logged" ? logged : <ActivitiesPage />}
      </div>
    </div>
  )
}
