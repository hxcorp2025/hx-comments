import { useState } from 'react'
import { sb } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setAviso('')
    setCarregando(true)
    const { error } = await sb.auth.signInWithPassword({ email, password: senha })
    setCarregando(false)
    if (error) setErro('Login falhou: confira e-mail e senha.')
  }

  async function esqueci() {
    setErro(''); setAviso('')
    if (!email) { setErro('Preenche o e-mail primeiro.'); return }
    const { error } = await sb.auth.resetPasswordForEmail(email)
    if (error) setErro('Não consegui enviar o e-mail de redefinição.')
    else setAviso('E-mail de redefinição enviado — olha a caixa de entrada.')
  }

  return (
    <form className="login" onSubmit={entrar}>
      <h1>🗣️ Central de Comentários</h1>
      <p className="sub">Sortudão · TikTok + Meta · Hook Mídia</p>
      <input type="email" placeholder="e-mail" value={email}
        onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ flex: 1 }} type={ver ? 'text' : 'password'} placeholder="senha" value={senha}
          onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        <button type="button" className="btn" onClick={() => setVer(!ver)} aria-label="mostrar senha">
          {ver ? '🙈' : '👁️'}
        </button>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {aviso && <p className="didatica">{aviso}</p>}
      <button className="btn primario" disabled={carregando}>
        {carregando ? 'Entrando…' : 'Entrar'}
      </button>
      <button type="button" className="btn" style={{ background: 'none', border: 'none', color: 'var(--muted)' }} onClick={esqueci}>
        Esqueci a senha
      </button>
    </form>
  )
}
