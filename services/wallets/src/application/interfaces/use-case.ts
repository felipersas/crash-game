/**
 * Marker interface for application use cases.
 */
export interface IUseCase<TInput = void, TOutput = void> {
  execute(input: TInput): Promise<TOutput>;
}
