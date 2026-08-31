import "./ChroniclesLogo.css"

export default function ChroniclesLogo({ size = 40, className = "" }) {
  return (
    <span className={`chronicles-logo logo-c-wrap ${className}`.trim()} style={{ width: size, height: size }} role="img" aria-label="Chronicles logo">
      <span className="chronicles-logo-ring" aria-hidden="true" />
      <span className="chronicles-logo-face" aria-hidden="true">
        <img src="/chronicles-mark.svg" alt="" draggable="false" />
      </span>
    </span>
  )
}
