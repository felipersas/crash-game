/**
 * Marker interface for command handlers.
 * Use cases implement this interface for consistency.
 */
export interface ICommandHandler<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
