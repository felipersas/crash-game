/**
 * Pagination value object — centralizes defaults and calculations.
 */

export interface PaginationResult {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationInput {
  page?: number;
  limit?: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const Pagination = {
  compute(input: PaginationInput = {}): PaginationResult {
    const page = Math.max(DEFAULT_PAGE, input.page || DEFAULT_PAGE);
    const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit || DEFAULT_LIMIT));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  },

  buildMeta(page: number, limit: number, total: number): PaginationMeta {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  },
};
