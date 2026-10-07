import { useNavigate } from "react-router-dom"

import "./LearningLauncher.css"

/**
 * A visible way into Learning Chronicles, sitting under Mira on the home views.
 * It is a button rather than a section of the page, so it is always there to
 * click and never in the way of the dashboard.
 */
export default function LearningLauncher() {
  const navigate = useNavigate()
  return (
    <button type="button" className="learning-launcher" onClick={() => navigate("/learning")}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M4 5.5C4 4.67 4.67 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
        <path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
      </svg>
      <span>Learning Chronicles</span>
    </button>
  )
}
