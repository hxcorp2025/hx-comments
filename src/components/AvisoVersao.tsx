import { useEffect, useState } from 'react'

// O index.html do GitHub Pages é servido com cache e gruda (pior ainda em "adicionar à
// tela de início" no iOS). Sem isto, o operador fica preso numa build antiga sem saber.
export default function AvisoVersao() {
  const [nova, setNova] = useState(false)

  useEffect(() => {
    let vivo = true
    const checar = async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
        const j = (await r.json()) as { build?: string }
        if (vivo && j.build && j.build !== __BUILD__) setNova(true)
      } catch {
        /* offline: ignora */
      }
    }
    checar()
    const t = setInterval(checar, 5 * 60 * 1000)
    const onVis = () => document.visibilityState === 'visible' && checar()
    document.addEventListener('visibilitychange', onVis)
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  if (!nova) return null
  return (
    <button className="aviso-versao" onClick={() => location.reload()}>
      ✨ Nova versão disponível — tocar para atualizar
    </button>
  )
}
