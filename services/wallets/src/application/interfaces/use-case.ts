/**
 * Marker interface for application use cases.
 * Use cases implement this interface for consistency.
 *
 * @template TInput - Input DTO type
 * @template TOutput - Output DTO type
 */
export interface IUseCase<TInput = void, TOutput = void> {
  /**
   * Execute the use case logic.
   * @param input - Input data for the use case
   * @returns Promise with the output data
   */
  execute(input: TInput): Promise<TOutput>;
}
