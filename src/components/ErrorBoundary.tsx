import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { erro: Error | null }

// Sem isso, um dado inesperado (plataforma nova, campo faltando) derruba o app
// inteiro em tela branca no celular, sem nenhuma pista pro operador.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Central de Comentários quebrou:', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="vazio" style={{ paddingTop: '18vh' }}>
        <span className="emoji">💥</span>
        Algo quebrou nesta tela.
        <p className="didatica" style={{ marginTop: 8 }}>{this.state.erro.message}</p>
        <p style={{ marginTop: 16 }}>
          <button className="btn primario" onClick={() => location.reload()}>Recarregar</button>
        </p>
      </div>
    )
  }
}
