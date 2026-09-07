export interface LoadingProgressUpdate {
  readonly progress: number;
  readonly message: string;
}

export type LoadingProgressReporter = (update: LoadingProgressUpdate) => void;

export interface LoadingProgressPresenter {
  begin(message: string): void;
  report(update: LoadingProgressUpdate): void;
  complete(message?: string): void;
  fail(message: string): void;
}

export function mapLoadingProgress(
  reporter: LoadingProgressReporter | undefined,
  start: number,
  end: number
): LoadingProgressReporter | undefined {
  if (!reporter) {
    return undefined;
  }

  const safeStart = Math.max(0, Math.min(1, start));
  const safeEnd = Math.max(safeStart, Math.min(1, end));
  return (update) => {
    const progress = Math.max(0, Math.min(1, update.progress));
    reporter({
      progress: safeStart + (safeEnd - safeStart) * progress,
      message: update.message
    });
  };
}
