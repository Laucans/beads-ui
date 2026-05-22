import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'

const GLOSSARY = {
  Mayor: "Le chef d'orchestre. C'est l'instance principale qui analyse tes demandes et planifie le travail des autres agents.",
  Convoy: "Un plan d'action. Un groupe de tâches ordonnées logiquement pour éviter que les agents ne se marchent sur les pieds.",
  Bead: "Une unité de travail atomique (un ticket dans la base de données). Ex: Créer un bouton, corriger un bug.",
  Polecat: "L'ouvrier. Un agent autonome qui prend un Bead, clone le code dans un coin isolé, et programme la solution.",
  Refinery: "Le contrôle qualité. L'espace où le code des Polecats est testé et validé avant d'être fusionné dans ton projet officiel.",
  Wisp: "Un mini-programme de surveillance invisible en arrière-plan. S'il 'gèle', le système peut bloquer.",
  Witness: "L'agent validateur qui donne le feu vert final pour qu'une branche soit fusionnée (Landed).",
}

export { GLOSSARY }

export default function TooltipHelp({ term }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: true })
  const btnRef = useRef(null)
  const tipRef = useRef(null)

  useEffect(() => {
    if (!visible) return
    const handler = (e) => {
      if (tipRef.current && !tipRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setVisible(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [visible])

  const definition = GLOSSARY[term]
  if (!definition) return null

  const toggle = (e) => {
    e.stopPropagation()
    if (!visible && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.top > 120 })
    }
    setVisible((v) => !v)
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label={`Help: ${term}`}
        className="
          inline-flex items-center justify-center
          w-4 h-4 ml-1 rounded-full
          text-[10px] font-bold font-mono
          border border-cyber-dim text-cyber-dim
          hover:border-cyber-accent2 hover:text-cyber-accent2
          transition-colors cursor-help leading-none
        "
      >
        ?
      </button>

      {visible && (
        <span
          ref={tipRef}
          role="tooltip"
          className={`
            absolute z-50 left-1/2 -translate-x-1/2
            ${pos.top ? 'bottom-full mb-2' : 'top-full mt-2'}
            w-64 p-3 rounded
            bg-cyber-surface border border-cyber-accent2
            shadow-cyber-blue
            text-xs text-cyber-text font-mono leading-relaxed
            whitespace-normal
          `}
        >
          <span className="block text-cyber-accent2 font-bold mb-1">{term}</span>
          {definition}
        </span>
      )}
    </span>
  )
}

TooltipHelp.propTypes = {
  term: PropTypes.string.isRequired,
}
