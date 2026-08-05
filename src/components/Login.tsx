import { useState } from 'react'
import { sb } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    const { error } = await sb.auth.signInWithPassword({ email, password: senha })
    setCarregando(false)
    if (error) setErro('Login falhou: confira e-mail e senha.')
  }

  return (
    <form className="login" onSubmit={entrar}>
      <h1>🗣️ Central de Comentários</h1>
      <p className="sub">Sortudão · TikTok + Meta · Hook Mídia</p>
      <input
        type="email"
        placeholder="e-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
        required
      />
      <input
        type="password"
        placeholder="senha"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        autoComplete="current-password"
        required
      />
      {erro && <p className="erro">{erro}</p>}
      <button className="btn primario" disabled={carregando}>
        {carregando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
