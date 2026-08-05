import { useEffect, useState, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Inbox, Music2, Facebook, Instagram, ShieldBan, BarChart3, ScrollText, LogOut } from 'lucide-react'
import { sb } from './lib/supabase'
import { listTemplates } from './lib/db'
import type { Template } from './lib/types'
import Login from './components/Login'
import Fila from './views/Fila'
import Feed from './views/Feed'
import Regras from './views/Regras'
import Insights from './views/Insights'
import LogView from './views/LogView'

type Aba = 'fila' | 'tiktok' | 'fb' | 'ig' | 'regras' | 'insights' | 'log'

const ABAS: { id: Aba; rotulo: string; Icone: typeof Inbox }[] = [
  { id: 'fila', rotulo: 'Fila', Icone: Inbox },
  { id: 'tiktok', rotulo: 'TikTok', Icone: Music2 },
  { id: 'fb', rotulo: 'Facebook', Icone: Facebook },
  { id: 'ig', rotulo: 'Instagram', Icone: Instagram },
  { id: 'regras', rotulo: 'Regras', Icone: ShieldBan },
  { id: 'insights', rotulo: 'Insights', Icone: BarChart3 },
  { id: 'log', rotulo: 'Log', Icone: ScrollText },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [pronto, setPronto] = useState(false)
  const [aba, setAba] = useState<Aba>('fila')
  const [templates, setTemplates] = useState<Template[]>([])
  const [negado, setNegado] = useState(false)
  const [papel, setPapel] = useState('operador')
  const [filaN, setFilaN] = useState<number | null>(null)

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setPronto(true) })
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    // allowlist + papel vêm do banco (a RLS devolve vazio pra quem não é operador)
    sb.from('painel_operadores').select('email, papel').eq('email', session.user.email).then(({ data }) => {
      if (!data || data.length === 0) setNegado(true)
      else {
        setNegado(false)
        setPapel(data[0].papel)
        listTemplates().then(setTemplates).catch(console.error)
        sb.from('ad_comments').select('id', { count: 'exact', head: true }).eq('status', 'revisao')
          .then(({ count }) => setFilaN(count ?? 0))
      }
    })
  }, [session])

  const onContagem = useCallback((n: number) => setFilaN(n), [])

  if (!pronto) return null
  if (!session) return <Login />

  if (negado) {
    return (
      <div className="vazio" style={{ paddingTop: '20vh' }}>
        <span className="emoji">🚫</span>
        Sua conta ({session.user.email}) não está na lista de operadores.
        <br />Fala com o Matheus pra ser liberado.
        <p style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => sb.auth.signOut()}>Sair</button>
        </p>
      </div>
    )
  }

  const admin = papel === 'admin'

  return (
    <div className="app">
      <header className="topo">
        <h1>🗣️ Central de Comentários</h1>
        <span className="quem">
          {session.user.email?.split('@')[0]}{' '}
          <button className="btn" style={{ minHeight: 32, padding: '4px 10px' }} onClick={() => sb.auth.signOut()} aria-label="sair">
            <LogOut size={14} />
          </button>
        </span>
      </header>

      <nav className="tabs" aria-label="abas">
        {ABAS.map(({ id, rotulo, Icone }) => (
          <button key={id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)}
            aria-current={aba === id ? 'page' : undefined}>
            <Icone size={19} />
            {id === 'fila' && filaN !== null && filaN > 0 ? `${rotulo} · ${filaN}` : rotulo}
          </button>
        ))}
      </nav>

      {aba === 'fila' && <Fila templates={templates} admin={admin} onContagem={onContagem} />}
      {aba === 'tiktok' && <Feed plataforma="tiktok" templates={templates} admin={admin} />}
      {aba === 'fb' && <Feed plataforma="fb" templates={templates} admin={admin} />}
      {aba === 'ig' && <Feed plataforma="ig" templates={templates} admin={admin} />}
      {aba === 'regras' && <Regras />}
      {aba === 'insights' && <Insights />}
      {aba === 'log' && <LogView />}
    </div>
  )
}
