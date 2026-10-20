import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { PlatformAdapter } from '../platform/types';
import { sendReport } from './reports';

interface Props {
  platform: PlatformAdapter;
  /** The window or screen it guards, as the report names it. */
  area: string;
  children: ReactNode;
}

/**
 * A screen that failed to draw: reported (unless turned off), and in its place a word and a way back instead of an
 * empty window.
 */
export class ReportBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void sendReport(this.props.platform, { area: this.props.area, message: error.message, stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}` });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crashed" role="alert">
        <b>Что-то сломалось</b>
        <p>Перезапустите окно — всё сохранённое на месте. Если отчёты об ошибках включены, разработчики уже знают.</p>
        <button className="btn btn--primary" type="button" onClick={() => window.location.reload()}>
          Перезапустить окно
        </button>
      </div>
    );
  }
}
