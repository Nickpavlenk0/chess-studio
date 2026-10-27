import { Component } from "react";
import type { ReactNode } from "react";
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="empty">
        <h1>Не удалось открыть студию</h1>
        <p>
          Произошла ошибка отображения. Обновите страницу. Если перед ошибкой
          результат был подтверждён, он уже находится в GitHub.
        </p>
        <button className="button" onClick={() => location.reload()}>
          Обновить страницу
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
